import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { generateQuestionsForCourse } from '../questionGenerator.js';
import { ownCourseMiddleware } from '../access.js';

const router = Router();
router.use(authMiddleware);

router.post('/generate/:courseId', ownCourseMiddleware, (req, res) => {
  try {
    const questions = generateQuestionsForCourse(req.course.id);
    res.status(201).json(questions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:courseId', ownCourseMiddleware, (req, res) => {
  const questions = db
    .prepare('SELECT * FROM questions WHERE course_id = ? ORDER BY id')
    .all(req.course.id);
  res.json(questions);
});

router.delete('/:courseId', ownCourseMiddleware, (req, res) => {
  db.prepare('DELETE FROM questions WHERE course_id = ?').run(req.course.id);
  res.json({ ok: true });
});

export default router;
