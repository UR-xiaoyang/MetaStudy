import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { ownCourseMiddleware } from '../access.js';

const router = Router();
router.use(authMiddleware);

// 上报学习时长（按天累加）
router.post('/:courseId', ownCourseMiddleware, (req, res) => {
  const { seconds, log_date } = req.body || {};
  const sec = Math.max(0, Math.floor(Number(seconds) || 0));
  if (sec <= 0) return res.status(400).json({ error: '时长无效' });

  // 限制日期格式为 YYYY-MM-DD（默认今天）
  const date = /^\d{4}-\d{2}-\d{2}$/.test(log_date || '') ? log_date : new Date().toISOString().slice(0, 10);

  db.prepare(
    `INSERT INTO study_logs (user_id, course_id, log_date, seconds, updated_at)
     VALUES (?, ?, ?, ?, datetime('now'))
     ON CONFLICT(user_id, course_id, log_date) DO UPDATE SET
       seconds = seconds + excluded.seconds,
       updated_at = datetime('now')`
  ).run(req.user.id, req.course.id, date, sec);
  const row = db
    .prepare('SELECT * FROM study_logs WHERE user_id = ? AND course_id = ? AND log_date = ?')
    .get(req.user.id, req.course.id, date);
  res.json(row);
});

// 查询当前用户某月（YYYY-MM）的打卡数据（按天聚合所有课程）
router.get('/month/:month', (req, res) => {
  const month = req.params.month;
  if (!/^\d{4}-\d{2}$/.test(month)) {
    return res.status(400).json({ error: '月份格式应为 YYYY-MM' });
  }
  const rows = db
    .prepare(
      `SELECT log_date, SUM(seconds) AS seconds
       FROM study_logs WHERE user_id = ? AND log_date LIKE ?
       GROUP BY log_date ORDER BY log_date`
    )
    .all(req.user.id, month + '%');
  res.json(rows);
});

// 查询当前用户某日期区间（YYYY-MM-DD..YYYY-MM-DD）逐日打卡数据（供年度热力图）
router.get('/range', (req, res) => {
  const { start, end } = req.query;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start || '') || !/^\d{4}-\d{2}-\d{2}$/.test(end || '')) {
    return res.status(400).json({ error: 'start 与 end 格式应为 YYYY-MM-DD' });
  }
  // 逐日聚合，并附带当天打卡过的课程明细（课程名 + 各自时长）
  const days = db
    .prepare(
      `SELECT sl.log_date AS log_date,
              SUM(sl.seconds) AS seconds
       FROM study_logs sl
       WHERE sl.user_id = ? AND sl.log_date BETWEEN ? AND ?
       GROUP BY sl.log_date
       ORDER BY sl.log_date`
    )
    .all(req.user.id, start, end);
  const courseRows = db
    .prepare(
      `SELECT sl.log_date AS log_date,
              c.title AS course_title,
              SUM(sl.seconds) AS seconds
       FROM study_logs sl
       LEFT JOIN courses c ON c.id = sl.course_id
       WHERE sl.user_id = ? AND sl.log_date BETWEEN ? AND ?
       GROUP BY sl.log_date, sl.course_id
       ORDER BY sl.log_date`
    )
    .all(req.user.id, start, end);
  const byCourse = {};
  for (const r of courseRows) {
    (byCourse[r.log_date] = byCourse[r.log_date] || []).push({
      course_title: r.course_title || '未知课程',
      seconds: r.seconds
    });
  }
  const result = days.map((d) => ({
    ...d,
    courses: byCourse[d.log_date] || []
  }));
  res.json(result);
});

// 汇总统计：总学习天数、总时长
router.get('/summary', (req, res) => {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT log_date) AS days, COALESCE(SUM(seconds),0) AS seconds
       FROM study_logs WHERE user_id = ?`
    )
    .get(req.user.id);
  res.json({ days: row.days, seconds: row.seconds });
});

export default router;
