import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { tmpdir } from 'node:os';
import { guessMimeType } from './config.js';

export class AsrError extends Error {
  constructor(message, { code = 'ASR_ERROR', retryable = true } = {}) {
    super(message);
    this.name = 'AsrError';
    this.code = code;
    this.retryable = retryable;
  }
}

function truncate(text, max = 300) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * OpenAI 兼容的 /audio/transcriptions 调用。
 *
 * 注意：这类接口只返回最终文本，不暴露逐秒进度，因此 progress 反映的是
 * “阶段”（上传中 / 识别中 / 解析中），而不是真实百分比。
 */
export async function transcribeWithOpenAiCompatible({ filePath, filename, mimeType, config, onProgress = () => {} }) {
  const buffer = await readFile(filePath);
  if (!buffer.length) throw new AsrError('音频文件为空', { code: 'EMPTY_AUDIO', retryable: false });

  onProgress(5);

  const form = new FormData();
  form.append(
    'file',
    new Blob([buffer], { type: mimeType || guessMimeType(filePath) }),
    basename(filename || filePath)
  );
  form.append('model', config.model);
  form.append('response_format', 'json');
  if (config.language) form.append('language', config.language);
  if (config.prompt) form.append('prompt', config.prompt);

  onProgress(20);

  let response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    response = await fetch(config.apiUrl, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}` },
      body: form,
      signal: controller.signal
    });
  } catch (err) {
    clearTimeout(timer);
    if (err?.name === 'AbortError') {
      throw new AsrError(`转写请求超时（${Math.round(config.timeoutMs / 1000)} 秒）`, { code: 'ASR_TIMEOUT' });
    }
    throw new AsrError(`无法连接转写服务：${err.message}`, { code: 'ASR_NETWORK' });
  } finally {
    clearTimeout(timer);
  }

  onProgress(85);

  if (!response.ok) {
    const body = await response.text().catch(() => '');
    const retryable = response.status === 429 || response.status >= 500;
    throw new AsrError(`转写服务返回 ${response.status}：${truncate(body)}`, {
      code: response.status === 401 || response.status === 403 ? 'ASR_AUTH' : 'ASR_HTTP',
      retryable
    });
  }

  let payload;
  try {
    payload = await response.json();
  } catch {
    throw new AsrError('转写服务返回了无法解析的响应', { code: 'ASR_BAD_RESPONSE' });
  }

  const text = typeof payload?.text === 'string' ? payload.text.trim() : '';
  if (!text) throw new AsrError('转写服务返回空文本，可能是音频无语音或格式不受支持', { code: 'ASR_EMPTY', retryable: false });

  onProgress(100);
  return {
    text,
    provider: 'openai',
    meta: { model: config.model, language: payload?.language || config.language || null }
  };
}

/**
 * 按 shell 语法拆分命令模板，支持单/双引号。
 */
export function splitCommand(template) {
  const tokens = [];
  let current = '';
  let quote = null;
  let hasContent = false;

  for (const char of String(template || '')) {
    if (quote) {
      if (char === quote) quote = null;
      else current += char;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasContent = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasContent || current) {
        tokens.push(current);
        current = '';
        hasContent = false;
      }
      continue;
    }
    current += char;
    hasContent = true;
  }
  if (hasContent || current) tokens.push(current);
  return tokens;
}

function fillTemplate(tokens, values) {
  return tokens.map((token) =>
    token.replace(/\{(input|output|language|model|format)\}/g, (match, key) => {
      const value = values[key];
      return value == null ? '' : String(value);
    })
  );
}

/**
 * 本地命令行转写（whisper.cpp / faster-whisper 等）。
 * 约定：命令把纯文本写入 {output}；若未生成文件则回退使用 stdout。
 */
export async function transcribeWithCommand({ filePath, config, onProgress = () => {} }) {
  const dir = await mkdtemp(join(tmpdir(), 'asr-'));
  const outputPath = join(dir, `output.${config.commandOutputFormat || 'txt'}`);
  const values = {
    input: filePath,
    output: outputPath,
    language: config.language || 'zh',
    model: config.model || '',
    format: config.commandOutputFormat || 'txt'
  };

  const tokens = fillTemplate(splitCommand(config.command), values);
  if (!tokens.length) throw new AsrError('ASR_COMMAND 为空', { code: 'ASR_CONFIG', retryable: false });

  onProgress(5);

  let stdout = '';
  let stderr = '';
  let lastProgress = 0;
  let timedOut = false;

  try {
    const child = spawn(tokens[0], tokens.slice(1), { stdio: ['ignore', 'pipe', 'pipe'] });
    const timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGKILL');
    }, config.timeoutMs);

    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      const text = chunk.toString();
      stderr += text;
      const matches = text.match(/(\d{1,3})\s*%/g);
      if (matches) {
        const value = Number(matches[matches.length - 1].replace(/\D/g, ''));
        if (Number.isFinite(value) && value > lastProgress) {
          lastProgress = Math.min(value, 99);
          onProgress(lastProgress);
        }
      }
    });

    const exitCode = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    }).finally(() => clearTimeout(timeout));

    if (timedOut) throw new AsrError('本地转写命令超时', { code: 'ASR_TIMEOUT' });
    if (exitCode !== 0) {
      throw new AsrError(`本地转写命令退出码 ${exitCode}：${truncate(stderr || stdout)}`, { code: 'ASR_COMMAND' });
    }

    let text = '';
    try {
      const info = await stat(outputPath);
      if (info.size > 0) text = (await readFile(outputPath, 'utf8')).trim();
    } catch {
      // 命令未写文件，回退 stdout
    }
    if (!text) text = stdout.trim();
    if (!text) throw new AsrError('本地转写命令未输出文本', { code: 'ASR_EMPTY', retryable: false });

    onProgress(100);
    return { text, provider: 'command', meta: { model: config.model || null, language: config.language || null } };
  } finally {
    await rm(dir, { recursive: true, force: true }).catch(() => {});
  }
}

/**
 * 根据配置构造 provider 函数。
 */
export function createProvider(config) {
  if (!config?.configured) {
    throw new AsrError(config?.reason || '转写服务未配置', { code: 'ASR_NOT_CONFIGURED', retryable: false });
  }
  if (config.provider === 'openai') return (ctx) => transcribeWithOpenAiCompatible({ ...ctx, config });
  if (config.provider === 'command') return (ctx) => transcribeWithCommand({ ...ctx, config });
  throw new AsrError(`不支持的转写服务：${config.provider}`, { code: 'ASR_CONFIG', retryable: false });
}
