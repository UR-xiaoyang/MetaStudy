import { db } from './db.js';
import { readLlmConfig } from './llm/config.js';
import { createLlmClient } from './llm/client.js';
import { createAiService } from './llm/service.js';

export const llmConfig = readLlmConfig();
export const llmClient = createLlmClient(llmConfig, { db });
export const ai = createAiService({ client: llmClient });

export function aiStatus() {
  return {
    configured: llmConfig.configured,
    model: llmConfig.configured ? llmConfig.model : null,
    baseUrl: llmConfig.configured ? llmConfig.baseUrl : null,
    reason: llmConfig.configured ? '' : llmConfig.reason
  };
}
