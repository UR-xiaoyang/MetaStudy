import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  transcribeWithOpenAiCompatible,
  transcribeWithCommand,
  splitCommand,
  AsrError
} from '../src/asr/providers.js';

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      resolve({
        url: `http://127.0.0.1:${port}/v1/audio/transcriptions`,
        close: () => new Promise((done) => server.close(done))
      });
    });
  });
}

function makeAudioFile(name = 'sample.webm', content = 'fake-audio-bytes') {
  const dir = mkdtempSync(join(tmpdir(), 'asr-file-'));
  const filePath = join(dir, name);
  writeFileSync(filePath, content);
  return filePath;
}

const baseConfig = {
  apiKey: 'test-key',
  model: 'whisper-1',
  language: 'zh',
  prompt: '',
  timeoutMs: 5000
};

test('OpenAI 兼容接口：按 multipart 上传并解析文本', async () => {
  let captured = null;
  const server = await startServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      captured = {
        method: req.method,
        auth: req.headers.authorization,
        contentType: req.headers['content-type'],
        body: Buffer.concat(chunks).toString('utf8')
      };
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: '这是转写结果。', language: 'zh' }));
    });
  });

  const progress = [];
  try {
    const result = await transcribeWithOpenAiCompatible({
      filePath: makeAudioFile('课堂录音.webm'),
      filename: '课堂录音.webm',
      mimeType: 'audio/webm',
      config: { ...baseConfig, apiUrl: server.url },
      onProgress: (value) => progress.push(value)
    });

    assert.equal(result.text, '这是转写结果。');
    assert.equal(result.provider, 'openai');
    assert.equal(captured.method, 'POST');
    assert.equal(captured.auth, 'Bearer test-key');
    assert.match(captured.contentType, /multipart\/form-data; boundary=/);
    assert.match(captured.body, /name="file"; filename="课堂录音.webm"/);
    assert.match(captured.body, /name="model"[\s\S]*whisper-1/);
    assert.deepEqual(progress.slice(-2), [85, 100]);
  } finally {
    await server.close();
  }
});

test('OpenAI 兼容接口：401 不可重试，500 可重试', async () => {
  const auth = await startServer((req, res) => {
    res.writeHead(401, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'invalid api key' }));
  });
  try {
    await assert.rejects(
      transcribeWithOpenAiCompatible({
        filePath: makeAudioFile(),
        config: { ...baseConfig, apiUrl: auth.url }
      }),
      (error) => {
        assert.ok(error instanceof AsrError);
        assert.equal(error.code, 'ASR_AUTH');
        assert.equal(error.retryable, false);
        assert.match(error.message, /401/);
        return true;
      }
    );
  } finally {
    await auth.close();
  }

  const upstream = await startServer((req, res) => {
    res.writeHead(503);
    res.end('busy');
  });
  try {
    await assert.rejects(
      transcribeWithOpenAiCompatible({
        filePath: makeAudioFile(),
        config: { ...baseConfig, apiUrl: upstream.url }
      }),
      (error) => {
        assert.equal(error.code, 'ASR_HTTP');
        assert.equal(error.retryable, true);
        return true;
      }
    );
  } finally {
    await upstream.close();
  }
});

test('OpenAI 兼容接口：空文本与超时错误码正确', async () => {
  const empty = await startServer((req, res) => {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ text: '   ' }));
  });
  try {
    await assert.rejects(
      transcribeWithOpenAiCompatible({ filePath: makeAudioFile(), config: { ...baseConfig, apiUrl: empty.url } }),
      (error) => error.code === 'ASR_EMPTY' && error.retryable === false
    );
  } finally {
    await empty.close();
  }

  const slow = await startServer((req, res) => {
    setTimeout(() => {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ text: '太慢了' }));
    }, 300);
  });
  try {
    await assert.rejects(
      transcribeWithOpenAiCompatible({
        filePath: makeAudioFile(),
        config: { ...baseConfig, apiUrl: slow.url, timeoutMs: 50 }
      }),
      (error) => error.code === 'ASR_TIMEOUT'
    );
  } finally {
    await slow.close();
  }
});

test('splitCommand 支持引号与空格', () => {
  assert.deepEqual(splitCommand('whisper-cli --model "small model" -f {input} -of {output}'), [
    'whisper-cli',
    '--model',
    'small model',
    '-f',
    '{input}',
    '-of',
    '{output}'
  ]);
  assert.deepEqual(splitCommand("  a  'b c'  "), ['a', 'b c']);
});

test('命令行 provider：读取输出文件并解析进度', async () => {
  const script = [
    "const fs=require('fs');",
    "process.stderr.write('progress 10%\\n');",
    "process.stderr.write('progress 60%\\n');",
    "fs.writeFileSync(process.argv[1], '本地 whisper 转写结果');"
  ].join('');

  const progress = [];
  const result = await transcribeWithCommand({
    filePath: makeAudioFile('local.wav'),
    config: {
      command: `node -e "${script}" {output}`,
      commandOutputFormat: 'txt',
      language: 'zh',
      model: 'small',
      timeoutMs: 15000
    },
    onProgress: (value) => progress.push(value)
  });

  assert.equal(result.text, '本地 whisper 转写结果');
  assert.equal(result.provider, 'command');
  assert.deepEqual(progress, [5, 10, 60, 100]);
});

test('命令行 provider：非零退出码带出 stderr', async () => {
  const script = "process.stderr.write('model file not found');process.exit(2);";
  await assert.rejects(
    transcribeWithCommand({
      filePath: makeAudioFile(),
      config: {
        command: `node -e "${script}"`,
        commandOutputFormat: 'txt',
        timeoutMs: 15000
      }
    }),
    (error) => {
      assert.equal(error.code, 'ASR_COMMAND');
      assert.match(error.message, /model file not found/);
      return true;
    }
  );
});
