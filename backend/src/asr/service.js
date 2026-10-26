import { db, storageDir } from '../db.js';
import { readAsrConfig } from './config.js';
import { createProvider } from './providers.js';
import { createTranscriptionWorker } from './queue.js';

export const asrConfig = readAsrConfig();

export const transcriptionWorker = createTranscriptionWorker({
  db,
  storageDir,
  provider: asrConfig.configured ? createProvider(asrConfig) : null,
  pollIntervalMs: asrConfig.pollIntervalMs,
  maxAttempts: asrConfig.maxAttempts,
  retryDelayMs: asrConfig.retryDelayMs
});

export function asrStatus() {
  return {
    configured: asrConfig.configured,
    provider: asrConfig.configured ? asrConfig.provider : null,
    model: asrConfig.configured ? asrConfig.model || null : null,
    language: asrConfig.language,
    reason: asrConfig.configured ? '' : asrConfig.reason
  };
}
