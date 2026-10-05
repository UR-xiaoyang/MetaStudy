<script setup>
import { ref } from 'vue';
import { authApi, saveSession } from '../api/client.js';

const mode = ref('login');
const username = ref('');
const password = ref('');
const role = ref('student');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    const payload = { username: username.value.trim(), password: password.value };
    const data = mode.value === 'login'
      ? await authApi.login(payload)
      : await authApi.register({ ...payload, role: role.value });
    saveSession(data.user, data.token);
    sessionStorage.setItem('flashLogin', data.user.username);
    window.location.reload();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="login-wrap">
    <div class="login-card">
      <h1>课后练习助手</h1>
      <p class="subtitle">录音 · 图片 · 对照复习</p>

      <div class="tabs">
        <button :class="{ active: mode === 'login' }" @click="mode = 'login'">登录</button>
        <button :class="{ active: mode === 'register' }" @click="mode = 'register'">注册</button>
      </div>

      <form @submit.prevent="submit">
        <div class="input-group">
          <label>用户名</label>
          <input v-model="username" placeholder="请输入用户名" autocomplete="username" />
        </div>
        <div class="input-group">
          <label>密码</label>
          <input v-model="password" type="password" placeholder="请输入密码" autocomplete="current-password" />
        </div>
        <div v-if="mode === 'register'" class="input-group">
          <label>身份</label>
          <select v-model="role">
            <option value="student">学生</option>
            <option value="teacher">老师</option>
          </select>
        </div>

        <p v-if="error" class="error">{{ error }}</p>
        <button type="submit" class="primary" :disabled="loading">
          {{ loading ? '处理中...' : (mode === 'login' ? '登录' : '注册') }}
        </button>
      </form>
    </div>
  </div>
</template>

<style scoped>
.login-wrap {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
}

.login-card {
  width: 360px;
  background: #fff;
  padding: 32px;
  border-radius: 12px;
  box-shadow: 0 10px 30px rgba(0, 0, 0, 0.08);
}

h1 {
  font-size: 22px;
  text-align: center;
}

.subtitle {
  text-align: center;
  color: #9ca3af;
  font-size: 13px;
  margin: 6px 0 20px;
}

.tabs {
  display: flex;
  gap: 8px;
  margin-bottom: 20px;
}

.tabs button {
  flex: 1;
  background: #f3f4f6;
  color: #6b7280;
  padding: 8px 0;
}

.tabs button.active {
  background: #2563eb;
  color: #fff;
}

select {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  background: #fff;
}

.error {
  color: #dc2626;
  font-size: 13px;
  margin-bottom: 10px;
}

.primary {
  width: 100%;
  background: #2563eb;
  color: #fff;
  padding: 12px 0;
  font-size: 15px;
}

.primary:disabled {
  opacity: 0.6;
}
</style>
