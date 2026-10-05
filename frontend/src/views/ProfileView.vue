<script setup>
import { ref, computed, onMounted } from 'vue';
import { profileApi, studyLogApi } from '../api/client.js';

const props = defineProps({ user: Object });
const emit = defineEmits(['back', 'open-class']);

const data = ref(null);
const loading = ref(true);
const error = ref('');
const summary = ref(null);
const rangeData = ref([]);
const hover = ref(null);
const hoverPos = ref({ x: 0, y: 0 });

function todayStr(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function startOfDay(d) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function addDays(d, n) {
  const x = new Date(d);
  x.setDate(x.getDate() + n);
  return x;
}

// GitHub 风格热力图布局常量：52 列 × 7 行（周一~周日）
const COLS = 52;
const CELLS = COLS * 7     // 364 天
const MONTHS = ['一月', '二月', '三月', '四月', '五月', '六月', '七月', '八月', '九月', '十月', '十一月', '十二月'];
const DAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

const todaySD = startOfDay(new Date());
const startDate = addDays(todaySD, -(CELLS - 1)); // 使 today 位于最后一列

const byDate = computed(() => {
  const map = {};
  for (const r of rangeData.value) map[r.log_date] = r;
  return map;
});

// 峰值：作为颜色映射的强度上限，避免全部接近最深色
const peak = computed(() => {
  let max = 0;
  for (const r of rangeData.value) if (r.seconds > max) max = r.seconds;
  return Math.max(max, 1);
});

const columns = computed(() => {
  const cols = [];
  for (let c = 0; c < COLS; c++) {
    const cells = [];
    for (let r = 0; r < 7; r++) {
      const idx = c * 7 + r;
      const date = addDays(startDate, idx);
      const ds = todayStr(date);
      const rec = byDate.value[ds];
      cells.push({
        date,
        dateStr: ds,
        seconds: rec ? rec.seconds : 0,
        courses: rec ? rec.courses : [],
        isToday: idx === CELLS - 1,
        isFuture: date > todaySD
      });
    }
    const colFirst = cells[0].date;
    const prevFirst = c > 0 ? addDays(startDate, (c - 1) * 7) : null;
    const showLabel = c === 0 || (prevFirst && colFirst.getMonth() !== prevFirst.getMonth());
    cols.push({ cells, monthLabel: showLabel ? MONTHS[colFirst.getMonth()] : '' });
  }
  return cols;
});

// 多级颜色映射：浅灰 → 深蓝
const HEAT_COLORS = ['#ebedf0', '#c7d2fe', '#93c5fd', '#3b82f6', '#1e40af'];

function heatColor(seconds) {
  if (seconds <= 0) return HEAT_COLORS[0];
  const r = seconds / peak.value;
  if (r < 0.25) return HEAT_COLORS[1];
  if (r < 0.5) return HEAT_COLORS[2];
  if (r < 0.75) return HEAT_COLORS[3];
  return HEAT_COLORS[4];
}

function formatTime(sec) {
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  if (h > 0) return `${h} 小时 ${m} 分`;
  if (m > 0) return `${m} 分钟`;
  return `${sec} 秒`;
}

function formatDateCN(ds) {
  const [y, m, d] = ds.split('-').map(Number);
  return `${y} 年 ${m} 月 ${d} 日`;
}

function onCellEnter(cell, e) {
  hover.value = cell;
  hoverPos.value = { x: e.clientX, y: e.clientY };
}

function onCellLeave() {
  hover.value = null;
}

function onContainerMouseMove(e) {
  if (hover.value) hoverPos.value = { x: e.clientX, y: e.clientY };
}

function secsToHours(s) {
  return (s / 3600).toFixed(1);
}

async function loadProfile() {
  loading.value = true;
  try {
    data.value = await profileApi.me();
  } catch (e) {
    error.value = e.message;
  } finally {
    loading.value = false;
  }
}

async function loadRange() {
  try {
    rangeData.value = await studyLogApi.range(todayStr(startDate), todayStr(todaySD));
  } catch (e) {
    rangeData.value = [];
  }
}

async function loadSummary() {
  try {
    summary.value = await studyLogApi.summary();
  } catch (e) {
    summary.value = null;
  }
}

onMounted(() => {
  loadProfile();
  loadRange();
  loadSummary();
});
</script>

<template>
  <div class="page">
    <header class="topbar">
      <div class="brand">
        <button class="back" @click="emit('back')">← 返回</button>
        <span>个人中心</span>
      </div>
      <div class="user-info">
        <span>{{ data?.user?.username || user.username }}</span>
        <span class="badge">{{ (data?.user?.role || user.role) === 'teacher' ? '老师' : '学生' }}</span>
      </div>
    </header>

    <main class="content">
      <p v-if="error" class="error">{{ error }}</p>
      <p v-if="loading" class="muted">加载中...</p>

      <template v-if="data">
        <!-- 我的班级 -->
        <section class="panel">
          <h3>我的班级（{{ data.classes.length }}）</h3>
          <div v-if="data.classes.length" class="card-grid">
            <div v-for="cls in data.classes" :key="cls.id" class="card" @click="emit('open-class', cls)">
              <div class="card-head">
                <h3>{{ cls.name }}</h3>
                <button class="enter" @click="emit('open-class', cls)">进入</button>
              </div>
              <p class="muted">成员 {{ cls.member_count }} 人</p>
              <p class="muted">邀请码 {{ cls.invite_code }}</p>
              <p class="muted">我的身份：{{ cls.my_role === 'teacher' ? '老师' : '学生' }}</p>
            </div>
          </div>
          <p v-else class="empty-sm">还没有加入班级。</p>
        </section>

        <!-- 打卡日志（仅学生） -->
        <section v-if="data.user.role === 'student'" class="panel">
          <div class="panel-head">
            <h3>打卡日志</h3>
            <span class="range-label">最近 12 个月</span>
          </div>

          <div v-if="summary" class="summary-bar">
            <span>累计打卡 <strong>{{ summary.days }}</strong> 天</span>
            <span>累计学习 <strong>{{ secsToHours(summary.seconds) }}</strong> 小时</span>
          </div>

          <div class="heat-wrap" @mousemove="onContainerMouseMove">
            <!-- 列头月份标签 -->
            <div class="month-row">
              <span class="month-pad"></span>
              <span v-for="(col, ci) in columns" :key="ci" class="month-label">{{ col.monthLabel }}</span>
            </div>

            <div class="heat-body">
              <!-- 行首星期标签 -->
              <div class="day-labels">
                <span v-for="(dl, i) in DAY_LABELS" :key="i">{{ dl }}</span>
              </div>

              <div class="heat-grid">
                <div v-for="(col, ci) in columns" :key="ci" class="heat-col">
                  <div
                    v-for="cell in col.cells"
                    :key="cell.dateStr"
                    class="heat-cell"
                    :class="{ today: cell.isToday, future: cell.isFuture }"
                    :style="{ background: cell.isFuture ? 'transparent' : heatColor(cell.seconds) }"
                    @mouseenter="onCellEnter(cell, $event)"
                    @mouseleave="onCellLeave"
                  ></div>
                </div>
              </div>
            </div>
          </div>

          <!-- 图例 Less → More -->
          <div class="legend">
            <span class="legend-text">Less</span>
            <span
              v-for="(c, i) in HEAT_COLORS"
              :key="i"
              class="legend-cell"
              :style="{ background: c }"
            ></span>
            <span class="legend-text">More</span>
          </div>

          <!-- 悬停提示框 -->
          <div
            v-if="hover"
            class="tooltip"
            :style="{ left: hoverPos.x + 'px', top: hoverPos.y + 14 + 'px' }"
          >
            <div class="tip-date">{{ formatDateCN(hover.dateStr) }}{{ hover.isToday ? '（今天）' : '' }}</div>
            <template v-if="hover.seconds > 0">
              <div v-for="(c, i) in hover.courses" :key="i" class="tip-course">
                <span class="tip-dot" :style="{ background: heatColor(c.seconds) }"></span>
                <span>{{ c.course_title }}</span>
                <span class="tip-sec">{{ formatTime(c.seconds) }}</span>
              </div>
              <div class="tip-total">共学习 {{ formatTime(hover.seconds) }}</div>
            </template>
            <div v-else class="tip-empty">无打卡记录</div>
          </div>
        </section>
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
  max-width: 1080px;
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

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.panel-head h3 {
  margin: 0;
}

.range-label {
  font-size: 12px;
  color: #9ca3af;
}

.summary-bar {
  display: flex;
  gap: 24px;
  margin-bottom: 14px;
  font-size: 14px;
  color: #374151;
}

.card-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 14px;
}

.card {
  background: #fff;
  border: 1px solid #e5e7eb;
  border-radius: 8px;
  padding: 14px;
  cursor: pointer;
}

.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}

.enter {
  background: #2563eb;
  color: #fff;
  font-size: 12px;
  padding: 4px 10px;
}

/* ---------- GitHub 风格热力图 ---------- */
.heat-wrap {
  position: relative;
}

.month-row {
  display: grid;
  grid-template-columns: 28px repeat(52, 1fr);
  gap: 3px;
  margin-bottom: 6px;
}

.month-pad {
  grid-column: 1;
}

.month-label {
  font-size: 11px;
  color: #6b7280;
  white-space: nowrap;
}

.heat-body {
  display: grid;
  grid-template-columns: 28px 1fr;
  gap: 3px;
}

.day-labels {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 3px;
  font-size: 10px;
  color: #9ca3af;
  line-height: 1;
}

.heat-grid {
  display: grid;
  grid-template-columns: repeat(52, minmax(10px, 1fr));
  gap: 3px;
}

.heat-col {
  display: grid;
  grid-template-rows: repeat(7, 12px);
  gap: 3px;
}

.heat-cell {
  width: 12px;
  height: 12px;
  border-radius: 2px;
  cursor: pointer;
}

.heat-cell.today {
  outline: 2px solid #2563eb;
  outline-offset: 1px;
}

.heat-cell.future {
  cursor: default;
}

/* 图例 */
.legend {
  display: flex;
  align-items: center;
  gap: 4px;
  margin-top: 12px;
  justify-content: flex-end;
}

.legend-text {
  font-size: 11px;
  color: #9ca3af;
}

.legend-cell {
  width: 11px;
  height: 11px;
  border-radius: 2px;
}

/* 提示框 */
.tooltip {
  position: fixed;
  z-index: 1000;
  background: #111827;
  color: #e5e7eb;
  border-radius: 8px;
  padding: 10px 12px;
  font-size: 12px;
  line-height: 1.6;
  min-width: 180px;
  box-shadow: 0 6px 20px rgba(0, 0, 0, 0.25);
  pointer-events: none;
}

.tip-date {
  font-weight: 600;
  color: #fff;
  margin-bottom: 4px;
}

.tip-course {
  display: flex;
  align-items: center;
  gap: 6px;
}

.tip-dot {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  flex-shrink: 0;
}

.tip-sec {
  margin-left: auto;
  color: #9ca3af;
}

.tip-total {
  margin-top: 4px;
  border-top: 1px solid #374151;
  padding-top: 4px;
  color: #9ca3af;
}

.tip-empty {
  color: #9ca3af;
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

.error {
  color: #dc2626;
  margin: 10px 0;
}
</style>
