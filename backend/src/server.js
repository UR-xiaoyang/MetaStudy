import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { db } from './db.js';
import authRoutes from './routes/auth.js';
import fileRoutes from './routes/files.js';
import classRoutes from './routes/classes.js';
import courseRoutes from './routes/courses.js';
import uploadRoutes from './routes/uploads.js';
import questionRoutes from './routes/questions.js';
import messageRoutes from './routes/messages.js';
import noteRoutes from './routes/notes.js';
import wrongRoutes from './routes/wrongs.js';
import planRoutes from './routes/plans.js';
import studyLogRoutes from './routes/studyLogs.js';
import profileRoutes from './routes/profile.js';
import quizRoutes from './routes/quiz.js';

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use('/files', fileRoutes);

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', time: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/classes', classRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/uploads', uploadRoutes);
app.use('/api/questions', questionRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/notes', noteRoutes);
app.use('/api/wrongs', wrongRoutes);
app.use('/api/plans', planRoutes);
app.use('/api/study-logs', studyLogRoutes);
app.use('/api/profile', profileRoutes);
app.use('/api/quiz', quizRoutes);

app.use((err, req, res, next) => {
  if (err?.name === 'MulterError') {
    const status = err.code === 'LIMIT_FILE_SIZE' ? 413 : 400;
    const error = err.code === 'LIMIT_FILE_SIZE' ? '上传文件超过大小限制' : '上传文件无效';
    return res.status(status).json({ error });
  }
  if (err?.message === '只允许上传音频文件' || err?.message === '只允许上传 JPEG、PNG 或 WebP 图片') {
    return res.status(400).json({ error: err.message });
  }
  console.error(err);
  res.status(500).json({ error: '服务器内部错误' });
});

app.listen(PORT, () => {
  const userCount = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  console.log(`[backend] API 服务已启动: http://localhost:${PORT}`);
  console.log(`[backend] 数据库: backend/data/practice.db, 当前用户数: ${userCount}`);
});
