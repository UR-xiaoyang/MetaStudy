import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'asr-queue-'));
process.env.DATA_DIR = join(root, 'data');
process.env.STORAGE_DIR = join(root, 'storage');

const { db, storageDir } = await import('../src/db.js');
const { createTranscriptionWorker } = await import('../src/asr/queue.js');

mkdirSync(join(storageDir, 'audios'), { recursive: true });

function seedRecording(filename = 'lecture.webm', bytes = 'fake-audio') {
  const userId = Number(
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(`u-${Date.now()}-${Math.random()}`, 'x')
      .lastInsertRowid
  );
  const classId = Number(
    db
      .prepare('INSERT INTO classes (name, invite_code, owner_id, is_personal) VALUES (?, ?, ?, 1)')
      .run('个人空间', `code-${Math.random()}`, userId).lastInsertRowid
  );
  const courseId = Number(
    db.prepare('INSERT INTO courses (class_id, title, created_by) VALUES (?, ?, ?)').run(classId, '物理', userId)
      .lastInsertRowid
  );
  const recordingId = Number(
    db
      .prepare('INSERT INTO recordings (course_id, filename, storage, duration, size, uploaded_by) VALUES (?, ?, ?, 300, ?, ?)')
      .run(courseId, filename, filename, bytes.length, userId).lastInsertRowid
  );
  writeFileSync(join(storageDir, 'audios', filename), bytes);
  return { userId, courseId, recordingId };
}

function makeWorker(provider, overrides = {}) {
  return createTranscriptionWorker({
    db,
    storageDir,
    provider,
    pollIntervalMs: 20,
    maxAttempts: 3,
    retryDelayMs: 0,
    logger: { log() {}, warn() {}, error() {} },
    ...overrides
  });
}

test('转写成功：写入 transcript 并把任务标记为 completed', async () => {
  const { recordingId } = seedRecording('ok.webm');
  const worker = makeWorker(async ({ onProgress }) => {
    onProgress(45);
    return { text: '  牛顿第二定律：合力等于质量乘以加速度。 ', provider: 'stub' };
  });

  const queued = worker.enqueue(recordingId, { provider: 'stub' });
  assert.equal(queued.queued, true);

  const result = await worker.runOnce();
  assert.equal(result.status, 'completed');

  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(recordingId);
  assert.equal(recording.transcript, '牛顿第二定律：合力等于质量乘以加速度。');
  assert.equal(recording.transcript_status, 'completed');
  assert.equal(recording.transcript_progress, 100);
  assert.equal(recording.transcript_source, 'stub');

  const job = worker.getJob(recordingId);
  assert.equal(job.status, 'completed');
  assert.equal(job.progress, 100);
  assert.equal(job.attempts, 0);
});

test('运行中会把进度写入任务与录音', async () => {
  const { recordingId } = seedRecording('progress.webm');
  let release;
  const gate = new Promise((resolve) => {
    release = resolve;
  });
  const worker = makeWorker(async ({ onProgress }) => {
    onProgress(40);
    await gate;
    return { text: '完成', provider: 'stub' };
  });

  worker.enqueue(recordingId);
  const running = worker.runOnce();
  await new Promise((resolve) => setTimeout(resolve, 30));

  assert.equal(worker.getJob(recordingId).progress, 40);
  assert.equal(db.prepare('SELECT transcript_progress FROM recordings WHERE id = ?').get(recordingId).transcript_progress, 40);
  assert.equal(db.prepare('SELECT transcript_status FROM recordings WHERE id = ?').get(recordingId).transcript_status, 'processing');

  release();
  await running;
  assert.equal(worker.getJob(recordingId).progress, 100);
});

test('可重试失败会重新排队，达到上限后标记 failed', async () => {
  const { recordingId } = seedRecording('retry.webm');
  let calls = 0;
  const worker = makeWorker(async () => {
    calls += 1;
    throw new Error('上游 503');
  });

  worker.enqueue(recordingId);
  await worker.runOnce();
  let job = worker.getJob(recordingId);
  assert.equal(job.status, 'pending');
  assert.equal(job.attempts, 1);
  assert.match(job.error, /503/);

  await worker.runOnce();
  assert.equal(worker.getJob(recordingId).attempts, 2);

  await worker.runOnce();
  job = worker.getJob(recordingId);
  assert.equal(job.status, 'failed');
  assert.equal(job.attempts, 3);
  assert.equal(calls, 3);

  const recording = db.prepare('SELECT * FROM recordings WHERE id = ?').get(recordingId);
  assert.equal(recording.transcript_status, 'failed');
  assert.match(recording.transcript_error, /503/);
});

test('不可重试错误（文件缺失）直接失败，不消耗重试次数', async () => {
  const { recordingId } = seedRecording('missing.webm');
  const worker = makeWorker(async () => ({ text: '不会执行', provider: 'stub' }));

  db.prepare('UPDATE recordings SET storage = ? WHERE id = ?').run('not-exists.webm', recordingId);
  worker.enqueue(recordingId);
  await worker.runOnce();

  const job = worker.getJob(recordingId);
  assert.equal(job.status, 'failed');
  assert.equal(job.attempts, 1);
  assert.match(job.error, /音频文件缺失/);
});

test('返回空文本视为不可重试失败', async () => {
  const { recordingId } = seedRecording('empty.webm');
  const worker = makeWorker(async () => ({ text: '   ', provider: 'stub' }));

  worker.enqueue(recordingId);
  await worker.runOnce();

  const job = worker.getJob(recordingId);
  assert.equal(job.status, 'failed');
  assert.equal(db.prepare('SELECT transcript_status FROM recordings WHERE id = ?').get(recordingId).transcript_status, 'failed');
});

test('重复入队不会创建第二个任务', async () => {
  const { recordingId } = seedRecording('dup.webm');
  const worker = makeWorker(async () => ({ text: '文本', provider: 'stub' }));

  const first = worker.enqueue(recordingId);
  const second = worker.enqueue(recordingId);
  assert.equal(first.queued, true);
  assert.equal(second.queued, false);
  assert.equal(second.job.id, first.job.id);

  const count = db.prepare('SELECT COUNT(*) AS n FROM transcription_jobs WHERE recording_id = ?').get(recordingId).n;
  assert.equal(count, 1);
});

test('陈旧 processing 任务会被重新排队', async () => {
  const { recordingId } = seedRecording('stale.webm');
  const worker = makeWorker(async () => ({ text: '文本', provider: 'stub' }), { staleMs: 1000 });

  const queued = worker.enqueue(recordingId);
  db.prepare(
    `UPDATE transcription_jobs SET status = 'processing', started_at = datetime('now', '-1 hour') WHERE id = ?`
  ).run(queued.job.id);

  const recovered = worker.resetStale();
  assert.equal(recovered, 1);
  assert.equal(worker.getJob(recordingId).status, 'pending');
  assert.equal(db.prepare('SELECT transcript_status FROM recordings WHERE id = ?').get(recordingId).transcript_status, 'pending');
});

test('扫描只处理当前到期任务，无任务时返回 null', async () => {
  const worker = makeWorker(async () => ({ text: '文本', provider: 'stub' }));

  const { recordingId } = seedRecording('future.webm');
  const queued = worker.enqueue(recordingId);
  db.prepare(`UPDATE transcription_jobs SET next_attempt_at = datetime('now', '+1 hour') WHERE id = ?`).run(queued.job.id);

  // 先清空其它用例遗留的到期任务
  while (await worker.runOnce()) {
    // drain
  }

  const job = worker.getJob(recordingId);
  assert.equal(job.status, 'pending');
  assert.equal(job.attempts, 0);
});
