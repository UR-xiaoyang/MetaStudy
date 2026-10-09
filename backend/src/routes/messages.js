import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { ownCourseMiddleware } from '../access.js';
import { fetchMessagesTree, MESSAGE_SELECT } from '../messageUtil.js';

const router = Router();
router.use(authMiddleware);

router.get('/:courseId', ownCourseMiddleware, (req, res) => {
  res.json(fetchMessagesTree(db, req.course.id));
});

router.post('/:courseId', ownCourseMiddleware, (req, res) => {
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

router.delete('/:courseId/:messageId', ownCourseMiddleware, (req, res) => {
  const msg = db
    .prepare('SELECT * FROM messages WHERE id = ? AND course_id = ?')
    .get(Number(req.params.messageId), req.course.id);
  if (!msg) return res.status(404).json({ error: '留言不存在' });
  if (msg.user_id !== req.user.id) {
    return res.status(403).json({ error: '无权删除该留言' });
  }
  db.prepare('DELETE FROM messages WHERE id = ?').run(msg.id);
  res.json({ ok: true });
});

export default router;
