import test from 'node:test';
import assert from 'node:assert/strict';
import { gradeAnswer, explainWrongAnswer } from '../src/grading.js';

test('客观题按标准答案给出满分或零分', () => {
  assert.deepEqual(
    gradeAnswer({ type: 'choice', answer: 'B' }, ' b '),
    { correct: true, score: 1, maxScore: 1, feedback: '回答正确。' }
  );

  assert.deepEqual(
    gradeAnswer({ type: 'fill', answer: '牛顿第二定律' }, '第一定律'),
    { correct: false, score: 0, maxScore: 1, feedback: '回答不正确，请回到课堂笔记复习相关知识点。' }
  );
});

test('简答题可识别覆盖多个关键点的回答，并列出遗漏点', () => {
  const result = gradeAnswer(
    {
      type: 'essay',
      answer: '要点：力、质量、加速度之间的关系；说明合力越大，加速度越大。',
      rubric: ['力', '质量', '加速度']
    },
    '合力越大，加速度越大，质量也会影响运动状态。'
  );

  assert.equal(result.correct, true);
  assert.equal(result.score, 3);
  assert.equal(result.maxScore, 3);
  assert.deepEqual(result.matchedPoints, ['力', '质量', '加速度']);
  assert.deepEqual(result.missingPoints, []);
});

test('错题讲解限定在课堂笔记与参考答案范围内', () => {
  const explanation = explainWrongAnswer({
    question: '合力变大时加速度如何变化？',
    answer: '质量不变时，合力越大，加速度越大。',
    studentAnswer: '合力变大，加速度变小。',
    note: '牛顿第二定律：质量不变时，物体加速度与所受合力成正比。',
    knowledgePoints: ['牛顿第二定律', '加速度']
  });

  assert.match(explanation, /课堂依据/);
  assert.match(explanation, /质量不变时/);
  assert.match(explanation, /牛顿第二定律/);
});
