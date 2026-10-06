import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

function isMember(userId, classId) {
  return !!db.prepare('SELECT id FROM class_members WHERE class_id = ? AND user_id = ?').get(classId, userId);
}

function checkCourse(req, res, next) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.courseId));
  if (!course) return res.status(404).json({ error: '课程不存在' });
  if (!isMember(req.user.id, course.class_id)) {
    return res.status(403).json({ error: '无权访问该课程' });
  }
  req.course = course;
  next();
}

router.get('/class-report/:classId', (req, res) => {
  const classId = Number(req.params.classId);
  const isTeacher = !!db
    .prepare("SELECT id FROM class_members WHERE class_id = ? AND user_id = ? AND role = 'teacher'")
    .get(classId, req.user.id);
  if (!isTeacher) {
    return res.status(403).json({ error: '只有班级老师可以查看错题汇总' });
  }
  const rows = db
    .prepare(
      `SELECT w.*, u.username AS created_by_name, c.title AS course_title, c.id AS course_id,
              q.question AS source_question
       FROM wrong_questions w
       JOIN courses c ON c.id = w.course_id
       LEFT JOIN users u ON u.id = w.created_by
       LEFT JOIN questions q ON q.id = w.question_id
       WHERE c.class_id = ?
       ORDER BY w.created_at DESC`
    )
    .all(classId);
  res.json(rows);
});

router.get('/:courseId', checkCourse, (req, res) => {
  const rows = db
    .prepare(
      `SELECT w.*, u.username AS created_by_name, q.question AS source_question
       FROM wrong_questions w
       LEFT JOIN users u ON u.id = w.created_by
       LEFT JOIN questions q ON q.id = w.question_id
       WHERE w.course_id = ? AND w.created_by = ?
       ORDER BY w.created_at DESC`
    )
    .all(req.course.id, req.user.id);
  res.json(rows);
});

router.post('/:courseId', checkCourse, (req, res) => {
  const { content, my_answer, correct_answer } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '错题内容不能为空' });
  }
  const info = db
    .prepare(
      'INSERT INTO wrong_questions (course_id, content, my_answer, correct_answer, source, created_by) VALUES (?, ?, ?, ?, ?, ?)'
    )
    .run(req.course.id, content.trim(), my_answer || null, correct_answer || null, 'manual', req.user.id);
  const row = db
    .prepare('SELECT * FROM wrong_questions WHERE id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.post('/:courseId/from-question', checkCourse, (req, res) => {
  const { question_id, my_answer } = req.body || {};
  if (!question_id) return res.status(400).json({ error: '缺少题目' });
  const q = db.prepare('SELECT * FROM questions WHERE id = ? AND course_id = ?').get(Number(question_id), req.course.id);
  if (!q) return res.status(404).json({ error: '题目不存在' });
  const existing = db
    .prepare('SELECT id FROM wrong_questions WHERE course_id = ? AND question_id = ? AND created_by = ?')
    .get(req.course.id, q.id, req.user.id);
  if (existing) {
    return res.status(409).json({ error: '这道题已在你的错题本中' });
  }
  const info = db
    .prepare(
      'INSERT INTO wrong_questions (course_id, question_id, content, my_answer, correct_answer, source, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)'
    )
    .run(req.course.id, q.id, q.question, my_answer || null, q.answer, 'question', req.user.id);
  const row = db
    .prepare('SELECT * FROM wrong_questions WHERE id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/:courseId/:wrongId', checkCourse, (req, res) => {
  const w = db
    .prepare('SELECT * FROM wrong_questions WHERE id = ? AND course_id = ?')
    .get(Number(req.params.wrongId), req.course.id);
  if (!w) return res.status(404).json({ error: '错题不存在' });
  if (w.created_by !== req.user.id && req.user.role !== 'teacher') {
    return res.status(403).json({ error: '无权删除该错题' });
  }
  db.prepare('DELETE FROM wrong_questions WHERE id = ?').run(w.id);
  res.json({ ok: true });
});

export default router;
