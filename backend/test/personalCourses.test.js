import test from 'node:test';
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { ensurePersonalClass } from '../src/personalCourses.js';

test('每位学生拥有自己的个人自习空间，且重复获取不会重复创建', () => {
  const db = new DatabaseSync(':memory:');
  db.exec(`
    CREATE TABLE classes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      invite_code TEXT NOT NULL UNIQUE,
      owner_id INTEGER NOT NULL,
      is_personal INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE class_members (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      class_id INTEGER NOT NULL,
      user_id INTEGER NOT NULL,
      role TEXT NOT NULL,
      UNIQUE(class_id, user_id)
    );
  `);

  const first = ensurePersonalClass(db, 11);
  const same = ensurePersonalClass(db, 11);
  const second = ensurePersonalClass(db, 12);

  assert.equal(first.id, same.id);
  assert.notEqual(first.id, second.id);
  assert.equal(first.is_personal, 1);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM classes').get().n, 2);
  assert.equal(db.prepare('SELECT role FROM class_members WHERE user_id = 11').get().role, 'student');
  db.close();
});
