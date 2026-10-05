import { Router } from 'express';
import crypto from 'node:crypto';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

function generateInviteCode() {
  return crypto.randomBytes(4).toString('hex').toUpperCase();
}

router.post('/', (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '只有老师可以创建班级' });
  }
  const { name } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: '班级名称不能为空' });
  }
  let code;
  do {
    code = generateInviteCode();
  } while (db.prepare('SELECT id FROM classes WHERE invite_code = ?').get(code));
  const info = db
    .prepare('INSERT INTO classes (name, invite_code, owner_id) VALUES (?, ?, ?)')
    .run(name, code, req.user.id);
  const classId = info.lastInsertRowid;
  db.prepare(
    'INSERT OR IGNORE INTO class_members (class_id, user_id, role) VALUES (?, ?, ?)'
  ).run(classId, req.user.id, 'teacher');
  res.status(201).json({ id: classId, name, invite_code: code });
});

router.post('/join', (req, res) => {
  const { invite_code } = req.body || {};
  if (!invite_code) {
    return res.status(400).json({ error: '邀请码不能为空' });
  }
  const cls = db
    .prepare('SELECT id, name, invite_code, owner_id FROM classes WHERE UPPER(invite_code) = ?')
    .get(invite_code.toUpperCase());
  if (!cls) {
    return res.status(404).json({ error: '班级不存在或邀请码错误' });
  }
  db.prepare(
    'INSERT OR IGNORE INTO class_members (class_id, user_id, role) VALUES (?, ?, ?)'
  ).run(cls.id, req.user.id, 'student');
  res.json({ id: cls.id, name: cls.name, invite_code: cls.invite_code, joined: true });
});

router.get('/', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.invite_code, c.owner_id, c.created_at, cm.role AS my_role,
              (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS member_count
       FROM class_members cm
       JOIN classes c ON c.id = cm.class_id
       WHERE cm.user_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

router.delete('/:id', (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '只有老师可以删除班级' });
  }
  const cls = db.prepare('SELECT id, owner_id FROM classes WHERE id = ?').get(Number(req.params.id));
  if (!cls) {
    return res.status(404).json({ error: '班级不存在' });
  }
  if (cls.owner_id !== req.user.id) {
    return res.status(403).json({ error: '只能删除自己创建的班级' });
  }
  db.prepare('DELETE FROM classes WHERE id = ?').run(cls.id);
  res.json({ ok: true });
});

export default router;
