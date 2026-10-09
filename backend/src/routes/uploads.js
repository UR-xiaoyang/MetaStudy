import { Router } from 'express';
import multer from 'multer';
import { db, storageDir } from '../db.js';
import { authMiddleware } from '../auth.js';
import { ownCourseMiddleware } from '../access.js';
import { join, extname } from 'node:path';
import crypto from 'node:crypto';

const router = Router();
router.use(authMiddleware);

function randName(original) {
  const ext = extname(original || '').toLowerCase();
  return `${crypto.randomBytes(8).toString('hex')}${ext}`;
}

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: join(storageDir, 'audios'),
    filename: (req, file, cb) => cb(null, randName(file.originalname))
  }),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['audio/webm', 'audio/mpeg', 'audio/mp4', 'audio/wav', 'audio/ogg'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传音频文件'));
    }
  }
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: join(storageDir, 'images'),
    filename: (req, file, cb) => cb(null, randName(file.originalname))
  }),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = ['image/jpeg', 'image/png', 'image/webp'];
    if (allowed.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('只允许上传 JPEG、PNG 或 WebP 图片'));
    }
  }
});

router.post('/audios/:courseId', ownCourseMiddleware, audioUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到录音文件' });
  const duration = req.body.duration == null || req.body.duration === '' ? null : Number(req.body.duration);
  if (duration !== null && (!Number.isFinite(duration) || duration < 0 || duration > 8 * 60 * 60)) {
    return res.status(400).json({ error: '录音时长不合法' });
  }
  const info = db
    .prepare('INSERT INTO recordings (course_id, filename, storage, duration, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.course.id, req.file.filename, req.file.filename, duration, req.file.size, req.user.id);
  res.status(201).json({
    id: Number(info.lastInsertRowid),
    filename: req.file.filename,
    storage: `/files/audios/${req.file.filename}`,
    duration,
    size: req.file.size
  });
});

router.post('/images/:courseId', ownCourseMiddleware, imageUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到图片文件' });
  const info = db
    .prepare('INSERT INTO images (course_id, filename, storage, size, uploaded_by) VALUES (?, ?, ?, ?, ?)')
    .run(req.course.id, req.file.filename, req.file.filename, req.file.size, req.user.id);
  res.status(201).json({
    id: Number(info.lastInsertRowid),
    filename: req.file.filename,
    storage: `/files/images/${req.file.filename}`,
    size: req.file.size
  });
});

export default router;
