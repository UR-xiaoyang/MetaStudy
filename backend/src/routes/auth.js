import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';

const router = Router();

router.post('/register', (req, res) => {
  const { username, password, role } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const finalRole = role === 'teacher' ? 'teacher' : 'student';
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  const info = db
    .prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
    .run(username, hashPassword(password), finalRole);
  const user = { id: info.lastInsertRowid, username, role: finalRole };
  res.status(201).json({ user, token: signToken(user) });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const user = db
    .prepare('SELECT id, username, password, role FROM users WHERE username = ?')
    .get(username);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const safeUser = { id: user.id, username: user.username, role: user.role };
  res.json({ user: safeUser, token: signToken(safeUser) });
});

export default router;
