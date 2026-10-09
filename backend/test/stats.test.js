import { strict as assert } from 'node:assert';
import { describe, it, before } from 'node:test';
import { db } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { ensurePersonalClass } from '../src/personalCourses.js';

describe('个人中心数据统计', () => {
  let user, space, course;

  before(() => {
    const timestamp = Date.now();
    const info = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(`stats_user_${timestamp}`, hashPassword('pass123'));
    user = { id: Number(info.lastInsertRowid) };
    
    // 等待避免数据库锁
    const start = Date.now();
    while (Date.now() - start < 100) {}
    
    space = ensurePersonalClass(db, user.id);
    
    // 创建课程
    const c = db.prepare('INSERT INTO courses (class_id, title, subject, created_by) VALUES (?, ?, ?, ?)').run(space.id, '统计测试课程', '数学', user.id);
    course = { id: Number(c.lastInsertRowid) };

    // 添加录音
    db.prepare('INSERT INTO recordings (course_id, filename, storage, duration, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)').run(course.id, 'audio1.mp3', 'audio1.mp3', 120, 1024000, user.id);
    db.prepare('INSERT INTO recordings (course_id, filename, storage, duration, size, uploaded_by) VALUES (?, ?, ?, ?, ?, ?)').run(course.id, 'audio2.mp3', 'audio2.mp3', 180, 2048000, user.id);

    // 添加图片
    db.prepare('INSERT INTO images (course_id, filename, storage, size, uploaded_by) VALUES (?, ?, ?, ?, ?)').run(course.id, 'img1.jpg', 'img1.jpg', 512000, user.id);

    // 添加习题
    db.prepare('INSERT INTO questions (course_id, type, question, answer) VALUES (?, ?, ?, ?)').run(course.id, 'choice', '测试题1', 'A');
    db.prepare('INSERT INTO questions (course_id, type, question, answer) VALUES (?, ?, ?, ?)').run(course.id, 'fill', '测试题2', '答案');
    db.prepare('INSERT INTO questions (course_id, type, question, answer) VALUES (?, ?, ?, ?)').run(course.id, 'essay', '测试题3', '参考答案');

    // 添加答题记录
    db.prepare('INSERT INTO quiz_attempts (course_id, user_id, answers, result, score, max_score) VALUES (?, ?, ?, ?, ?, ?)').run(course.id, user.id, '{}', '{}', 80, 100);
    db.prepare('INSERT INTO quiz_attempts (course_id, user_id, answers, result, score, max_score) VALUES (?, ?, ?, ?, ?, ?)').run(course.id, user.id, '{}', '{}', 90, 100);

    // 添加错题
    db.prepare('INSERT INTO wrong_questions (course_id, content, my_answer, correct_answer, source, created_by) VALUES (?, ?, ?, ?, ?, ?)').run(course.id, '错题1', '我的答案', '正确答案', 'manual', user.id);
  });

  it('统计课程数量', () => {
    const result = db.prepare('SELECT COUNT(*) as count FROM courses WHERE created_by = ?').get(user.id);
    assert.equal(result.count, 1);
  });

  it('统计录音数量', () => {
    const result = db.prepare('SELECT COUNT(*) as count FROM recordings WHERE uploaded_by = ?').get(user.id);
    assert.equal(result.count, 2);
  });

  it('统计图片数量', () => {
    const result = db.prepare('SELECT COUNT(*) as count FROM images WHERE uploaded_by = ?').get(user.id);
    assert.equal(result.count, 1);
  });

  it('统计习题数量', () => {
    const result = db.prepare(
      `SELECT COUNT(*) as count FROM questions q
       JOIN courses c ON c.id = q.course_id
       WHERE c.created_by = ?`
    ).get(user.id);
    assert.equal(result.count, 3);
  });

  it('统计答题次数', () => {
    const result = db.prepare('SELECT COUNT(*) as count FROM quiz_attempts WHERE user_id = ?').get(user.id);
    assert.equal(result.count, 2);
  });

  it('统计错题数量', () => {
    const result = db.prepare('SELECT COUNT(*) as count FROM wrong_questions WHERE created_by = ?').get(user.id);
    assert.equal(result.count, 1);
  });

  it('计算平均分数', () => {
    const result = db.prepare(
      `SELECT AVG(CAST(score AS REAL) / CAST(max_score AS REAL) * 100) as avg_score
       FROM quiz_attempts
       WHERE user_id = ? AND max_score > 0`
    ).get(user.id);
    assert.ok(result.avg_score !== null);
    assert.equal(result.avg_score, 85); // (80 + 90) / 2 = 85
  });
});
