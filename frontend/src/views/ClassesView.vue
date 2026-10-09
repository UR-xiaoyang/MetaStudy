<script setup>
import { ref, onMounted } from 'vue';
import { classApi } from '../api/client.js';

const props = defineProps({ user: Object });
const emit = defineEmits(['logout', 'open-class', 'open-profile']);
const spaces = ref([]);
const error = ref('');
const loading = ref(false);
const editingName = ref(false);
const nameDraft = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    spaces.value = await classApi.list();
    nameDraft.value = spaces.value[0]?.name || '我的自习空间';
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function saveName() {
  if (!nameDraft.value.trim()) return;
  try {
    const space = await classApi.create({ name: nameDraft.value.trim() });
    spaces.value = [space];
    editingName.value = false;
  } catch (e) {
    error.value = e.message;
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">学生自习助手</div>
      <div class="user-info">
        <button class="username-btn" @click="emit('open-profile')">{{ user.username }}</button>
        <button class="logout" @click="emit('logout')">退出</button>
      </div>
    </header>

    <main class="content">
      <div class="toolbar">
        <div>
          <h2>我的学习空间</h2>
          <p class="muted">整理课程资料、完成练习并追踪学习进度。</p>
        </div>
        <button class="ghost" @click="editingName = !editingName">重命名空间</button>
      </div>

      <section v-if="editingName" class="panel">
        <div class="input-group">
          <label>学习空间名称</label>
          <input v-model="nameDraft" maxlength="64" placeholder="例如：我的高二自习" @keyup.enter="saveName" />
        </div>
        <div class="actions">
          <button class="primary" @click="saveName">保存</button>
          <button class="ghost" @click="editingName = false">取消</button>
        </div>
      </section>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="muted">加载中...</p>

      <section v-for="space in spaces" :key="space.id" class="space-card">
        <div>
          <h3>{{ space.name }}</h3>
          <p class="muted">已创建 {{ space.course_count || 0 }} 门课程</p>
        </div>
        <button class="primary" @click="emit('open-class', space)">进入学习空间</button>
      </section>
    </main>
  </div>
</template>

<style scoped>
.topbar { display:flex; align-items:center; justify-content:space-between; background:#2563eb; color:#fff; padding:14px 24px; }
.brand { font-size:18px; font-weight:600; }
.user-info,.actions { display:flex; align-items:center; gap:10px; }
.username-btn,.logout { background:rgba(255,255,255,.15); color:#fff; }
.content { max-width:900px; margin:0 auto; padding:32px 24px; }
.toolbar { display:flex; align-items:flex-start; justify-content:space-between; gap:16px; margin-bottom:20px; }
.panel,.space-card { background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:18px; margin-bottom:16px; }
.space-card { display:flex; align-items:center; justify-content:space-between; }
.muted { color:#6b7280; font-size:14px; margin-top:6px; }
.error { color:#dc2626; margin:12px 0; }
.primary { background:#2563eb; color:#fff; }
.ghost { background:#fff; border:1px solid #d1d5db; color:#374151; }
.input-group label { display:block; margin-bottom:6px; font-size:14px; }
.input-group input { width:100%; padding:10px; border:1px solid #d1d5db; border-radius:6px; }
@media (max-width:600px) { .toolbar,.space-card { align-items:stretch; flex-direction:column; } }
</style>
