import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { ownCourseMiddleware } from '../access.js';

const router = Router();
router.use(authMiddleware);

router.get('/:courseId', ownCourseMiddleware, (req, res) => {
  const rows = db
    .prepare(
      `SELECT w.*, u.username AS created_by_name, q.question AS source_question
       FROM wrong_questions w
       LEFT JOIN users u ON u.id = w.created_by
       LEFT JOIN questions q ON q.id = w.question_id
       WHERE w.course_id = ? AND w.created_by = ? ORDER BY w.created_at DESC`
    )
    .all(req.course.id, req.user.id);
  res.json(rows);
});

router.post('/:courseId', ownCourseMiddleware, (req, res) => {
  const { content, my_answer, correct_answer } = req.body || {};
  const text = typeof content === 'string' ? content.trim() : '';
  if (!text) return res.status(400).json({ error: '错题内容不能为空' });
  const info = db
    .prepare('INSERT INTO wrong_questions (course_id, content, my_answer, correct_answer, source, created_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.course.id, text, my_answer || null, correct_answer || null, 'manual', req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM wrong_questions WHERE id = ?').get(info.lastInsertRowid));
});

router.post('/:courseId/from-question', ownCourseMiddleware, (req, res) => {
  const questionId = Number(req.body?.question_id);
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND course_id = ?').get(questionId, req.course.id);
  if (!q) return res.status(404).json({ error: '题目不存在' });
  const existing = db.prepare('SELECT id FROM wrong_questions WHERE course_id = ? AND question_id = ? AND created_by = ?')
    .get(req.course.id, q.id, req.user.id);
  if (existing) return res.status(409).json({ error: '这道题已在你的错题本中' });
  const info = db.prepare(
    'INSERT INTO wrong_questions (course_id, question_id, content, my_answer, correct_answer, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
  ).run(req.course.id, q.id, q.question, req.body?.my_answer || null, q.answer, 'question', req.user.id);
  res.status(201).json(db.prepare('SELECT * FROM wrong_questions WHERE id = ?').get(info.lastInsertRowid));
});

router.delete('/:courseId/:wrongId', ownCourseMiddleware, (req, res) => {
  const wrong = db.prepare('SELECT * FROM wrong_questions WHERE id = ? AND course_id = ? AND created_by = ?')
    .get(Number(req.params.wrongId), req.course.id, req.user.id);
  if (!wrong) return res.status(404).json({ error: '错题不存在' });
  db.prepare('DELETE FROM wrong_questions WHERE id = ?').run(wrong.id);
  res.json({ ok: true });
});

export default router;
