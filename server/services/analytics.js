/**
 * Analytics over recorded history (orders, order items, inventory movements).
 * Everything here is descriptive statistics on real data — no models, no guesses.
 * "Sold" = orders that were not refused/cancelled.
 */

const SOLD = `o.status NOT IN ('refused','cancelled')`;

function shiftFor(offset) { return `${offset >= 0 ? '+' : ''}${offset} minutes`; }

export function rangeToTimestamps(from, to, utcOffsetMinutes) {
  return {
    fromTs: new Date(Date.parse(`${from}T00:00:00Z`) - utcOffsetMinutes * 60_000).toISOString(),
    toTs: new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000 - utcOffsetMinutes * 60_000).toISOString(),
  };
}

export function mealAnalytics(db, { fromTs, toTs }) {
  const rows = db.all(
    `SELECT m.id, m.name, m.price_millimes, m.archived_at, v.cost_per_serving, v.cost_complete,
       COALESCE(s.units, 0) AS units, COALESCE(s.revenue, 0) AS revenue, COALESCE(s.est_cost, 0) AS est_cost,
       COALESCE(s.orders, 0) AS orders, COALESCE(c.cancelled_units, 0) AS cancelled_units,
       COALESCE(r.repeat_customers, 0) AS repeat_customers, COALESCE(r.customers, 0) AS customers
     FROM meals m LEFT JOIN meal_versions v ON v.id = m.current_version_id
     LEFT JOIN (SELECT oi.meal_id, SUM(oi.quantity) AS units, SUM(oi.line_total_millimes) AS revenue,
                  SUM(oi.unit_cost_millimes * oi.quantity) AS est_cost, COUNT(DISTINCT o.id) AS orders
                FROM order_items oi JOIN orders o ON o.id = oi.order_id
                WHERE ${SOLD} AND o.created_at >= ? AND o.created_at < ? GROUP BY oi.meal_id) s ON s.meal_id = m.id
     LEFT JOIN (SELECT oi.meal_id, SUM(oi.quantity) AS cancelled_units FROM order_items oi JOIN orders o ON o.id = oi.order_id
                WHERE o.status IN ('refused','cancelled') AND o.created_at >= ? AND o.created_at < ? GROUP BY oi.meal_id) c ON c.meal_id = m.id
     LEFT JOIN (SELECT meal_id, COUNT(*) AS customers, SUM(n > 1) AS repeat_customers FROM (
                  SELECT oi.meal_id, o.customer_id, COUNT(DISTINCT o.id) AS n FROM order_items oi JOIN orders o ON o.id = oi.order_id
                  WHERE ${SOLD} AND o.created_at >= ? AND o.created_at < ? GROUP BY oi.meal_id, o.customer_id) GROUP BY meal_id) r ON r.meal_id = m.id
     WHERE m.archived_at IS NULL OR s.units > 0`,
    fromTs, toTs, fromTs, toTs, fromTs, toTs,
  );
  return rows.map((r) => ({
    mealId: r.id, name: r.name, units: r.units, orders: r.orders, revenueMillimes: r.revenue,
    estimatedCostMillimes: Math.round(r.est_cost), estimatedMarginMillimes: Math.round(r.revenue - r.est_cost),
    currentPriceMillimes: r.price_millimes, currentCostPerServing: r.cost_per_serving, costComplete: Boolean(r.cost_complete),
    currentMarginPct: r.price_millimes > 0 && r.cost_per_serving != null ? ((r.price_millimes - r.cost_per_serving) / r.price_millimes) * 100 : null,
    cancelledUnits: r.cancelled_units,
    cancellationRate: r.units + r.cancelled_units > 0 ? r.cancelled_units / (r.units + r.cancelled_units) : 0,
    customers: r.customers, repeatCustomers: r.repeat_customers,
    reorderRate: r.customers > 0 ? r.repeat_customers / r.customers : 0,
  })).sort((a, b) => b.units - a.units);
}

export function ingredientAnalytics(db, { fromTs, toTs }) {
  return db.all(
    `SELECT i.id, i.name, i.base_unit, i.cost_per_unit,
       -COALESCE(SUM(CASE WHEN m.type = 'consumption' THEN m.quantity END), 0) AS used,
       -COALESCE(SUM(CASE WHEN m.type IN ('waste','spoilage','damage') THEN m.quantity END), 0) AS wasted,
       COALESCE(SUM(CASE WHEN m.type = 'purchase' THEN m.quantity END), 0) AS purchased
     FROM ingredients i LEFT JOIN inventory_movements m ON m.ingredient_id = i.id AND m.created_at >= ? AND m.created_at < ?
     GROUP BY i.id`, fromTs, toTs,
  ).map((r) => ({
    ingredientId: r.id, name: r.name, baseUnit: r.base_unit, costPerUnit: r.cost_per_unit, used: r.used, wasted: r.wasted, purchased: r.purchased,
    usedCostMillimes: r.cost_per_unit ? Math.round(r.used * r.cost_per_unit) : null,
    wastedCostMillimes: r.cost_per_unit ? Math.round(r.wasted * r.cost_per_unit) : null,
    wasteRate: r.used + r.wasted > 0 ? r.wasted / (r.used + r.wasted) : 0,
  })).sort((a, b) => (b.usedCostMillimes ?? 0) - (a.usedCostMillimes ?? 0));
}

export function cityAnalytics(db, { fromTs, toTs }) {
  const cities = db.all(
    `SELECT COALESCE(o.city, '—') AS city, COUNT(*) AS orders, SUM(o.total_millimes) AS revenue, COUNT(DISTINCT o.customer_id) AS customers
     FROM orders o WHERE ${SOLD} AND o.created_at >= ? AND o.created_at < ? GROUP BY COALESCE(o.city, '—') ORDER BY orders DESC`, fromTs, toTs,
  );
  const topMeals = db.all(
    `SELECT COALESCE(o.city, '—') AS city, oi.name, SUM(oi.quantity) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE ${SOLD} AND o.created_at >= ? AND o.created_at < ? GROUP BY COALESCE(o.city, '—'), oi.name ORDER BY units DESC`, fromTs, toTs,
  );
  return cities.map((c) => ({
    city: c.city, orders: c.orders, revenueMillimes: c.revenue, customers: c.customers,
    averageOrderMillimes: Math.round(c.revenue / c.orders),
    topMeals: topMeals.filter((m) => m.city === c.city).slice(0, 3).map((m) => ({ name: m.name, units: m.units })),
  }));
}

export function timeAnalytics(db, { fromTs, toTs, utcOffsetMinutes }) {
  const shift = shiftFor(utcOffsetMinutes);
  const q = (expr) => db.all(
    `SELECT ${expr} AS bucket, COUNT(*) AS orders, SUM(total_millimes) AS revenue FROM orders o
     WHERE ${SOLD} AND o.created_at >= ? AND o.created_at < ? GROUP BY bucket ORDER BY bucket`, shift, fromTs, toTs,
  ).map((r) => ({ bucket: r.bucket, orders: r.orders, revenueMillimes: r.revenue }));
  return {
    byDay: q(`date(o.created_at, ?)`),
    byWeek: q(`strftime('%Y-W%W', o.created_at, ?)`),
    byMonth: q(`strftime('%Y-%m', o.created_at, ?)`),
    byHour: q(`CAST(strftime('%H', o.created_at, ?) AS INTEGER)`),
    byWeekday: q(`CAST(strftime('%w', o.created_at, ?) AS INTEGER)`),
  };
}

export function summary(db, { fromTs, toTs }) {
  const s = db.get(
    `SELECT COUNT(*) AS orders, SUM(${SOLD}) AS sold, COALESCE(SUM(CASE WHEN ${SOLD} THEN total_millimes END), 0) AS value,
       SUM(status = 'refused') AS refused, SUM(status = 'cancelled') AS cancelled, COUNT(DISTINCT customer_id) AS customers
     FROM orders o WHERE created_at >= ? AND created_at < ?`, fromTs, toTs,
  );
  const sources = db.all(
    `SELECT source, COUNT(*) AS n FROM orders o WHERE ${SOLD} AND created_at >= ? AND created_at < ? GROUP BY source`, fromTs, toTs,
  );
  return {
    orders: s.orders, soldOrders: s.sold ?? 0, orderValueMillimes: s.value, refused: s.refused ?? 0, cancelled: s.cancelled ?? 0,
    customers: s.customers, averageOrderMillimes: s.sold ? Math.round(s.value / s.sold) : 0,
    sources: Object.fromEntries(sources.map((r) => [r.source, r.n])),
  };
}

// ─── Recommendations (customer side) ─────────────────────────────────────────

/**
 * Meals frequently bought in the same order ("often ordered together"), requiring a
 * minimum co-occurrence so a single coincidence is not presented as a pattern.
 */
export function frequentPairs(db, { minOrders = 3, limit = 10 } = {}) {
  return db.all(
    `SELECT a.meal_id AS a, b.meal_id AS b, ma.name AS a_name, mb.name AS b_name, COUNT(DISTINCT a.order_id) AS orders
     FROM order_items a JOIN order_items b ON a.order_id = b.order_id AND a.meal_id < b.meal_id
     JOIN orders o ON o.id = a.order_id JOIN meals ma ON ma.id = a.meal_id JOIN meals mb ON mb.id = b.meal_id
     WHERE ${SOLD} AND ma.archived_at IS NULL AND mb.archived_at IS NULL AND ma.is_available = 1 AND mb.is_available = 1
     GROUP BY a.meal_id, b.meal_id HAVING orders >= ? ORDER BY orders DESC LIMIT ?`, minOrders, limit,
  ).map((r) => ({ mealIds: [r.a, r.b], names: [r.a_name, r.b_name], orders: r.orders }));
}

/**
 * For a customer: their most re-ordered meals + meals often ordered with them.
 * Falls back to the 30-day best sellers. Returns meal ids with the reason shown to the user.
 */
export function recommendationsFor(db, customerId) {
  const out = [];
  const seen = new Set();
  const push = (mealId, reason) => { if (!seen.has(mealId)) { seen.add(mealId); out.push({ mealId, reason }); } };
  if (customerId) {
    const mine = db.all(
      `SELECT oi.meal_id, SUM(oi.quantity) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
       JOIN meals m ON m.id = oi.meal_id WHERE o.customer_id = ? AND ${SOLD} AND m.archived_at IS NULL AND m.is_available = 1
       GROUP BY oi.meal_id ORDER BY units DESC LIMIT 3`, customerId,
    );
    for (const m of mine) push(m.meal_id, 'you_ordered');
    for (const pair of frequentPairs(db, { limit: 30 })) {
      const [a, b] = pair.mealIds;
      if (seen.has(a) && !seen.has(b)) push(b, 'ordered_together');
      if (seen.has(b) && !seen.has(a)) push(a, 'ordered_together');
    }
  }
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  for (const m of db.all(
    `SELECT oi.meal_id FROM order_items oi JOIN orders o ON o.id = oi.order_id JOIN meals m ON m.id = oi.meal_id
     WHERE ${SOLD} AND o.created_at >= ? AND m.archived_at IS NULL AND m.is_available = 1 AND oi.meal_id IS NOT NULL
     GROUP BY oi.meal_id ORDER BY SUM(oi.quantity) DESC LIMIT 6`, since,
  )) push(m.meal_id, 'popular');
  return out.slice(0, 6);
}
