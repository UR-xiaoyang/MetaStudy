const API_BASE = '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('token');
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function handleUnauthorized(status) {
  if (status === 401) {
    clearSession();
    window.dispatchEvent(new CustomEvent('session-expired'));
  }
}

function request(path, options = {}) {
  const headers = { 'Content-Type': 'application/json', ...getAuthHeaders(), ...(options.headers || {}) };

  return fetch(`${API_BASE}${path}`, { ...options, headers }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      handleUnauthorized(res.status);
      const err = new Error(data.error || '请求失败');
      err.status = res.status;
      throw err;
    }
    return data;
  });
}

export const authApi = {
  register: (payload) => request('/auth/register', { method: 'POST', body: JSON.stringify(payload) }),
  login: (payload) => request('/auth/login', { method: 'POST', body: JSON.stringify(payload) })
};

export const classApi = {
  list: () => request('/classes'),
  create: (payload) => request('/classes', { method: 'POST', body: JSON.stringify(payload) }),
  join: (payload) => request('/classes/join', { method: 'POST', body: JSON.stringify(payload) }),
  remove: (id) => request(`/classes/${id}`, { method: 'DELETE' })
};

function upload(path, file, extra) {
  const fd = new FormData();
  fd.append('file', file);
  if (extra) {
    for (const [k, v] of Object.entries(extra)) {
      if (v != null) fd.append(k, v);
    }
  }
  return fetch(`${API_BASE}${path}`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: fd
  }).then(async (res) => {
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      handleUnauthorized(res.status);
      const err = new Error(data.error || '上传失败');
      err.status = res.status;
      throw err;
    }
    return data;
  });
}

export const courseApi = {
  list: (classId) => request(`/courses/class/${classId}`),
  create: (payload) => request('/courses', { method: 'POST', body: JSON.stringify(payload) }),
  detail: (id) => request(`/courses/${id}`),
  stats: (id) => request(`/courses/${id}/stats`),
  remove: (id) => request(`/courses/${id}`, { method: 'DELETE' })
};

export const uploadApi = {
  audio: (courseId, file, duration) => upload(`/uploads/audios/${courseId}`, file, { duration }),
  image: (courseId, file) => upload(`/uploads/images/${courseId}`, file)
};

export const questionApi = {
  generate: (courseId, options = {}) =>
    request(`/questions/generate/${courseId}`, { method: 'POST', body: JSON.stringify(options) }),
  list: (courseId) => request(`/questions/${courseId}`),
  removeAll: (courseId) => request(`/questions/${courseId}`, { method: 'DELETE' })
};

export const transcribeApi = {
  capabilities: () => request('/transcribe/capabilities'),
  status: (recordingId) => request(`/transcribe/${recordingId}/status`),
  start: (recordingId) => request(`/transcribe/${recordingId}/start`, { method: 'POST' }),
  retry: (recordingId) => request(`/transcribe/${recordingId}/retry`, { method: 'POST' }),
  save: (recordingId, text) =>
    request(`/transcribe/${recordingId}/result`, { method: 'PUT', body: JSON.stringify({ text }) }),
  listByCourse: (courseId) => request(`/transcribe/course/${courseId}`)
};

export const aiApi = {
  status: () => request('/ai/status')
};

export const quizApi = {
  submit: (courseId, answers) => request(`/quiz/${courseId}/submit`, { method: 'POST', body: JSON.stringify({ answers }) }),
  myAttempts: (courseId) => request(`/quiz/${courseId}/attempts/me`),
  explain: (courseId, questionId, studentAnswer) =>
    request(`/quiz/${courseId}/explain/${questionId}`, { method: 'POST', body: JSON.stringify({ student_answer: studentAnswer }) })
};

export const messageApi = {
  list: (courseId) => request(`/messages/${courseId}`),
  create: (courseId, content, parentId) =>
    request(`/messages/${courseId}`, { method: 'POST', body: JSON.stringify({ content, parent_id: parentId }) }),
  remove: (courseId, messageId) => request(`/messages/${courseId}/${messageId}`, { method: 'DELETE' })
};

export const teacherChatApi = {
  list: (classId) => request(`/teacher-chats/${classId}`),
  create: (classId, content) => request(`/teacher-chats/${classId}`, { method: 'POST', body: JSON.stringify({ content }) }),
  remove: (classId, chatId) => request(`/teacher-chats/${classId}/${chatId}`, { method: 'DELETE' })
};

export const noteApi = {
  get: (courseId) => request(`/notes/${courseId}`),
  generate: (courseId) => request(`/notes/generate/${courseId}`, { method: 'POST' }),
  save: (courseId, content) => request(`/notes/${courseId}`, { method: 'PUT', body: JSON.stringify({ content }) })
};

export const wrongApi = {
  list: (courseId) => request(`/wrongs/${courseId}`),
  classReport: (classId) => request(`/wrongs/class-report/${classId}`),
  addManual: (courseId, payload) => request(`/wrongs/${courseId}`, { method: 'POST', body: JSON.stringify(payload) }),
  addFromQuestion: (courseId, questionId, myAnswer) =>
    request(`/wrongs/${courseId}/from-question`, { method: 'POST', body: JSON.stringify({ question_id: questionId, my_answer: myAnswer }) }),
  remove: (courseId, wrongId) => request(`/wrongs/${courseId}/${wrongId}`, { method: 'DELETE' })
};

export const planApi = {
  get: (courseId) => request(`/plans/${courseId}`),
  generate: (courseId) => request(`/plans/generate/${courseId}`, { method: 'POST' }),
  saveState: (courseId, state) => request(`/plans/state/${courseId}`, { method: 'PUT', body: JSON.stringify({ state }) })
};

export const studyLogApi = {
  report: (courseId, seconds) => request(`/study-logs/${courseId}`, { method: 'POST', body: JSON.stringify({ seconds }) }),
  month: (month) => request(`/study-logs/month/${month}`),
  range: (start, end) => request(`/study-logs/range?start=${start}&end=${end}`),
  summary: () => request('/study-logs/summary')
};

export const profileApi = {
  me: () => request('/profile/me')
};

export function authorizedFileUrl(path) {
  const token = localStorage.getItem('token');
  if (!path || !token) return path || '';
  return `${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

export function saveSession(user, token) {
  localStorage.setItem('user', JSON.stringify(user));
  localStorage.setItem('token', token);
}

export function loadSession() {
  const user = localStorage.getItem('user');
  const token = localStorage.getItem('token');
  if (!user || !token) return null;
  return { user: JSON.parse(user), token };
}

export function clearSession() {
  localStorage.removeItem('user');
  localStorage.removeItem('token');
}
