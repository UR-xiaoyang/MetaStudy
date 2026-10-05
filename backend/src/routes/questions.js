import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { generateQuestionsForCourse } from '../questionGenerator.js';

const router = Router();
router.use(authMiddleware);

function isMember(userId, classId) {
  return !!db.prepare('SELECT id FROM class_members WHERE class_id = ? AND user_id = ?').get(classId, userId);
}

router.post('/generate/:courseId', (req, res) => {
  const courseId = Number(req.params.courseId);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  if (!isMember(req.user.id, course.class_id)) {
    return res.status(403).json({ error: '无权访问该课程' });
  }
  try {
    const questions = generateQuestionsForCourse(courseId);
    res.status(201).json(questions);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:courseId', (req, res) => {
  const courseId = Number(req.params.courseId);
  const questions = db
    .prepare('SELECT * FROM questions WHERE course_id = ? ORDER BY id')
    .all(courseId);
  res.json(questions);
});

router.delete('/:courseId', (req, res) => {
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '只有老师可以删除习题' });
  }
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(Number(req.params.courseId));
  if (!course) return res.status(404).json({ error: '课程不存在' });
  db.prepare('DELETE FROM questions WHERE course_id = ?').run(course.id);
  res.json({ ok: true });
});

export default router;
