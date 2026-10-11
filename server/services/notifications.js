/**
 * Notification centre. One reusable `notify()` used by every module:
 *  • staff/admin alerts are addressed to a PERMISSION (everyone holding it sees them),
 *  • customer updates are addressed to the customer's user account (if any) and,
 *    when WhatsApp is configured, queued in the outbound message outbox.
 */
import { nowIso } from '../db/database.js';
import { P } from '../../shared/permissions.js';
import { formatMoney } from '../../shared/money.js';

/**
 * @param {import('../db/database.js').Db} db
 * @param {{ userId?: number, permission?: string, type: string, severity?: 'info'|'warning'|'critical',
 *   title: string, body?: string, link?: string, data?: object, dedupeKey?: string }} n
 */
export function notify(db, n) {
  return db.run(
    `INSERT OR IGNORE INTO notifications (user_id, permission, type, severity, title, body, link, data_json, dedupe_key, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    n.userId ?? null, n.permission ?? null, n.type, n.severity ?? 'info', n.title, n.body ?? null, n.link ?? null,
    n.data ? JSON.stringify(n.data) : null, n.dedupeKey ?? null, nowIso(),
  );
}

function audienceClause(userId, permissions) {
  const placeholders = permissions.map(() => '?').join(',');
  return {
    sql: `(n.user_id = ?${permissions.length ? ` OR n.permission IN (${placeholders})` : ''})`,
    params: [userId, ...permissions],
  };
}

export function listNotifications(db, { userId, permissions, unreadOnly = false, limit = 30 }) {
  const { sql, params } = audienceClause(userId, permissions);
  const rows = db.all(
    `SELECT n.*, r.read_at FROM notifications n
     LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
     WHERE ${sql} ${unreadOnly ? 'AND r.read_at IS NULL' : ''}
     ORDER BY n.id DESC LIMIT ?`,
    userId, ...params, limit,
  );
  const unread = db.get(
    `SELECT COUNT(*) AS c FROM notifications n
     LEFT JOIN notification_reads r ON r.notification_id = n.id AND r.user_id = ?
     WHERE ${sql} AND r.read_at IS NULL`,
    userId, ...params,
  ).c;
  return {
    unread,
    items: rows.map((r) => ({
      id: r.id, type: r.type, severity: r.severity, title: r.title, body: r.body, link: r.link,
      data: r.data_json ? JSON.parse(r.data_json) : null, createdAt: r.created_at, read: Boolean(r.read_at),
    })),
  };
}

export function markNotificationsRead(db, { userId, permissions, ids }) {
  const { sql, params } = audienceClause(userId, permissions);
  const now = nowIso();
  db.tx(() => {
    const targets = ids?.length
      ? db.all(`SELECT n.id FROM notifications n WHERE ${sql} AND n.id IN (${ids.map(() => '?').join(',')})`, ...params, ...ids)
      : db.all(`SELECT n.id FROM notifications n WHERE ${sql}`, ...params);
    for (const t of targets) {
      db.run('INSERT OR IGNORE INTO notification_reads (notification_id, user_id, read_at) VALUES (?, ?, ?)', t.id, userId, now);
    }
  });
}

// ─── Domain events → notifications ───────────────────────────────────────────

export function notifyNewOrder(db, order) {
  notify(db, {
    permission: P.ORDERS_VIEW,
    type: 'order.new',
    severity: 'info',
    title: `New order ${order.number}`,
    body: `${order.itemCount} item(s) · ${formatMoney(order.totalMillimes)} · ${order.city ?? order.fulfillment} · ${order.source}`,
    link: `/staff/orders/${order.id}`,
    data: { orderId: order.id },
  });
}

export function notifyLowStock(db, ingredient, availableQty) {
  const out = availableQty <= 0;
  notify(db, {
    permission: P.INVENTORY_VIEW,
    type: out ? 'inventory.out' : 'inventory.low',
    severity: out ? 'critical' : 'warning',
    title: `${out ? 'Out of stock' : 'Low stock'}: ${ingredient.name}`,
    body: `Available: ${Math.max(0, Math.round(availableQty * 10) / 10)} ${ingredient.base_unit} (reorder level ${ingredient.reorder_level} ${ingredient.base_unit})`,
    link: `/staff/inventory`,
    data: { ingredientId: ingredient.id },
    // One alert per ingredient per state per day — avoids flooding on every order.
    dedupeKey: `stock:${out ? 'out' : 'low'}:${ingredient.id}:${nowIso().slice(0, 10)}`,
  });
}

export function notifyReservedShortfall(db, ingredient, shortfall) {
  notify(db, {
    permission: P.INVENTORY_MANAGE,
    type: 'inventory.shortfall',
    severity: 'critical',
    title: `Stock shortfall: ${ingredient.name}`,
    body: `Accepted orders need ${Math.round(shortfall * 10) / 10} ${ingredient.base_unit} more than is in stock.`,
    link: `/staff/inventory`,
    data: { ingredientId: ingredient.id },
    dedupeKey: `shortfall:${ingredient.id}:${nowIso().slice(0, 13)}`,
  });
}

export function notifyPaymentIssue(db, order, message) {
  notify(db, {
    permission: P.PAYMENTS_MANAGE,
    type: 'payment.issue',
    severity: 'warning',
    title: `Payment issue on ${order.number}`,
    body: message,
    link: `/admin/orders/${order.id}`,
    data: { orderId: order.id },
  });
}

/**
 * Raise one "late order" alert per order per status (run periodically by the server).
 * Uses the same lateness rule as the kitchen board (shared/orderStatus.js).
 */
export function notifyLateOrders(db, isOrderLate) {
  const active = db.all(`SELECT id, number, status, status_changed_at, requested_for FROM orders WHERE status IN ('new','accepted','preparing','ready')`);
  let raised = 0;
  for (const o of active) {
    if (!isOrderLate({ status: o.status, statusChangedAt: o.status_changed_at, requestedFor: o.requested_for })) continue;
    const r = notify(db, {
      permission: P.ORDERS_VIEW,
      type: 'order.late',
      severity: o.status === 'new' ? 'critical' : 'warning',
      title: `Late order ${o.number}`,
      body: o.status === 'new' ? 'Waiting to be accepted' : `Still "${o.status}"`,
      link: `/staff/orders/${o.id}`,
      data: { orderId: o.id },
      dedupeKey: `late:${o.id}:${o.status}`,
    });
    raised += r.changes;
  }
  return raised;
}

/** Alert admins when refusals spike: ≥ 3 refusals and ≥ 30 % of orders in the last 24 h. */
export function checkRefusalPattern(db) {
  const since = new Date(Date.now() - 24 * 3600_000).toISOString();
  const s = db.get(
    `SELECT COUNT(*) AS total, SUM(status = 'refused') AS refused FROM orders WHERE created_at >= ?`,
    since,
  );
  if (s.refused >= 3 && s.refused / s.total >= 0.3) {
    notify(db, {
      permission: P.ANALYTICS_VIEW,
      type: 'orders.refusal_spike',
      severity: 'critical',
      title: 'Unusual number of refused orders',
      body: `${s.refused} of ${s.total} orders were refused in the last 24 hours.`,
      link: '/admin/orders?status=refused',
      dedupeKey: `refusal-spike:${nowIso().slice(0, 10)}`,
    });
  }
}
