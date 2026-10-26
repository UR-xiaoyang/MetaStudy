export class LlmError extends Error {
  constructor(message, { code = 'LLM_ERROR', status = null, retryable = false } = {}) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function truncate(text, max = 300) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…` : value;
}

/**
 * 从模型输出中提取 JSON：兼容纯 JSON、```json 代码块、以及前后带说明文字的情况。
 */
export function extractJson(text) {
  const raw = String(text ?? '').trim();
  if (!raw) throw new LlmError('模型返回空内容', { code: 'LLM_EMPTY' });

  try {
    return JSON.parse(raw);
  } catch {
    // 继续尝试其它形式
  }

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenced) {
    try {
      return JSON.parse(fenced[1].trim());
    } catch {
      // 继续
    }
  }

  const start = raw.search(/[[{]/);
  if (start >= 0) {
    const open = raw[start];
    const close = open === '{' ? '}' : ']';
    let depth = 0;
    let inString = false;
    let escaped = false;
    for (let i = start; i < raw.length; i += 1) {
      const char = raw[i];
      if (inString) {
        if (escaped) escaped = false;
        else if (char === '\\') escaped = true;
        else if (char === '"') inString = false;
        continue;
      }
      if (char === '"') inString = true;
      else if (char === open) depth += 1;
      else if (char === close) {
        depth -= 1;
        if (depth === 0) {
          const candidate = raw.slice(start, i + 1);
          try {
            return JSON.parse(candidate);
          } catch {
            break;
          }
        }
      }
    }
  }

  throw new LlmError(`模型输出不是合法 JSON：${truncate(raw)}`, { code: 'LLM_BAD_JSON' });
}

/**
 * OpenAI 兼容 chat/completions 客户端：超时、重试、用量与成本审计。
 */
export function createLlmClient(config, { db = null, fetchImpl = globalThis.fetch, logger = console, sleepImpl = sleep } = {}) {
  const insertCall = db
    ? db.prepare(
        `INSERT INTO llm_calls (user_id, feature, model, prompt_tokens, completion_tokens, cost, latency_ms, success, error)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
      )
    : null;

  function logCall({ userId, feature, model, usage, latencyMs, success, error }) {
    if (!insertCall) return;
    const promptTokens = Number(usage?.prompt_tokens || 0);
    const completionTokens = Number(usage?.completion_tokens || 0);
    const cost =
      (promptTokens / 1000) * config.pricePer1kInput + (completionTokens / 1000) * config.pricePer1kOutput;
    try {
      insertCall.run(
        userId ?? null,
        feature,
        model,
        promptTokens,
        completionTokens,
        Number(cost.toFixed(6)),
        Math.round(latencyMs),
        success ? 1 : 0,
        error ? truncate(error, 500) : null
      );
    } catch (dbError) {
      logger.error?.(`[llm] 调用日志写入失败：${dbError.message}`);
    }
  }

  async function requestOnce({ messages, temperature, maxTokens, json }) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), config.timeoutMs);
    try {
      const body = {
        model: config.model,
        messages,
        temperature: temperature ?? config.temperature,
        max_tokens: maxTokens ?? config.maxTokens,
        stream: false
      };
      if (json && config.jsonMode) body.response_format = { type: 'json_object' };

      const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.apiKey}`
        },
        body: JSON.stringify(body),
        signal: controller.signal
      });

      if (!response.ok) {
        const text = await response.text().catch(() => '');
        const retryable = response.status === 429 || response.status >= 500;
        throw new LlmError(`LLM 服务返回 ${response.status}：${truncate(text)}`, {
          code: response.status === 401 || response.status === 403 ? 'LLM_AUTH' : 'LLM_HTTP',
          status: response.status,
          retryable
        });
      }

      const payload = await response.json();
      const content = payload?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) {
        throw new LlmError('LLM 响应缺少内容', { code: 'LLM_EMPTY' });
      }
      return { content, usage: payload.usage || {}, model: payload.model || config.model };
    } catch (error) {
      if (error?.name === 'AbortError') {
        throw new LlmError(`LLM 请求超时（${Math.round(config.timeoutMs / 1000)} 秒）`, {
          code: 'LLM_TIMEOUT',
          retryable: true
        });
      }
      if (error instanceof LlmError) throw error;
      throw new LlmError(`无法连接 LLM 服务：${error.message}`, { code: 'LLM_NETWORK', retryable: true });
    } finally {
      clearTimeout(timer);
    }
  }

  async function chat({ messages, feature = 'unknown', userId = null, temperature, maxTokens, json = true }) {
    if (!config.configured) {
      throw new LlmError(config.reason || 'LLM 未配置', { code: 'LLM_NOT_CONFIGURED' });
    }
    if (!Array.isArray(messages) || !messages.length) {
      throw new LlmError('messages 不能为空', { code: 'LLM_BAD_REQUEST' });
    }

    const startedAt = Date.now();
    let lastError = null;

    for (let attempt = 0; attempt <= config.maxRetries; attempt += 1) {
      try {
        const result = await requestOnce({ messages, temperature, maxTokens, json });
        logCall({
          userId,
          feature,
          model: result.model,
          usage: result.usage,
          latencyMs: Date.now() - startedAt,
          success: true
        });
        return { ...result, latencyMs: Date.now() - startedAt };
      } catch (error) {
        lastError = error;
        const canRetry = error?.retryable && attempt < config.maxRetries;
        if (!canRetry) break;
        const backoff = 500 * 2 ** attempt;
        logger.warn?.(`[llm] ${feature} 第 ${attempt + 1} 次失败（${error.code}），${backoff}ms 后重试`);
        await sleepImpl(backoff);
      }
    }

    logCall({
      userId,
      feature,
      model: config.model,
      usage: {},
      latencyMs: Date.now() - startedAt,
      success: false,
      error: lastError?.message
    });
    throw lastError;
  }

  async function chatJson(options) {
    const result = await chat(options);
    return { ...result, data: extractJson(result.content) };
  }

  return { chat, chatJson, config };
}
