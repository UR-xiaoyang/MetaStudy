<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { courseApi, uploadApi, questionApi, messageApi, noteApi, wrongApi, planApi, studyLogApi } from '../api/client.js';
import MarkdownView from '../components/MarkdownView.vue';
import StudyPlanView from '../components/StudyPlanView.vue';

const props = defineProps({ user: Object, course: Object });
const emit = defineEmits(['back', 'updated']);

const detail = ref(null);
const loading = ref(true);
const error = ref('');
const stats = ref(null);
const statsLoading = ref(false);
const plan = ref(null);
const planLoading = ref(false);
const planState = ref({ preview: [], review: [], practice: [] });

// 学习打卡计时器（学生端）
const studyActive = ref(false);
const studySeconds = ref(0);
let studyTimer = null;

function startStudy() {
  if (studyActive.value) return;
  studyActive.value = true;
  studySeconds.value = 0;
  studyTimer = setInterval(() => {
    studySeconds.value += 1;
  }, 1000);
}

async function stopStudy() {
  if (!studyActive.value) return;
  if (studyTimer) clearInterval(studyTimer);
  studyTimer = null;
  studyActive.value = false;
  const sec = studySeconds.value;
  if (sec > 0) {
    try {
      await studyLogApi.report(props.course.id, sec);
      alert(`本次学习 ${Math.floor(sec / 60)} 分钟，已记入打卡日志`);
    } catch (e) {
      alert('记录学习时长失败：' + e.message);
    }
  }
  studySeconds.value = 0;
}

function isTeacher() {
  return props.user.role === 'teacher';
}

async function load() {
  loading.value = true;
  try {
    detail.value = await courseApi.detail(props.course.id);
    if (isTeacher()) {
      statsLoading.value = true;
      try {
        stats.value = await courseApi.stats(props.course.id);
      } finally {
        statsLoading.value = false;
      }
    } else {
      planLoading.value = true;
      try {
        const p = await planApi.get(props.course.id);
        plan.value = p;
        planState.value = parsePlanState(p);
      } finally {
        planLoading.value = false;
      }
    }
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

function parsePlanState(p) {
  if (p && p.state) {
    try {
      const s = JSON.parse(p.state);
      return { preview: s.preview || [], review: s.review || [], practice: s.practice || [] };
    } catch {
      return { preview: [], review: [], practice: [] };
    }
  }
  return { preview: [], review: [], practice: [] };
}

async function savePlanState(next) {
  planState.value = next;
  try {
    const p = await planApi.saveState(props.course.id, next);
    if (p) plan.value = p;
  } catch (e) {
    alert('保存学习计划进度失败：' + e.message);
  }
}

async function generatePlan() {
  planLoading.value = true;
  try {
    const p = await planApi.generate(props.course.id);
    plan.value = p;
    planState.value = parsePlanState(p);
    emit('updated');
  } catch (e) {
    alert('生成学习计划失败：' + e.message);
  } finally {
    planLoading.value = false;
  }
}

// ---------- 录音 ----------
const mediaRecorder = ref(null);
const recording = ref(false);
const recordingTime = ref(0);
const transcribing = ref(false);
let recordingTimer = null;
let chunks = [];

function formatDuration(sec) {
  if (sec == null) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

async function startRecording() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('浏览器不支持录音，请使用新版 Chrome/Edge 或桌面应用');
    return;
  }
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mr = new MediaRecorder(stream);
    mediaRecorder.value = mr;
    chunks = [];
    mr.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data);
    };
    mr.onstop = () => {
      stream.getTracks().forEach((t) => t.stop());
      stopTimer();
    };
    mr.start();
    recording.value = true;
    recordingTime.value = 0;
    recordingTimer = setInterval(() => {
      recordingTime.value += 1;
    }, 1000);
  } catch (e) {
    alert('无法访问麦克风：' + e.message);
  }
}

function stopTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

async function stopRecording() {
  if (!mediaRecorder.value) return;
  const duration = recordingTime.value;
  const mr = mediaRecorder.value;
  mediaRecorder.value = null;
  recording.value = false;

  await new Promise((resolve) => {
    mr.onstop = () => {
      mr.stream.getTracks().forEach((t) => t.stop());
      stopTimer();
      resolve();
    };
    mr.stop();
  });

  const blob = new Blob(chunks, { type: mr.mimeType || 'audio/webm' });
  if (blob.size === 0) return;
  const fileName = `recording-${Date.now()}.webm`;
  const file = new File([blob], fileName, { type: blob.type });
  try {
    await uploadApi.audio(props.course.id, file, duration);
    await load();
    emit('updated');
  } catch (e) {
    alert('录音上传失败：' + e.message);
  }
}

// ---------- 录音转文字（Web Speech API）----------
const liveTranscript = ref('');
const liveRecording = ref(false);
let recognition = null;
let recognitionTimer = null;

function speechSupported() {
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

async function startTranscribe() {
  if (!speechSupported()) {
    alert('当前浏览器不支持语音识别，请使用 Chrome/Edge');
    return;
  }
  liveTranscript.value = '';
  liveRecording.value = true;
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  recognition = new SR();
  recognition.lang = 'zh-CN';
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.onresult = (e) => {
    let text = '';
    for (let i = e.resultIndex; i < e.results.length; i++) {
      text += e.results[i][0].transcript;
    }
    liveTranscript.value = text;
  };
  recognition.onend = () => {
    liveRecording.value = false;
    clearInterval(recognitionTimer);
  };
  recognition.start();
  recognitionTimer = setInterval(() => recognition && recognition.start(), 12000);
  transcribing.value = true;
}

function stopTranscribe() {
  if (recognition) {
    recognition.stop();
    recognition = null;
  }
  if (recognitionTimer) {
    clearInterval(recognitionTimer);
    recognitionTimer = null;
  }
  transcribing.value = false;
  liveRecording.value = false;
}

// ---------- 图片上传 ----------
const imageFile = ref(null);
const uploading = ref(false);

function onImageChange(e) {
  imageFile.value = e.target.files[0] || null;
}

async function uploadImage() {
  if (!imageFile.value) return;
  uploading.value = true;
  try {
    await uploadApi.image(props.course.id, imageFile.value);
    imageFile.value = null;
    await load();
    emit('updated');
  } catch (e) {
    alert('图片上传失败：' + e.message);
  } finally {
    uploading.value = false;
  }
}

// ---------- 笔记 ----------
const generatingNote = ref(false);
const editingNote = ref(false);
const noteDraft = ref('');

async function generateNote() {
  generatingNote.value = true;
  try {
    await noteApi.generate(props.course.id);
    await load();
    emit('updated');
    editingNote.value = false;
  } catch (e) {
    alert('生成笔记失败：' + e.message);
  } finally {
    generatingNote.value = false;
  }
}

function startEditNote() {
  noteDraft.value = detail.value.note?.content || '';
  editingNote.value = true;
}

async function saveNote() {
  try {
    await noteApi.save(props.course.id, noteDraft.value);
    await load();
    emit('updated');
    editingNote.value = false;
  } catch (e) {
    alert('保存笔记失败：' + e.message);
  }
}

// ---------- 习题 ----------
const generating = ref(false);
const showAnswers = ref(false);
const selectedAnswers = ref({});

async function generate() {
  generating.value = true;
  try {
    await questionApi.generate(props.course.id);
    await load();
    emit('updated');
    showAnswers.value = false;
  } catch (e) {
    alert('生成习题失败：' + e.message);
  } finally {
    generating.value = false;
  }
}

async function clearQuestions() {
  if (!confirm('确定清空本课程的全部习题？')) return;
  try {
    await questionApi.removeAll(props.course.id);
    await load();
    emit('updated');
  } catch (e) {
    alert(e.message);
  }
}

function selectAnswer(q, optionIndex) {
  selectedAnswers.value[q.id] = optionIndex;
  const chosen = String.fromCharCode(65 + optionIndex);
  // 实时判断并在答错时提示可加入错题本
  if (chosen !== q.answer) {
    alert(`回答错误，正确答案是 ${q.answer}。可点击「加入错题本」复习。`);
  } else {
    alert('回答正确！');
  }
}

async function addToWrongBook(q) {
  const myAnswer = selectedAnswers.value[q.id] != null
    ? String.fromCharCode(65 + selectedAnswers.value[q.id])
    : null;
  try {
    await wrongApi.addFromQuestion(props.course.id, q.id, myAnswer);
    await load();
    alert('已加入错题本');
  } catch (e) {
    alert(e.message);
  }
}

// ---------- 留言 ----------
const newMessage = ref('');
const sendingMsg = ref(false);
const replyTarget = ref(null);
const replyText = ref('');
const replyingTo = ref(null);

async function sendMessage() {
  if (!newMessage.value.trim()) return;
  sendingMsg.value = true;
  try {
    await messageApi.create(props.course.id, newMessage.value.trim());
    newMessage.value = '';
    await load();
  } catch (e) {
    alert(e.message);
  } finally {
    sendingMsg.value = false;
  }
}

function openReply(m) {
  if (replyingTo.value === m.id) {
    replyingTo.value = null;
    replyText.value = '';
    return;
  }
  replyingTo.value = m.id;
  replyText.value = `@${m.username} `;
}

async function sendReply(m) {
  if (!replyText.value.trim()) return;
  try {
    await messageApi.create(props.course.id, replyText.value.trim(), m.id);
    replyingTo.value = null;
    replyText.value = '';
    await load();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteMessage(m) {
  if (!confirm('确定删除这条留言？')) return;
  try {
    await messageApi.remove(props.course.id, m.id);
    await load();
  } catch (e) {
    alert(e.message);
  }
}

// ---------- 错题本 ----------
const showAddWrong = ref(false);
const wrongForm = ref({ content: '', my_answer: '', correct_answer: '' });

function openAddWrong() {
  wrongForm.value = { content: '', my_answer: '', correct_answer: '' };
  showAddWrong.value = true;
}

async function addManualWrong() {
  if (!wrongForm.value.content.trim()) return;
  try {
    await wrongApi.addManual(props.course.id, {
      content: wrongForm.value.content.trim(),
      my_answer: wrongForm.value.my_answer || null,
      correct_answer: wrongForm.value.correct_answer || null
    });
    showAddWrong.value = false;
    await load();
  } catch (e) {
    alert(e.message);
  }
}

async function deleteWrong(w) {
  if (!confirm('确定删除这道错题？')) return;
  try {
    await wrongApi.remove(props.course.id, w.id);
    await load();
  } catch (e) {
    alert(e.message);
  }
}

function typeLabel(t) {
  return { choice: '单选题', fill: '填空题', essay: '简答题' }[t] || t;
}

function optionLabel(letter) {
  return { 0: 'A', 1: 'B', 2: 'C', 3: 'D' }[letter] || letter;
}

function pctOfMax(val, max) {
  if (!max) return '0%';
  return Math.round((val / max) * 100) + '%';
}

function maxMessage(students) {
  return Math.max(1, ...students.map((s) => s.message_count));
}

onMounted(load);
onBeforeUnmount(() => {
  stopTimer();
  stopTranscribe();
  if (studyTimer) clearInterval(studyTimer);
});
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <button class="back" @click="emit('back')">← 返回</button>
        <span>{{ course.title }}</span>
      </div>
      <div class="user-info">
        <span>{{ user.username }}</span>
        <span class="badge">{{ user.role === 'teacher' ? '老师' : '学生' }}</span>
      </div>
    </header>

    <main class="content">
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="muted">加载中...</p>

      <template v-if="detail">
        <!-- 老师端：学习数据看板 -->
        <template v-if="isTeacher()">
          <p v-if="statsLoading" class="muted">数据加载中...</p>
          <template v-else-if="stats">
            <section class="panel">
              <h3>{{ stats.course.title }} · 学习数据看板</h3>
              <div class="stat-cards">
                <div class="stat-card">
                  <div class="stat-num">{{ stats.overview.student_count }}</div>
                  <div class="stat-label">学生人数</div>
                </div>
                <div class="stat-card">
                  <div class="stat-num">{{ stats.overview.wrong_total }}</div>
                  <div class="stat-label">错题总数</div>
                </div>
                <div class="stat-card">
                  <div class="stat-num">{{ stats.overview.message_total }}</div>
                  <div class="stat-label">留言总数</div>
                </div>
                <div class="stat-card">
                  <div class="stat-num">{{ stats.overview.question_count }}</div>
                  <div class="stat-label">习题数</div>
                </div>
                <div class="stat-card">
                  <div class="stat-num">{{ stats.overview.recording_count }}</div>
                  <div class="stat-label">录音数</div>
                </div>
                <div class="stat-card">
                  <div class="stat-num">{{ stats.overview.image_count }}</div>
                  <div class="stat-label">图片数</div>
                </div>
              </div>
            </section>

            <section class="panel">
              <h3>学生错题排行</h3>
              <div v-if="stats.wrong_ranking.length" class="bar-list">
                <div v-for="(s, i) in stats.wrong_ranking" :key="i" class="bar-row">
                  <span class="bar-name">{{ i + 1 }}. {{ s.username }}</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill wrong-bar"
                      :style="{ width: pctOfMax(s.wrong_count, stats.wrong_ranking[0].wrong_count) }"
                    ></div>
                  </div>
                  <span class="bar-val">{{ s.wrong_count }} 题</span>
                </div>
              </div>
              <p v-else class="empty-sm">暂无错题数据。</p>
            </section>

            <section class="panel">
              <h3>学生参与度（留言数）</h3>
              <div class="bar-list">
                <div v-for="(s, i) in stats.students" :key="i" class="bar-row">
                  <span class="bar-name">{{ s.username }}</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill msg-bar"
                      :style="{ width: pctOfMax(s.message_count, maxMessage(stats.students)) }"
                    ></div>
                  </div>
                  <span class="bar-val">{{ s.message_count }} 条</span>
                </div>
              </div>
            </section>

            <section class="panel">
              <h3>错题来源分布</h3>
              <div v-if="stats.wrong_by_source.length" class="bar-list">
                <div v-for="(s, i) in stats.wrong_by_source" :key="i" class="bar-row">
                  <span class="bar-name">{{ s.source === 'manual' ? '手写添加' : '来自习题' }}</span>
                  <div class="bar-track">
                    <div
                      class="bar-fill src-bar"
                      :style="{ width: pctOfMax(s.n, stats.wrong_by_source[0].n) }"
                    ></div>
                  </div>
                  <span class="bar-val">{{ s.n }} 题</span>
                </div>
              </div>
              <p v-else class="empty-sm">暂无错题数据。</p>
            </section>
          </template>
        </template>

        <!-- 学生端 / 非老师：原有功能模块 -->
        <template v-else>
        <!-- 0️⃣ 学习打卡计时器 -->
        <section class="panel">
          <div class="q-head">
            <h3>⏱️ 学习打卡</h3>
            <div class="study-timer">
              <template v-if="!studyActive">
                <button class="primary" @click="startStudy">开始学习</button>
              </template>
              <template v-else>
                <span class="study-time">{{ formatDuration(studySeconds) }}</span>
                <button class="rec" @click="stopStudy">结束学习</button>
              </template>
            </div>
          </div>
          <p class="muted">点击「开始学习」计时，结束后自动计入今日打卡日志。</p>
        </section>

        <!-- ① AI 学习计划（预习/复习/练习） -->
        <section class="panel">
          <div class="q-head">
            <h3>AI 学习计划</h3>
            <button class="primary" :disabled="planLoading" @click="generatePlan">
              {{ planLoading ? '生成中...' : (plan ? '重新生成计划' : '生成学习计划') }}
            </button>
          </div>
          <p class="muted">AI 根据本课内容自动生成「预习、复习、练习」三个阶段的学习计划。</p>

          <div v-if="planLoading" class="muted">计划生成中...</div>

          <StudyPlanView
            v-else-if="plan"
            :plan="plan"
            :state="planState"
            @update="savePlanState"
          />
          <p v-else class="empty-sm">还没有学习计划，点击「生成学习计划」获取预习/复习/练习安排。</p>
        </section>

        <!-- ① 录音区（录音键 + 一键录音转文字 并排） -->
        <section class="panel">
          <h3>课堂录音</h3>
          <div class="rec-control">
            <button v-if="!recording" class="primary" @click="startRecording">● 开始录音</button>
            <button v-else class="rec" @click="stopRecording">■ 停止录音</button>
            <button v-if="!transcribing" class="ghost" @click="startTranscribe">一键录音转文字</button>
            <button v-else class="rec" @click="stopTranscribe">■ 停止转写</button>
            <span v-if="recording" class="rec-timer">{{ formatDuration(recordingTime) }}</span>
          </div>

          <div v-if="transcribing" class="transcript-box">
            <p class="muted">正在实时语音识别（中文）...</p>
            <p v-if="liveTranscript" class="transcript-text">{{ liveTranscript }}</p>
          </div>

          <ul class="file-list" v-if="detail.recordings.length">
            <li v-for="r in detail.recordings" :key="r.id">
              <span>🎤 {{ r.filename }}（{{ formatDuration(r.duration) }}）</span>
              <audio :src="r.storage" controls></audio>
              <span class="muted">{{ r.uploader }} · {{ r.created_at }}</span>
              <div v-if="r.transcript" class="transcript-text">{{ r.transcript }}</div>
            </li>
          </ul>
          <p v-else class="empty-sm">还没有录音，点击「开始录音」录制课堂内容。</p>
        </section>

        <!-- ② 图片区（上传下面放 一键整理成笔记 按钮） -->
        <section class="panel">
          <h3>课程图片</h3>
          <div class="upload-row">
            <input type="file" accept="image/*" @change="onImageChange" />
            <button class="primary" :disabled="!imageFile || uploading" @click="uploadImage">
              {{ uploading ? '上传中...' : '上传图片' }}
            </button>
          </div>

          <div class="note-gen-row">
            <button class="ghost" :disabled="generatingNote" @click="generateNote">
              {{ generatingNote ? '整理中...' : '一键整理成笔记' }}
            </button>
          </div>

          <div v-if="detail.note" class="note-box">
            <div class="note-head">
              <strong>笔记</strong>
              <span class="muted" v-if="detail.note.auto_generated">（自动生成）</span>
              <button class="ghost" @click="startEditNote">编辑</button>
            </div>
            <MarkdownView v-if="!editingNote" :source="detail.note.content" />
            <div v-else class="note-edit">
              <textarea v-model="noteDraft" rows="12"></textarea>
              <div class="actions">
                <button class="primary" @click="saveNote">保存</button>
                <button class="ghost" @click="editingNote = false">取消</button>
              </div>
            </div>
          </div>

          <div class="img-grid" v-if="detail.images.length">
            <div v-for="img in detail.images" :key="img.id" class="img-item">
              <img :src="img.storage" :alt="img.filename" />
              <span class="muted">{{ img.uploader }}</span>
            </div>
          </div>
          <p v-else-if="!detail.note" class="empty-sm">还没有图片，上传课堂板书、课件截图等。</p>
        </section>

        <!-- ③ 留言栏（放在习题栏目上面，楼层式回复） -->
        <section class="panel">
          <h3>留言与讨论（{{ detail.messages.length }}）</h3>
          <div class="msg-input">
            <input
              v-model="newMessage"
              placeholder="输入留言，与老师和同学交流..."
              @keyup.enter="sendMessage"
            />
            <button class="primary" :disabled="sendingMsg" @click="sendMessage">发送</button>
          </div>

          <ul class="msg-list" v-if="detail.messages.length">
            <li v-for="m in detail.messages" :key="m.id" class="msg-item">
              <p>
                <strong>{{ m.username }}</strong>
                <span class="muted"> {{ m.created_at }}</span>
                <button class="ghost reply-btn" @click="openReply(m)">回复</button>
                <button
                  v-if="m.user_id === user.id || user.role === 'teacher'"
                  class="danger"
                  @click="deleteMessage(m)"
                >删除</button>
              </p>
              <p class="msg-content">{{ m.content }}</p>

              <div v-if="replyingTo === m.id" class="reply-input">
                <input v-model="replyText" placeholder="回复..." @keyup.enter="sendReply(m)" />
                <button class="primary" @click="sendReply(m)">发送回复</button>
              </div>

              <ul v-if="m.replies && m.replies.length" class="reply-list">
                <li v-for="r in m.replies" :key="r.id" class="msg-item reply-item">
                  <p>
                    <strong>{{ r.username }}</strong>
                    <span class="muted"> {{ r.created_at }}</span>
                    <button class="ghost reply-btn" @click="openReply(r)">回复</button>
                    <button
                      v-if="r.user_id === user.id || user.role === 'teacher'"
                      class="danger"
                      @click="deleteMessage(r)"
                    >删除</button>
                  </p>
                  <p class="msg-content">{{ r.content }}</p>

                  <div v-if="replyingTo === r.id" class="reply-input">
                    <input v-model="replyText" placeholder="回复..." @keyup.enter="sendReply(r)" />
                    <button class="primary" @click="sendReply(r)">发送回复</button>
                  </div>
                </li>
              </ul>
            </li>
          </ul>
          <p v-else class="empty-sm">还没有留言，来发第一条吧。</p>
        </section>

        <!-- ④ 习题区（生成习题 + 一键生成错题本 并排，选择题 abcd 可点击） -->
        <section class="panel">
          <div class="q-head">
            <h3>自动习题（{{ detail.questions.length }} 道）</h3>
            <div class="actions">
              <button class="primary" :disabled="generating" @click="generate">
                {{ generating ? '生成中...' : '生成习题' }}
              </button>
              <button class="ghost" @click="openAddWrong">一键生成错题本</button>
              <button class="ghost" @click="showAnswers = !showAnswers">
                {{ showAnswers ? '隐藏答案' : '查看答案' }}
              </button>
              <button v-if="user.role === 'teacher'" class="danger" @click="clearQuestions">清空</button>
            </div>
          </div>
          <p class="muted">习题基于课程标题、学科及已上传的录音与图片文件名，通过本地规则自动生成。</p>

          <div class="q-list" v-if="detail.questions.length">
            <div v-for="(q, i) in detail.questions" :key="q.id" class="q-item">
              <p class="q-title">
                <span class="tag">{{ typeLabel(q.type) }}</span>
                {{ i + 1 }}. {{ q.question }}
              </p>
              <div v-if="q.type === 'choice' && q.options" class="options">
                <button
                  v-for="(opt, oi) in JSON.parse(q.options)"
                  :key="oi"
                  class="option-btn"
                  :class="{ picked: selectedAnswers[q.id] === oi }"
                  @click="selectAnswer(q, oi)"
                >
                  {{ optionLabel(oi) }}. {{ opt }}
                </button>
              </div>
              <button class="ghost add-wrong" @click="addToWrongBook(q)">加入错题本</button>
              <p v-if="showAnswers" class="answer">答案：{{ q.answer }}</p>
            </div>
          </div>
          <p v-else class="empty-sm">还没有习题，点击「生成习题」基于本课程内容自动出题。</p>
        </section>

        <!-- ⑤ 错题本区 -->
        <section class="panel">
          <div class="q-head">
            <h3>我的错题本（{{ detail.wrongs.length }}）</h3>
            <button class="primary" @click="openAddWrong">手写添加错题</button>
          </div>

          <div v-if="showAddWrong" class="wrong-form">
            <div class="input-group">
              <label>错题内容</label>
              <textarea v-model="wrongForm.content" rows="3"></textarea>
            </div>
            <div class="input-group">
              <label>我的答案（可选）</label>
              <input v-model="wrongForm.my_answer" />
            </div>
            <div class="input-group">
              <label>正确答案（可选）</label>
              <input v-model="wrongForm.correct_answer" />
            </div>
            <div class="actions">
              <button class="primary" @click="addManualWrong">保存错题</button>
              <button class="ghost" @click="showAddWrong = false">取消</button>
            </div>
          </div>

          <div class="wrong-list" v-if="detail.wrongs.length">
            <div v-for="w in detail.wrongs" :key="w.id" class="wrong-item">
              <p class="wrong-content">{{ w.content }}</p>
              <p class="muted">我的答案：{{ w.my_answer || '无' }}</p>
              <p class="answer">正确答案：{{ w.correct_answer || '无' }}</p>
              <p class="muted">{{ w.created_by_name }} · {{ w.created_at }}</p>
              <button
                v-if="w.created_by === user.id || user.role === 'teacher'"
                class="danger"
                @click="deleteWrong(w)"
              >删除</button>
            </div>
          </div>
          <p v-else class="empty-sm">还没有错题，做题时点「加入错题本」或手动添加。</p>
        </section>
        </template>
      </template>
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
  max-width: 860px;
  margin: 0 auto;
  padding: 24px;
}

.panel {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 18px;
  margin-bottom: 18px;
}

.panel h3 {
  margin-bottom: 12px;
}

.rec-control {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
  margin-bottom: 10px;
}

.rec {
  background: #dc2626;
  color: #fff;
}

.rec-timer {
  font-weight: 600;
  color: #dc2626;
}

.transcript-box {
  background: #f3f4f6;
  border-radius: 6px;
  padding: 10px;
  margin-bottom: 10px;
}

.transcript-text {
  white-space: pre-wrap;
  margin-top: 6px;
  font-size: 13px;
  color: #374151;
}

.file-list {
  list-style: none;
}

.file-list li {
  padding: 8px 0;
  border-top: 1px solid #f3f4f6;
}

.upload-row {
  display: flex;
  gap: 10px;
  align-items: center;
  margin-bottom: 12px;
}

.note-gen-row {
  margin-bottom: 12px;
}

.note-box {
  background: #f3f4f6;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.note-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid #d1d5db;
  border-radius: 6px;
  font-size: 14px;
  font-family: inherit;
  resize: vertical;
}

.img-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
  gap: 10px;
}

.img-item img {
  width: 100%;
  height: 120px;
  object-fit: cover;
  border-radius: 6px;
  border: 1px solid #e5e7eb;
}

.msg-input {
  display: flex;
  gap: 8px;
  margin-bottom: 12px;
}

.msg-list {
  list-style: none;
}

.msg-item {
  padding: 10px;
  border-top: 1px solid #f3f4f6;
}

.msg-content {
  margin-top: 4px;
  color: #374151;
}

.reply-btn {
  margin-left: 8px;
  font-size: 12px;
  padding: 2px 8px;
}

.reply-input {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}

.reply-list {
  list-style: none;
  margin-left: 20px;
  margin-top: 8px;
  border-left: 2px solid #e5e7eb;
  padding-left: 10px;
}

.reply-item {
  background: #fafafa;
  border-radius: 6px;
  margin-bottom: 6px;
}

.q-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
  gap: 8px;
  flex-wrap: wrap;
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

.q-list {
  margin-top: 12px;
}

.q-item {
  padding: 12px;
  border: 1px solid #f3f4f6;
  border-radius: 6px;
  margin-bottom: 10px;
}

.q-title {
  font-weight: 500;
}

.tag {
  display: inline-block;
  font-size: 11px;
  background: #e0e7ff;
  color: #4338ca;
  padding: 2px 8px;
  border-radius: 999px;
  margin-right: 8px;
}

.options {
  display: flex;
  flex-direction: column;
  gap: 8px;
  margin-top: 8px;
}

.option-btn {
  text-align: left;
  background: #fff;
  border: 1px solid #d1d5db;
  color: #1f2937;
  padding: 10px 12px;
}

.option-btn.picked {
  border-color: #2563eb;
  background: #eff6ff;
}

.add-wrong {
  margin-top: 10px;
  font-size: 12px;
}

.answer {
  margin-top: 6px;
  color: #16a34a;
  font-weight: 500;
}

.wrong-form {
  background: #f3f4f6;
  border-radius: 6px;
  padding: 12px;
  margin-bottom: 12px;
}

.wrong-list {
  margin-top: 8px;
}

.wrong-item {
  padding: 12px;
  border: 1px solid #f3f4f6;
  border-radius: 6px;
  margin-bottom: 10px;
}

.wrong-content {
  font-weight: 500;
  white-space: pre-wrap;
}

.error {
  color: #dc2626;
  margin: 10px 0;
}

.stat-cards {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(120px, 1fr));
  gap: 12px;
}

.stat-card {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 16px;
  text-align: center;
}

.stat-num {
  font-size: 28px;
  font-weight: 700;
  color: #2563eb;
}

.stat-label {
  font-size: 13px;
  color: #6b7280;
  margin-top: 4px;
}

.bar-list {
  margin-top: 10px;
}

.bar-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 0;
}

.bar-name {
  width: 130px;
  font-size: 13px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.bar-track {
  flex: 1;
  height: 20px;
  background: #f3f4f6;
  border-radius: 4px;
  overflow: hidden;
}

.bar-fill {
  height: 100%;
  border-radius: 4px;
}

.wrong-bar {
  background: #ef4444;
}

.msg-bar {
  background: #3b82f6;
}

.src-bar {
  background: #8b5cf6;
}

.bar-val {
  width: 60px;
  font-size: 12px;
  color: #4b5563;
  text-align: right;
}

.plan-box {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.plan-tab {
  background: #f3f4f6;
  border-radius: 8px;
  padding: 12px;
}

.plan-tab h4 {
  margin-bottom: 8px;
}

.study-timer {
  display: flex;
  align-items: center;
  gap: 10px;
}

.study-time {
  font-weight: 700;
  font-size: 18px;
  color: #2563eb;
}

@media (max-width: 600px) {
  .stat-cards {
    grid-template-columns: repeat(2, 1fr);
  }
}



.muted {
  color: #6b7280;
  font-size: 13px;
  margin-top: 4px;
}

.empty-sm {
  color: #9ca3af;
  font-size: 13px;
}
</style>
