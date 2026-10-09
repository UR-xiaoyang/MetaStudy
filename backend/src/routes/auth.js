import { Router } from 'express';
import { db } from '../db.js';
import { hashPassword, verifyPassword, signToken } from '../auth.js';
import { ensurePersonalClass } from '../personalCourses.js';

const router = Router();

router.post('/register', (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  if (normalizedUsername.length > 32 || password.length > 128) {
    return res.status(400).json({ error: '用户名或密码长度不合法' });
  }
  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(normalizedUsername);
  if (exists) {
    return res.status(409).json({ error: '用户名已存在' });
  }
  const info = db
    .prepare('INSERT INTO users (username, password, role) VALUES (?, ?, ?)')
    .run(normalizedUsername, hashPassword(password), 'student');
  const user = { id: Number(info.lastInsertRowid), username: normalizedUsername, role: 'student' };
  ensurePersonalClass(db, user.id);
  res.status(201).json({ user, token: signToken(user) });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  const normalizedUsername = typeof username === 'string' ? username.trim() : '';
  if (!normalizedUsername || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: '用户名和密码不能为空' });
  }
  const user = db
    .prepare('SELECT id, username, password, role FROM users WHERE username = ?')
    .get(normalizedUsername);
  if (!user || !verifyPassword(password, user.password)) {
    return res.status(401).json({ error: '用户名或密码错误' });
  }
  const safeUser = { id: user.id, username: user.username, role: 'student' };
  ensurePersonalClass(db, safeUser.id);
  res.json({ user: safeUser, token: signToken(safeUser) });
});

export default router;
