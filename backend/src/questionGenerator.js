import { db } from './db.js';

const COMMON_STOPWORDS =
  /(的|了|和|是|在|与|及|或|都|也|就|很|而|因为|所以|但是|以及|可以|我们|你们|他们|这个|那个|对于|关于|什么|如何|为什么|进行|具有|包括|以及)/g;

export const DIFFICULTIES = ['basic', 'medium', 'advanced'];
export const MAX_QUESTIONS = 10;

function extractKeywords(...texts) {
  const words = new Set();
  const chunk = texts.filter(Boolean).join(' ');
  const tokens = chunk
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  for (const token of tokens) {
    const word = token.replace(COMMON_STOPWORDS, '');
    if (!word) continue;
    if (/[\u4e00-\u9fa5]{2,}/.test(word)) words.add(word);
    else if (word.length >= 2) words.add(word);
  }
  return Array.from(words);
}

export function pickSentences(transcript, max = 30) {
  return String(transcript || '')
    .split(/[。！？!?\n]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12 && s.length <= 160)
    .slice(0, max);
}

function shuffle(arr) {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

function choiceFromSentence(sentence, keyword, keywords) {
  const distractors = keywords.filter((k) => k !== keyword && !sentence.includes(k)).slice(0, 3);
  if (distractors.length < 3) return null;
  const options = shuffle([keyword, ...distractors]);
  const answerIndex = options.indexOf(keyword);
  return {
    type: 'choice',
    question: `课堂原话「${sentence.replace(keyword, '____')}」中，横线处应填入哪个概念？`,
    options: JSON.stringify(options),
    answer: String.fromCharCode(65 + answerIndex)
  };
}

function fillFromSentence(sentence, keyword) {
  return {
    type: 'fill',
    question: `请补全课堂原话中的空缺：「${sentence.replace(keyword, '____')}」`,
    options: null,
    answer: keyword
  };
}

function essayFromCourse(course, keywords, sentences) {
  const target = keywords.slice(0, 3);
  const reference = sentences.slice(0, 2).join('；');
  return {
    type: 'essay',
    question: target.length
      ? `请结合本节课堂内容，说明「${target[0]}」的含义，并举例说明它在「${course.title}」中的作用。`
      : `请结合本节课堂内容，用自己的话总结「${course.title}」的核心知识点，并举例说明。`,
    options: null,
    answer: reference || (target.length ? target.join('；') : course.title)
  };
}

/**
 * 规则出题：优先用课堂原话挖空，保证题目与本课内容相关；
 * 没有转写文本时才退回通用模板。
 */
export function buildRuleQuestions(course, context = {}, { difficulty = 'basic', count = 5 } = {}) {
  const { images = [], recordings = [], transcripts = [] } = context;
  const sentences = pickSentences(transcripts.join(' '));
  const keywords = extractKeywords(
    course.title,
    course.subject,
    ...transcripts,
    ...images.map((i) => i.filename),
    ...recordings.map((r) => r.filename)
  );
  if (!keywords.length) keywords.push(course.title);

  const order =
    difficulty === 'advanced'
      ? ['essay', 'choice', 'fill']
      : difficulty === 'medium'
        ? ['choice', 'fill', 'essay']
        : ['fill', 'choice', 'essay'];

  const questions = [];
  const usedKeywords = new Set();

  const nextKeyword = (sentence) =>
    keywords.find((k) => k.length >= 2 && sentence.includes(k) && !usedKeywords.has(k)) || null;

  const rounds = Math.max(1, Math.ceil(count / order.length));
  for (let round = 0; round < rounds; round += 1) {
    for (const type of order) {
      if (questions.length >= count) break;
      const sentence = sentences[round % Math.max(sentences.length, 1)];
      if (!sentence) continue;
      const keyword = nextKeyword(sentence);
      if (!keyword) continue;

      let built = null;
      if (type === 'choice') built = choiceFromSentence(sentence, keyword, keywords);
      else if (type === 'fill') built = fillFromSentence(sentence, keyword);
      else built = essayFromCourse(course, keywords, sentences);

      if (built) {
        if (type !== 'essay') usedKeywords.add(keyword);
        if (!questions.some((q) => q.question === built.question)) questions.push(built);
      }
    }
  }

  // 简答题兜底
  if (questions.length < count) {
    const essay = essayFromCourse(course, keywords, sentences);
    if (!questions.some((q) => q.question === essay.question)) questions.push(essay);
  }

  // 无转写文本时的通用模板
  if (!questions.length) {
    const topic = keywords[0];
    questions.push({
      type: 'fill',
      question: `本节课「${course.title}」中，请补全下面这句话的空缺：${course.title}与「____」密切相关。`,
      options: null,
      answer: topic
    });
    const distractors = keywords.filter((k) => k !== topic).slice(0, 3);
    if (distractors.length === 3) {
      const options = shuffle([topic, ...distractors]);
      questions.push({
        type: 'choice',
        question: `下列哪一项是本课「${course.title}」的核心概念？`,
        options: JSON.stringify(options),
        answer: String.fromCharCode(65 + options.indexOf(topic))
      });
    }
    questions.push(essayFromCourse(course, keywords, sentences));
  }

  return questions.slice(0, count);
}

/**
 * 生成习题：优先 LLM（支持难度），失败自动降级到规则模板。
 * @returns {Promise<{questions: object[], engine: 'llm'|'rule', model: string|null, degraded: boolean, error?: string}>}
 */
export async function generateQuestionsForCourse(
  courseId,
  { ai = null, userId = null, difficulty = 'basic', count = 5, replace = false } = {}
) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) throw new Error('课程不存在');

  const safeDifficulty = DIFFICULTIES.includes(difficulty) ? difficulty : 'basic';
  const safeCount = Math.max(1, Math.min(MAX_QUESTIONS, Number(count) || 5));

  const images = db.prepare('SELECT filename FROM images WHERE course_id = ?').all(courseId);
  const recordings = db.prepare('SELECT filename, transcript FROM recordings WHERE course_id = ?').all(courseId);
  const transcripts = recordings.map((r) => r.transcript).filter(Boolean);
  const context = { images, recordings, transcripts, transcript: transcripts.join('\n') };

  let engine = 'rule';
  let model = null;
  let degraded = false;
  let error = null;
  let questions = [];

  if (ai?.configured) {
    try {
      const note = db.prepare('SELECT content FROM notes WHERE course_id = ?').get(courseId)?.content || '';
      const result = await ai.generateQuestions({
        course,
        note,
        transcript: context.transcript,
        difficulty: safeDifficulty,
        count: safeCount,
        userId
      });
      questions = result.data.map((q) => ({
        type: q.type,
        question: q.question,
        options: Array.isArray(q.options) && q.options.length ? JSON.stringify(q.options) : null,
        answer: q.answer
      }));
      engine = 'llm';
      model = result.model;
    } catch (err) {
      degraded = true;
      error = err.message;
    }
  }

  if (!questions.length) {
    questions = buildRuleQuestions(course, context, { difficulty: safeDifficulty, count: safeCount });
  }

  if (replace) db.prepare('DELETE FROM questions WHERE course_id = ?').run(courseId);

  const insert = db.prepare(
    'INSERT INTO questions (course_id, type, question, options, answer, difficulty, engine) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const saved = questions.map((q) => {
    const info = insert.run(courseId, q.type, q.question, q.options, q.answer, safeDifficulty, engine);
    return { ...q, id: Number(info.lastInsertRowid), difficulty: safeDifficulty, engine };
  });

  return { questions: saved, engine, model, degraded, error };
}
