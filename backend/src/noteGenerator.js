import { db } from './db.js';

const STOPWORDS = /(的|了|和|是|在|与|及|或|都|也|就|很|而|因为|所以|但是|以及|可以|我们|你们|他们|这个|那个|关于|什么|如何|为什么|进行|具有|包括|以及)/g;

function extractKeywords(...texts) {
  const tokens = texts
    .filter(Boolean)
    .join(' ')
    .replace(/[^\u4e00-\u9fa5A-Za-z0-9]+/g, ' ')
    .split(/\s+/)
    .filter(Boolean);

  const seen = new Set();
  for (const t of tokens) {
    const word = t.replace(STOPWORDS, '');
    if (!word) continue;
    const key = /[\u4e00-\u9fa5]{2,}/.test(word) ? word : word.toLowerCase();
    if (key.length >= 2) seen.add(key);
  }
  return Array.from(seen);
}

export function generateNoteForCourse(courseId) {
  const course = db.prepare('SELECT * FROM courses WHERE id = ?').get(courseId);
  if (!course) throw new Error('课程不存在');

  const images = db.prepare('SELECT filename FROM images WHERE course_id = ?').all(courseId);
  const recordings = db.prepare('SELECT filename, transcript FROM recordings WHERE course_id = ?').all(courseId);
  const questions = db.prepare('SELECT question, answer FROM questions WHERE course_id = ?').all(courseId);

  const transcripts = recordings.map((r) => r.transcript).filter(Boolean);
  const speechText = transcripts.join(' ');

  const keywords = extractKeywords(course.title, course.subject, speechText,
    ...images.map((i) => i.filename), ...recordings.map((r) => r.filename));
  const topKeywords = keywords.slice(0, 6).join('、') || '（待补充）';

  const recordingSummary = recordings.length
    ? `共 ${recordings.length} 段课堂录音` + (speechText ? `，已转写约 ${speechText.replace(/\s+/g, '').length} 字语音内容` : '，尚未转写') + '。'
    : '暂无课堂录音。';

  const imageSummary = images.length ? `共 ${images.length} 张课程图片。` : '暂无课程图片。';

  const questionSummary = questions.length
    ? `已生成 ${questions.length} 道练习题。`
    : '暂无练习题。';

  const questionList = questions.length
    ? questions.map((q, i) => `  ${i + 1}. ${q.question}（答案：${q.answer}）`).join('\n')
    : '';

  const transcriptBlock = speechText
    ? `\n### 课堂语音要点（转写摘录）\n${speechText.slice(0, 600)}${speechText.length > 600 ? '……' : ''}`
    : '';

  return `# ${course.title} 课程笔记

## 基本信息
- 学科：${course.subject || '未设置'}
- 核心关键词：${topKeywords}

## 课程资源
- ${recordingSummary}
- ${imageSummary}
- ${questionSummary}

## 知识要点
围绕主题「${course.title}」及核心关键词（${topKeywords}），建议重点掌握以下内容：
1. 理解主题的基本概念与定义，能用自己的话复述。
2. 掌握核心关键词的含义及其在题目中的应用。
3. 结合录音与图片资源，梳理知识点之间的逻辑关系。
4. 通过练习（${questionSummary.replace('。', '')}）巩固所学，遇到错题及时加入错题本复习。${transcriptBlock}

## 复习建议
- 回听课堂录音，查漏补缺。
- 先看笔记，再做题，最后整理错题本反复巩固。
`;
}

void db;
