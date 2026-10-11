/** Customers (web accounts, guests and WhatsApp contacts share one table, matched by phone). */
import { nowIso } from '../db/database.js';
import { notFound, conflict } from '../http/errors.js';
import { audit } from './audit.js';

export function mapCustomer(c) {
  return {
    id: c.id, name: c.name, phone: c.phone, email: c.email, city: c.city, address: c.address,
    userId: c.user_id, notes: c.notes, createdAt: c.created_at,
  };
}

/**
 * Find-or-create the customer for an order. Account holders keep their saved profile;
 * guests / WhatsApp contacts get their latest address remembered.
 */
export function upsertCustomerForOrder(db, { name, phone, email, city, address, userId }) {
  const ts = nowIso();
  let existing = null;
  if (userId) existing = db.get('SELECT * FROM customers WHERE user_id = ?', userId);
  if (!existing && phone) existing = db.get('SELECT * FROM customers WHERE phone = ?', phone);
  if (existing) {
    if (!existing.user_id || existing.user_id === userId) {
      db.run(
        `UPDATE customers SET name = COALESCE(?, name), phone = COALESCE(phone, ?), email = COALESCE(email, ?),
           city = COALESCE(?, city), address = COALESCE(?, address), user_id = COALESCE(user_id, ?), updated_at = ? WHERE id = ?`,
        existing.user_id ? null : name, phone ?? null, email ?? null, city ?? null, address ?? null, userId ?? null, ts, existing.id,
      );
    }
    return existing.id;
  }
  const { lastInsertRowid } = db.run(
    'INSERT INTO customers (name, phone, email, city, address, user_id, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    name, phone ?? null, email ?? null, city ?? null, address ?? null, userId ?? null, ts, ts,
  );
  return lastInsertRowid;
}

const STATS = `
  COUNT(o.id) AS order_count,
  COALESCE(SUM(CASE WHEN o.status = 'completed' THEN o.total_millimes END), 0) AS spent,
  MAX(o.created_at) AS last_order_at,
  SUM(o.status = 'completed' AND o.created_at >= ?) AS orders_30d`;

function segment(c, highValueThreshold) {
  if (c.order_count === 0) return 'new';
  if (highValueThreshold && c.spent >= highValueThreshold && c.spent > 0) return 'high_value';
  if (c.orders_30d >= 3) return 'frequent';
  if (c.last_order_at && Date.now() - Date.parse(c.last_order_at) > 60 * 86400_000) return 'lapsed';
  return 'regular';
}

export function listCustomers(db, { search, city, segment: seg, sort = 'recent', page = 1, pageSize = 50 }) {
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const where = [];
  const params = [];
  if (search) { where.push('(c.name LIKE ? OR c.phone LIKE ? OR c.email LIKE ?)'); params.push(`%${search}%`, `%${search.replace(/\D/g, '') || search}%`, `%${search}%`); }
  if (city) { where.push('c.city = ?'); params.push(city); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = db.all(
    `SELECT c.*, ${STATS} FROM customers c LEFT JOIN orders o ON o.customer_id = c.id ${clause} GROUP BY c.id`,
    since30, ...params,
  );
  // "High value" = top 10 % of customers by completed spend.
  const spends = rows.map((r) => r.spent).filter((s) => s > 0).sort((a, b) => b - a);
  const threshold = spends.length >= 10 ? spends[Math.floor(spends.length * 0.1)] : null;
  let items = rows.map((r) => ({
    ...mapCustomer(r), orderCount: r.order_count, spentMillimes: r.spent, lastOrderAt: r.last_order_at,
    segment: segment(r, threshold),
  }));
  if (seg) items = items.filter((c) => c.segment === seg);
  const sorters = {
    recent: (a, b) => String(b.lastOrderAt ?? b.createdAt).localeCompare(String(a.lastOrderAt ?? a.createdAt)),
    spent: (a, b) => b.spentMillimes - a.spentMillimes,
    orders: (a, b) => b.orderCount - a.orderCount,
    name: (a, b) => a.name.localeCompare(b.name),
  };
  items.sort(sorters[sort] ?? sorters.recent);
  return { total: items.length, page, pageSize, items: items.slice((page - 1) * pageSize, page * pageSize) };
}

export function getCustomer(db, id) {
  const since30 = new Date(Date.now() - 30 * 86400_000).toISOString();
  const c = db.get(`SELECT c.*, ${STATS} FROM customers c LEFT JOIN orders o ON o.customer_id = c.id WHERE c.id = ? GROUP BY c.id`, since30, id);
  if (!c) throw notFound('Customer');
  const orders = db.all(
    `SELECT id, number, status, source, total_millimes, payment_method, payment_status, city, created_at
     FROM orders WHERE customer_id = ? ORDER BY id DESC LIMIT 100`, id,
  ).map((o) => ({
    id: o.id, number: o.number, status: o.status, source: o.source, totalMillimes: o.total_millimes,
    paymentMethod: o.payment_method, paymentStatus: o.payment_status, city: o.city, createdAt: o.created_at,
  }));
  const favoriteMeals = db.all(
    `SELECT oi.name, SUM(oi.quantity) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.customer_id = ? AND o.status NOT IN ('refused','cancelled') GROUP BY oi.name ORDER BY units DESC LIMIT 5`, id,
  );
  const completed = orders.filter((o) => o.status === 'completed');
  return {
    ...mapCustomer(c), orderCount: c.order_count, spentMillimes: c.spent, lastOrderAt: c.last_order_at,
    averageOrderMillimes: completed.length ? Math.round(c.spent / completed.length) : 0,
    segment: segment(c, null), orders, topMeals: favoriteMeals,
  };
}

export function updateCustomer(db, actor, id, data) {
  return db.tx(() => {
    const before = db.get('SELECT * FROM customers WHERE id = ?', id);
    if (!before) throw notFound('Customer');
    if (data.phone && data.phone !== before.phone && db.get('SELECT id FROM customers WHERE phone = ? AND id != ?', data.phone, id)) {
      throw conflict('phone_taken', 'Another customer already uses this phone number');
    }
    db.run(
      'UPDATE customers SET name = ?, phone = ?, email = ?, city = ?, address = ?, notes = ?, updated_at = ? WHERE id = ?',
      data.name ?? before.name, data.phone ?? before.phone, data.email ?? before.email, data.city ?? before.city,
      data.address ?? before.address, data.notes !== undefined ? data.notes : before.notes, nowIso(), id,
    );
    audit(db, actor, 'customer.update', 'customer', id, mapCustomer(before), data);
    return getCustomer(db, id);
  });
}

// ─── Delivery zones ──────────────────────────────────────────────────────────

export function listZones(db, { includeInactive = false } = {}) {
  return db.all(`SELECT * FROM delivery_zones ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, city`).map((z) => ({
    id: z.id, city: z.city, feeMillimes: z.fee_millimes, minOrderMillimes: z.min_order_millimes, isActive: Boolean(z.is_active), sortOrder: z.sort_order,
  }));
}

export function upsertZone(db, actor, id, data) {
  return db.tx(() => {
    if (id) {
      const before = db.get('SELECT * FROM delivery_zones WHERE id = ?', id);
      if (!before) throw notFound('Delivery zone');
      db.run(
        'UPDATE delivery_zones SET city = ?, fee_millimes = ?, min_order_millimes = ?, is_active = ?, sort_order = ? WHERE id = ?',
        data.city ?? before.city, data.feeMillimes ?? before.fee_millimes, data.minOrderMillimes ?? before.min_order_millimes,
        data.isActive ?? before.is_active, data.sortOrder ?? before.sort_order, id,
      );
      audit(db, actor, 'zone.update', 'delivery_zone', id, before, data);
      return id;
    }
    if (db.get('SELECT id FROM delivery_zones WHERE city = ?', data.city)) throw conflict('zone_exists', 'This city already exists');
    const { lastInsertRowid } = db.run(
      'INSERT INTO delivery_zones (city, fee_millimes, min_order_millimes, is_active, sort_order) VALUES (?, ?, ?, ?, ?)',
      data.city, data.feeMillimes ?? 0, data.minOrderMillimes ?? 0, data.isActive ?? true, data.sortOrder ?? 0,
    );
    audit(db, actor, 'zone.create', 'delivery_zone', lastInsertRowid, undefined, data);
    return lastInsertRowid;
  });
}
