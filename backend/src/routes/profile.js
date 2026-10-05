import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

// 个人中心：用户信息 + 班级列表
router.get('/me', (req, res) => {
  const user = db
    .prepare('SELECT id, username, role, created_at FROM users WHERE id = ?')
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const classes = db
    .prepare(
      `SELECT c.id, c.name, c.invite_code, c.created_at, cm.role AS my_role,
              (SELECT COUNT(*) FROM class_members m WHERE m.class_id = c.id) AS member_count
       FROM class_members cm JOIN classes c ON c.id = cm.class_id
       WHERE cm.user_id = ? ORDER BY c.created_at DESC`
    )
    .all(req.user.id);

  res.json({ user, classes });
});

export default router;
