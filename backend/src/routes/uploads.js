import { Router } from 'express';
import multer from 'multer';
import { db, storageDir } from '../db.js';
import { authMiddleware } from '../auth.js';
import { join, extname } from 'node:path';
import crypto from 'node:crypto';

const router = Router();
router.use(authMiddleware);

function isMember(userId, classId) {
  return !!db.prepare('SELECT id FROM class_members WHERE class_id = ? AND user_id = ?').get(classId, userId);
}

function randName(original) {
  const ext = extname(original || '').toLowerCase();
  return `${crypto.randomBytes(8).toString('hex')}${ext}`;
}

const audioUpload = multer({
  storage: multer.diskStorage({
    destination: join(storageDir, 'audios'),
    filename: (req, file, cb) => cb(null, randName(file.originalname))
  }),
  limits: { fileSize: 200 * 1024 * 1024 }
});

const imageUpload = multer({
  storage: multer.diskStorage({
    destination: join(storageDir, 'images'),
    filename: (req, file, cb) => cb(null, randName(file.originalname))
  }),
  limits: { fileSize: 20 * 1024 * 1024 }
});

function checkCourse(req, res, next) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.courseId || req.body.course_id));
  if (!course) return res.status(404).json({ error: '课程不存在' });
  if (!isMember(req.user.id, course.class_id)) {
    return res.status(403).json({ error: '无权访问该课程' });
  }
  req.course = course;
  next();
}

router.post('/audios/:courseId', checkCourse, audioUpload.single('file'), (req, res) => {
  if (!req.file) return res.status(400).json({ error: '未收到录音文件' });
  const info = db
    .prepare('INSERT INTO recordings (course_id, filename, storage, duration, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)')
    .run(req.course.id, req.file.filename, req.file.filename, req.body.duration ? Number(req.body.duration) : null, req.file.size, req.user.id);
  res.status(201).json({
    id: Number(info.lastInsertRowid),
    filename: req.file.filename,
    storage: `/files/audios/${req.file.filename}`,
    duration: req.body.duration ? Number(req.body.duration) : null,
    size: req.file.size
  });
});

router.post('/images/:courseId', checkCourse, imageUpload.single('file'), (req, res) => {
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
