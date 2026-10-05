<script setup>
import { ref, onMounted } from 'vue';
import { courseApi, wrongApi, teacherChatApi } from '../api/client.js';

const props = defineProps({ user: Object, classInfo: Object });
const emit = defineEmits(['back', 'open-course']);

const courses = ref([]);
const loading = ref(false);
const error = ref('');

const showCreate = ref(false);
const newTitle = ref('');
const newSubject = ref('');

// 老师错题汇总
const showWrongReport = ref(false);
const wrongReport = ref([]);
const wrongLoading = ref(false);

async function loadWrongReport() {
  wrongLoading.value = true;
  try {
    wrongReport.value = await wrongApi.classReport(props.classInfo.id);
    showWrongReport.value = true;
  } catch (e) {
    alert(e.message);
  } finally {
    wrongLoading.value = false;
  }
}

// 老师群聊
const showChat = ref(false);
const chats = ref([]);
const chatText = ref('');
const chatLoading = ref(false);

async function loadChats() {
  chatLoading.value = true;
  try {
    chats.value = await teacherChatApi.list(props.classInfo.id);
    showChat.value = true;
  } catch (e) {
    alert(e.message);
  } finally {
    chatLoading.value = false;
  }
}

async function sendChat() {
  if (!chatText.value.trim()) return;
  try {
    await teacherChatApi.create(props.classInfo.id, chatText.value.trim());
    chatText.value = '';
    await loadChats();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteChat(c) {
  if (!confirm('删除这条消息？')) return;
  try {
    await teacherChatApi.remove(props.classInfo.id, c.id);
    await loadChats();
  } catch (e) {
    alert(e.message);
  }
}

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
    await courseApi.create({
      class_id: props.classInfo.id,
      title: newTitle.value.trim(),
      subject: newSubject.value.trim() || null
    });
    showCreate.value = false;
    newTitle.value = '';
    newSubject.value = '';
    await load();
  } catch (e) {
    alert(e.message);
  }
}

async function removeCourse(course) {
  if (!confirm(`确定删除课程「${course.title}」？其录音、图片、习题将一并删除。`)) return;
  try {
    await courseApi.remove(course.id);
    await load();
  } catch (e) {
    alert(e.message);
  }
}

onMounted(load);
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <button class="back" @click="emit('back')">← 返回</button>
        <span>{{ classInfo.name }} · 课程</span>
      </div>
      <div class="user-info">
        <span>{{ user.username }}</span>
        <span class="badge">{{ user.role === 'teacher' ? '老师' : '学生' }}</span>
      </div>
    </header>

    <main class="content">
      <div class="toolbar">
        <h2>课程列表</h2>
        <div class="actions" v-if="user.role === 'teacher'">
          <button class="ghost" @click="loadWrongReport" :disabled="wrongLoading">
            {{ wrongLoading ? '汇总中...' : '错题汇总' }}
          </button>
          <button class="ghost" @click="loadChats" :disabled="chatLoading">
            {{ chatLoading ? '加载中...' : '老师交流' }}
          </button>
          <button class="primary" @click="showCreate = !showCreate">新建课程</button>
        </div>
      </div>

      <!-- 老师：班级错题汇总 -->
      <div v-if="showWrongReport && user.role === 'teacher'" class="panel">
        <div class="panel-head">
          <h3>全班错题汇总（{{ wrongReport.length }}）</h3>
          <button class="ghost" @click="showWrongReport = false">关闭</button>
        </div>
        <p class="muted">该班级所有学生、所有课程的错题汇总。</p>
        <div v-if="wrongReport.length" class="report-list">
          <div v-for="w in wrongReport" :key="w.id" class="report-item">
            <p class="report-title">
              <strong>{{ w.created_by_name }}</strong>
              <span class="muted">{{ w.course_title }} · {{ w.created_at }}</span>
            </p>
            <p class="wrong-content">{{ w.content }}</p>
            <p class="muted">我的答案：{{ w.my_answer || '无' }} ｜ 正确答案：{{ w.correct_answer || '无' }}</p>
          </div>
        </div>
        <p v-else class="empty-sm">该班级目前还没有错题记录。</p>
      </div>

      <!-- 老师：班主任与老师们交流 -->
      <div v-if="showChat && user.role === 'teacher'" class="panel">
        <div class="panel-head">
          <h3>老师交流区（{{ classInfo.name }}）</h3>
          <button class="ghost" @click="showChat = false">关闭</button>
        </div>
        <div class="chat-input">
          <input v-model="chatText" placeholder="给班主任和各位老师留言..." @keyup.enter="sendChat" />
          <button class="primary" @click="sendChat">发送</button>
        </div>
        <div class="chat-list" v-if="chats.length">
          <div v-for="c in chats" :key="c.id" class="chat-item">
            <p>
              <strong>{{ c.username }}</strong>
              <span class="muted"> {{ c.created_at }}</span>
              <button class="danger" @click="deleteChat(c)">删除</button>
            </p>
            <p class="msg-content">{{ c.content }}</p>
          </div>
        </div>
        <p v-else class="empty-sm">还没有消息。</p>
      </div>

      <div v-if="showCreate" class="panel">
        <div class="input-group">
          <label>课程标题</label>
          <input v-model="newTitle" placeholder="例如：一元二次方程" />
        </div>
        <div class="input-group">
          <label>学科（可选）</label>
          <input v-model="newSubject" placeholder="例如：数学" />
        </div>
        <button class="primary" @click="createCourse">创建</button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="muted">加载中...</p>

      <div class="card-grid">
        <div v-for="c in courses" :key="c.id" class="card" @click="emit('open-course', c)">
          <div class="card-head">
            <h3>{{ c.title }}</h3>
            <button v-if="user.role === 'teacher'" class="danger" @click.stop="removeCourse(c)">删除</button>
          </div>
          <p v-if="c.subject" class="muted">学科：{{ c.subject }}</p>
          <p class="muted">录音 {{ c.recording_count }} · 图片 {{ c.image_count }} · 习题 {{ c.question_count }}</p>
          <p class="muted">{{ c.created_at }}</p>
        </div>
      </div>

      <p v-if="!loading && courses.length === 0" class="empty">
        该班级还没有课程。点击「新建课程」开始添加。
      </p>
    </main>
  </div>
</template>

<style scoped>
.topbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #2563eb;
  color: #fff;
  padding: 14px 24px;
}

.brand {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
}

.back {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
  padding: 6px 12px;
  font-size: 13px;
}

.user-info {
  display: flex;
  align-items: center;
  gap: 10px;
}

.badge {
  font-size: 12px;
  padding: 2px 8px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.2);
}

.content {
  max-width: 900px;
  margin: 0 auto;
  padding: 24px;
}

.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}

.primary {
  background: #2563eb;
  color: #fff;
}

.danger {
  background: #fee2e2;
  color: #dc2626;
  font-size: 12px;
  padding: 4px 10px;
}

.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  margin-bottom: 16px;
}

.panel .primary {
  margin-top: 8px;
}

.error {
  color: #dc2626;
  margin: 10px 0;
}

.muted {
  color: #6b7280;
  font-size: 13px;
  margin-top: 4px;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(240px, 1fr));
  gap: 16px;
  margin-top: 8px;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 16px;
  cursor: pointer;
  transition: box-shadow 0.15s;
}

.card:hover {
  box-shadow: 0 4px 14px rgba(0, 0, 0, 0.08);
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.empty {
  color: #9ca3af;
  text-align: center;
  margin-top: 40px;
}

.actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}

.ghost {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #374151;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-head h3 {
  margin: 0;
}

.report-list,
.chat-list {
  margin-top: 10px;
}

.report-item,
.chat-item {
  border: 1px solid #f3f4f6;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 8px;
}

.report-title {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.wrong-content {
  margin-top: 4px;
  white-space: pre-wrap;
}

.chat-input {
  display: flex;
  gap: 8px;
  margin-bottom: 10px;
}

.msg-content {
  margin-top: 4px;
}
</style>
