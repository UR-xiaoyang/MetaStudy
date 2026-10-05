import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { generateNoteForCourse } from '../noteGenerator.js';

const router = Router();
router.use(authMiddleware);

function isMember(userId, classId) {
  return !!db.prepare('SELECT id FROM class_members WHERE class_id = ? AND user_id = ?').get(classId, userId);
}

function checkCourse(req, res, next) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.courseId));
  if (!course) return res.status(404).json({ error: '课程不存在' });
  if (!isMember(req.user.id, course.class_id)) {
    return res.status(403).json({ error: '无权访问该课程' });
  }
  req.course = course;
  next();
}

router.get('/:courseId', checkCourse, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE course_id = ?').get(req.course.id);
  res.json(note || null);
});

router.post('/generate/:courseId', checkCourse, (req, res) => {
  try {
    const content = generateNoteForCourse(req.course.id);
    db.prepare(
      `INSERT INTO notes (course_id, content, auto_generated, updated_at)
       VALUES (?, ?, 1, datetime('now'))
       ON CONFLICT(course_id) DO UPDATE SET content = excluded.content, auto_generated = 1,
         updated_at = datetime('now')`
    ).run(req.course.id, content);
    const note = db.prepare('SELECT * FROM notes WHERE course_id = ?').get(req.course.id);
    res.json(note);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:courseId', checkCourse, (req, res) => {
  const { content } = req.body || {};
  if (content == null) {
    return res.status(400).json({ error: '笔记内容不能为空' });
  }
  db.prepare(
    `INSERT INTO notes (course_id, content, auto_generated, updated_at)
     VALUES (?, ?, 0, datetime('now'))
     ON CONFLICT(course_id) DO UPDATE SET content = excluded.content, auto_generated = 0,
       updated_at = datetime('now')`
  ).run(req.course.id, content);
  const note = db.prepare('SELECT * FROM notes WHERE course_id = ?').get(req.course.id);
  res.json(note);
});

export default router;
