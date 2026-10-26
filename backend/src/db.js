import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
// DATA_DIR / STORAGE_DIR 允许测试与部署覆盖默认位置
const dataDir = process.env.DATA_DIR ? resolve(process.env.DATA_DIR) : join(__dirname, '..', 'data');
const storageDir = process.env.STORAGE_DIR ? resolve(process.env.STORAGE_DIR) : join(__dirname, '..', 'storage');

mkdirSync(dataDir, { recursive: true });
mkdirSync(join(storageDir, 'audios'), { recursive: true });
mkdirSync(join(storageDir, 'images'), { recursive: true });

export const db = new DatabaseSync(join(dataDir, 'practice.db'));
export { storageDir };

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;

  CREATE TABLE IF NOT EXISTS users (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    username   TEXT NOT NULL UNIQUE,
    password   TEXT NOT NULL,
    role       TEXT NOT NULL DEFAULT 'student',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS classes (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL,
    invite_code TEXT NOT NULL UNIQUE,
    owner_id    INTEGER NOT NULL,
    is_personal INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (owner_id) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS class_members (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id  INTEGER NOT NULL,
    user_id   INTEGER NOT NULL,
    role      TEXT NOT NULL DEFAULT 'student',
    joined_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (class_id, user_id),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS courses (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    class_id   INTEGER NOT NULL,
    title      TEXT NOT NULL,
    subject    TEXT,
    created_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (class_id) REFERENCES classes(id) ON DELETE CASCADE,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS recordings (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER NOT NULL,
    filename   TEXT NOT NULL,
    storage    TEXT NOT NULL,
    duration   REAL,
    size       INTEGER,
    transcript TEXT,
    uploaded_by INTEGER NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS images (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL,
    filename    TEXT NOT NULL,
    storage     TEXT NOT NULL,
    size        INTEGER,
    uploaded_by INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (uploaded_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS questions (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER NOT NULL,
    type       TEXT NOT NULL,
    question   TEXT NOT NULL,
    options    TEXT,
    answer     TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS quiz_attempts (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    answers     TEXT NOT NULL,
    result      TEXT NOT NULL,
    score       INTEGER NOT NULL DEFAULT 0,
    max_score   INTEGER NOT NULL DEFAULT 0,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS messages (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER NOT NULL,
    user_id    INTEGER NOT NULL,
    parent_id  INTEGER,
    content    TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_id) REFERENCES messages(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS notes (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id  INTEGER NOT NULL UNIQUE,
    content    TEXT,
    auto_generated INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS wrong_questions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL,
    question_id INTEGER,
    content     TEXT NOT NULL,
    my_answer   TEXT,
    correct_answer TEXT,
    source      TEXT NOT NULL DEFAULT 'manual',
    created_by  INTEGER NOT NULL,
    created_at  TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (question_id) REFERENCES questions(id) ON DELETE SET NULL,
    FOREIGN KEY (created_by) REFERENCES users(id)
  );

  CREATE TABLE IF NOT EXISTS study_plans (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    course_id   INTEGER NOT NULL,
    user_id     INTEGER NOT NULL,
    preview     TEXT,
    review      TEXT,
    practice    TEXT,
    state       TEXT,
    updated_at  TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (course_id, user_id),
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS study_logs (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    course_id  INTEGER NOT NULL,
    log_date   TEXT NOT NULL,
    seconds    INTEGER NOT NULL DEFAULT 0,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (user_id, course_id, log_date),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
    FOREIGN KEY (course_id) REFERENCES courses(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS transcription_jobs (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    recording_id    INTEGER NOT NULL UNIQUE,
    status          TEXT NOT NULL DEFAULT 'pending',
    provider        TEXT,
    attempts        INTEGER NOT NULL DEFAULT 0,
    max_attempts    INTEGER NOT NULL DEFAULT 3,
    progress        INTEGER NOT NULL DEFAULT 0,
    error           TEXT,
    next_attempt_at TEXT,
    created_at      TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at      TEXT NOT NULL DEFAULT (datetime('now')),
    started_at      TEXT,
    finished_at     TEXT,
    FOREIGN KEY (recording_id) REFERENCES recordings(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS llm_calls (
    id                INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id           INTEGER,
    feature           TEXT NOT NULL,
    model             TEXT,
    prompt_tokens     INTEGER NOT NULL DEFAULT 0,
    completion_tokens INTEGER NOT NULL DEFAULT 0,
    cost              REAL NOT NULL DEFAULT 0,
    latency_ms        INTEGER NOT NULL DEFAULT 0,
    success           INTEGER NOT NULL DEFAULT 0,
    error             TEXT,
    created_at        TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_transcription_jobs_pick
    ON transcription_jobs (status, next_attempt_at, id);
  CREATE INDEX IF NOT EXISTS idx_llm_calls_created
    ON llm_calls (created_at);
`);

try {
  db.exec(`ALTER TABLE classes ADD COLUMN is_personal INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE recordings ADD COLUMN transcript TEXT`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE messages ADD COLUMN parent_id INTEGER`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE study_plans ADD COLUMN state TEXT`);
} catch (e) {
  // 列已存在
}

// v1.1 转写状态字段：none | pending | processing | completed | failed
try {
  db.exec(`ALTER TABLE recordings ADD COLUMN transcript_status TEXT NOT NULL DEFAULT 'none'`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE recordings ADD COLUMN transcript_progress INTEGER NOT NULL DEFAULT 0`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE recordings ADD COLUMN transcript_error TEXT`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE recordings ADD COLUMN transcript_task_id TEXT`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE recordings ADD COLUMN transcript_updated_at TEXT`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE recordings ADD COLUMN transcript_source TEXT`);
} catch (e) {
  // 列已存在
}

// 历史数据：已有转写文本的录音标记为已完成（来源标记为浏览器实时识别）
db.prepare(
  `UPDATE recordings
   SET transcript_status = 'completed', transcript_progress = 100, transcript_source = 'browser'
   WHERE transcript IS NOT NULL AND trim(transcript) <> '' AND transcript_status = 'none'`
).run();

// 生成来源（llm / rule）与习题难度，供前端展示与筛选
try {
  db.exec(`ALTER TABLE notes ADD COLUMN engine TEXT`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE notes ADD COLUMN model TEXT`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE questions ADD COLUMN difficulty TEXT`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE questions ADD COLUMN engine TEXT`);
} catch (e) {
  // 列已存在
}

try {
  db.exec(`ALTER TABLE study_plans ADD COLUMN engine TEXT`);
} catch (e) {
  // 列已存在
}

export const QUESTION_TYPES = ['choice', 'fill', 'essay'];
