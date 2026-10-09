import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { gradeAnswer, explainWrongAnswer } from '../grading.js';
import { ownCourseMiddleware } from '../access.js';

const router = Router();
router.use(authMiddleware);

function loadCourseForMember(userId, courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return { error: '课程不存在', status: 404 };
  const member = db
    .prepare('SELECT id FROM class_members WHERE class_id = ? AND user_id = ?')
    .get(course.class_id, userId);
  if (!member) return { error: '无权访问该课程', status: 403 };
  return { course };
}

function getKnowledgePoints(courseId) {
  const note = db.prepare('SELECT content FROM notes WHERE course_id = ?').get(courseId);
  if (!note?.content) return [];
  const section = note.content.match(/## 知识要点\s*([\s\S]*?)(?=\n##|$)/)?.[1] || '';
  return section
    .split('\n')
    .map((line) => line.replace(/^\s*\d+[.、]\s*/, '').trim())
    .filter(Boolean)
    .slice(0, 4);
}

router.post('/:courseId/submit', ownCourseMiddleware, (req, res) => {
  const courseId = Number(req.params.courseId);
  const access = loadCourseForMember(req.user.id, courseId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const submitted = req.body?.answers;
  if (!submitted || typeof submitted !== 'object') {
    return res.status(400).json({ error: '请提交 answers 对象' });
  }

  const questions = db.prepare('SELECT * FROM questions WHERE course_id = ? ORDER BY id').all(courseId);
  if (!questions.length) return res.status(400).json({ error: '当前课程还没有可提交的习题' });

  const results = questions.map((question) => {
    const studentAnswer = submitted[String(question.id)] ?? submitted[question.id] ?? '';
    const rubric = question.type === 'essay'
      ? String(question.answer).split(/[；;。\n、,，]/).map((item) => item.trim()).filter((item) => item.length >= 2).slice(0, 4)
      : undefined;
    return {
      questionId: question.id,
      studentAnswer,
      ...gradeAnswer({ ...question, rubric }, studentAnswer)
    };
  });

  const score = results.reduce((total, item) => total + item.score, 0);
  const maxScore = results.reduce((total, item) => total + item.maxScore, 0);
  const payload = { score, maxScore, results };
  const created = db
    .prepare(
      `INSERT INTO quiz_attempts (course_id, user_id, answers, result, score, max_score)
       VALUES (?, ?, ?, ?, ?, ?)`
    )
    .run(courseId, req.user.id, JSON.stringify(submitted), JSON.stringify(payload), score, maxScore);

  res.status(201).json({ attemptId: Number(created.lastInsertRowid), ...payload });
});

router.get('/:courseId/attempts/me', ownCourseMiddleware, (req, res) => {
  const courseId = Number(req.params.courseId);
  const access = loadCourseForMember(req.user.id, courseId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const attempts = db
    .prepare(
      `SELECT id, score, max_score, result, created_at
       FROM quiz_attempts WHERE course_id = ? AND user_id = ?
       ORDER BY created_at DESC`
    )
    .all(courseId, req.user.id)
    .map((attempt) => ({ ...attempt, result: JSON.parse(attempt.result) }));
  res.json(attempts);
});

router.post('/:courseId/explain/:questionId', ownCourseMiddleware, (req, res) => {
  const courseId = Number(req.params.courseId);
  const questionId = Number(req.params.questionId);
  const access = loadCourseForMember(req.user.id, courseId);
  if (access.error) return res.status(access.status).json({ error: access.error });

  const question = db
    .prepare('SELECT * FROM questions WHERE id = ? AND course_id = ?')
    .get(questionId, courseId);
  if (!question) return res.status(404).json({ error: '题目不存在' });

  const note = db.prepare('SELECT content FROM notes WHERE course_id = ?').get(courseId)?.content || '';
  const explanation = explainWrongAnswer({
    question: question.question,
    answer: question.answer,
    studentAnswer: req.body?.student_answer || '',
    note,
    knowledgePoints: getKnowledgePoints(courseId)
  });
  res.json({ explanation, relatedKnowledgePoints: getKnowledgePoints(courseId) });
});

export default router;
