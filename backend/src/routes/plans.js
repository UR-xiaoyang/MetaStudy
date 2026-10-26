import { Router } from 'express';
import { db } from '../db.js';
import { authMiddleware } from '../auth.js';
import { ownCourseMiddleware } from '../access.js';
import { ai } from '../ai.js';

const router = Router();
router.use(authMiddleware);

const STOPWORDS = /(的|了|和|是|在|与|及|或|都|也|就|很|而|因为|所以|但是|以及|可以|我们|你们|他们|这个|那个|关于|什么|如何|为什么|进行|具有|包括|以及)/g;

function extractKeywords(...texts) {
  const seen = new Set();
  const tokens = texts
    .filter(Boolean)
    .join(' ')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  for (const t of tokens) {
    const w = t.replace(STOPWORDS, '');
    if (!w) continue;
    const key = /[\u4e00-\u9fa5]{2,}/.test(w) ? w : w.toLowerCase();
    if (key.length >= 2) seen.add(key);
  }
  return Array.from(seen);
}

function buildPlan(course) {
  const images = db.prepare('SELECT filename FROM images WHERE course_id = ?').all(course.id);
  const recordings = db.prepare('SELECT filename, transcript FROM recordings WHERE course_id = ?').all(course.id);
  const questions = db.prepare('SELECT question, answer FROM questions WHERE course_id = ?').all(course.id);

  const transcripts = recordings.map((r) => r.transcript).filter(Boolean).join(' ');
  const keywords = extractKeywords(course.title, course.subject, transcripts,
    ...images.map((i) => i.filename), ...recordings.map((r) => r.filename));
  const kw = keywords.slice(0, 5).join('、') || course.title;

  const preview = [
    `# 预习计划：${course.title}`,
    ``,
    `**目标**：在上课前对「${course.title}」（${course.subject || '未设置学科'}）建立初步认知，带着问题听课。`,
    ``,
    `**建议步骤**：`,
    `1. 通读课程目录与简介，找出本课核心概念（关键词：${kw}）。`,
    `2. 带着以下问题预习：本课要解决什么问题？与之前学过的内容有什么关系？`,
    `3. 浏览已上传的课程图片/课件截图，圈出看不懂的地方。`,
    `4. 如课程有录音，可先快速试听开头了解脉络。`,
    ``,
    `**预习产出**：用一段话写下你对本课的初步理解与2-3个疑问，带到课堂提问。`
  ].join('\n');

  const transcriptBlock = transcripts
    ? `\n4. 结合课堂语音转写内容回顾关键词：${kw}。`
    : '';

  const review = [
    `# 复习计划：${course.title}`,
    ``,
    `**目标**：巩固知识点，把课堂内容转化为长期记忆。`,
    ``,
    `**建议步骤**：`,
    `1. 重读本课的笔记与教材，梳理知识框架。`,
    `2. 回听课堂录音，对照时间轴补全遗漏的细节。${transcriptBlock}`,
    `3. 用自己的话向他人复述核心概念，检验是否真正理解。`,
    `4. 整理课堂图片/板书，建立视觉联想。`,
    ``,
    `**复习产出**：能不看资料，独立画出本课的知识要点思维导图。`
  ].join('\n');

  const practice = [
    `# 练习计划：${course.title}`,
    ``,
    `**目标**：通过练习检验掌握程度，及时查漏补缺。`,
    ``,
    `**建议步骤**：`,
    questions.length
      ? `1. 完成本课自动生成的 ${questions.length} 道练习题，先独立作答再核对答案。`
      : `1. 先点击「生成习题」获得本课练习题，再独立作答并核对答案。`,
    `2. 做错的题目点击「加入错题本」，记录错因。`,
    `3. 针对错题回看笔记与录音，重新做同类题。`,
    `4. 定期回顾错题本，直到能一次做对为止。`,
    ``,
    `**练习产出**：错题本中的本课题目全部转为“已掌握”。`
  ].join('\n');

  return { preview, review, practice };
}

function listItemCount(md) {
  if (!md) return 0;
  return md.split('\n').filter((l) => /^\s*\d+\.\s+/.test(l)).length;
}

function emptyState(preview, review, practice) {
  return JSON.stringify({
    preview: Array(listItemCount(preview)).fill(false),
    review: Array(listItemCount(review)).fill(false),
    practice: Array(listItemCount(practice)).fill(false)
  });
}

router.get('/:courseId', ownCourseMiddleware, (req, res) => {
  let plan = db
    .prepare('SELECT * FROM study_plans WHERE course_id = ? AND user_id = ?')
    .get(req.course.id, req.user.id);
  if (plan && !plan.state) {
    const state = emptyState(plan.preview, plan.review, plan.practice);
    db.prepare('UPDATE study_plans SET state = ? WHERE id = ?').run(state, plan.id);
    plan.state = state;
  }
  res.json(plan || null);
});

router.put('/state/:courseId', ownCourseMiddleware, (req, res) => {
  const { state } = req.body || {};
  const existing = db
    .prepare('SELECT * FROM study_plans WHERE course_id = ? AND user_id = ?')
    .get(req.course.id, req.user.id);
  if (!existing) return res.status(404).json({ error: '尚未生成学习计划，请先生成' });
  const safe = { preview: [], review: [], practice: [] };
  if (state && typeof state === 'object') {
    safe.preview = Array.isArray(state.preview) ? state.preview : [];
    safe.review = Array.isArray(state.review) ? state.review : [];
    safe.practice = Array.isArray(state.practice) ? state.practice : [];
  }
  db.prepare('UPDATE study_plans SET state = ?, updated_at = datetime(\'now\') WHERE id = ?')
    .run(JSON.stringify(safe), existing.id);
  const saved = db
    .prepare('SELECT * FROM study_plans WHERE course_id = ? AND user_id = ?')
    .get(req.course.id, req.user.id);
  res.json(saved);
});

router.post('/generate/:courseId', ownCourseMiddleware, async (req, res) => {
  try {
    const questions = db.prepare('SELECT question, answer FROM questions WHERE course_id = ?').all(req.course.id);
    const recordings = db.prepare('SELECT transcript FROM recordings WHERE course_id = ?').all(req.course.id);
    const transcript = recordings.map((r) => r.transcript).filter(Boolean).join('\n');
    const attempts = db
      .prepare(
        `SELECT score, max_score, created_at FROM quiz_attempts
          WHERE course_id = ? AND user_id = ? ORDER BY created_at DESC LIMIT 5`
      )
      .all(req.course.id, req.user.id);
    const wrongs = db
      .prepare(
        `SELECT content, my_answer, correct_answer FROM wrong_questions
          WHERE course_id = ? AND created_by = ? ORDER BY created_at DESC LIMIT 10`
      )
      .all(req.course.id, req.user.id);

    let plan = null;
    let engine = 'rule';
    let degraded = false;
    let error = null;

    if (ai.configured) {
      try {
        const result = await ai.buildPlan({
          course: req.course,
          transcript,
          questions,
          attempts,
          wrongs,
          userId: req.user.id
        });
        plan = result.data;
        engine = 'llm';
      } catch (e) {
        degraded = true;
        error = e.message;
      }
    }

    if (!plan) plan = buildPlan(req.course);

    const state = emptyState(plan.preview, plan.review, plan.practice);
    db.prepare(
      `INSERT INTO study_plans (course_id, user_id, preview, review, practice, state, engine, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(course_id, user_id) DO UPDATE SET
         preview = excluded.preview,
         review = excluded.review,
         practice = excluded.practice,
         state = excluded.state,
         engine = excluded.engine,
         updated_at = datetime('now')`
    ).run(req.course.id, req.user.id, plan.preview, plan.review, plan.practice, state, engine);
    const saved = db
      .prepare('SELECT * FROM study_plans WHERE course_id = ? AND user_id = ?')
      .get(req.course.id, req.user.id);
    res.json({ ...saved, degraded, degradedReason: error, focus: plan.focus || [] });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

export default router;
