/**
 * Inventory: append-only movement ledger + order reservations.
 *
 *   on hand   = ingredients.stock_qty (changed ONLY by recordMovement)
 *   reserved  = Σ active reservations (orders accepted/new, not yet in production)
 *   available = on hand − reserved
 *
 * Order lifecycle:
 *   order placed            → reserve (atomic check-and-reserve inside the order transaction)
 *   refused / cancelled     → release reservations (stock never left the shelf)
 *   preparing               → consume: reservations become 'consumption' movements
 *   cancelled after cooking → nothing is returned (food was produced); record waste if discarded
 */
import { nowIso } from '../db/database.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { audit } from './audit.js';
import { getSettings } from './settings.js';
import { notifyLowStock, notifyReservedShortfall } from './notifications.js';

export const MANUAL_MOVEMENT_TYPES = ['purchase', 'adjustment', 'waste', 'spoilage', 'damage', 'consumption', 'return'];
const NEGATIVE_TYPES = ['waste', 'spoilage', 'damage', 'consumption', 'return']; // return = sent back to supplier
const POSITIVE_TYPES = ['opening', 'purchase'];

/** Map ingredientId → { name, stock, reserved, available, reorderLevel, trackStock }. */
export function getAvailabilityMap(db, ids = null) {
  const filter = ids ? `WHERE i.id IN (${ids.map(() => '?').join(',')})` : '';
  const rows = db.all(
    `SELECT i.id, i.name, i.base_unit, i.stock_qty, i.reorder_level, i.track_stock,
       COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r WHERE r.ingredient_id = i.id AND r.status = 'active'), 0) AS reserved
     FROM ingredients i ${filter}`, ...(ids ?? []),
  );
  return new Map(rows.map((r) => [r.id, {
    name: r.name, baseUnit: r.base_unit, stock: r.stock_qty, reserved: r.reserved, available: r.stock_qty - r.reserved,
    reorderLevel: r.reorder_level, trackStock: Boolean(r.track_stock),
  }]));
}

/** Emit low-stock / shortfall alerts for the given ingredients. */
export function checkStockAlerts(db, ingredientIds) {
  if (!ingredientIds.length) return;
  const map = getAvailabilityMap(db, ingredientIds);
  for (const id of ingredientIds) {
    const s = map.get(id);
    if (!s?.trackStock) continue;
    const row = { id, name: s.name, base_unit: s.baseUnit, reorder_level: s.reorderLevel };
    if (s.available < 0) notifyReservedShortfall(db, row, -s.available);
    if (s.available <= s.reorderLevel) notifyLowStock(db, row, s.available);
  }
}

/**
 * The ONLY function that changes stock. Writes the ledger row and the new level atomically.
 * @param {{ ingredientId: number, type: string, quantity: number, reason?: string, unitCost?: number|null, orderId?: number|null }} m
 *   quantity is SIGNED for internal callers; positive for 'opening'/'purchase'.
 */
export function recordMovement(db, actor, m) {
  return db.tx(() => {
    const ing = db.get('SELECT * FROM ingredients WHERE id = ?', m.ingredientId);
    if (!ing) throw notFound('Ingredient');
    if (!Number.isFinite(m.quantity) || m.quantity === 0) throw badRequest('invalid_quantity', 'Quantity must be non-zero');
    if (POSITIVE_TYPES.includes(m.type) && m.quantity < 0) throw badRequest('invalid_quantity', `${m.type} must add stock`);
    if (NEGATIVE_TYPES.includes(m.type) && m.quantity > 0) throw badRequest('invalid_quantity', `${m.type} must remove stock`);
    const stockAfter = Math.round((ing.stock_qty + m.quantity) * 1e6) / 1e6;
    // Manual removals cannot take more than is physically on hand. Order consumption may
    // (only when enforcement is off) — the negative level then flags a data problem.
    if (stockAfter < 0 && !(m.type === 'consumption' && m.orderId)) {
      throw conflict('insufficient_stock', `Only ${ing.stock_qty} ${ing.base_unit} of ${ing.name} on hand`);
    }
    const now = nowIso();
    db.run('UPDATE ingredients SET stock_qty = ?, updated_at = ? WHERE id = ?', stockAfter, now, ing.id);
    const { lastInsertRowid: id } = db.run(
      `INSERT INTO inventory_movements (ingredient_id, type, quantity, stock_after, unit_cost, reason, order_id, user_id, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ing.id, m.type, m.quantity, stockAfter, m.unitCost ?? null, m.reason ?? null, m.orderId ?? null, actor?.userId ?? null, now,
    );
    if (!m.orderId) {
      audit(db, actor, `inventory.${m.type}`, 'ingredient', ing.id, { stockQty: ing.stock_qty }, { stockQty: stockAfter, quantity: m.quantity, reason: m.reason ?? null, movementId: id });
    }
    checkStockAlerts(db, [ing.id]);
    return { id, ingredientId: ing.id, type: m.type, quantity: m.quantity, stockAfter };
  });
}

/**
 * Staff/admin entry point. `quantity` is always entered as a positive amount; the sign comes
 * from the type. For 'adjustment' the user enters the physically COUNTED quantity instead.
 * A purchase with a unit cost can update the ingredient's cost and be booked as an expense.
 */
export function recordManualMovement(db, actor, input, { updateIngredientCost, recordExpense }) {
  return db.tx(() => {
    const ing = db.get('SELECT * FROM ingredients WHERE id = ?', input.ingredientId);
    if (!ing) throw notFound('Ingredient');
    let delta;
    if (input.type === 'adjustment') {
      if (input.countedQuantity == null) throw badRequest('counted_quantity_required', 'Enter the counted quantity');
      delta = input.countedQuantity - ing.stock_qty;
      if (Math.abs(delta) < 1e-9) throw badRequest('no_change', 'Counted quantity equals current stock');
      if (!input.reason) throw badRequest('reason_required', 'Adjustments need a reason');
    } else {
      if (!(input.quantity > 0)) throw badRequest('invalid_quantity', 'Quantity must be greater than 0');
      delta = NEGATIVE_TYPES.includes(input.type) ? -input.quantity : input.quantity;
      if (input.type !== 'purchase' && !input.reason) throw badRequest('reason_required', 'Please give a reason');
    }
    const movement = recordMovement(db, actor, {
      ingredientId: ing.id, type: input.type, quantity: delta, reason: input.reason, unitCost: input.unitCost ?? null,
    });

    if (input.type === 'purchase' && input.unitCost != null) {
      if (updateIngredientCost && input.unitCost !== ing.cost_per_unit) updateIngredientCost(ing.id, input.unitCost);
      if (input.recordExpense && recordExpense) {
        recordExpense({
          category: 'ingredients', amountMillimes: Math.round(input.unitCost * input.quantity),
          expenseDate: now().slice(0, 10), description: `Purchase: ${input.quantity} ${ing.base_unit} ${ing.name}`,
          reference: input.reference ?? null, inventoryMovementId: movement.id,
        });
      }
    }
    return movement;
  });
}

function now() { return nowIso(); }

/**
 * Atomically check availability and reserve stock for an order. Must run inside the
 * order-creation transaction. Throws 409 insufficient_stock (with details) when enforcement is on.
 * @param {Map<number, number>} requirements ingredientId → quantity (base units)
 */
export function reserveForOrder(db, orderId, requirements) {
  const ids = [...requirements.keys()];
  const map = getAvailabilityMap(db, ids);
  const enforce = getSettings(db)['inventory.enforce'];
  const shortages = [];
  for (const [id, qty] of requirements) {
    const s = map.get(id);
    if (s?.trackStock && s.available + 1e-9 < qty) {
      shortages.push({ ingredientId: id, name: s.name, required: qty, available: Math.max(0, s.available), baseUnit: s.baseUnit });
    }
  }
  if (shortages.length && enforce) {
    throw conflict('insufficient_stock', 'Some items are no longer available in the requested quantity', { shortages });
  }
  const ts = nowIso();
  for (const [id, qty] of requirements) {
    if (!map.get(id)?.trackStock) continue;
    db.run(
      `INSERT INTO inventory_reservations (order_id, ingredient_id, quantity, status, created_at, updated_at) VALUES (?, ?, ?, 'active', ?, ?)`,
      orderId, id, qty, ts, ts,
    );
  }
  checkStockAlerts(db, ids);
  return { shortages };
}

export function releaseOrderReservations(db, orderId) {
  const ids = db.all(`SELECT ingredient_id FROM inventory_reservations WHERE order_id = ? AND status = 'active'`, orderId).map((r) => r.ingredient_id);
  db.run(`UPDATE inventory_reservations SET status = 'released', updated_at = ? WHERE order_id = ? AND status = 'active'`, nowIso(), orderId);
  return ids.length;
}

export function consumeOrderReservations(db, actor, order) {
  const rows = db.all(`SELECT * FROM inventory_reservations WHERE order_id = ? AND status = 'active'`, order.id);
  for (const r of rows) {
    recordMovement(db, actor, {
      ingredientId: r.ingredient_id, type: 'consumption', quantity: -r.quantity,
      reason: `Order ${order.number}`, orderId: order.id,
    });
    db.run(`UPDATE inventory_reservations SET status = 'consumed', updated_at = ? WHERE id = ?`, nowIso(), r.id);
  }
  return rows.length;
}

export function listMovements(db, { ingredientId, type, from, to, page = 1, pageSize = 50 }) {
  const where = [];
  const params = [];
  if (ingredientId) { where.push('m.ingredient_id = ?'); params.push(ingredientId); }
  if (type) { where.push('m.type = ?'); params.push(type); }
  if (from) { where.push('m.created_at >= ?'); params.push(from); }
  if (to) { where.push('m.created_at < ?'); params.push(to); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = db.get(`SELECT COUNT(*) AS n FROM inventory_movements m ${clause}`, ...params).n;
  const items = db.all(
    `SELECT m.*, i.name AS ingredient_name, i.base_unit, u.name AS user_name, o.number AS order_number
     FROM inventory_movements m JOIN ingredients i ON i.id = m.ingredient_id
     LEFT JOIN users u ON u.id = m.user_id LEFT JOIN orders o ON o.id = m.order_id
     ${clause} ORDER BY m.id DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize,
  ).map((m) => ({
    id: m.id, ingredientId: m.ingredient_id, ingredientName: m.ingredient_name, baseUnit: m.base_unit, type: m.type,
    quantity: m.quantity, stockAfter: m.stock_after, unitCost: m.unit_cost, reason: m.reason,
    orderId: m.order_id, orderNumber: m.order_number, userName: m.user_name, createdAt: m.created_at,
  }));
  return { total, page, pageSize, items };
}

/**
 * Days of stock left at the average daily consumption of the last `days` days.
 * Plain arithmetic on recorded history — an estimate, not a prediction model.
 */
export function stockForecast(db, { days = 14 } = {}) {
  const since = new Date(Date.now() - days * 86400_000).toISOString();
  const usage = new Map(db.all(
    `SELECT ingredient_id, -SUM(quantity) AS used FROM inventory_movements
     WHERE type = 'consumption' AND created_at >= ? GROUP BY ingredient_id`, since,
  ).map((r) => [r.ingredient_id, r.used]));
  const map = getAvailabilityMap(db);
  const out = [];
  for (const [id, s] of map) {
    if (!s.trackStock) continue;
    const used = usage.get(id) ?? 0;
    const perDay = used / days;
    out.push({
      ingredientId: id, name: s.name, baseUnit: s.baseUnit, available: s.available, reorderLevel: s.reorderLevel,
      avgDailyUse: perDay, daysLeft: perDay > 0 ? Math.max(0, s.available) / perDay : null, basedOnDays: days,
    });
  }
  return out.sort((a, b) => (a.daysLeft ?? Infinity) - (b.daysLeft ?? Infinity));
}

/** Requirement for N meals vs. stock — e.g. "20 × Chicken Bowl needs 3 kg chicken". */
export function checkRequirements(db, requirements) {
  const map = getAvailabilityMap(db, [...requirements.keys()]);
  return [...requirements].map(([id, qty]) => {
    const s = map.get(id);
    return { ingredientId: id, name: s?.name, baseUnit: s?.baseUnit, required: qty, available: s?.available ?? 0, enough: !s?.trackStock || s.available + 1e-9 >= qty };
  });
}
