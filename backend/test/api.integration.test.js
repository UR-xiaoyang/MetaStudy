import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import net from 'node:net';
import { spawn } from 'node:child_process';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const backendDir = join(__dirname, '..');

const TRANSCRIPT =
  '牛顿第二定律指出，物体加速度与所受合力成正比，与质量成反比。加速度的方向与合力方向相同。';

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function startStubServer() {
  return new Promise((resolve) => {
    const calls = [];
    const server = http.createServer((req, res) => {
      const chunks = [];
      req.on('data', (chunk) => chunks.push(chunk));
      req.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        calls.push({ url: req.url, raw });

        if (req.url.startsWith('/v1/audio/transcriptions')) {
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ text: TRANSCRIPT, language: 'zh' }));
          return;
        }

        if (req.url.startsWith('/v1/chat/completions')) {
          const payload = JSON.parse(raw);
          const prompt = payload.messages.map((m) => m.content).join('\n');
          let content = '{}';
          if (prompt.includes('生成课程笔记')) {
            content = JSON.stringify({
              title: '牛顿运动定律',
              outline: ['合力与加速度', '质量与惯性'],
              keywords: ['合力', '加速度', '质量'],
              summary: '合力决定加速度，质量决定惯性。',
              content: '# 牛顿运动定律\n\n## 合力与加速度\n**合力**越大，加速度越大。'
            });
          } else if (prompt.includes('生成练习题')) {
            content = JSON.stringify({
              questions: [
                { type: 'choice', question: '合力不变时，质量增大，加速度如何变化？', options: ['增大', '减小', '不变', '先增后减'], answer: 'B', explanation: 'a=F/m' },
                { type: 'fill', question: '加速度的方向与 ____ 的方向相同。', answer: '合力', explanation: '矢量同向' },
                { type: 'essay', question: '简述牛顿第二定律。', answer: '合力与加速度成正比；与质量成反比；方向相同' }
              ]
            });
          } else if (prompt.includes('批改简答题')) {
            content = JSON.stringify({
              score: 75,
              max_score: 100,
              feedback: '关系写对了，但没有说明方向，也缺少质量的前提。',
              strengths: ['写出了正比关系'],
              weaknesses: ['未说明方向', '遗漏质量条件'],
              suggestions: ['补上“方向与合力相同”']
            });
          } else if (prompt.includes('讲解一道做错的题')) {
            content = JSON.stringify({
              error_type: '概念混淆',
              explanation: '### 错因分析\n你混淆了合力与质量的关系。\n\n### 正确思路\na=F/m。'
            });
          } else if (prompt.includes('生成三阶段学习计划')) {
            content = JSON.stringify({
              preview: '# 预习计划\n\n1. 通读课本\n2. 标记疑问',
              review: '# 复习计划\n\n1. 复述定律\n2. 重做错题',
              practice: '# 练习计划\n\n1. 完成 3 道题\n2. 整理错因',
              focus: ['方向判断']
            });
          }
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(
            JSON.stringify({
              model: 'stub-model',
              choices: [{ message: { role: 'assistant', content } }],
              usage: { prompt_tokens: 120, completion_tokens: 60 }
            })
          );
          return;
        }

        res.writeHead(404);
        res.end('not found');
      });
    });

    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        base: `http://127.0.0.1:${port}`,
        calls,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

async function waitFor(check, { timeoutMs = 20000, intervalMs = 150, label = '条件' } = {}) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const value = await check();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
  throw new Error(`等待超时：${label}`);
}

async function api(base, path, { method = 'GET', token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (body) headers['Content-Type'] = 'application/json';
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body: form || (body ? JSON.stringify(body) : undefined)
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, data };
}

test('端到端：上传音频 → 后台转写 → AI 笔记/习题/批改/讲解/计划', { timeout: 90000 }, async (t) => {
  const stub = await startStubServer();
  const port = await freePort();
  const base = `http://127.0.0.1:${port}`;
  const root = mkdtempSync(join(tmpdir(), 'api-e2e-'));

  const child = spawn(process.execPath, ['src/server.js'], {
    cwd: backendDir,
    env: {
      ...process.env,
      PORT: String(port),
      AUTH_SECRET: 'integration-secret-integration-secret',
      DATA_DIR: join(root, 'data'),
      STORAGE_DIR: join(root, 'storage'),
      ASR_PROVIDER: 'openai',
      ASR_API_URL: `${stub.base}/v1/audio/transcriptions`,
      ASR_API_KEY: 'test-asr-key',
      ASR_MODEL: 'whisper-1',
      ASR_POLL_INTERVAL_MS: '80',
      LLM_API_KEY: 'test-llm-key',
      LLM_BASE_URL: `${stub.base}/v1`,
      LLM_MODEL: 'stub-model',
      LLM_MAX_RETRIES: '0',
      LLM_TIMEOUT_MS: '10000',
      NODE_ENV: 'test'
    },
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let logs = '';
  child.stdout.on('data', (chunk) => {
    logs += chunk.toString();
  });
  child.stderr.on('data', (chunk) => {
    logs += chunk.toString();
  });

  t.after(async () => {
    child.kill();
    await stub.close();
  });

  await waitFor(
    async () => {
      try {
        const response = await fetch(`${base}/api/health`);
        return response.ok;
      } catch {
        return false;
      }
    },
    { label: '后端启动', timeoutMs: 20000 }
  );

  // 注册
  const register = await api(base, '/api/auth/register', {
    method: 'POST',
    body: { username: `student_${Date.now()}`, password: 'Passw0rd!123' }
  });
  assert.equal(register.status, 201, JSON.stringify(register.data));
  const token = register.data.token;
  assert.ok(token);

  // 能力探测
  const capabilities = await api(base, '/api/transcribe/capabilities', { token });
  assert.equal(capabilities.data.configured, true);
  assert.equal(capabilities.data.provider, 'openai');
  assert.ok(capabilities.data.supportedFormats.includes('.m4a'));

  const aiStatus = await api(base, '/api/ai/status', { token });
  assert.equal(aiStatus.data.configured, true);
  assert.equal(aiStatus.data.model, 'stub-model');

  // 课程
  const course = await api(base, '/api/courses', { method: 'POST', token, body: { title: '牛顿运动定律', subject: '物理' } });
  assert.equal(course.status, 201, JSON.stringify(course.data));
  const courseId = course.data.id;

  // 上传音频（webm，模拟浏览器录音）
  const form = new FormData();
  form.append('file', new Blob([Buffer.from('fake-webm-bytes')], { type: 'audio/webm' }), 'lesson.webm');
  form.append('duration', '300');
  const upload = await api(base, `/api/uploads/audios/${courseId}`, { method: 'POST', token, form });
  assert.equal(upload.status, 201, JSON.stringify(upload.data));
  const recordingId = upload.data.id;

  // 启动转写
  const start = await api(base, `/api/transcribe/${recordingId}/start`, { method: 'POST', token });
  assert.equal(start.status, 202, JSON.stringify(start.data));
  assert.equal(start.data.status, 'pending');

  const duplicate = await api(base, `/api/transcribe/${recordingId}/start`, { method: 'POST', token });
  assert.equal([409, 202].includes(duplicate.status), true);

  const finished = await waitFor(
    async () => {
      const status = await api(base, `/api/transcribe/${recordingId}/status`, { token });
      if (status.data.status === 'failed') throw new Error(`转写失败：${status.data.error}`);
      return status.data.status === 'completed' ? status.data : null;
    },
    { label: '转写完成' }
  );
  assert.equal(finished.progress, 100);
  assert.equal(finished.transcript, TRANSCRIPT);
  assert.equal(finished.source, 'openai');
  assert.ok(stub.calls.some((call) => call.url.startsWith('/v1/audio/transcriptions')));

  // 转写结果可编辑保存
  const edited = await api(base, `/api/transcribe/${recordingId}/result`, {
    method: 'PUT',
    token,
    body: { text: `${TRANSCRIPT}（已人工校对）` }
  });
  assert.equal(edited.status, 200);
  assert.equal(edited.data.source, 'manual');
  assert.match(edited.data.transcript, /已人工校对/);

  // AI 笔记
  const note = await api(base, `/api/notes/generate/${courseId}`, { method: 'POST', token });
  assert.equal(note.status, 200, JSON.stringify(note.data));
  assert.equal(note.data.engine, 'llm');
  assert.match(note.data.content, /牛顿运动定律/);
  assert.equal(note.data.model, 'stub-model');

  // AI 习题（中级难度）
  const generated = await api(base, `/api/questions/generate/${courseId}`, {
    method: 'POST',
    token,
    body: { difficulty: 'medium', count: 3 }
  });
  assert.equal(generated.status, 201, JSON.stringify(generated.data));
  assert.equal(generated.data.engine, 'llm');
  assert.equal(generated.data.questions.length, 3);
  assert.ok(generated.data.questions.every((q) => q.difficulty === 'medium'));

  const questions = await api(base, `/api/questions/${courseId}`, { token });
  assert.equal(questions.data.length, 3);

  const choice = questions.data.find((q) => q.type === 'choice');
  const essay = questions.data.find((q) => q.type === 'essay');
  assert.ok(choice && essay);
  assert.equal(JSON.parse(choice.options).length, 4);

  // 提交批改：选择题答对、简答题走 LLM
  const submit = await api(base, `/api/quiz/${courseId}/submit`, {
    method: 'POST',
    token,
    body: { answers: { [choice.id]: 'B', [essay.id]: '合力越大加速度越大' } }
  });
  assert.equal(submit.status, 201, JSON.stringify(submit.data));
  assert.equal(submit.data.engine, 'mixed');

  const essayResult = submit.data.results.find((item) => item.questionId === essay.id);
  assert.equal(essayResult.engine, 'llm');
  assert.match(essayResult.feedback, /方向/);
  assert.equal(essayResult.maxScore, 3);
  assert.equal(essayResult.score, 2);

  // AI 错题讲解
  const explain = await api(base, `/api/quiz/${courseId}/explain/${essay.id}`, {
    method: 'POST',
    token,
    body: { student_answer: '质量越大加速度越大' }
  });
  assert.equal(explain.status, 200);
  assert.equal(explain.data.engine, 'llm');
  assert.equal(explain.data.errorType, '概念混淆');
  assert.match(explain.data.explanation, /错因分析/);

  // AI 学习计划
  const plan = await api(base, `/api/plans/generate/${courseId}`, { method: 'POST', token });
  assert.equal(plan.status, 200, JSON.stringify(plan.data));
  assert.equal(plan.data.engine, 'llm');
  assert.match(plan.data.preview, /预习计划/);
  assert.deepEqual(JSON.parse(plan.data.state).preview, [false, false]);

  // 成本审计
  const usage = await api(base, '/api/ai/status', { token });
  assert.equal(usage.data.usage7d.length >= 4, true);
  assert.ok(usage.data.usage7d.every((row) => row.calls > 0));
  assert.ok(usage.data.totalCost7d >= 0);

  // 失败用例：未配置转写时返回明确提示（另一个进程不适用，这里验证权限边界）
  const forbidden = await api(base, `/api/transcribe/${recordingId}/status`, { token: 'invalid-token' });
  assert.equal(forbidden.status, 401);

  assert.ok(!logs.includes('UnhandledPromiseRejection'), logs);
});
