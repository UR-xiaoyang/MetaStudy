function normalize(value) {
  return String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s。；;，,、.!！?？:：]/g, '');
}

function splitRubric(question) {
  if (Array.isArray(question.rubric) && question.rubric.length) return question.rubric;
  return String(question.answer || '')
    .split(/[；;。\n、,，]/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 2);
}

export function gradeAnswer(question, studentAnswer) {
  const answer = String(studentAnswer ?? '').trim();
  const type = question?.type || 'choice';

  if (type === 'essay') {
    const rubric = splitRubric(question);
    const matchedPoints = rubric.filter((point) => answer.includes(point));
    const missingPoints = rubric.filter((point) => !matchedPoints.includes(point));
    const maxScore = Math.max(rubric.length, 1);
    const score = matchedPoints.length;
    return {
      correct: score === maxScore,
      score,
      maxScore,
      matchedPoints,
      missingPoints,
      feedback: score === maxScore
        ? '回答覆盖了参考答案中的主要知识点。'
        : `回答覆盖了 ${score}/${maxScore} 个关键知识点，请结合课堂笔记补充遗漏内容。`
    };
  }

  const correct = normalize(answer) === normalize(question?.answer);
  return {
    correct,
    score: correct ? 1 : 0,
    maxScore: 1,
    feedback: correct ? '回答正确。' : '回答不正确，请回到课堂笔记复习相关知识点。'
  };
}

export function explainWrongAnswer({ question, answer, studentAnswer, note, knowledgePoints = [] }) {
  const points = knowledgePoints.length ? knowledgePoints.join('、') : '本题相关知识点';
  return [
    '### 错题讲解',
    `**题目：**${question}`,
    `**你的答案：**${studentAnswer || '未作答'}`,
    `**参考答案：**${answer}`,
    '',
    `**课堂依据：**${note || '请查看本课程笔记中的相关内容。'}`,
    `**涉及知识点：**${points}`,
    '',
    '**分析：**你的答案与参考答案不一致。请先定位题目中的条件，再按照课堂中介绍的概念或步骤逐项判断。不要只记结论，要说明结论成立的前提。',
    '',
    '**巩固建议：**回看上面的课堂依据，用自己的话复述相关知识点后，再完成一道同类型题。'
  ].join('\n');
}
