import crypto from 'node:crypto';

function inviteCode() {
  return `P${crypto.randomBytes(4).toString('hex').toUpperCase()}`;
}

export function ensurePersonalClass(db, userId) {
  let personal = db
    .prepare('SELECT id, name, invite_code, owner_id, is_personal FROM classes WHERE owner_id = ? AND is_personal = 1')
    .get(userId);
  if (!personal) {
    const result = db
      .prepare('INSERT INTO classes (name, invite_code, owner_id, is_personal) VALUES (?, ?, ?, 1)')
      .run('我的自习空间', inviteCode(), userId);
    personal = db
      .prepare('SELECT id, name, invite_code, owner_id, is_personal FROM classes WHERE id = ?')
      .get(result.lastInsertRowid);
  }
  db.prepare('INSERT OR IGNORE INTO class_members (class_id, user_id, role) VALUES (?, ?, ?)')
    .run(personal.id, userId, 'student');
  return personal;
}
