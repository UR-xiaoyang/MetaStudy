<script setup>
import { computed } from 'vue';
import { marked } from 'marked';
import DOMPurify from 'dompurify';

const props = defineProps({
  source: { type: String, default: '' }
});

marked.setOptions({ gfm: true, breaks: true });

const html = computed(() => {
  if (!props.source) return '';
  try {
    const rawHtml = marked.parse(props.source);
    return DOMPurify.sanitize(rawHtml, {
      ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'u', 's', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'code', 'pre', 'hr', 'a'],
      ALLOWED_ATTR: ['href'],
      ALLOW_DATA_ATTR: false
    });
  } catch {
    return DOMPurify.sanitize(props.source);
  }
});
</script>

<template>
  <div class="md-view" v-html="html"></div>
</template>

<style scoped>
.md-view {
  font-size: 14px;
  line-height: 1.8;
  color: #1f2937;
  word-break: break-word;
}

.md-view :deep(h1) {
  font-size: 20px;
  margin: 16px 0 8px;
  padding-bottom: 6px;
  border-bottom: 1px solid #e5e7eb;
}

.md-view :deep(h2) {
  font-size: 17px;
  margin: 14px 0 6px;
}

.md-view :deep(h3) {
  font-size: 15px;
  margin: 12px 0 4px;
}

.md-view :deep(h4) {
  font-size: 14px;
  margin: 10px 0 4px;
}

.md-view :deep(p) {
  margin: 8px 0;
}

.md-view :deep(ul),
.md-view :deep(ol) {
  margin: 8px 0;
  padding-left: 22px;
}

.md-view :deep(li) {
  margin: 4px 0;
}

.md-view :deep(strong) {
  font-weight: 600;
}

.md-view :deep(code) {
  background: #f3f4f6;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 13px;
}

.md-view :deep(pre) {
  background: #f9fafb;
  padding: 12px;
  border-radius: 6px;
  overflow-x: auto;
  margin: 10px 0;
}

.md-view :deep(hr) {
  border: none;
  border-top: 1px solid #e5e7eb;
  margin: 14px 0;
}

.md-view :deep(blockquote) {
  border-left: 3px solid #d1d5db;
  padding-left: 12px;
  color: #6b7280;
  margin: 8px 0;
}
</style>
