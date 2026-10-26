import { LlmError } from './client.js';
import {
  buildNotePrompt,
  buildQuestionsPrompt,
  buildGradingPrompt,
  buildExplanationPrompt,
  buildPlanPrompt
} from './prompts.js';

const QUESTION_TYPES = new Set(['choice', 'fill', 'essay']);

function asString(value, fallback = '') {
  return typeof value === 'string' ? value.trim() : fallback;
}

function asStringArray(value, max = 10) {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean)
    .slice(0, max);
}

function shapeError(message) {
  return new LlmError(message, { code: 'LLM_SHAPE', retryable: false });
}

export function normalizeNote(data) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw shapeError('笔记结果不是对象');
  const content = asString(data.content);
  if (!content) throw shapeError('笔记结果缺少 content');
  return {
    title: asString(data.title),
    outline: asStringArray(data.outline, 12),
    keywords: asStringArray(data.keywords, 12),
    summary: asString(data.summary),
    content
  };
}

export function normalizeQuestions(data) {
  const list = Array.isArray(data) ? data : Array.isArray(data?.questions) ? data.questions : null;
  if (!list) throw shapeError('习题结果不是数组');

  const questions = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const type = asString(item.type).toLowerCase();
    const question = asString(item.question);
    const answer = asString(item.answer);
    if (!QUESTION_TYPES.has(type) || !question || !answer) continue;

    if (type === 'choice') {
      const options = asStringArray(item.options, 6);
      const letter = answer.toUpperCase().slice(0, 1);
      if (options.length < 2 || !/^[A-F]$/.test(letter)) continue;
      const index = letter.charCodeAt(0) - 65;
      if (index >= options.length) continue;
      questions.push({ type, question, options, answer: letter, explanation: asString(item.explanation) });
    } else {
      questions.push({ type, question, options: null, answer, explanation: asString(item.explanation) });
    }
  }

  if (!questions.length) throw shapeError('习题结果没有有效题目');
  return questions;
}

export function normalizeGrading(data, maxScore = 100) {
  if (!data || typeof data !== 'object') throw shapeError('批改结果不是对象');
  const limit = Number(maxScore) > 0 ? Number(maxScore) : 100;
  const rawScore = Number(data.score);
  if (!Number.isFinite(rawScore)) throw shapeError('批改结果缺少 score');
  const score = Math.max(0, Math.min(limit, Math.round(rawScore)));
  const feedback = asString(data.feedback);
  if (!feedback) throw shapeError('批改结果缺少 feedback');

  return {
    score,
    maxScore: limit,
    feedback,
    strengths: asStringArray(data.strengths, 6),
    weaknesses: asStringArray(data.weaknesses, 6),
    suggestions: asStringArray(data.suggestions, 6)
  };
}

export function normalizeExplanation(data) {
  if (!data || typeof data !== 'object') throw shapeError('讲解结果不是对象');
  const explanation = asString(data.explanation);
  if (!explanation) throw shapeError('讲解结果缺少 explanation');
  return {
    errorType: asString(data.error_type),
    explanation
  };
}

export function normalizePlan(data) {
  if (!data || typeof data !== 'object') throw shapeError('学习计划结果不是对象');
  const preview = asString(data.preview);
  const review = asString(data.review);
  const practice = asString(data.practice);
  if (!preview || !review || !practice) throw shapeError('学习计划缺少 preview/review/practice');
  return { preview, review, practice, focus: asStringArray(data.focus, 8) };
}

/**
 * LLM 业务层：负责 prompt 组装 + 输出校验。
 * 失败时抛出 LlmError，由调用方决定是否降级到规则模板。
 */
export function createAiService({ client, logger = console }) {
  const configured = Boolean(client?.config?.configured);

  async function run({ feature, userId, messages, normalize, maxTokens, temperature }) {
    const result = await client.chatJson({ messages, feature, userId, maxTokens, temperature });
    try {
      const data = normalize(result.data);
      return { data, model: result.model, usage: result.usage, latencyMs: result.latencyMs };
    } catch (error) {
      logger.warn?.(`[llm] ${feature} 输出校验失败：${error.message}`);
      throw error;
    }
  }

  return {
    configured,
    model: client?.config?.model || null,

    async generateNote({ course, transcript, images = [], questions = [], userId = null }) {
      return run({
        feature: 'note_gen',
        userId,
        messages: buildNotePrompt({ course, transcript, images, questions }),
        normalize: normalizeNote,
        maxTokens: 2048
      });
    },

    async generateQuestions({ course, note, transcript, difficulty = 'basic', count = 5, userId = null }) {
      const result = await run({
        feature: 'question_gen',
        userId,
        messages: buildQuestionsPrompt({ course, note, transcript, difficulty, count }),
        normalize: (data) => normalizeQuestions(data),
        maxTokens: 2048
      });
      return { ...result, data: result.data.slice(0, count) };
    },

    async gradeEssay({ question, reference, studentAnswer, maxScore = 100, userId = null }) {
      const result = await run({
        feature: 'grading',
        userId,
        messages: buildGradingPrompt({ question, reference, studentAnswer, maxScore }),
        normalize: (data) => normalizeGrading(data, maxScore),
        maxTokens: 800,
        temperature: 0.1
      });
      return result;
    },

    async explainWrong({ question, answer, studentAnswer, note, knowledgePoints = [], userId = null }) {
      const result = await run({
        feature: 'explanation',
        userId,
        messages: buildExplanationPrompt({ question, answer, studentAnswer, note, knowledgePoints }),
        normalize: normalizeExplanation,
        maxTokens: 1200
      });
      return result;
    },

    async buildPlan({ course, transcript, questions, attempts, wrongs, userId = null }) {
      const result = await run({
        feature: 'plan',
        userId,
        messages: buildPlanPrompt({ course, transcript, questions, attempts, wrongs }),
        normalize: normalizePlan,
        maxTokens: 1600
      });
      return result;
    }
  };
}
