import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { ownCourseMiddleware, ownRecordingMiddleware } from '../access.js';
import { asrConfig, asrStatus, transcriptionWorker } from '../asr/service.js';
import { AUDIO_MIME_BY_EXT } from '../asr/config.js';

const router = Router();
router.use(authMiddleware);

const MAX_TRANSCRIPT_LENGTH = 200000;

function jobToPayload(recordingId, job, recording) {
  const status = job?.status || recording?.transcript_status || 'none';
  return {
    recordingId: Number(recordingId),
    status,
    progress: job ? job.progress : recording?.transcript_progress ?? (status === 'completed' ? 100 : 0),
    error: job?.error || recording?.transcript_error || null,
    attempts: job?.attempts || 0,
    maxAttempts: job?.max_attempts || asrConfig.maxAttempts,
    transcript: recording?.transcript || null,
    source: recording?.transcript_source || null,
    updatedAt: recording?.transcript_updated_at || job?.updated_at || null,
    configured: asrConfig.configured,
    provider: asrConfig.provider || null
  };
}

function loadRecording(recordingId) {
  return db.prepare('SELECT * FROM recordings WHERE id = ?').get(recordingId);
}

router.get('/capabilities', (req, res) => {
  res.json({
    ...asrStatus(),
    maxAttempts: asrConfig.maxAttempts,
    supportedFormats: Object.keys(AUDIO_MIME_BY_EXT),
    maxFileSizeMb: 200
  });
});

router.get('/course/:courseId', ownCourseMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT j.*, r.filename, r.transcript_status, r.transcript_progress, r.transcript_error
         FROM transcription_jobs j
         JOIN recordings r ON r.id = j.recording_id
        WHERE r.course_id = ?
        ORDER BY j.id DESC`
    )
    .all(req.course.id);
  res.json(rows);
});

router.post('/:recordingId/start', ownRecordingMiddleware, (req, res) => {
  if (!asrConfig.configured) {
    return res.status(503).json({
      error: asrConfig.reason || '转写服务未配置',
      code: 'ASR_NOT_CONFIGURED',
      hint: '在 backend/.env 中设置 ASR_PROVIDER 与对应的 API 密钥，或配置本地 whisper 命令'
    });
  }

  const recording = req.recording;
  if (!recording.storage) {
    return res.status(400).json({ error: '录音缺少存储路径，无法转写' });
  }

  try {
    const result = transcriptionWorker.enqueue(recording.id, { provider: asrConfig.provider });
    if (!result.queued) {
      return res.status(409).json({
        error: result.reason === 'processing' ? '该录音正在转写中' : '该录音已在转写队列中',
        status: jobToPayload(recording.id, result.job, loadRecording(recording.id))
      });
    }

    // 立即触发一次调度，前端随后轮询状态
    setTimeout(() => {
      transcriptionWorker.tick().catch(() => {});
    }, 0);

    res.status(202).json(jobToPayload(recording.id, result.job, loadRecording(recording.id)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.get('/:recordingId/status', ownRecordingMiddleware, (req, res) => {
  const job = transcriptionWorker.getJob(req.recording.id);
  const recording = loadRecording(req.recording.id);
  res.json(jobToPayload(req.recording.id, job, recording));
});

router.post('/:recordingId/retry', ownRecordingMiddleware, (req, res) => {
  if (!asrConfig.configured) {
    return res.status(503).json({ error: asrConfig.reason || '转写服务未配置', code: 'ASR_NOT_CONFIGURED' });
  }

  const job = transcriptionWorker.getJob(req.recording.id);
  if (job && (job.status === 'processing' || job.status === 'pending')) {
    return res.status(409).json({ error: '该录音已在转写队列中' });
  }

  try {
    const result = transcriptionWorker.enqueue(req.recording.id, {
      provider: asrConfig.provider,
      maxAttemptsOverride: asrConfig.maxAttempts
    });
    setTimeout(() => {
      transcriptionWorker.tick().catch(() => {});
    }, 0);
    res.status(202).json(jobToPayload(req.recording.id, result.job, loadRecording(req.recording.id)));
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

router.put('/:recordingId/result', ownRecordingMiddleware, (req, res) => {
  const text = typeof req.body?.text === 'string' ? req.body.text.trim() : '';
  if (!text) return res.status(400).json({ error: '转写内容不能为空' });
  if (text.length > MAX_TRANSCRIPT_LENGTH) {
    return res.status(413).json({ error: '转写内容过长' });
  }

  db.prepare(
    `UPDATE recordings
        SET transcript = ?, transcript_status = 'completed', transcript_progress = 100,
            transcript_error = NULL, transcript_source = 'manual',
            transcript_updated_at = datetime('now')
      WHERE id = ?`
  ).run(text, req.recording.id);
  db.prepare(
    `UPDATE transcription_jobs
        SET status = 'completed', progress = 100, error = NULL, updated_at = datetime('now')
      WHERE recording_id = ?`
  ).run(req.recording.id);

  res.json(jobToPayload(req.recording.id, transcriptionWorker.getJob(req.recording.id), loadRecording(req.recording.id)));
});

export default router;
