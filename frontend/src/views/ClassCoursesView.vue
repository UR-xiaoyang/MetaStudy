<script setup>
import { ref, onMounted } from 'vue';
import { courseApi } from '../api/client.js';

const props = defineProps({ user: Object, classInfo: Object });
const emit = defineEmits(['back', 'open-course']);
const courses = ref([]);
const loading = ref(false);
const error = ref('');
const showCreate = ref(false);
const newTitle = ref('');
const newSubject = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    courses.value = await courseApi.list(props.classInfo.id);
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function createCourse() {
  if (!newTitle.value.trim()) return;
  try {
    const course = await courseApi.create({ title: newTitle.value.trim(), subject: newSubject.value.trim() || null });
    courses.value.unshift(course);
    showCreate.value = false;
    newTitle.value = '';
    newSubject.value = '';
  } catch (e) {
    error.value = e.message;
  }
}

async function removeCourse(course) {
  if (!confirm(`确定删除课程「${course.title}」？其笔记、练习和学习记录也会被删除。`)) return;
  try {
    await courseApi.remove(course.id);
    courses.value = courses.value.filter((item) => item.id !== course.id);
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand"><button class="back" @click="emit('back')">← 返回</button><span>{{ classInfo.name }}</span></div>
      <span>{{ user.username }}</span>
    </header>
    <main class="content">
      <div class="toolbar"><div><h2>我的课程</h2><p class="muted">每门课程保存独立的录音、笔记、练习和错题。</p></div><button class="primary" @click="showCreate = !showCreate">新建课程</button></div>
      <section v-if="showCreate" class="panel">
        <div class="input-group"><label>课程标题</label><input v-model="newTitle" placeholder="例如：牛顿第二定律" maxlength="120" @keyup.enter="createCourse" /></div>
        <div class="input-group"><label>学科（可选）</label><input v-model="newSubject" placeholder="例如：物理" maxlength="60" /></div>
        <div class="actions"><button class="primary" @click="createCourse">创建课程</button><button class="ghost" @click="showCreate = false">取消</button></div>
      </section>
      <p v-if="error" class="error">{{ error }}</p><p v-if="loading" class="muted">加载中...</p>
      <div v-if="courses.length" class="card-grid">
        <article v-for="course in courses" :key="course.id" class="card" @click="emit('open-course', course)">
          <div class="card-head"><h3>{{ course.title }}</h3><button class="danger" @click.stop="removeCourse(course)">删除</button></div>
          <p v-if="course.subject" class="muted">{{ course.subject }}</p><p class="muted">录音 {{ course.recording_count || 0 }} · 图片 {{ course.image_count || 0 }} · 习题 {{ course.question_count || 0 }}</p>
        </article>
      </div>
      <p v-else-if="!loading" class="empty">还没有课程，先创建一门课程开始自习。</p>
    </main>
  </div>
</template>

<style scoped>
.topbar { display:flex; align-items:center; justify-content:space-between; background:#2563eb; color:#fff; padding:14px 24px; }.brand,.actions { display:flex; align-items:center; gap:12px; }.brand { font-size:18px; font-weight:600; }.back { background:rgba(255,255,255,.15); color:#fff; }.content { max-width:900px; margin:0 auto; padding:32px 24px; }.toolbar,.card-head { display:flex; justify-content:space-between; gap:12px; }.toolbar { align-items:flex-start; margin-bottom:20px; }.panel,.card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:18px; }.panel { margin-bottom:16px; }.card-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(240px,1fr)); gap:16px; }.card { cursor:pointer; }.card:hover { border-color:#93c5fd; box-shadow:0 4px 16px rgba(37,99,235,.08); }.input-group { margin-bottom:12px; }.input-group label { display:block; margin-bottom:6px; font-size:14px; }.input-group input { width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; }.primary { background:#2563eb; color:#fff; }.ghost { background:#fff; border:1px solid #d1d5db; color:#374151; }.danger { color:#dc2626; background:#fee2e2; }.muted,.empty { color:#6b7280; font-size:14px; margin-top:6px; }.error { color:#dc2626; margin:12px 0; }.empty { text-align:center; margin:48px 0; }@media (max-width:600px) {.toolbar { flex-direction:column; }.toolbar>.primary { width:100%; }}
</style>
