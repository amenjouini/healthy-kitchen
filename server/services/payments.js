/**
 * Payments. Each order has a payment record (method, status, amount, reference,
 * refund info) instead of a boolean "paid". orders.payment_status mirrors the
 * latest payment for fast filtering.
 */
import { nowIso } from '../db/database.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { P } from '../../shared/permissions.js';
import { audit } from './audit.js';
import { notifyPaymentIssue } from './notifications.js';
import { queueCustomerMessage } from './messaging.js';

function mapPayment(p, { includeReference = true } = {}) {
  return {
    id: p.id, orderId: p.order_id, method: p.method, status: p.status, amountMillimes: p.amount_millimes,
    refundedMillimes: p.refunded_millimes, currency: p.currency, paidAt: p.paid_at, refundedAt: p.refunded_at,
    createdAt: p.created_at, updatedAt: p.updated_at,
    ...(includeReference && {
      provider: p.provider, providerReference: p.provider_reference, refundReason: p.refund_reason,
      notes: p.notes, recordedBy: p.recorded_by_name ?? null,
    }),
  };
}

export function createPayment(db, order, { method, status = 'pending', reference = null, actor = null }) {
  const ts = nowIso();
  db.run(
    `INSERT INTO payments (order_id, method, status, amount_millimes, provider_reference, paid_at, recorded_by, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    order.id, method, status, order.total_millimes, reference, status === 'paid' ? ts : null, actor?.userId ?? null, ts, ts,
  );
  syncOrderPaymentStatus(db, order.id);
}

export function latestPayment(db, orderId) {
  return db.get('SELECT * FROM payments WHERE order_id = ? ORDER BY id DESC LIMIT 1', orderId);
}

export function syncOrderPaymentStatus(db, orderId) {
  const p = latestPayment(db, orderId);
  if (p) db.run('UPDATE orders SET payment_status = ?, payment_method = ?, updated_at = ? WHERE id = ?', p.status, p.method, nowIso(), orderId);
}

export function listOrderPayments(db, orderId, opts) {
  return db.all(
    `SELECT p.*, u.name AS recorded_by_name FROM payments p LEFT JOIN users u ON u.id = p.recorded_by WHERE p.order_id = ? ORDER BY p.id`, orderId,
  ).map((p) => mapPayment(p, opts));
}

/**
 * Mark the order's payment as paid.
 * Staff with payments.collect may only confirm CASH; online/reference changes need payments.manage.
 */
export function markPaid(db, actor, permissions, orderId, { method, reference, notes } = {}) {
  return db.tx(() => {
    const order = db.get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!order) throw notFound('Order');
    const p = latestPayment(db, orderId);
    if (!p) throw notFound('Payment');
    const newMethod = method ?? p.method;
    const canManage = permissions.includes(P.PAYMENTS_MANAGE);
    if (!canManage && !(permissions.includes(P.PAYMENTS_COLLECT) && newMethod === 'cash' && p.method === 'cash')) throw forbidden();
    if (p.status === 'paid') throw conflict('already_paid', 'This order is already paid');
    if (['refunded', 'partially_refunded'].includes(p.status)) throw conflict('payment_refunded', 'Refunded payments cannot be marked paid');
    if (['refused', 'cancelled'].includes(order.status)) throw conflict('order_closed', 'Order was refused or cancelled');
    if (newMethod === 'online' && !reference && !p.provider_reference) {
      throw badRequest('reference_required', 'Online payments need a transaction reference');
    }
    const ts = nowIso();
    db.run(
      `UPDATE payments SET status = 'paid', method = ?, amount_millimes = ?, provider_reference = COALESCE(?, provider_reference),
         notes = COALESCE(?, notes), paid_at = ?, recorded_by = ?, updated_at = ? WHERE id = ?`,
      newMethod, order.total_millimes, reference ?? null, notes ?? null, ts, actor?.userId ?? null, ts, p.id,
    );
    syncOrderPaymentStatus(db, orderId);
    audit(db, actor, 'payment.paid', 'order', orderId, { status: p.status, method: p.method }, { status: 'paid', method: newMethod, reference: reference ?? null });
    queueCustomerMessage(db, order, 'payment_confirmed');
    return listOrderPayments(db, orderId);
  });
}

export function markFailed(db, actor, orderId, { notes }) {
  return db.tx(() => {
    const order = db.get('SELECT * FROM orders WHERE id = ?', orderId);
    const p = latestPayment(db, orderId);
    if (!order || !p) throw notFound('Payment');
    if (p.status !== 'pending') throw conflict('invalid_payment_state', `Payment is ${p.status}`);
    db.run(`UPDATE payments SET status = 'failed', notes = ?, recorded_by = ?, updated_at = ? WHERE id = ?`, notes ?? null, actor?.userId ?? null, nowIso(), p.id);
    syncOrderPaymentStatus(db, orderId);
    audit(db, actor, 'payment.failed', 'order', orderId, { status: p.status }, { status: 'failed', notes });
    notifyPaymentIssue(db, order, `Payment marked as failed${notes ? `: ${notes}` : ''}`);
    return listOrderPayments(db, orderId);
  });
}

export function refund(db, actor, orderId, { amountMillimes, reason }) {
  return db.tx(() => {
    const p = latestPayment(db, orderId);
    if (!p) throw notFound('Payment');
    if (!['paid', 'partially_refunded'].includes(p.status)) throw conflict('not_refundable', 'Only paid payments can be refunded');
    const remaining = p.amount_millimes - p.refunded_millimes;
    const amount = amountMillimes ?? remaining;
    if (amount <= 0 || amount > remaining) throw badRequest('invalid_refund_amount', `Refund must be between 0.001 and ${remaining / 1000} DT`);
    const refunded = p.refunded_millimes + amount;
    const status = refunded === p.amount_millimes ? 'refunded' : 'partially_refunded';
    const ts = nowIso();
    db.run(
      'UPDATE payments SET status = ?, refunded_millimes = ?, refunded_at = ?, refund_reason = ?, recorded_by = ?, updated_at = ? WHERE id = ?',
      status, refunded, ts, reason, actor?.userId ?? null, ts, p.id,
    );
    syncOrderPaymentStatus(db, orderId);
    audit(db, actor, 'payment.refund', 'order', orderId, { status: p.status, refundedMillimes: p.refunded_millimes }, { status, refundedMillimes: refunded, reason });
    return listOrderPayments(db, orderId);
  });
}

/** Order refused/cancelled: pending payments are cancelled; paid ones need a refund decision. */
export function onOrderClosed(db, order) {
  const p = latestPayment(db, order.id);
  if (!p) return;
  if (p.status === 'pending') {
    db.run(`UPDATE payments SET status = 'cancelled', updated_at = ? WHERE id = ?`, nowIso(), p.id);
    syncOrderPaymentStatus(db, order.id);
  } else if (p.status === 'paid') {
    notifyPaymentIssue(db, order, `Order ${order.status} but payment of ${p.amount_millimes / 1000} DT was received — refund needed.`);
  }
}

export function listPayments(db, { status, method, from, to, search, page = 1, pageSize = 50 }) {
  const where = [];
  const params = [];
  if (status) { where.push('p.status = ?'); params.push(status); }
  if (method) { where.push('p.method = ?'); params.push(method); }
  if (from) { where.push('p.created_at >= ?'); params.push(from); }
  if (to) { where.push('p.created_at < ?'); params.push(to); }
  if (search) { where.push('(o.number LIKE ? OR o.customer_name LIKE ? OR p.provider_reference LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM payments p JOIN orders o ON o.id = p.order_id ${clause}`, ...params).n;
  const totals = db.all(
    `SELECT p.status, p.method, COUNT(*) AS n, SUM(p.amount_millimes - p.refunded_millimes) AS net
     FROM payments p JOIN orders o ON o.id = p.order_id ${clause} GROUP BY p.status, p.method`, ...params,
  );
  const items = db.all(
    `SELECT p.*, o.number, o.customer_name, o.status AS order_status, o.source, u.name AS recorded_by_name
     FROM payments p JOIN orders o ON o.id = p.order_id LEFT JOIN users u ON u.id = p.recorded_by
     ${clause} ORDER BY p.id DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize,
  ).map((p) => ({ ...mapPayment(p), orderNumber: p.number, customerName: p.customer_name, orderStatus: p.order_status, source: p.source }));
  return { total, page, pageSize, items, totals };
}
