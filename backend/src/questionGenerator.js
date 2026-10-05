import { db } from './db.js';

const COMMON_STOPWORDS =
  /(的|了|和|是|在|与|及|或|都|也|就|很|而|因为|所以|但是|以及|可以|我们|你们|他们|这个|那个|对于|关于|什么|如何|为什么|进行|具有|包括|以及)/g;

function extractKeywords(...texts) {
  const words = new Set();
  const chunk = texts.filter(Boolean).join(' ');
  const tokens = chunk
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((t) => t.length >= 1);

  const arr = Array.from(tokens);
  for (let i = 0; i < arr.length; i++) {
    const word = arr[i].replace(COMMON_STOPWORDS, '');
    if (!word) continue;
    if (/[\u4e00-\u9fa5]{2,}/.test(word)) words.add(word);
    else if (word.length >= 2) words.add(word);
  }
  return Array.from(words);
}

function generateChoice(course, keywords) {
  const topic = keywords.length ? keywords[0] : course.title;
  const options = [
    topic,
    '与该主题无关的干扰项A',
    '与该主题无关的干扰项B',
    '与该主题无关的干扰项C'
  ];
  shuffle(options);
  const answerIndex = options.indexOf(topic);
  return {
    type: 'choice',
    question: `关于「${course.title}」这一课，下列说法正确的是哪一项？（围绕主题词：${topic}）`,
    options: JSON.stringify(options),
    answer: String.fromCharCode(65 + answerIndex)
  };
}

function generateFill(course, keywords) {
  const target = keywords.length > 1 ? keywords[1] : (keywords[0] || course.title);
  return {
    type: 'fill',
    question: `本节课「${course.title}」中，请补全下面这句话的空缺：${course.title}与「____」密切相关。`,
    options: null,
    answer: target
  };
}

function generateEssay(course, keywords) {
  const target = keywords.slice(0, 3).join('、') || course.title;
  return {
    type: 'essay',
    question: `请结合本节课「${course.title}」的内容（关键词：${target}），用自己的话总结本节课的核心知识点，并举例说明。`,
    options: null,
    answer: `本题为开放性题目，参考答案方向：围绕「${course.title}」及关键词「${target}」进行总结与举例。`
  };
}

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

export function generateQuestionsForCourse(courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) throw new Error('课程不存在');

  const images = db
    .prepare('SELECT filename FROM images WHERE course_id = ?')
    .all(courseId)
    .map((r) => r.filename);
  const recordings = db
    .prepare('SELECT filename FROM recordings WHERE course_id = ?')
    .all(courseId)
    .map((r) => r.filename);

  const keywords = extractKeywords(course.title, course.subject, ...images, ...recordings);
  if (!keywords.length) keywords.push(course.title);

  const questions = [
    generateChoice(course, keywords),
    generateFill(course, keywords),
    generateEssay(course, keywords)
  ];

  const insert = db.prepare(
    'INSERT INTO questions (course_id, type, question, options, answer) VALUES (?, ?, ?, ?, ?)'
  );
  for (const q of questions) {
    insert.run(courseId, q.type, q.question, q.options, q.answer);
  }
  return questions;
}
