<script setup>
import { ref, onMounted } from 'vue';
import { classApi } from '../api/client.js';

const props = defineProps({ user: Object });
const emit = defineEmits(['logout', 'open-class', 'open-profile']);

const classes = ref([]);
const error = ref('');
const loading = ref(false);

const showCreate = ref(false);
const newClassName = ref('');

const showJoin = ref(false);
const inviteCode = ref('');

async function load() {
  loading.value = true;
  error.value = '';
  try {
    classes.value = await classApi.list();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function createClass() {
  if (!newClassName.value.trim()) return;
  try {
    const cls = await classApi.create({ name: newClassName.value.trim() });
    alert(`班级「${cls.name}」创建成功，邀请码：${cls.invite_code}`);
    showCreate.value = false;
    newClassName.value = '';
    await load();
  } catch (e) {
    alert(e.message);
  }
}

async function joinClass() {
  if (!inviteCode.value.trim()) return;
  try {
    const cls = await classApi.join({ invite_code: inviteCode.value.trim() });
    alert(`已加入班级「${cls.name}」`);
    showJoin.value = false;
    inviteCode.value = '';
    await load();
  } catch (e) {
    alert(e.message);
  }
}

async function removeClass(cls) {
  if (!confirm(`确定删除班级「${cls.name}」？此操作不可恢复。`)) return;
  try {
    await classApi.remove(cls.id);
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
      <div class="brand">课后练习助手</div>
      <div class="user-info">
        <button class="username-btn" @click="emit('open-profile')">{{ user.username }}</button>
        <span class="badge" :class="user.role">{{ user.role === 'teacher' ? '老师' : '学生' }}</span>
        <button class="logout" @click="emit('logout')">退出</button>
      </div>
    </header>

    <main class="content">
      <div class="toolbar">
        <h2>我的班级</h2>
        <div class="actions">
          <button class="ghost" @click="showJoin = !showJoin">加入班级</button>
          <button v-if="user.role === 'teacher'" class="primary" @click="showCreate = !showCreate">创建班级</button>
        </div>
      </div>

      <div v-if="showCreate" class="panel">
        <div class="input-group">
          <label>班级名称</label>
          <input v-model="newClassName" placeholder="例如：初二（3）班" />
        </div>
        <button class="primary" @click="createClass">创建</button>
      </div>

      <div v-if="showJoin" class="panel">
        <div class="input-group">
          <label>邀请码</label>
          <input v-model="inviteCode" placeholder="输入老师提供的邀请码" />
        </div>
        <button class="primary" @click="joinClass">加入</button>
      </div>

      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="muted">加载中...</p>

      <div class="card-grid">
        <div v-for="cls in classes" :key="cls.id" class="card">
          <div class="card-head">
            <h3>{{ cls.name }}</h3>
            <div class="card-actions">
              <button class="enter" @click="emit('open-class', cls)">进入</button>
              <button v-if="user.role === 'teacher'" class="danger" @click="removeClass(cls)">删除</button>
            </div>
          </div>
          <p class="muted">成员 {{ cls.member_count }} 人</p>
          <p class="muted">邀请码 {{ cls.invite_code }}</p>
          <p class="muted">我的身份：{{ cls.my_role === 'teacher' ? '老师' : '学生' }}</p>
        </div>
      </div>

      <p v-if="!loading && classes.length === 0" class="empty">
        还没有班级。老师可创建班级，学生可输入邀请码加入。
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
  font-size: 18px;
  font-weight: 600;
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

.logout {
  background: rgba(255, 255, 255, 0.15);
  color: #fff;
}

.username-btn {
  background: transparent;
  color: #fff;
  font-size: 15px;
  font-weight: 600;
  padding: 4px 8px;
}

.username-btn:hover {
  background: rgba(255, 255, 255, 0.15);
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

.actions {
  display: flex;
  gap: 8px;
}

.ghost {
  background: #fff;
  border: 1px solid #d1d5db;
  color: #374151;
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
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.card-actions {
  display: flex;
  gap: 6px;
}

.enter {
  background: #2563eb;
  color: #fff;
  font-size: 12px;
  padding: 4px 10px;
}

.empty {
  color: #9ca3af;
  text-align: center;
  margin-top: 40px;
}
</style>
