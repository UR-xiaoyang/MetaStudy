import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

function isTeacherMember(userId, classId) {
  return db
    .prepare('SELECT id FROM class_members WHERE class_id = ? AND user_id = ? AND role = ?')
    .get(classId, userId, 'teacher');
}

function checkClass(req, res, next) {
  const cls = db.prepare('SELECT * FROM classes WHERE id = ?').get(Number(req.params.classId));
  if (!cls) return res.status(404).json({ error: '班级不存在' });
  if (!isTeacherMember(req.user.id, cls.id)) {
    return res.status(403).json({ error: '仅班级老师可访问教师交流区' });
  }
  req.cls = cls;
  next();
}

router.get('/:classId', checkClass, (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.id, t.content, t.created_at, u.id AS user_id, u.username
       FROM teacher_chats t JOIN users u ON u.id = t.user_id
       WHERE t.class_id = ? ORDER BY t.created_at ASC`
    )
    .all(req.cls.id);
  res.json(rows);
});

router.post('/:classId', checkClass, (req, res) => {
  const { content } = req.body || {};
  if (!content || !content.trim()) {
    return res.status(400).json({ error: '消息内容不能为空' });
  }
  const info = db
    .prepare('INSERT INTO teacher_chats (class_id, user_id, content) VALUES (?, ?, ?)')
    .run(req.cls.id, req.user.id, content.trim());
  const row = db
    .prepare(
      `SELECT t.id, t.content, t.created_at, u.id AS user_id, u.username
       FROM teacher_chats t JOIN users u ON u.id = t.user_id WHERE t.id = ?`
    )
    .get(info.lastInsertRowid);
  res.status(201).json(row);
});

router.delete('/:classId/:chatId', checkClass, (req, res) => {
  const chat = db
    .prepare('SELECT * FROM teacher_chats WHERE id = ? AND class_id = ?')
    .get(Number(req.params.chatId), req.cls.id);
  if (!chat) return res.status(404).json({ error: '消息不存在' });
  if (chat.user_id !== req.user.id && req.user.role !== 'teacher') {
    return res.status(403).json({ error: '无权删除该消息' });
  }
  db.prepare('DELETE FROM teacher_chats WHERE id = ?').run(chat.id);
  res.json({ ok: true });
});

export default router;
