import { db } from './db.js';

export function getOwnCourse(userId, courseId) {
  return db
    .prepare(
      `SELECT c.* FROM courses c
       JOIN classes cl ON cl.id = c.class_id
       WHERE c.id = ? AND c.created_by = ? AND cl.owner_id = ? AND cl.is_personal = 1`
    )
    .get(courseId, userId, userId);
}

export function ownCourseMiddleware(req, res, next) {
  const courseId = Number(req.params.courseId ?? req.params.id);
  if (!Number.isSafeInteger(courseId) || courseId <= 0) {
    return res.status(400).json({ error: '课程 ID 不合法' });
  }
  const course = getOwnCourse(req.user.id, courseId);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  req.course = course;
  next();
}
