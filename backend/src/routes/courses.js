import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { fetchMessagesTree } from '../messageUtil.js';

const router = Router();
router.use(authMiddleware);

function isMember(userId, classId) {
  return !!db.prepare('SELECT id FROM class_members WHERE class_id = ? AND user_id = ?').get(classId, userId);
}

router.get('/class/:classId', (req, res) => {
  const classId = Number(req.params.classId);
  if (!isMember(req.user.id, classId)) {
    return res.status(403).json({ error: '无权访问该班级' });
  }
  const rows = db
    .prepare(
      `SELECT c.id, c.title, c.subject, c.created_by, c.created_at,
              (SELECT COUNT(*) FROM recordings r WHERE r.course_id = c.id) AS recording_count,
              (SELECT COUNT(*) FROM images i WHERE i.course_id = c.id) AS image_count,
              (SELECT COUNT(*) FROM questions q WHERE q.course_id = c.id) AS question_count
       FROM courses c
       WHERE c.class_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(classId);
  res.json(rows);
});

router.get('/member-class', (req, res) => {
  const rows = db
    .prepare(
      `SELECT c.id, c.class_id, c.title, c.subject, cm.role AS my_role
       FROM courses c
       JOIN class_members cm ON cm.class_id = c.class_id
       WHERE cm.user_id = ?
       ORDER BY c.created_at DESC`
    )
    .all(req.user.id);
  res.json(rows);
});

router.post('/', (req, res) => {
  const { class_id, title, subject } = req.body || {};
  if (!class_id || !title) {
    return res.status(400).json({ error: 'class_id 和课程标题不能为空' });
  }
  if (!isMember(req.user.id, Number(class_id))) {
    return res.status(403).json({ error: '无权访问该班级' });
  }
  const info = db
    .prepare('INSERT INTO courses (class_id, title, subject, created_by) VALUES (?, ?, ?, ?)')
    .run(Number(class_id), title.trim(), subject ? subject.trim() : null, req.user.id);
  const course = db
    .prepare('SELECT * FROM courses WHERE id = ?')
    .get(info.lastInsertRowid);
  res.status(201).json(course);
});

router.get('/:id', (req, res) => {
  const id = Number(req.params.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  if (!isMember(req.user.id, course.class_id)) {
    return res.status(403).json({ error: '无权访问该课程' });
  }
  const recordings = db
    .prepare(
      `SELECT r.*, u.username AS uploader FROM recordings r
       JOIN users u ON u.id = r.uploaded_by
       WHERE r.course_id = ? ORDER BY r.created_at DESC`
    )
    .all(id);
  const images = db
    .prepare(
      `SELECT i.*, u.username AS uploader FROM images i
       JOIN users u ON u.id = i.uploaded_by
       WHERE i.course_id = ? ORDER BY i.created_at DESC`
    )
    .all(id);
  const questions = db.prepare('SELECT * FROM questions WHERE course_id = ? ORDER BY id').all(id);
  const messages = fetchMessagesTree(db, id);
  const note = db.prepare('SELECT * FROM notes WHERE course_id = ?').get(id) || null;
  const wrongs = db
    .prepare(
      `SELECT w.*, u.username AS created_by_name, q.question AS source_question
       FROM wrong_questions w
       LEFT JOIN users u ON u.id = w.created_by
       LEFT JOIN questions q ON q.id = w.question_id
       WHERE w.course_id = ? ORDER BY w.created_at DESC`
    )
    .all(id);
  res.json({ ...course, recordings, images, questions, messages, note, wrongs });
});

router.get('/:id/stats', (req, res) => {
  const id = Number(req.params.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  if (!isMember(req.user.id, course.class_id)) {
    return res.status(403).json({ error: '无权访问该课程' });
  }

  // 学生列表（该课程所属班级的学生成员）
  const students = db
    .prepare(
      `SELECT u.id, u.username, cm.role
       FROM class_members cm JOIN users u ON u.id = cm.user_id
       WHERE cm.class_id = ? AND cm.role = 'student'
       ORDER BY u.username`
    )
    .all(course.class_id);

  // 每位学生在该课程下的错题数与留言数
  const wrongCounts = db
    .prepare('SELECT created_by, COUNT(*) AS n FROM wrong_questions WHERE course_id = ? GROUP BY created_by')
    .all(id);
  const msgCounts = db
    .prepare('SELECT user_id, COUNT(*) AS n FROM messages WHERE course_id = ? GROUP BY user_id')
    .all(id);
  const wrongMap = Object.fromEntries(wrongCounts.map((r) => [r.created_by, r.n]));
  const msgMap = Object.fromEntries(msgCounts.map((r) => [r.user_id, r.n]));

  const studentsStats = students.map((s) => ({
    username: s.username,
    wrong_count: wrongMap[s.id] || 0,
    message_count: msgMap[s.id] || 0
  }));

  // 错题类型来源分布（来源：manual 手写 / question 来自习题）
  const wrongBySource = db
    .prepare('SELECT source, COUNT(*) AS n FROM wrong_questions WHERE course_id = ? GROUP BY source')
    .all(id);

  // 错题排名（按学生排序）
  const wrongRanking = studentsStats
    .filter((s) => s.wrong_count > 0)
    .sort((a, b) => b.wrong_count - a.wrong_count);

  const recordingCount = db.prepare('SELECT COUNT(*) AS n FROM recordings WHERE course_id = ?').get(id).n;
  const imageCount = db.prepare('SELECT COUNT(*) AS n FROM images WHERE course_id = ?').get(id).n;
  const questionCount = db.prepare('SELECT COUNT(*) AS n FROM questions WHERE course_id = ?').get(id).n;
  const wrongTotal = wrongCounts.reduce((s, r) => s + r.n, 0);
  const messageTotal = msgCounts.reduce((s, r) => s + r.n, 0);

  res.json({
    course: { id: course.id, title: course.title, subject: course.subject },
    overview: {
      student_count: students.length,
      recording_count: recordingCount,
      image_count: imageCount,
      question_count: questionCount,
      wrong_total: wrongTotal,
      message_total: messageTotal
    },
    students: studentsStats,
    wrong_ranking: wrongRanking,
    wrong_by_source: wrongBySource
  });
});

router.delete('/:id', (req, res) => {
  const id = Number(req.params.id);
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(id);
  if (!course) return res.status(404).json({ error: '课程不存在' });
  if (req.user.role !== 'teacher') {
    return res.status(403).json({ error: '只有老师可以删除课程' });
  }
  db.prepare('DELETE FROM courses WHERE id = ?').run(id);
  res.json({ ok: true });
});

export default router;
