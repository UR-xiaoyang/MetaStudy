import { extname } from 'node:path';

/**
 * 支持的音频格式（与上传白名单保持一致）。
 * webm 既可能来自浏览器录音，也可能是普通音频文件。
 */
export const AUDIO_MIME_BY_EXT = {
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.webm': 'audio/webm',
  '.ogg': 'audio/ogg',
  '.aac': 'audio/aac',
  '.flac': 'audio/flac'
};

export const SUPPORTED_PROVIDERS = ['openai', 'command'];

export function guessMimeType(filename) {
  return AUDIO_MIME_BY_EXT[extname(filename || '').toLowerCase()] || 'application/octet-stream';
}

function toPositiveInt(value, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : fallback;
}

/**
 * 从环境变量读取 ASR 配置。
 *
 * - openai:  兼容 OpenAI /audio/transcriptions 协议的服务（OpenAI、硅基流动、
 *            本地 faster-whisper-server、whisper.cpp server 等）
 * - command: 本地命令行（whisper.cpp、faster-whisper CLI 等），模板中使用
 *            {input} {output} {language} {model} 占位符
 *
 * 未配置时返回 configured=false，接口会明确提示而不是静默降级。
 */
export function readAsrConfig(env = process.env) {
  const provider = String(env.ASR_PROVIDER || '').trim().toLowerCase();
  const timeoutMs = toPositiveInt(env.ASR_TIMEOUT_MS, 15 * 60 * 1000);
  const maxAttempts = toPositiveInt(env.ASR_MAX_ATTEMPTS, 3);
  const pollIntervalMs = toPositiveInt(env.ASR_POLL_INTERVAL_MS, 1000);
  const retryDelayMs = Number(env.ASR_RETRY_DELAY_MS ?? 30000);
  const language = String(env.ASR_LANGUAGE || 'zh').trim();
  const model = String(env.ASR_MODEL || (provider === 'openai' ? 'whisper-1' : '')).trim();

  const config = {
    provider,
    configured: false,
    reason: '',
    missing: [],
    timeoutMs,
    maxAttempts,
    pollIntervalMs,
    retryDelayMs: Number.isFinite(retryDelayMs) && retryDelayMs >= 0 ? retryDelayMs : 30000,
    language,
    model,
    apiUrl: String(env.ASR_API_URL || 'https://api.openai.com/v1/audio/transcriptions').trim(),
    apiKey: String(env.ASR_API_KEY || '').trim(),
    prompt: String(env.ASR_PROMPT || '').trim(),
    command: String(env.ASR_COMMAND || '').trim(),
    commandOutputFormat: String(env.ASR_COMMAND_FORMAT || 'txt').trim()
  };

  if (!provider) {
    config.reason = '未配置转写服务：请设置 ASR_PROVIDER（openai 或 command）';
    return config;
  }
  if (!SUPPORTED_PROVIDERS.includes(provider)) {
    config.reason = `不支持的 ASR_PROVIDER：${provider}（可选：${SUPPORTED_PROVIDERS.join(' / ')}）`;
    return config;
  }

  if (provider === 'openai') {
    if (!config.apiUrl) config.missing.push('ASR_API_URL');
    if (!config.apiKey) config.missing.push('ASR_API_KEY');
    if (!config.model) config.missing.push('ASR_MODEL');
  }

  if (provider === 'command') {
    if (!config.command) config.missing.push('ASR_COMMAND');
    else if (!config.command.includes('{input}')) {
      config.reason = 'ASR_COMMAND 必须包含 {input} 占位符';
      return config;
    } else if (!config.command.includes('{output}')) {
      config.reason = 'ASR_COMMAND 必须包含 {output} 占位符（转写文本写入该文件）';
      return config;
    }
  }

  if (config.missing.length) {
    config.reason = `转写服务缺少环境变量：${config.missing.join('、')}`;
    return config;
  }

  config.configured = true;
  return config;
}
