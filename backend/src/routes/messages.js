import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { fetchMessagesTree, MESSAGE_SELECT } from '../messageUtil.js';

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

router.get('/:courseId', checkCourse, (req, res) => {
  res.json(fetchMessagesTree(db, req.course.id));
});

router.post('/:courseId', checkCourse, (req, res) => {
  const { content, parent_id } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '留言内容不能为空' });
  }
  if (parent_id) {
    const parent = db
      .prepare('SELECT id FROM messages WHERE id = ? AND course_id = ?')
      .get(Number(parent_id), req.course.id);
    if (!parent) return res.status(404).json({ error: '父留言不存在' });
  }
  const info = db
    .prepare('INSERT INTO messages (course_id, user_id, parent_id, content) VALUES (?, ?, ?, ?)')
    .run(req.course.id, req.user.id, parent_id ? Number(parent_id) : null, content.trim());
  const row = db
    .prepare(`${MESSAGE_SELECT} WHERE m.id = ?`)
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/:courseId/:messageId', checkCourse, (req, res) => {
  const msg = db
    .prepare('SELECT * FROM messages WHERE id = ? AND course_id = ?')
    .get(Number(req.params.messageId), req.course.id);
  if (!msg) return res.status(404).json({ error: '留言不存在' });
  if (msg.user_id !== req.user.id && req.user.role !== 'teacher') {
    return res.status(403).json({ error: '无权删除该留言' });
  }
  db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id);
  res.json({ ok: true });
});

export default router;
