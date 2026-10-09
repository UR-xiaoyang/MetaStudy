import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { fetchMessagesTree } from '../messageUtil.js';
import { ensurePersonalClass } from '../personalCourses.js';

const router = Router();
router.use(authMiddleware);

function ownCourse(userId, courseId) {
  return db
    .prepare(
      `SELECT c.* FROM courses c
       JOIN classes cl ON cl.id = c.class_id
       WHERE c.id = ? AND c.created_by = ? AND cl.owner_id = ? AND cl.is_personal = 1`
    )
    .get(courseId, userId, userId);
}

router.get('/class/:classId', (req, res) => {
  const classId = Number(req.params.classId);
  const personal = ensurePersonalClass(db, req.user.id);
  if (classId !== personal.id) return res.status(404).json({ error: '学习空间不存在' });
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.subject, c.created_at,
              (SELECT COUNT(*) FROM recordings r WHERE r.course_id = c.id) AS recording_count,
              (SELECT COUNT(*) FROM images i WHERE i.course_id = c.id) AS image_count,
              (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id) AS question_count
       FROM courses c
       WHERE c.class_id = ? AND c.created_by = ?
       ORDER BY c.created_at DESC`
    )
    .all(classId, req.user.id);
  res.json(rows);
});

router.get('/member-class', (req, res) => {
  const personal = ensurePersonalClass(db, req.user.id);
  const rows = db
    .prepare('SELECT id, class_id, title, subject, created_at FROM courses WHERE class_id = ? AND created_by = ? ORDER BY created_at DESC')
    .all(personal.id, req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { title, subject } = req.body || {};
  const normalizedTitle = typeof title === 'string' ? title.trim() : '';
  if (!normalizedTitle || normalizedTitle.length > 120) {
    return res.status(400).json({ error: '课程标题应为 1 至 120 个字符' });
  }
  const personal = ensurePersonalClass(db, req.user.id);
  const info = db
    .prepare('INSERT INTO courses (class_id, title, subject, created_by) VALUES (?, ?, ?, ?)')
    .run(personal.id, normalizedTitle, typeof subject === 'string' ? subject.trim() || null : null, req.user.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(course);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const course = ownCourse(req.user.id, id);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  const recordings = db
    .prepare('SELECT r.*, u.username AS uploader FROM recordings r JOIN users u ON u.id = r.uploaded_by WHERE r.course_id = ? ORDER BY r.created_at DESC')
    .all(id);
  const images = db
    .prepare('SELECT i.*, u.username AS uploader FROM images i JOIN users u ON u.id = i.uploaded_by WHERE i.course_id = ? ORDER BY i.created_at DESC')
    .all(id);
  const questions = db.prepare('SELECT * FROM questions WHERE course_id = ? ORDER BY id').all(id);
  const messages = fetchMessagesTree(db, id);
  const note = db.prepare('SELECT * FROM notes WHERE course_id = ?').get(id) || null;
  const wrongs = db
    .prepare(
      `SELECT w.*, u.username AS created_by_name, q.question AS source_question
       FROM wrong_questions w LEFT JOIN users u ON u.id = w.created_by
       LEFT JOIN questions q ON q.id = w.question_id
       WHERE w.course_id = ? AND w.created_by = ? ORDER BY w.created_at DESC`
    )
    .all(id, req.user.id);
  res.json({ ...course, recordings, images, questions, messages, note, wrongs });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const course = ownCourse(req.user.id, id);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  db.prepare('DELETE FROM courses WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
