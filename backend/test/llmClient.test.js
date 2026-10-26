import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'llm-client-'));
process.env.DATA_DIR = join(root, 'data');
process.env.STORAGE_DIR = join(root, 'storage');

const { db } = await import('../src/db.js');
const { createLlmClient, extractJson, LlmError } = await import('../src/llm/client.js');

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/v1`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

function reply(res, content, { status = 200, usage } = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(
    JSON.stringify({
      model: 'stub-model',
      choices: [{ message: { role: 'assistant', content } }],
      usage: usage || { prompt_tokens: 100, completion_tokens: 50 }
    })
  );
}

function makeClient(serverUrl, overrides = {}) {
  return createLlmClient(
    {
      configured: true,
      apiKey: 'test-key',
      baseUrl: serverUrl,
      model: 'stub-model',
      timeoutMs: 5000,
      maxRetries: 2,
      temperature: 0.2,
      maxTokens: 512,
      jsonMode: false,
      pricePer1kInput: 0.1,
      pricePer1kOutput: 0.1,
      ...overrides
    },
    { db, logger: { log() {}, warn() {}, error() {} }, sleepImpl: async () => {} }
  );
}

const messages = [{ role: 'user', content: 'hello' }];

test('extractJson 兼容纯 JSON、代码块与前后说明文字', () => {
  assert.deepEqual(extractJson('{"a":1}'), { a: 1 });
  assert.deepEqual(extractJson('```json\n{"a":2}\n```'), { a: 2 });
  assert.deepEqual(extractJson('好的，结果如下：\n```\n{"a":3}\n```\n以上。'), { a: 3 });
  assert.deepEqual(extractJson('说明文字 {"a":{"b":[1,2]}} 结束'), { a: { b: [1, 2] } });
  assert.throws(() => extractJson('没有 JSON'), (error) => error instanceof LlmError && error.code === 'LLM_BAD_JSON');
  assert.throws(() => extractJson('   '), (error) => error.code === 'LLM_EMPTY');
});

test('chat 发送 OpenAI 兼容请求，并记录用量与成本', async () => {
  let body = null;
  let auth = null;
  const server = await startServer((req, res) => {
    auth = req.headers.authorization;
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      reply(res, '{"ok":true}');
    });
  });

  try {
    const client = makeClient(server.url);
    const result = await client.chat({ messages, feature: 'unit_test', userId: 42 });
    assert.equal(result.content, '{"ok":true}');
    assert.equal(auth, 'Bearer test-key');
    assert.equal(body.model, 'stub-model');
    assert.equal(body.stream, false);
    assert.equal(body.temperature, 0.2);

    const row = db.prepare("SELECT * FROM llm_calls WHERE feature = 'unit_test' ORDER BY id DESC LIMIT 1").get();
    assert.equal(row.success, 1);
    assert.equal(row.user_id, 42);
    assert.equal(row.prompt_tokens, 100);
    assert.equal(row.completion_tokens, 50);
    assert.equal(row.model, 'stub-model');
    // (100/1000)*0.1 + (50/1000)*0.1 = 0.015
    assert.ok(Math.abs(row.cost - 0.015) < 1e-9);
  } finally {
    await server.close();
  }
});

test('5xx 会重试，成功后不再报错', async () => {
  let calls = 0;
  const server = await startServer((req, res) => {
    calls += 1;
    if (calls === 1) {
      res.writeHead(500);
      res.end('upstream boom');
      return;
    }
    reply(res, '第二次成功');
  });

  try {
    const client = makeClient(server.url);
    const result = await client.chat({ messages, feature: 'retry' });
    assert.equal(result.content, '第二次成功');
    assert.equal(calls, 2);
  } finally {
    await server.close();
  }
});

test('401 不重试，并记录失败调用', async () => {
  let calls = 0;
  const server = await startServer((req, res) => {
    calls += 1;
    res.writeHead(401);
    res.end('bad key');
  });

  try {
    const client = makeClient(server.url);
    await assert.rejects(client.chat({ messages, feature: 'auth_fail' }), (error) => {
      assert.equal(error.code, 'LLM_AUTH');
      assert.equal(error.retryable, false);
      return true;
    });
    assert.equal(calls, 1);

    const row = db.prepare("SELECT * FROM llm_calls WHERE feature = 'auth_fail' ORDER BY id DESC LIMIT 1").get();
    assert.equal(row.success, 0);
    assert.match(row.error, /401/);
  } finally {
    await server.close();
  }
});

test('超时返回 LLM_TIMEOUT', async () => {
  const server = await startServer((req, res) => {
    setTimeout(() => reply(res, '太慢'), 400);
  });

  try {
    const client = makeClient(server.url, { timeoutMs: 50, maxRetries: 0 });
    await assert.rejects(client.chat({ messages, feature: 'timeout' }), (error) => error.code === 'LLM_TIMEOUT');
  } finally {
    await server.close();
  }
});

test('chatJson 自动解析代码块包裹的 JSON', async () => {
  const server = await startServer((req, res) => reply(res, '```json\n{"answer":42}\n```'));
  try {
    const client = makeClient(server.url);
    const result = await client.chatJson({ messages, feature: 'json' });
    assert.deepEqual(result.data, { answer: 42 });
  } finally {
    await server.close();
  }
});

test('未配置时立即抛错且不发请求', async () => {
  const client = createLlmClient(
    { configured: false, reason: '未配置 LLM：请设置 LLM_API_KEY', apiKey: '', baseUrl: '', model: '', maxRetries: 0 },
    { db }
  );
  await assert.rejects(client.chat({ messages, feature: 'unconfigured' }), (error) => {
    assert.equal(error.code, 'LLM_NOT_CONFIGURED');
    return true;
  });
});
