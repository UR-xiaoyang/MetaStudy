import { strict as assert } from 'node:assert';
import { describe, it, before } from 'node:test';
import { db } from '../src/db.js';
import { hashPassword } from '../src/auth.js';
import { ensurePersonalClass } from '../src/personalCourses.js';
import { getOwnCourse } from '../src/access.js';

describe('课程访问权限隔离', () => {
  let userA, userB, spaceA, spaceB, courseA, courseB;

  before(() => {
    // 创建两个用户（避免用户名冲突）
    const timestamp = Date.now();
    const infoA = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(`studentA_${timestamp}`, hashPassword('pass123'));
    const infoB = db.prepare('INSERT INTO users (username, password) VALUES (?, ?)').run(`studentB_${timestamp}`, hashPassword('pass123'));
    userA = { id: Number(infoA.lastInsertRowid), username: `studentA_${timestamp}` };
    userB = { id: Number(infoB.lastInsertRowid), username: `studentB_${timestamp}` };

    // 创建各自的学习空间
    spaceA = ensurePersonalClass(db, userA.id);
    spaceB = ensurePersonalClass(db, userB.id);

    // 用户 A 创建课程
    const ca = db.prepare('INSERT INTO courses (class_id, title, subject, created_by) VALUES (?, ?, ?, ?)').run(spaceA.id, '用户A课程', '数学', userA.id);
    courseA = { id: Number(ca.lastInsertRowid), title: '用户A课程', created_by: userA.id };

    // 用户 B 创建课程
    const cb = db.prepare('INSERT INTO courses (class_id, title, subject, created_by) VALUES (?, ?, ?, ?)').run(spaceB.id, '用户B课程', '物理', userB.id);
    courseB = { id: Number(cb.lastInsertRowid), title: '用户B课程', created_by: userB.id };
  });

  it('用户只能访问自己创建的课程', () => {
    const aOwns = getOwnCourse(userA.id, courseA.id);
    assert.ok(aOwns, '用户 A 应能访问自己的课程');
    assert.equal(aOwns.created_by, userA.id);

    const aCantAccessB = getOwnCourse(userA.id, courseB.id);
    assert.equal(aCantAccessB, undefined, '用户 A 不应访问用户 B 的课程');
  });

  it('用户无法访问其他用户的课程', () => {
    const bOwns = getOwnCourse(userB.id, courseB.id);
    assert.ok(bOwns, '用户 B 应能访问自己的课程');

    const bCantAccessA = getOwnCourse(userB.id, courseA.id);
    assert.equal(bCantAccessA, undefined, '用户 B 不应访问用户 A 的课程');
  });

  it('删除课程后无法再访问', () => {
    const newCourse = db.prepare('INSERT INTO courses (class_id, title, subject, created_by) VALUES (?, ?, ?, ?)').run(spaceA.id, '临时课程', '化学', userA.id);
    const tempId = Number(newCourse.lastInsertRowid);

    const before = getOwnCourse(userA.id, tempId);
    assert.ok(before, '删除前应能访问');

    db.prepare('DELETE FROM courses WHERE id = ?').run(tempId);

    const after = getOwnCourse(userA.id, tempId);
    assert.equal(after, undefined, '删除后应无法访问');
  });
});
