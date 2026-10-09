import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { ensurePersonalClass } from '../personalCourses.js';

const router = Router();
router.use(authMiddleware);

function ownPersonalClass(userId, classId) {
  return db
    .prepare('SELECT * FROM classes WHERE id = ? AND owner_id = ? AND is_personal = 1')
    .get(classId, userId);
}

router.get('/', (req, res) => {
  const personal = ensurePersonalClass(db, req.user.id);
  const rows = db
    .prepare(
      `SELECT c.id, c.name, c.created_at,
              (SELECT COUNT(*) FROM courses co WHERE co.class_id = c.id) AS course_count
       FROM classes c
       WHERE c.id = ?`
    )
    .all(personal.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { name } = req.body || {};
  const normalizedName = typeof name === 'string' ? name.trim() : '';
  if (!normalizedName || normalizedName.length > 64) {
    return res.status(400).json({ error: '学习空间名称应为 1 至 64 个字符' });
  }
  const personal = ensurePersonalClass(db, req.user.id);
  db.prepare('UPDATE classes SET name = ? WHERE id = ?').run(normalizedName, personal.id);
  const updated = db.prepare('SELECT id, name, created_at FROM classes WHERE id = ?').get(personal.id);
  res.json(updated);
});

router.delete('/:id', (req, res) => {
  const classId = Number(req.params.id);
  const personal = ownPersonalClass(req.user.id, classId);
  if (!personal) return res.status(404).json({ error: '学习空间不存在' });
  db.prepare('DELETE FROM courses WHERE class_id = ?').run(personal.id);
  res.json({ ok: true });
});

export default router;
