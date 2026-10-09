import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { generateNoteForCourse } from '../noteGenerator.js';
import { ownCourseMiddleware } from '../access.js';

const router = Router();
router.use(authMiddleware);

router.get('/:courseId', ownCourseMiddleware, (req, res) => {
  const note = db.prepare('SELECT * FROM notes WHERE course_id = ?').get(req.course.id);
  res.json(note || null);
});

router.post('/generate/:courseId', ownCourseMiddleware, (req, res) => {
  try {
    const content = generateNoteForCourse(req.course.id);
    db.prepare(
      `INSERT INTO notes (course_id, content, auto_generated, updated_at)
       VALUES (?, ?, 1, datetime('now'))
       ON CONFLICT(course_id) DO UPDATE SET content = excluded.content, auto_generated = 1, updated_at = datetime('now')`
    ).run(req.course.id, content);
    res.json(db.prepare('SELECT * FROM notes WHERE course_id = ?').get(req.course.id));
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.put('/:courseId', ownCourseMiddleware, (req, res) => {
  const content = typeof req.body?.content === 'string' ? req.body.content.trim() : '';
  if (!content) return res.status(400).json({ error: '笔记内容不能为空' });
  db.prepare(
    `INSERT INTO notes (course_id, content, auto_generated, updated_at)
     VALUES (?, ?, 0, datetime('now'))
     ON CONFLICT(course_id) DO UPDATE SET content = excluded.content, auto_generated = 0, updated_at = datetime('now')`
  ).run(req.course.id, content);
  res.json(db.prepare('SELECT * FROM notes WHERE course_id = ?').get(req.course.id));
});

export default router;
