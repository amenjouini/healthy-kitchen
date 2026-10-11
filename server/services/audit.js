/** Audit log: WHO did WHAT, WHEN, with old/new values where practical. */
import { nowIso } from '../db/database.js';

/**
 * @param {import('../db/database.js').Db} db
 * @param {{ userId?: number|null, ip?: string|null }|null} actor
 */
export function audit(db, actor, action, entityType, entityId, oldValue, newValue) {
  db.run(
    `INSERT INTO audit_logs (user_id, action, entity_type, entity_id, old_json, new_json, ip, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    actor?.userId ?? null,
    action,
    entityType,
    entityId == null ? null : String(entityId),
    oldValue === undefined ? null : JSON.stringify(oldValue),
    newValue === undefined ? null : JSON.stringify(newValue),
    actor?.ip ?? null,
    nowIso(),
  );
}

/** Return { old, new } containing only the keys whose values differ (deep-compared via JSON). */
export function diff(before, after, keys = Object.keys(after ?? {})) {
  const oldV = {};
  const newV = {};
  for (const k of keys) {
    if (JSON.stringify(before?.[k]) !== JSON.stringify(after?.[k])) {
      oldV[k] = before?.[k] ?? null;
      newV[k] = after?.[k] ?? null;
    }
  }
  return Object.keys(newV).length ? { old: oldV, new: newV } : null;
}

export function listAudit(db, { entityType, entityId, userId, action, from, to, page = 1, pageSize = 50 }) {
  const where = [];
  const params = [];
  if (entityType) { where.push('a.entity_type = ?'); params.push(entityType); }
  if (entityId) { where.push('a.entity_id = ?'); params.push(String(entityId)); }
  if (userId) { where.push('a.user_id = ?'); params.push(userId); }
  if (action) { where.push('a.action LIKE ?'); params.push(`${action}%`); }
  if (from) { where.push('a.created_at >= ?'); params.push(from); }
  if (to) { where.push('a.created_at < ?'); params.push(to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM audit_logs a ${clause}`, ...params).n;
  const rows = db.all(
    `SELECT a.*, u.name AS user_name FROM audit_logs a LEFT JOIN users u ON u.id = a.user_id
     ${clause} ORDER BY a.id DESC LIMIT ? OFFSET ?`,
    ...params, pageSize, (page - 1) * pageSize,
  );
  return {
    total, page, pageSize,
    items: rows.map((r) => ({
      id: r.id, action: r.action, entityType: r.entity_type, entityId: r.entity_id,
      userId: r.user_id, userName: r.user_name, ip: r.ip, createdAt: r.created_at,
      old: r.old_json ? JSON.parse(r.old_json) : null, new: r.new_json ? JSON.parse(r.new_json) : null,
    })),
  };
}
