<script setup>
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps({
  plan: Object,
  state: { type: Object, default: () => ({ preview: [], review: [], practice: [] }) }
});
const emit = defineEmits(['update']);

marked.setOptions({ gfm: true, breaks: true });

function splitMarkdown(md) {
  if (!md) return { title: '', blocks: [], steps: [], output: '' };
  const lines = md.split('\n');
  const title = lines.find((l) => /^#\s+/.test(l))?.replace(/^#\s+/, '') || '';
  const stepRe = /^\s*\d+\.\s+(.*)$/;
  const steps = [];
  const blocks = [];
  let currentType = null;
  let currentBuf = [];

  const flush = () => {
    if (currentType) {
      const text = currentBuf.join('\n').trim();
      if (text) blocks.push({ type: currentType, text });
      currentBuf = [];
      currentType = null;
    }
  };

  for (const raw of lines) {
    if (/^#\s+/.test(raw)) continue;
    const step = raw.match(stepRe);
    if (step) {
      flush();
      steps.push(step[1]);
      currentType = null;
      continue;
    }
    if (/^(目标|预习产出|复习产出|练习产出|建议步骤)/.test(raw.replace(/\*\*/g, ''))) {
      flush();
      currentType = 'heading';
    } else if (currentType === null) {
      currentType = 'text';
    }
    if (currentType === 'text' || currentType === 'heading') {
      currentBuf.push(raw);
    }
  }
  flush();

  const output = blocks
    .filter((b) => /产出/.test(b.text))
    .map((b) => b.text.replace(/\*\*/g, ''))
    .join('\n');
  return { title, blocks, steps, output };
}

function parseWithMarkdown(fullMd) {
  // 渲染为 html 供说明性段落使用；步骤单独展示
  try {
    const rawHtml = marked.parse(fullMd);
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'blockquote', 'code', 'pre'],
      ALLOWED_ATTR: [],
      ALLOW_DATA_ATTR: false
    });
  } catch {
    return DOMPurify.sanitize(fullMd);
  }
}

const sections = computed(() => {
  const keys = ['preview', 'review', 'practice'];
  const meta = { preview: { icon: '📖', name: '预习' }, review: { icon: '🔁', name: '复习' }, practice: { icon: '✏️', name: '练习' } };
  return keys.map((key) => {
    const parsed = splitMarkdown(props.plan?.[key] || '');
    return {
      key,
      icon: meta[key].icon,
      name: meta[key].name,
      title: parsed.title,
      blocks: parsed.blocks,
      steps: parsed.steps,
      output: parsed.output,
      checks: Array.isArray(props.state[key]) ? props.state[key] : []
    };
  });
});

function toggle(section, index) {
  const next = { ...props.state, [section.key]: section.checks.slice() };
  next[section.key][index] = !next[section.key][index];
  emit('update', next);
}

function isChecked(section, index) {
  return !!(section.checks && section.checks[index]);
}

function doneRatio(section) {
  if (!section.steps.length) return 0;
  const done = section.checks.filter(Boolean).length;
  return Math.round((done / section.steps.length) * 100);
}
</script>

<template>
  <div class="plan-ui">
    <div v-for="section in sections" :key="section.key" class="plan-section">
      <div class="section-head">
        <span class="section-icon">{{ section.icon }}</span>
        <h4>{{ section.name }}</h4>
        <span class="section-progress">{{ doneRatio(section) }}%</span>
      </div>

      <div class="section-title">{{ section.title }}</div>

      <div
        class="plan-block"
        v-for="(b, bi) in section.blocks.filter((x) => x.type === 'heading' && !/产出/.test(x.text))"
        :key="'h' + bi"
      >
        <div class="md-inline" v-html="parseWithMarkdown(b.text)"></div>
      </div>

      <ul class="task-list">
        <li v-for="(step, i) in section.steps" :key="i" class="task-item" @click="toggle(section, i)">
          <span class="checkbox" :class="{ checked: isChecked(section, i) }">{{ isChecked(section, i) ? '✓' : '' }}</span>
          <span class="task-text" :class="{ done: isChecked(section, i) }">{{ step }}</span>
        </li>
      </ul>

      <div v-if="section.output" class="plan-output">
        <div class="md-inline" v-html="parseWithMarkdown(section.output)"></div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.plan-ui {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.plan-section {
  border: 1px solid #e5e7eb;
  border-radius: 10px;
  padding: 16px;
}

.section-head {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 6px;
}

.section-icon {
  font-size: 16px;
}

.section-head h4 {
  margin: 0;
  font-size: 16px;
}

.section-progress {
  margin-left: auto;
  font-size: 13px;
  font-weight: 600;
  color: #2563eb;
}

.section-title {
  font-size: 15px;
  font-weight: 600;
  color: #1f2937;
  margin-bottom: 8px;
}

.plan-block {
  margin-bottom: 4px;
}

.md-inline {
  font-size: 14px;
  line-height: 1.7;
}

.md-inline :deep(p) {
  margin: 6px 0;
}

.md-inline :deep(strong) {
  color: #111827;
}

.task-list {
  list-style: none;
  margin: 8px 0;
  padding: 0;
}

.task-item {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  padding: 8px 10px;
  border-radius: 8px;
  cursor: pointer;
  transition: background 0.15s;
}

.task-item:hover {
  background: #f3f4f6;
}

.checkbox {
  flex-shrink: 0;
  width: 20px;
  height: 20px;
  border: 2px solid #d1d5db;
  border-radius: 5px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  color: #fff;
  margin-top: 1px;
  transition: all 0.15s;
}

.checkbox.checked {
  background: #2563eb;
  border-color: #2563eb;
}

.task-text {
  font-size: 14px;
  line-height: 1.6;
  color: #1f2937;
}

.task-text.done {
  text-decoration: line-through;
  color: #9ca3af;
}

.plan-output {
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px dashed #e5e7eb;
}

.md-inline :deep(blockquote) {
  margin: 6px 0;
  padding-left: 10px;
  border-left: 3px solid #d1d5db;
  color: #6b7280;
}
</style>
