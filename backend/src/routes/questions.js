import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { generateQuestionsForCourse, DIFFICULTIES, MAX_QUESTIONS } from '../questionGenerator.js';
import { ownCourseMiddleware } from '../access.js';
import { ai } from '../ai.js';

const router = Router();
router.use(authMiddleware);

router.post('/generate/:courseId', ownCourseMiddleware, async (req, res) => {
  const { difficulty, count, replace } = req.body || {};
  if (difficulty != null && !DIFFICULTIES.includes(difficulty)) {
    return res.status(400).json({ error: `难度只能是 ${DIFFICULTIES.join(' / ')}` });
  }
  if (count != null && (!Number.isInteger(Number(count)) || Number(count) < 1 || Number(count) > MAX_QUESTIONS)) {
    return res.status(400).json({ error: `题目数量应为 1-${MAX_QUESTIONS}` });
  }

  try {
    const result = await generateQuestionsForCourse(req.course.id, {
      ai,
      userId: req.user.id,
      difficulty: difficulty || 'basic',
      count: Number(count) || 5,
      replace: Boolean(replace)
    });
    res.status(201).json({
      ...result,
      aiConfigured: Boolean(ai.configured)
    });
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
