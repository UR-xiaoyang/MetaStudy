export const MESSAGE_SELECT = `
  SELECT m.id, m.course_id, m.parent_id, m.content, m.created_at,
         u.id AS user_id, u.username
  FROM messages m JOIN users u ON u.id = m.user_id`;

export function fetchMessagesTree(db, courseId) {
  const rows = db
    .prepare(`${MESSAGE_SELECT} WHERE m.course_id = ? ORDER BY m.created_at ASC`)
    .all(courseId);
  const byId = new Map();
  const roots = [];
  for (const r of rows) byId.set(r.id, { ...r, replies: [] });
  for (const r of rows) {
    const node = byId.get(r.id);
    if (r.parent_id && byId.has(r.parent_id)) {
      byId.get(r.parent_id).replies.push(node);
    } else {
      roots.push(node);
    }
  }
  return roots;
}
