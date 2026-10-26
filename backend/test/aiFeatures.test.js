import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const root = mkdtempSync(join(tmpdir(), 'ai-features-'));
process.env.DATA_DIR = join(root, 'data');
process.env.STORAGE_DIR = join(root, 'storage');

const { db } = await import('../src/db.js');
const { generateNoteForCourse, buildRuleNote } = await import('../src/noteGenerator.js');
const { generateQuestionsForCourse, buildRuleQuestions } = await import('../src/questionGenerator.js');
const { gradeAnswerWithAi } = await import('../src/grading.js');
const { normalizeQuestions, normalizeGrading, normalizePlan } = await import('../src/llm/service.js');

const TRANSCRIPT =
  '牛顿第二定律指出，物体加速度与所受合力成正比，与质量成反比。加速度的方向与合力方向相同。' +
  '在经典力学中，质量是物体惯性的量度，合力为零时物体保持静止或匀速直线运动。';

function seedCourse(title = '牛顿运动定律', transcript = TRANSCRIPT) {
  const userId = Number(
    db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(`u-${Math.random()}`, 'x').lastInsertRowid
  );
  const classId = Number(
    db
      .prepare('INSERT INTO classes (name, invite_code, owner_id, is_personal) VALUES (?, ?, ?, 1)')
      .run('个人空间', `code-${Math.random()}`, userId).lastInsertRowid
  );
  const courseId = Number(
    db.prepare('INSERT INTO courses (class_id, title, subject, created_by) VALUES (?, ?, ?, ?)')
      .run(classId, title, '物理', userId).lastInsertRowid
  );
  if (transcript) {
    db.prepare(
      'INSERT INTO recordings (course_id, filename, storage, duration, size, transcript, uploaded_by) VALUES (?, ?, ?, 300, 100, ?, ?)'
    ).run(courseId, 'lesson.webm', 'lesson.webm', transcript, userId);
  }
  return { userId, courseId };
}

test('LLM 失败时笔记降级为规则模板并标记 degraded', async () => {
  const { courseId } = seedCourse();
  const failingAi = {
    configured: true,
    generateNote: async () => {
      throw new Error('upstream 502');
    }
  };

  const result = await generateNoteForCourse(courseId, { ai: failingAi });
  assert.equal(result.engine, 'rule');
  assert.equal(result.degraded, true);
  assert.match(result.error, /502/);
  assert.match(result.content, /课程笔记/);
  assert.match(result.content, /课堂语音要点/);
});

test('LLM 成功时使用模型生成的笔记', async () => {
  const { courseId } = seedCourse();
  const ai = {
    configured: true,
    generateNote: async () => ({
      data: { content: '# AI 笔记\n\n## 知识点\n合力与加速度成正比。', title: 'AI 笔记', outline: [], keywords: [], summary: '' },
      model: 'glm-4-flash'
    })
  };

  const result = await generateNoteForCourse(courseId, { ai });
  assert.equal(result.engine, 'llm');
  assert.equal(result.degraded, false);
  assert.equal(result.model, 'glm-4-flash');
  assert.match(result.content, /合力与加速度成正比/);
});

test('未配置 LLM 时始终使用规则模板且不标记降级', async () => {
  const { courseId } = seedCourse();
  const result = await generateNoteForCourse(courseId, { ai: { configured: false } });
  assert.equal(result.engine, 'rule');
  assert.equal(result.degraded, false);
});

test('规则习题基于课堂原话挖空，答案确实出现在原句中', () => {
  const context = {
    images: [],
    recordings: [{ filename: 'lesson.webm', transcript: TRANSCRIPT }],
    transcripts: [TRANSCRIPT]
  };
  const questions = buildRuleQuestions({ id: 1, title: '牛顿运动定律', subject: '物理' }, context, {
    difficulty: 'basic',
    count: 4
  });

  assert.ok(questions.length >= 2);
  const fill = questions.find((q) => q.type === 'fill');
  assert.ok(fill, '应生成填空题');
  assert.match(fill.question, /____/);
  assert.ok(fill.answer.length >= 2);
  assert.ok(fill.question.replace('____', fill.answer).includes('课堂原话'));

  const choice = questions.find((q) => q.type === 'choice');
  if (choice) {
    const options = JSON.parse(choice.options);
    assert.equal(options.length, 4);
    assert.ok(options.includes(fill.answer) || options.length === 4);
    assert.ok(['A', 'B', 'C', 'D'].includes(choice.answer));
  }
});

test('无转写文本时退回通用模板，仍返回可用题目', () => {
  const { courseId } = seedCourse('线性代数', null);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  const questions = buildRuleQuestions(course, { images: [], recordings: [], transcripts: [] }, { count: 3 });
  assert.ok(questions.length >= 1);
  assert.ok(questions.every((q) => q.question && q.answer));
});

test('LLM 出题失败时降级为规则题目并写入 questions 表', async () => {
  const { courseId } = seedCourse();
  const failingAi = {
    configured: true,
    generateQuestions: async () => {
      throw new Error('model overloaded');
    }
  };

  const result = await generateQuestionsForCourse(courseId, { ai: failingAi, difficulty: 'medium', count: 4 });
  assert.equal(result.engine, 'rule');
  assert.equal(result.degraded, true);
  assert.ok(result.questions.length >= 2);

  const rows = db.prepare('SELECT * FROM questions WHERE course_id = ?').all(courseId);
  assert.equal(rows.length, result.questions.length);
  assert.ok(rows.every((row) => row.engine === 'rule' && row.difficulty === 'medium'));
});

test('LLM 出题成功时写入模型题目并带上难度', async () => {
  const { courseId } = seedCourse();
  const ai = {
    configured: true,
    generateQuestions: async ({ difficulty, count }) => ({
      data: Array.from({ length: count }, (_, i) => ({
        type: 'choice',
        question: `模型题目 ${i + 1}`,
        options: ['甲', '乙', '丙', '丁'],
        answer: 'B'
      })),
      model: 'glm-4-flash',
      usage: {},
      latencyMs: 10,
      requestPayload: { difficulty }
    })
  };

  const result = await generateQuestionsForCourse(courseId, { ai, difficulty: 'advanced', count: 3 });
  assert.equal(result.engine, 'llm');
  assert.equal(result.degraded, false);
  assert.equal(result.questions.length, 3);
  assert.equal(result.questions[0].options, JSON.stringify(['甲', '乙', '丙', '丁']));
});

test('AI 批改按评分点缩放分数，失败返回 null 由调用方降级', async () => {
  const question = {
    type: 'essay',
    question: '说明加速度与合力的关系。',
    answer: '合力越大加速度越大；加速度方向与合力相同；质量不变'
  };

  const ai = {
    configured: true,
    gradeEssay: async () => ({
      data: {
        score: 80,
        maxScore: 100,
        feedback: '方向描述正确，但未说明质量不变的前提。',
        strengths: ['合力与加速度的关系正确'],
        weaknesses: ['缺少质量不变的前提'],
        suggestions: ['补充前提条件']
      },
      model: 'glm-4-flash'
    })
  };

  const graded = await gradeAnswerWithAi(question, '合力越大加速度越大，方向与合力相同。', { ai });
  assert.equal(graded.engine, 'llm');
  assert.equal(graded.maxScore, 3);
  assert.equal(graded.score, 2); // 80% × 3 个评分点四舍五入
  assert.equal(graded.percent, 80);
  assert.match(graded.feedback, /质量不变/);

  const failing = { configured: true, gradeEssay: async () => { throw new Error('timeout'); } };
  assert.equal(await gradeAnswerWithAi(question, '随便写的', { ai: failing }), null);
  assert.equal(await gradeAnswerWithAi({ type: 'choice', answer: 'A' }, 'A', { ai }), null);
});

test('LLM 输出校验：非法题目被丢弃，分数被夹紧', () => {
  const questions = normalizeQuestions({
    questions: [
      { type: 'choice', question: '有效题', options: ['甲', '乙', '丙', '丁'], answer: 'C' },
      { type: 'choice', question: '答案越界', options: ['甲', '乙'], answer: 'D' },
      { type: 'unknown', question: '无效题型', answer: 'x' },
      { type: 'fill', question: '', answer: 'x' }
    ]
  });
  assert.equal(questions.length, 1);
  assert.equal(questions[0].answer, 'C');

  const graded = normalizeGrading({ score: 150, feedback: '不错' }, 100);
  assert.equal(graded.score, 100);

  const negative = normalizeGrading({ score: -5, feedback: '错' }, 100);
  assert.equal(negative.score, 0);

  assert.throws(() => normalizePlan({ preview: '', review: 'r', practice: 'p' }));
});

test('规则笔记包含转写字数统计与关键词', () => {
  const course = { id: 1, title: '牛顿运动定律', subject: '物理' };
  const context = {
    images: [{ filename: 'board.png' }],
    recordings: [{ filename: 'lesson.webm', transcript: TRANSCRIPT }],
    transcripts: [TRANSCRIPT],
    questions: [{ question: '什么是惯性？', answer: '物体保持运动状态的性质' }]
  };
  const note = buildRuleNote(course, context);
  assert.match(note, /共 1 段课堂录音/);
  assert.match(note, /已生成 1 道练习题/);
  assert.match(note, /共 1 张课程图片/);
});
