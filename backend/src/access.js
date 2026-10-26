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

export function getOwnRecording(userId, recordingId) {
  return db
    .prepare(
      `SELECT r.*, c.class_id, c.title AS course_title, c.subject AS course_subject
       FROM recordings r
       JOIN courses c ON c.id = r.course_id
       JOIN classes cl ON cl.id = c.class_id
       WHERE r.id = ? AND c.created_by = ? AND cl.owner_id = ? AND cl.is_personal = 1`
    )
    .get(recordingId, userId, userId);
}

/**
 * 录音级权限校验：录音所属课程必须属于当前用户的个人学习空间。
 */
export function ownRecordingMiddleware(req, res, next) {
  const recordingId = Number(req.params.recordingId);
  if (!Number.isSafeInteger(recordingId) || recordingId <= 0) {
    return res.status(400).json({ error: '录音 ID 不合法' });
  }
  const recording = getOwnRecording(req.user.id, recordingId);
  if (!recording) return res.status(404).json({ error: '录音不存在' });
  req.recording = recording;
  req.course = {
    id: recording.course_id,
    class_id: recording.class_id,
    title: recording.course_title,
    subject: recording.course_subject
  };
  next();
}

