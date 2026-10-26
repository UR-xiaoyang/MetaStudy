function toNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/**
 * LLM 配置。默认指向智谱 GLM 的 OpenAI 兼容端点，
 * 也可以指向通义千问 compatible-mode、DeepSeek、vLLM、Ollama 等任意兼容服务。
 */
export function readLlmConfig(env = process.env) {
  const apiKey = String(env.LLM_API_KEY || '').trim();
  const baseUrl = String(env.LLM_BASE_URL || 'https://open.bigmodel.cn/api/paas/v4').trim().replace(/\/+$/, '');
  const model = String(env.LLM_MODEL || 'glm-4-flash').trim();
  const jsonMode = String(env.LLM_JSON_MODE || 'off').toLowerCase();

  const config = {
    configured: false,
    reason: '',
    apiKey,
    baseUrl,
    model,
    timeoutMs: toNumber(env.LLM_TIMEOUT_MS, 30000),
    maxRetries: Math.max(0, Math.min(5, toNumber(env.LLM_MAX_RETRIES, 2))),
    temperature: toNumber(env.LLM_TEMPERATURE, 0.3),
    maxTokens: toNumber(env.LLM_MAX_TOKENS, 2048),
    jsonMode: jsonMode === 'on' || jsonMode === 'auto',
    pricePer1kInput: toNumber(env.LLM_PRICE_INPUT_PER_1K, 0),
    pricePer1kOutput: toNumber(env.LLM_PRICE_OUTPUT_PER_1K, 0)
  };

  if (!apiKey) {
    config.reason = '未配置 LLM：请设置 LLM_API_KEY（可选 LLM_BASE_URL / LLM_MODEL）';
    return config;
  }
  if (!baseUrl) {
    config.reason = 'LLM_BASE_URL 不能为空';
    return config;
  }
  if (!model) {
    config.reason = 'LLM_MODEL 不能为空';
    return config;
  }

  config.configured = true;
  return config;
}
