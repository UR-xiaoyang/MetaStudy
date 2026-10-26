import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { guessMimeType } from './config.js';

export const JOB_STATUS = {
  PENDING: 'pending',
  PROCESSING: 'processing',
  COMPLETED: 'completed',
  FAILED: 'failed'
};

function shortError(error) {
  return String(error?.message || error || '转写失败').slice(0, 500);
}

/**
 * 基于 SQLite 的转写队列。
 *
 * 不引入 Redis/BullMQ 的理由：本项目的部署形态是单机 Node 进程，任务量级是
 * “用户自己上传的录音”，引入 Redis 只会增加运维成本；把队列状态放进同一个
 * SQLite 文件，进程重启后可继续处理未完成任务，语义与 Bull 的最小可用集一致
 * （pending → processing → completed/failed，失败重试、陈旧任务回收）。
 */
export function createTranscriptionWorker({
  db,
  storageDir,
  provider,
  pollIntervalMs = 1000,
  maxAttempts = 3,
  retryDelayMs = 30000,
  staleMs = 15 * 60 * 1000,
  logger = console
}) {
  let timer = null;
  let running = false;
  const lastProgress = new Map();

  const selectJob = db.prepare('SELECT * FROM transcription_jobs WHERE recording_id = ?');
  const selectNext = db.prepare(
    `SELECT j.*, r.storage, r.filename, r.course_id
       FROM transcription_jobs j
       JOIN recordings r ON r.id = j.recording_id
      WHERE j.status = 'pending'
        AND (j.next_attempt_at IS NULL OR j.next_attempt_at <= datetime('now'))
      ORDER BY j.id
      LIMIT 1`
  );

  function auditRecording(recordingId, { status, progress, error = null, source = null }) {
    db.prepare(
      `UPDATE recordings
          SET transcript_status = ?,
              transcript_progress = ?,
              transcript_error = ?,
              transcript_source = COALESCE(?, transcript_source),
              transcript_updated_at = datetime('now')
        WHERE id = ?`
    ).run(status, Math.max(0, Math.min(100, Math.round(progress))), error, source, recordingId);
  }

  function updateJobProgress(jobId, recordingId, progress) {
    const value = Math.max(0, Math.min(100, Math.round(progress)));
    const previous = lastProgress.get(jobId);
    const now = Date.now();
    const shouldWrite =
      value >= 100 ||
      previous == null ||
      value - previous.value >= 5 ||
      now - previous.at >= 1000;
    if (!shouldWrite) return;
    lastProgress.set(jobId, { value, at: now });
    db.prepare(`UPDATE transcription_jobs SET progress = ?, updated_at = datetime('now') WHERE id = ?`).run(value, jobId);
    auditRecording(recordingId, { status: JOB_STATUS.PROCESSING, progress: value });
  }

  function enqueue(recordingId, { provider: providerName = null, maxAttemptsOverride = null } = {}) {
    const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(recordingId);
    if (!recording) throw new Error('录音不存在');

    const existing = selectJob.get(recordingId);
    const limit = maxAttemptsOverride || maxAttempts;

    if (existing && existing.status === JOB_STATUS.PROCESSING) {
      return { job: existing, queued: false, reason: 'processing' };
    }
    if (existing && existing.status === JOB_STATUS.PENDING) {
      return { job: existing, queued: false, reason: 'pending' };
    }

    if (existing) {
      db.prepare(
        `UPDATE transcription_jobs
            SET status = 'pending', attempts = 0, progress = 0, error = NULL,
                provider = COALESCE(?, provider), max_attempts = ?,
                next_attempt_at = NULL, started_at = NULL, finished_at = NULL,
                updated_at = datetime('now')
          WHERE recording_id = ?`
      ).run(providerName, limit, recordingId);
    } else {
      db.prepare(
        `INSERT INTO transcription_jobs (recording_id, status, provider, max_attempts)
         VALUES (?, 'pending', ?, ?)`
      ).run(recordingId, providerName, limit);
    }

    auditRecording(recordingId, { status: JOB_STATUS.PENDING, progress: 0 });
    return { job: selectJob.get(recordingId), queued: true };
  }

  function resetStale() {
    const staleSeconds = Math.max(1, Math.round(staleMs / 1000));
    const stale = db
      .prepare(
        `SELECT id, recording_id FROM transcription_jobs
          WHERE status = 'processing'
            AND started_at IS NOT NULL
            AND started_at <= datetime('now', ?)`
      )
      .all(`-${staleSeconds} seconds`);
    for (const job of stale) {
      db.prepare(
        `UPDATE transcription_jobs
            SET status = 'pending', next_attempt_at = NULL, error = '任务中断，已重新排队',
                started_at = NULL, updated_at = datetime('now')
          WHERE id = ?`
      ).run(job.id);
      auditRecording(job.recording_id, { status: JOB_STATUS.PENDING, progress: 0 });
    }
    return stale.length;
  }

  async function runOnce() {
    if (!provider) throw new Error('转写服务未配置');
    const job = selectNext.get();
    if (!job) return null;

    const claimed = db
      .prepare(
        `UPDATE transcription_jobs
            SET status = 'processing', started_at = datetime('now'), updated_at = datetime('now'),
                progress = 1, error = NULL
          WHERE id = ? AND status = 'pending'`
      )
      .run(job.id);
    if (claimed.changes === 0) return null;

    auditRecording(job.recording_id, { status: JOB_STATUS.PROCESSING, progress: 1 });
    lastProgress.set(job.id, { value: 1, at: Date.now() });

    const filePath = join(storageDir, 'audios', job.storage);
    const startedAt = Date.now();

    try {
      if (!existsSync(filePath)) {
        throw Object.assign(new Error(`音频文件缺失：${job.storage}`), { retryable: false });
      }

      const result = await provider({
        recordingId: job.recording_id,
        courseId: job.course_id,
        filePath,
        filename: job.filename,
        mimeType: guessMimeType(job.filename),
        onProgress: (value) => updateJobProgress(job.id, job.recording_id, value)
      });

      const text = String(result?.text || '').trim();
      if (!text) {
        throw Object.assign(new Error('转写结果为空'), { retryable: false });
      }

      db.prepare(
        `UPDATE recordings
            SET transcript = ?, transcript_status = 'completed', transcript_progress = 100,
                transcript_error = NULL, transcript_source = ?, transcript_updated_at = datetime('now')
          WHERE id = ?`
      ).run(text, result?.provider || job.provider || 'unknown', job.recording_id);
      db.prepare(
        `UPDATE transcription_jobs
            SET status = 'completed', progress = 100, error = NULL,
                finished_at = datetime('now'), updated_at = datetime('now')
          WHERE id = ?`
      ).run(job.id);
      lastProgress.delete(job.id);

      logger.log?.(
        `[asr] 转写完成 recording=${job.recording_id} provider=${result?.provider || 'unknown'} ` +
          `chars=${text.length} elapsed=${Date.now() - startedAt}ms`
      );
      return { jobId: job.id, recordingId: job.recording_id, status: JOB_STATUS.COMPLETED };
    } catch (error) {
      const attempts = job.attempts + 1;
      const retryable = error?.retryable !== false;
      const willRetry = retryable && attempts < (job.max_attempts || maxAttempts);
      const message = shortError(error);

      if (willRetry) {
        const delaySeconds = Math.max(0, Math.round(retryDelayMs / 1000));
        db.prepare(
          `UPDATE transcription_jobs
              SET status = 'pending', attempts = ?, error = ?, started_at = NULL,
                  next_attempt_at = datetime('now', ?), updated_at = datetime('now')
            WHERE id = ?`
        ).run(attempts, message, `+${delaySeconds} seconds`, job.id);
        auditRecording(job.recording_id, { status: JOB_STATUS.PENDING, progress: 0, error: message });
      } else {
        db.prepare(
          `UPDATE transcription_jobs
              SET status = 'failed', attempts = ?, error = ?, finished_at = datetime('now'),
                  updated_at = datetime('now')
            WHERE id = ?`
        ).run(attempts, message, job.id);
        auditRecording(job.recording_id, { status: JOB_STATUS.FAILED, progress: 0, error: message });
      }
      lastProgress.delete(job.id);

      logger.error?.(
        `[asr] 转写失败 recording=${job.recording_id} attempts=${attempts} retry=${willRetry} error=${message}`
      );
      return {
        jobId: job.id,
        recordingId: job.recording_id,
        status: willRetry ? JOB_STATUS.PENDING : JOB_STATUS.FAILED,
        error: message
      };
    }
  }

  async function tick() {
    if (running || !provider) return;
    running = true;
    try {
      // 处理本轮所有到期任务，避免多个任务时每轮只推进一个
      let processed = 0;
      while (processed < 20) {
        const result = await runOnce();
        if (!result) break;
        processed += 1;
        if (result.status === JOB_STATUS.PENDING) break; // 失败退避，等下一轮
      }
    } catch (error) {
      logger.error?.(`[asr] 队列执行异常：${error.message}`);
    } finally {
      running = false;
    }
  }

  function start() {
    if (timer) return;
    resetStale();
    timer = setInterval(tick, pollIntervalMs);
    timer.unref?.();
  }

  function stop() {
    if (timer) clearInterval(timer);
    timer = null;
  }

  function getJob(recordingId) {
    return selectJob.get(recordingId) || null;
  }

  return { enqueue, runOnce, start, stop, resetStale, getJob, tick };
}
