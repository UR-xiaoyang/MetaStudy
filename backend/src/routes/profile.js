import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';

const router = Router();
router.use(authMiddleware);

// 个人中心：用户信息 + 班级列表
router.get('/me', (req, res) => {
  const user = db
    .prepare("SELECT id, username, 'student' AS role, created_at FROM users WHERE id = ?")
    .get(req.user.id);
  if (!user) return res.status(404).json({ error: '用户不存在' });

  const classes = db
    .prepare(
      `SELECT c.id, c.name, c.created_at,
              (SELECT COUNT(*) FROM courses co WHERE co.class_id = c.id) AS course_count
       FROM class_members cm JOIN classes c ON c.id = cm.class_id
       WHERE cm.user_id = ? AND c.is_personal = 1 ORDER BY c.created_at DESC`
    )
    .all(req.user.id);

  // 统计数据概览
  const stats = {
    total_courses: db.prepare(
      `SELECT COUNT(*) as count FROM courses 
       WHERE created_by = ?`
    ).get(req.user.id)?.count || 0,
    
    total_recordings: db.prepare(
      `SELECT COUNT(*) as count FROM recordings 
       WHERE uploaded_by = ?`
    ).get(req.user.id)?.count || 0,
    
    total_images: db.prepare(
      `SELECT COUNT(*) as count FROM images 
       WHERE uploaded_by = ?`
    ).get(req.user.id)?.count || 0,
    
    total_questions: db.prepare(
      `SELECT COUNT(*) as count FROM questions q
       JOIN courses c ON c.id = q.course_id
       WHERE c.created_by = ?`
    ).get(req.user.id)?.count || 0,
    
    total_attempts: db.prepare(
      `SELECT COUNT(*) as count FROM quiz_attempts 
       WHERE user_id = ?`
    ).get(req.user.id)?.count || 0,
    
    total_wrongs: db.prepare(
      `SELECT COUNT(*) as count FROM wrong_questions 
       WHERE created_by = ?`
    ).get(req.user.id)?.count || 0,
    
    avg_score: null
  };

  // 计算平均分数
  const avgResult = db.prepare(
    `SELECT AVG(CAST(score AS REAL) / CAST(max_score AS REAL) * 100) as avg_score
     FROM quiz_attempts
     WHERE user_id = ? AND max_score > 0`
  ).get(req.user.id);
  
  if (avgResult && avgResult.avg_score !== null) {
    stats.avg_score = Math.round(avgResult.avg_score * 10) / 10;
  }

  res.json({ user, classes, stats });
});

export default router;
