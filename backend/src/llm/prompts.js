const SYSTEM_PROMPT =
  '你是一位耐心、严谨的中学/大学教师，擅长把课堂内容整理成学生能复习的材料。' +
  '只输出 JSON，不要输出 Markdown 代码块标记，不要输出 JSON 之外的任何说明。';

const MAX_TRANSCRIPT_CHARS = 6000;

function clip(text, max = MAX_TRANSCRIPT_CHARS) {
  const value = String(text || '').replace(/\s+/g, ' ').trim();
  return value.length > max ? `${value.slice(0, max)}…（后文省略）` : value;
}

function joinLines(items, max = 20) {
  return (items || []).slice(0, max).map((item, i) => `${i + 1}. ${item}`).join('\n');
}

export function buildNotePrompt({ course, transcript, images = [], questions = [] }) {
  const questionList = questions.map((q) => `- ${q.question}（答案：${q.answer}）`).join('\n');
  const user = [
    `# 任务：生成课程笔记`,
    ``,
    `课程标题：${course.title}`,
    `学科：${course.subject || '未设置'}`,
    `课程图片数量：${images.length}`,
    ``,
    `## 课堂录音转写（可能为空或不完整）`,
    clip(transcript) || '（无转写文本）',
    ``,
    questionList ? `## 已有练习题\n${questionList}` : '',
    ``,
    `## 输出 JSON 结构`,
    `{`,
    `  "title": "笔记标题",`,
    `  "outline": ["一级要点 1", "一级要点 2"],`,
    `  "keywords": ["关键词 1", "关键词 2"],`,
    `  "summary": "100 字以内的本课总结",`,
    `  "content": "Markdown 正文，包含 ## 知识点小节，关键概念用 **加粗**"`,
    `}`,
    ``,
    `## 要求`,
    `1. 只依据给定材料，不要编造课程里没有出现的知识点；材料不足时明确写“录音内容不足以确定……”。`,
    `2. content 必须包含 3-6 个知识点小节，每节 2-4 句话。`,
    `3. keywords 不超过 8 个，来自材料中的真实概念。`
  ]
    .filter(Boolean)
    .join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user }
  ];
}

export function buildQuestionsPrompt({ course, note, transcript, difficulty = 'basic', count = 5 }) {
  const level = { basic: '基础（概念记忆与直接应用）', medium: '中级（理解与多步骤应用）', advanced: '高级（综合分析与迁移）' }[
    difficulty
  ] || '基础（概念记忆与直接应用）';

  const user = [
    `# 任务：为课程生成练习题`,
    ``,
    `课程标题：${course.title}`,
    `学科：${course.subject || '未设置'}`,
    `难度：${level}`,
    `题目数量：${count}`,
    ``,
    `## 课程笔记`,
    clip(note, 4000) || '（暂无笔记）',
    ``,
    `## 课堂录音转写`,
    clip(transcript, 2000) || '（无转写文本）',
    ``,
    `## 输出 JSON`,
    `{ "questions": [`,
    `  { "type": "choice", "question": "题干", "options": ["A 选项内容","B 选项内容","C 选项内容","D 选项内容"], "answer": "B", "explanation": "解析" },`,
    `  { "type": "fill", "question": "含 ____ 的题干", "answer": "参考答案", "explanation": "解析" },`,
    `  { "type": "essay", "question": "简答题干", "answer": "评分要点1；评分要点2；评分要点3", "explanation": "解析" }`,
    `] }`,
    ``,
    `## 要求`,
    `1. 题目必须紧扣给定材料，禁止出现“干扰项A”这类占位文本。`,
    `2. 选择题 4 个选项且只有 1 个正确答案，answer 用 A/B/C/D 表示。`,
    `3. 简答题的 answer 用“；”分隔 3-4 个评分要点。`,
    `4. 至少 1 道选择题、1 道填空题，其余题型自选。`
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user }
  ];
}

export function buildGradingPrompt({ question, reference, studentAnswer, maxScore = 100 }) {
  const user = [
    `# 任务：批改简答题`,
    ``,
    `题目：${question}`,
    `参考答案/评分要点：${reference}`,
    `学生答案：${studentAnswer || '（未作答）'}`,
    `满分：${maxScore}`,
    ``,
    `## 输出 JSON`,
    `{`,
    `  "score": 0,`,
    `  "max_score": ${maxScore},`,
    `  "feedback": "总体评语，2-3 句",`,
    `  "strengths": ["答对的要点"],`,
    `  "weaknesses": ["错误或缺失的要点"],`,
    `  "suggestions": ["可执行的改进建议"]`,
    `}`,
    ``,
    `## 要求`,
    `1. 判断语义是否覆盖评分要点，而不是关键词是否逐字出现。`,
    `2. 明确指出逻辑错误或概念混淆，不要只给分数。`,
    `3. score 为 0-${maxScore} 的整数，未作答记 0 分。`,
    `4. 评语要具体到学生这次答案里的表述。`
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user }
  ];
}

export function buildExplanationPrompt({ question, answer, studentAnswer, note, knowledgePoints = [] }) {
  const user = [
    `# 任务：讲解一道做错的题`,
    ``,
    `题目：${question}`,
    `参考答案：${answer}`,
    `学生答案：${studentAnswer || '（未作答）'}`,
    `涉及知识点：${knowledgePoints.length ? knowledgePoints.join('、') : '（未标注）'}`,
    ``,
    `## 课堂笔记（作为讲解依据）`,
    clip(note, 4000) || '（暂无笔记）',
    ``,
    `## 输出 JSON`,
    `{ "error_type": "概念混淆 | 计算错误 | 审题偏差 | 知识缺失", "explanation": "Markdown 讲解正文" }`,
    ``,
    `## 要求`,
    `1. 先判断学生答案错在哪一步（error_type），再解释正确答案为什么成立。`,
    `2. explanation 用 Markdown，包含：**错因分析**、**正确思路**、**同类题提醒** 三部分。`,
    `3. 只使用课堂笔记与参考答案中的知识，不要引入未学过的内容。`
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user }
  ];
}

export function buildPlanPrompt({ course, transcript, questions = [], attempts = [], wrongs = [] }) {
  const attemptLines = attempts
    .slice(0, 5)
    .map((a) => `- ${a.created_at} 得分 ${a.score}/${a.max_score}`)
    .join('\n');
  const wrongLines = joinLines(wrongs.map((w) => `${w.content}（我的答案：${w.my_answer || '未填'}；正确答案：${w.correct_answer || '未填'}）`), 10);

  const user = [
    `# 任务：生成三阶段学习计划`,
    ``,
    `课程标题：${course.title}`,
    `学科：${course.subject || '未设置'}`,
    ``,
    `## 课堂录音转写`,
    clip(transcript, 3000) || '（无转写文本）',
    ``,
    `## 已有习题`,
    joinLines(questions.map((q) => q.question), 10) || '（暂无）',
    ``,
    `## 最近答题记录`,
    attemptLines || '（暂无）',
    ``,
    `## 错题本`,
    wrongLines || '（暂无）',
    ``,
    `## 输出 JSON`,
    `{ "preview": "预习计划 Markdown", "review": "复习计划 Markdown", "practice": "练习计划 Markdown", "focus": ["薄弱知识点"] }`,
    ``,
    `## 要求`,
    `1. 每个计划以“# 标题”开头，内含 3-5 个编号步骤（以 "1." "2." 开头），前端会据此渲染可勾选清单。`,
    `2. 结合错题与答题记录指出薄弱点，并给出可执行的补强动作。`,
    `3. 不要写“根据个人情况调整”这类空话，每条步骤都要具体。`
  ].join('\n');

  return [
    { role: 'system', content: SYSTEM_PROMPT },
    { role: 'user', content: user }
  ];
}
