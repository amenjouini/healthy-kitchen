/**
 * Orders — the hub connecting customer → meals → nutrition → payment → inventory → staff.
 *
 * Creation runs in ONE synchronous transaction:
 *   resolve lines from current meal versions (server prices / nutrition / cost — client values ignored)
 *   → compute totals → check & reserve stock → insert order, items, history, payment
 *   → notify staff, queue customer message.
 * Because the transaction is synchronous and IMMEDIATE, two simultaneous orders for the
 * last portions are serialised: the second sees the first one's reservation and is rejected.
 */
import crypto from 'node:crypto';
import { nowIso } from '../db/database.js';
import { badRequest, conflict, forbidden, notFound } from '../http/errors.js';
import { calculateRecipe, roundNutrition } from '../../shared/nutrition.js';
import {
  canTransition, isOrderLate, REFUSAL_REASONS, CANCELLATION_REASONS, PRE_PRODUCTION_STATUSES, customerTimeline,
} from '../../shared/orderStatus.js';
import { P } from '../../shared/permissions.js';
import { audit } from './audit.js';
import { mapIngredient } from './ingredients.js';
import { reserveForOrder, releaseOrderReservations, consumeOrderReservations } from './inventory.js';
import { createPayment, listOrderPayments, onOrderClosed, latestPayment, markPaid } from './payments.js';
import { upsertCustomerForOrder } from './customers.js';
import { notifyNewOrder, checkRefusalPattern } from './notifications.js';
import { queueCustomerMessage, STATUS_EVENTS } from './messaging.js';
import { getSettings } from './settings.js';

const MAX_CUSTOM_PORTIONS = 3;

/** Resolve a catalogue meal line → price, nutrition, cost and ingredient requirements per unit. */
function resolveMealLine(db, line) {
  const meal = db.get('SELECT * FROM meals WHERE id = ?', line.mealId);
  if (!meal || meal.archived_at || !meal.is_available || !meal.current_version_id) {
    throw conflict('meal_unavailable', `Meal ${meal?.name ?? line.mealId} is not available`, { mealId: line.mealId });
  }
  const v = db.get('SELECT * FROM meal_versions WHERE id = ?', meal.current_version_id);
  const recipe = JSON.parse(v.recipe_json);
  return {
    kind: 'meal', mealId: meal.id, versionId: v.id, name: meal.name, quantity: line.quantity, notes: line.notes ?? null,
    unitPrice: v.price_millimes, unitCost: v.cost_per_serving, nutrition: JSON.parse(v.nutrition_json),
    components: recipe.map((r) => ({ ingredientId: r.ingredientId, name: r.name, quantity: r.quantity / v.servings, baseUnit: r.baseUnit })),
  };
}

/** Resolve a "build your own bowl" line from customer-selectable ingredients. */
function resolveCustomLine(db, line) {
  const ids = line.custom.map((c) => c.ingredientId);
  if (new Set(ids).size !== ids.length) throw badRequest('duplicate_ingredient', 'Each ingredient can be chosen once (use portions)');
  const rows = db.all(`SELECT * FROM ingredients WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const byId = new Map(rows.map((r) => [r.id, mapIngredient(r)]));
  let unitPrice = 0;
  const recipeLines = line.custom.map((c) => {
    const ing = byId.get(c.ingredientId);
    if (!ing || ing.archivedAt || !ing.customerSelectable || !ing.portionQty || ing.portionPriceMillimes == null) {
      throw conflict('ingredient_unavailable', `Ingredient ${ing?.name ?? c.ingredientId} cannot be selected`, { ingredientId: c.ingredientId });
    }
    if (c.portions > MAX_CUSTOM_PORTIONS) throw badRequest('too_many_portions', `Max ${MAX_CUSTOM_PORTIONS} portions per ingredient`);
    unitPrice += ing.portionPriceMillimes * c.portions;
    return { ingredient: ing, quantity: ing.portionQty * c.portions };
  });
  const calc = calculateRecipe(recipeLines, { servings: 1 });
  return {
    kind: 'custom', mealId: null, versionId: null, name: 'Custom bowl', quantity: line.quantity, notes: line.notes ?? null,
    unitPrice, unitCost: calc.totalCost, nutrition: roundNutrition(calc.total),
    components: recipeLines.map((l) => ({ ingredientId: l.ingredient.id, name: l.ingredient.name, quantity: l.quantity, baseUnit: l.ingredient.baseUnit })),
  };
}

function nextOrderNumber(db) {
  const next = (db.get('SELECT COALESCE(MAX(id), 0) + 1 AS n FROM orders').n);
  return `HK-${String(next).padStart(5, '0')}`;
}

/**
 * @param {object} input validated order input (see routes/orders.js)
 * @param {{ actor, isStaff: boolean, userId?: number }} opts
 */
export function createOrder(db, input, { actor, isStaff, userId = null }) {
  return db.tx(() => {
    const settings = getSettings(db);
    if (!isStaff && !settings['kitchen.acceptingOrders']) throw conflict('kitchen_closed', 'We are not taking online orders right now');

    const lines = input.items.map((l) => (l.custom ? resolveCustomLine(db, l) : resolveMealLine(db, l)));
    const subtotal = lines.reduce((s, l) => s + l.unitPrice * l.quantity, 0);

    let zone = null;
    if (input.fulfillment === 'delivery') {
      if (!input.zoneId) throw badRequest('zone_required', 'Choose a delivery city');
      if (!input.address) throw badRequest('address_required', 'A delivery address is required');
      zone = db.get('SELECT * FROM delivery_zones WHERE id = ? AND is_active = 1', input.zoneId);
      if (!zone) throw conflict('outside_delivery_area', 'We do not deliver to this city');
      if (subtotal < zone.min_order_millimes) {
        throw conflict('below_minimum_order', `Minimum order for ${zone.city} is ${zone.min_order_millimes / 1000} DT`, { minOrderMillimes: zone.min_order_millimes });
      }
    }
    const deliveryFee = zone ? zone.fee_millimes : 0;
    const discount = 0; // no promotions engine yet; column exists so totals stay reproducible
    const total = subtotal + deliveryFee - discount;
    const city = zone?.city ?? input.city ?? null;

    if (input.paymentMethod === 'online' && !isStaff) {
      throw conflict('online_payment_unavailable', 'Online payment is not available yet');
    }

    const customerId = upsertCustomerForOrder(db, {
      name: input.customer.name, phone: input.customer.phone, email: input.customer.email, city,
      address: input.address, userId: isStaff ? null : userId,
    });

    const ts = nowIso();
    const number = nextOrderNumber(db);
    const estimatedCost = lines.reduce((s, l) => s + l.unitCost * l.quantity, 0);
    const { lastInsertRowid: orderId } = db.run(
      `INSERT INTO orders (number, tracking_token, customer_id, source, status, status_changed_at, fulfillment, customer_name,
         customer_phone, city, address, delivery_zone_id, notes, requested_for, subtotal_millimes, delivery_fee_millimes,
         discount_millimes, total_millimes, estimated_cost_millimes, payment_method, payment_status, whatsapp_conversation_id,
         created_by, created_at, updated_at)
       VALUES (?, ?, ?, ?, 'new', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?)`,
      number, crypto.randomBytes(12).toString('base64url'), customerId, input.source, ts, input.fulfillment,
      input.customer.name, input.customer.phone ?? null, city, input.address ?? null, zone?.id ?? null, input.notes ?? null,
      input.requestedFor ?? null, subtotal, deliveryFee, discount, total, Math.round(estimatedCost * 100) / 100,
      input.paymentMethod, input.whatsappConversationId ?? null, isStaff ? actor?.userId : null, ts, ts,
    );

    const requirements = new Map();
    for (const l of lines) {
      db.run(
        `INSERT INTO order_items (order_id, kind, meal_id, meal_version_id, name, quantity, unit_price_millimes, line_total_millimes,
           unit_cost_millimes, nutrition_json, components_json, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        orderId, l.kind, l.mealId, l.versionId, l.name, l.quantity, l.unitPrice, l.unitPrice * l.quantity,
        Math.round(l.unitCost * 100) / 100, JSON.stringify(l.nutrition), JSON.stringify(l.components), l.notes,
      );
      for (const c of l.components) requirements.set(c.ingredientId, (requirements.get(c.ingredientId) ?? 0) + c.quantity * l.quantity);
    }
    reserveForOrder(db, orderId, requirements);

    db.run(
      'INSERT INTO order_status_history (order_id, from_status, to_status, user_id, created_at) VALUES (?, NULL, ?, ?, ?)',
      orderId, 'new', actor?.userId ?? null, ts,
    );
    const order = db.get('SELECT * FROM orders WHERE id = ?', orderId);
    const prepaid = isStaff && input.paymentStatus === 'paid';
    createPayment(db, order, { method: input.paymentMethod, status: prepaid ? 'paid' : 'pending', reference: input.paymentReference ?? null, actor });

    if (input.whatsappConversationId) {
      db.run('UPDATE whatsapp_conversations SET customer_id = COALESCE(customer_id, ?) WHERE id = ?', customerId, input.whatsappConversationId);
    }

    audit(db, actor, 'order.create', 'order', orderId, undefined, { number, source: input.source, total, items: lines.map((l) => ({ name: l.name, quantity: l.quantity })) });
    notifyNewOrder(db, { id: orderId, number, itemCount: lines.reduce((s, l) => s + l.quantity, 0), totalMillimes: total, city, fulfillment: input.fulfillment, source: input.source });
    queueCustomerMessage(db, db.get('SELECT * FROM orders WHERE id = ?', orderId), 'order_received');
    return { id: orderId, number, trackingToken: order.tracking_token, totalMillimes: total };
  });
}

/**
 * Move an order through the state machine. Every rule lives here; the UI only mirrors it.
 * @param {{ actor, permissions: string[], customerUserId?: number }} who
 */
export function transitionOrder(db, orderId, to, { reason, note, collectCash } = {}, who) {
  return db.tx(() => {
    const order = db.get('SELECT * FROM orders WHERE id = ?', orderId);
    if (!order) throw notFound('Order');
    const from = order.status;
    if (!canTransition(from, to)) throw conflict('invalid_transition', `An order that is "${from}" cannot become "${to}"`, { from, to });

    const perms = who.permissions ?? [];
    const isOwner = Boolean(who.customerUserId) && db.get('SELECT 1 FROM customers WHERE id = ? AND user_id = ?', order.customer_id, who.customerUserId);
    if (to === 'cancelled') {
      const allowed = (from === 'new' && (isOwner || perms.includes(P.ORDERS_MANAGE))) || perms.includes(P.ORDERS_CANCEL);
      if (!allowed) throw forbidden(from === 'new' ? undefined : 'Only a manager can cancel an order once it is accepted');
      if (isOwner && !perms.includes(P.ORDERS_MANAGE)) reason = 'customer_request';
      if (!CANCELLATION_REASONS.includes(reason)) throw badRequest('reason_required', 'Choose a cancellation reason');
      if (reason === 'other' && !note) throw badRequest('note_required', 'Please describe the reason');
    } else {
      if (!perms.includes(P.ORDERS_MANAGE)) throw forbidden();
    }
    if (to === 'refused') {
      if (!REFUSAL_REASONS.includes(reason)) throw badRequest('reason_required', 'A refusal reason is required');
      if (reason === 'other' && !note) throw badRequest('note_required', 'Please describe the reason');
    }

    const ts = nowIso();
    db.run(
      `UPDATE orders SET status = ?, status_changed_at = ?, updated_at = ?,
         refusal_reason = CASE WHEN ? = 'refused' THEN ? ELSE refusal_reason END,
         cancellation_reason = CASE WHEN ? = 'cancelled' THEN ? ELSE cancellation_reason END,
         status_note = COALESCE(?, status_note),
         completed_at = CASE WHEN ? = 'completed' THEN ? ELSE completed_at END
       WHERE id = ?`,
      to, ts, ts, to, reason ?? null, to, reason ?? null, note ?? null, to, ts, orderId,
    );
    db.run(
      'INSERT INTO order_status_history (order_id, from_status, to_status, reason, note, user_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      orderId, from, to, reason ?? null, note ?? null, who.actor?.userId ?? null, ts,
    );

    // Inventory side effects
    if ((to === 'refused' || to === 'cancelled') && PRE_PRODUCTION_STATUSES.includes(from)) releaseOrderReservations(db, orderId);
    if (to === 'preparing') consumeOrderReservations(db, who.actor, order);

    const updated = db.get('SELECT * FROM orders WHERE id = ?', orderId);
    if (to === 'refused' || to === 'cancelled') onOrderClosed(db, updated);
    if (to === 'completed' && collectCash) {
      const p = latestPayment(db, orderId);
      if (p?.method === 'cash' && p.status === 'pending') markPaid(db, who.actor, perms, orderId, {});
    }

    audit(db, who.actor, to === 'refused' ? 'order.refuse' : 'order.status', 'order', orderId, { status: from }, { status: to, reason: reason ?? null, note: note ?? null });
    if (to === 'refused') checkRefusalPattern(db);
    if (STATUS_EVENTS[to]) queueCustomerMessage(db, updated, STATUS_EVENTS[to]);
    return updated;
  });
}

// ─── Reading ─────────────────────────────────────────────────────────────────

function mapOrderRow(o, now = new Date()) {
  return {
    id: o.id, number: o.number, customerId: o.customer_id, source: o.source, status: o.status,
    statusChangedAt: o.status_changed_at, fulfillment: o.fulfillment, customerName: o.customer_name,
    customerPhone: o.customer_phone, city: o.city, address: o.address, notes: o.notes, requestedFor: o.requested_for,
    subtotalMillimes: o.subtotal_millimes, deliveryFeeMillimes: o.delivery_fee_millimes, discountMillimes: o.discount_millimes,
    totalMillimes: o.total_millimes, paymentMethod: o.payment_method, paymentStatus: o.payment_status,
    refusalReason: o.refusal_reason, cancellationReason: o.cancellation_reason, createdAt: o.created_at,
    completedAt: o.completed_at, itemCount: o.item_count ?? undefined,
    late: isOrderLate({ status: o.status, statusChangedAt: o.status_changed_at, requestedFor: o.requested_for }, now),
  };
}

function mapItem(i) {
  return {
    id: i.id, kind: i.kind, mealId: i.meal_id, mealVersionId: i.meal_version_id, name: i.name, quantity: i.quantity,
    unitPriceMillimes: i.unit_price_millimes, lineTotalMillimes: i.line_total_millimes,
    nutrition: JSON.parse(i.nutrition_json), components: JSON.parse(i.components_json), notes: i.notes,
  };
}

/**
 * @param {'staff'|'finance'} view finance adds cost/margin + payment references + internal notes history
 */
export function getOrder(db, id, { view = 'staff' } = {}) {
  const o = db.get('SELECT * FROM orders WHERE id = ? OR number = ?', Number(id) || -1, String(id));
  if (!o) throw notFound('Order');
  const items = db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', o.id);
  const history = db.all(
    `SELECT h.*, u.name AS user_name FROM order_status_history h LEFT JOIN users u ON u.id = h.user_id WHERE h.order_id = ? ORDER BY h.id`, o.id,
  );
  const finance = view === 'finance';
  return {
    ...mapOrderRow(o),
    statusNote: o.status_note,
    whatsappConversationId: o.whatsapp_conversation_id,
    items: items.map((i) => ({ ...mapItem(i), ...(finance && { unitCostMillimes: i.unit_cost_millimes }) })),
    history: history.map((h) => ({ from: h.from_status, to: h.to_status, reason: h.reason, note: h.note, by: h.user_name, at: h.created_at })),
    payments: listOrderPayments(db, o.id, { includeReference: finance }),
    reservations: db.all(
      `SELECT r.ingredient_id, i.name, i.base_unit, r.quantity, r.status FROM inventory_reservations r JOIN ingredients i ON i.id = r.ingredient_id WHERE r.order_id = ?`, o.id,
    ).map((r) => ({ ingredientId: r.ingredient_id, name: r.name, baseUnit: r.base_unit, quantity: r.quantity, status: r.status })),
    ...(finance && {
      estimatedCostMillimes: o.estimated_cost_millimes,
      estimatedMarginMillimes: o.subtotal_millimes - o.discount_millimes - o.estimated_cost_millimes,
    }),
  };
}

/** Customer-safe view used by tracking pages: no staff names, internal notes, costs or references. */
export function getOrderForCustomer(db, number, { token, customerUserId }) {
  const o = db.get('SELECT * FROM orders WHERE number = ?', number);
  if (!o) throw notFound('Order');
  const ownsViaAccount = customerUserId && db.get('SELECT 1 FROM customers WHERE id = ? AND user_id = ?', o.customer_id, customerUserId);
  const tokenOk = token && token.length === o.tracking_token.length && crypto.timingSafeEqual(Buffer.from(token), Buffer.from(o.tracking_token));
  if (!ownsViaAccount && !tokenOk) throw notFound('Order');
  const items = db.all('SELECT * FROM order_items WHERE order_id = ? ORDER BY id', o.id).map(mapItem)
    .map(({ components, ...rest }) => ({ ...rest, ingredients: components.map((c) => c.name) }));
  const history = db.all('SELECT to_status, created_at FROM order_status_history WHERE order_id = ? ORDER BY id', o.id);
  return {
    number: o.number, status: o.status, fulfillment: o.fulfillment, city: o.city, createdAt: o.created_at,
    customerName: o.customer_name, items, subtotalMillimes: o.subtotal_millimes, deliveryFeeMillimes: o.delivery_fee_millimes,
    discountMillimes: o.discount_millimes, totalMillimes: o.total_millimes, paymentMethod: o.payment_method,
    paymentStatus: o.payment_status, timeline: customerTimeline(o.status),
    reachedAt: Object.fromEntries(history.map((h) => [h.to_status, h.created_at])),
    // Coarse category only (e.g. "outside_delivery_area"); the internal note stays internal.
    closedReason: o.status === 'refused' ? o.refusal_reason : o.status === 'cancelled' ? o.cancellation_reason : null,
    canCancel: o.status === 'new' && Boolean(ownsViaAccount),
  };
}

export function listOrders(db, f = {}) {
  const where = [];
  const params = [];
  if (f.status) { const s = f.status.split(','); where.push(`o.status IN (${s.map(() => '?').join(',')})`); params.push(...s); }
  if (f.active) where.push(`o.status IN ('new','accepted','preparing','ready')`);
  if (f.search) {
    where.push('(o.number LIKE ? OR o.customer_name LIKE ? OR o.customer_phone LIKE ?)');
    const digits = f.search.replace(/\D/g, '');
    params.push(`%${f.search}%`, `%${f.search}%`, digits ? `%${digits}%` : `%${f.search}%`);
  }
  for (const [key, col] of [['city', 'o.city'], ['paymentMethod', 'o.payment_method'], ['paymentStatus', 'o.payment_status'], ['source', 'o.source'], ['customerId', 'o.customer_id'], ['fulfillment', 'o.fulfillment']]) {
    if (f[key]) { where.push(`${col} = ?`); params.push(f[key]); }
  }
  if (f.from) { where.push('o.created_at >= ?'); params.push(f.from); }
  if (f.to) { where.push('o.created_at < ?'); params.push(f.to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const page = f.page ?? 1;
  const pageSize = f.pageSize ?? 50;
  const rows = db.all(
    `SELECT o.*, (SELECT SUM(quantity) FROM order_items WHERE order_id = o.id) AS item_count FROM orders o ${clause}
     ORDER BY ${f.sort === 'oldest' ? 'o.id ASC' : 'o.id DESC'}`, ...params,
  );
  const now = new Date();
  let items = rows.map((r) => mapOrderRow(r, now));
  if (f.late) items = items.filter((o) => o.late);
  const total = items.length;
  items = items.slice((page - 1) * pageSize, page * pageSize);
  if (f.withItems && items.length) {
    const ids = items.map((o) => o.id);
    const lines = db.all(`SELECT * FROM order_items WHERE order_id IN (${ids.map(() => '?').join(',')}) ORDER BY id`, ...ids);
    const byOrder = new Map();
    for (const l of lines) {
      if (!byOrder.has(l.order_id)) byOrder.set(l.order_id, []);
      byOrder.get(l.order_id).push({ kind: l.kind, name: l.name, quantity: l.quantity, notes: l.notes, components: JSON.parse(l.components_json) });
    }
    items = items.map((o) => ({ ...o, items: byOrder.get(o.id) ?? [] }));
  }
  return { total, page, pageSize, items };
}

/** Today's kitchen picture for the staff dashboard. */
export function kitchenOverview(db, { utcOffsetMinutes }) {
  const local = new Date(Date.now() + utcOffsetMinutes * 60_000);
  const startOfDay = new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate()) - utcOffsetMinutes * 60_000).toISOString();
  const counts = Object.fromEntries(db.all(
    `SELECT status, COUNT(*) AS n FROM orders WHERE status IN ('new','accepted','preparing','ready') OR created_at >= ? GROUP BY status`, startOfDay,
  ).map((r) => [r.status, r.n]));
  const active = listOrders(db, { active: true, pageSize: 500, sort: 'oldest' }).items;
  const settings = getSettings(db);
  const workload = db.get(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS units, COALESCE(SUM(oi.quantity * COALESCE(m.prep_minutes, 10)), 0) AS minutes
     FROM order_items oi JOIN orders o ON o.id = oi.order_id LEFT JOIN meals m ON m.id = oi.meal_id
     WHERE o.status IN ('accepted','preparing')`,
  );
  const preparingUnits = db.get(
    `SELECT COALESCE(SUM(oi.quantity), 0) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id WHERE o.status = 'preparing'`,
  ).n;
  return {
    counts: { new: counts.new ?? 0, accepted: counts.accepted ?? 0, preparing: counts.preparing ?? 0, ready: counts.ready ?? 0, completedToday: counts.completed ?? 0, refusedToday: counts.refused ?? 0, cancelledToday: counts.cancelled ?? 0 },
    late: active.filter((o) => o.late).map((o) => ({ id: o.id, number: o.number, status: o.status, statusChangedAt: o.statusChangedAt })),
    workload: {
      mealsPreparing: preparingUnits,
      mealsQueued: workload.units,
      // Rough estimate: total prep minutes of accepted+preparing meals divided by cooks working in parallel.
      estimatedMinutes: Math.ceil(workload.minutes / Math.max(1, settings['kitchen.parallelCooks'])),
    },
    acceptingOrders: settings['kitchen.acceptingOrders'],
  };
}
