import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, loggedIn, mealByEn, ingredientByEn, guestOrder } from './helpers.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

test('guest checkout: server computes price, nutrition and totals; client-sent values are ignored', async () => {
  const meal = mealByEn(ctx.db, 'Protein Harvest');
  const zone = ctx.db.get(`SELECT id FROM delivery_zones WHERE city = 'Tunis'`);
  const res = await client(ctx.base).post('/api/orders', {
    ...guestOrder(meal.id, { fulfillment: 'delivery', zoneId: zone.id, address: '1 Rue X' }),
    items: [{ mealId: meal.id, quantity: 2, unitPrice: 1, nutrition: { kcal: 1 } }],
    total: 1, totalMillimes: 1,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.order.totalMillimes, 2 * 24000 + 5000);
  const item = ctx.db.get('SELECT * FROM order_items WHERE order_id = ?', res.body.order.id);
  assert.equal(item.unit_price_millimes, 24000);
  const nutrition = JSON.parse(item.nutrition_json);
  assert.ok(nutrition.kcal > 400 && nutrition.kcal < 520, `kcal ${nutrition.kcal}`);
  assert.equal(ctx.db.get('SELECT number FROM orders WHERE id = ?', res.body.order.id).number, res.body.order.number);
});

test('tracking requires the token (or account ownership) and hides internal data', async () => {
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const { body } = await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  const anon = client(ctx.base);
  assert.equal((await anon.get(`/api/track/${body.order.number}`)).status, 404);
  assert.equal((await anon.get(`/api/track/${body.order.number}?t=wrong-token-wrong`)).status, 404);
  const ok = await anon.get(`/api/track/${body.order.number}?t=${body.order.trackingToken}`);
  assert.equal(ok.status, 200);
  assert.deepEqual(ok.body.order.timeline.steps.map((s) => s.state), ['done', 'upcoming', 'upcoming', 'upcoming', 'upcoming']);
  assert.equal(ok.body.order.history, undefined);
  assert.equal(ok.body.order.items[0].components, undefined);
});

test('full lifecycle: accept → preparing (consumes stock) → ready → completed (cash collected)', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const meal = mealByEn(ctx.db, 'Protein Harvest');
  const chicken = ingredientByEn(ctx.db, 'Organic Chicken');
  const stockBefore = chicken.stock_qty;
  const { body } = await client(ctx.base).post('/api/orders', { ...guestOrder(meal.id), items: [{ mealId: meal.id, quantity: 2 }] });
  const id = body.order.id;
  // reserved, not yet consumed
  assert.equal(ctx.db.get('SELECT stock_qty FROM ingredients WHERE id = ?', chicken.id).stock_qty, stockBefore);
  assert.equal(ctx.db.get(`SELECT SUM(quantity) q FROM inventory_reservations WHERE order_id = ? AND ingredient_id = ? AND status = 'active'`, id, chicken.id).q, 300);

  for (const to of ['accepted', 'preparing', 'ready']) {
    const r = await staff.post(`/api/orders/${id}/transition`, { to });
    assert.equal(r.status, 200, JSON.stringify(r.body));
    assert.equal(r.body.order.status, to);
  }
  assert.equal(ctx.db.get('SELECT stock_qty FROM ingredients WHERE id = ?', chicken.id).stock_qty, stockBefore - 300);
  const mv = ctx.db.get(`SELECT * FROM inventory_movements WHERE order_id = ? AND ingredient_id = ?`, id, chicken.id);
  assert.equal(mv.type, 'consumption');
  assert.equal(mv.quantity, -300);

  const done = await staff.post(`/api/orders/${id}/transition`, { to: 'completed', collectCash: true });
  assert.equal(done.body.order.status, 'completed');
  assert.equal(done.body.order.paymentStatus, 'paid');
  const history = ctx.db.all('SELECT to_status FROM order_status_history WHERE order_id = ? ORDER BY id', id).map((h) => h.to_status);
  assert.deepEqual(history, ['new', 'accepted', 'preparing', 'ready', 'completed']);
});

test('invalid transitions are rejected', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const { body } = await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  for (const to of ['preparing', 'ready', 'completed']) {
    const r = await staff.post(`/api/orders/${body.order.id}/transition`, { to });
    assert.equal(r.status, 409, `new → ${to} should fail`);
    assert.equal(r.body.error.code, 'invalid_transition');
  }
});

test('refusal requires a reason, releases reserved stock, and is visible to admins', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const admin = await loggedIn(ctx.base, 'admin');
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const { body } = await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  const id = body.order.id;
  assert.equal((await staff.post(`/api/orders/${id}/transition`, { to: 'refused' })).status, 400);
  assert.equal((await staff.post(`/api/orders/${id}/transition`, { to: 'refused', reason: 'other' })).status, 400, 'other needs a note');
  const r = await staff.post(`/api/orders/${id}/transition`, { to: 'refused', reason: 'outside_delivery_area', note: 'Customer is in Sousse' });
  assert.equal(r.status, 200);
  assert.equal(ctx.db.get(`SELECT COUNT(*) c FROM inventory_reservations WHERE order_id = ? AND status = 'active'`, id).c, 0);
  assert.equal(ctx.db.get('SELECT status FROM payments WHERE order_id = ?', id).status, 'cancelled');
  const view = await admin.get(`/api/orders/${id}`);
  assert.equal(view.body.order.refusalReason, 'outside_delivery_area');
  assert.equal(view.body.order.statusNote, 'Customer is in Sousse');
  assert.ok(ctx.db.get(`SELECT 1 FROM audit_logs WHERE action = 'order.refuse' AND entity_id = ?`, String(id)));
});

test('cancellation: staff can cancel NEW; only orders.cancel holders after acceptance; reservation released', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const manager = await loggedIn(ctx.base, 'manager');
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const a = (await client(ctx.base).post('/api/orders', guestOrder(meal.id))).body.order.id;
  assert.equal((await staff.post(`/api/orders/${a}/transition`, { to: 'cancelled', reason: 'customer_request' })).status, 200);

  const b = (await client(ctx.base).post('/api/orders', guestOrder(meal.id))).body.order.id;
  await staff.post(`/api/orders/${b}/transition`, { to: 'accepted' });
  assert.equal((await staff.post(`/api/orders/${b}/transition`, { to: 'cancelled', reason: 'customer_request' })).status, 403);
  assert.equal((await manager.post(`/api/orders/${b}/transition`, { to: 'cancelled', reason: 'customer_request' })).status, 200);
  assert.equal(ctx.db.get(`SELECT COUNT(*) c FROM inventory_reservations WHERE order_id = ? AND status = 'released'`, b).c > 0, true);
});

test('customer can cancel their own NEW order from their account, not others', async () => {
  const customer = await loggedIn(ctx.base, 'customer');
  const meal = mealByEn(ctx.db, 'Forest Elixir');
  const mine = await customer.post('/api/orders', { ...guestOrder(meal.id), customer: { name: 'Customer', phone: '50000000' } });
  assert.equal(mine.status, 201);
  const theirs = (await client(ctx.base).post('/api/orders', guestOrder(meal.id))).body.order;
  assert.equal((await customer.post(`/api/track/${theirs.number}/cancel`, {})).status, 404);
  const ok = await customer.post(`/api/track/${mine.body.order.number}/cancel`, {});
  assert.equal(ok.status, 200);
  assert.equal(ok.body.order.status, 'cancelled');
  const orders = await customer.get('/api/me/orders');
  assert.ok(orders.body.items.some((o) => o.number === mine.body.order.number));
});

test('unavailable / archived meals and unknown zones cannot be ordered', async () => {
  const draft = mealByEn(ctx.db, 'Green Power Bowl'); // seeded as unavailable draft
  const r = await client(ctx.base).post('/api/orders', guestOrder(draft.id));
  assert.equal(r.status, 409);
  assert.equal(r.body.error.code, 'meal_unavailable');
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const z = await client(ctx.base).post('/api/orders', guestOrder(meal.id, { fulfillment: 'delivery', zoneId: 9999, address: 'x' }));
  assert.equal(z.body.error.code, 'outside_delivery_area');
  const online = await client(ctx.base).post('/api/orders', guestOrder(meal.id, { paymentMethod: 'online' }));
  assert.equal(online.body.error.code, 'online_payment_unavailable');
});

test('validation errors are reported per field', async () => {
  const r = await client(ctx.base).post('/api/orders', { items: [], customer: { name: '', phone: '12' }, fulfillment: 'teleport', paymentMethod: 'cash' });
  assert.equal(r.status, 400);
  assert.ok(r.body.error.details.fields.items);
  assert.ok(r.body.error.details.fields['customer.name']);
  assert.ok(r.body.error.details.fields['customer.phone']);
  assert.ok(r.body.error.details.fields.fulfillment);
});

test('custom bowl: priced from portion prices, nutrition from the shared calculator', async () => {
  const chicken = ingredientByEn(ctx.db, 'Organic Chicken');
  const quinoa = ingredientByEn(ctx.db, 'Heirloom Quinoa');
  const r = await client(ctx.base).post('/api/orders', {
    ...guestOrder(null), items: [{ custom: [{ ingredientId: chicken.id, portions: 2 }, { ingredientId: quinoa.id, portions: 1 }], quantity: 1 }],
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const item = ctx.db.get('SELECT * FROM order_items WHERE order_id = ?', r.body.order.id);
  assert.equal(item.unit_price_millimes, 2 * 8500 + 3500);
  assert.equal(JSON.parse(item.nutrition_json).kcal, 2 * 165 + 120);
  const romaine = ingredientByEn(ctx.db, 'Romaine Lettuce'); // not customer-selectable
  const bad = await client(ctx.base).post('/api/orders', { ...guestOrder(null), items: [{ custom: [{ ingredientId: romaine.id, portions: 1 }], quantity: 1 }] });
  assert.equal(bad.status, 409);
});

test('staff WhatsApp/phone order: source recorded; staff may only pre-mark CASH as paid', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const base = { ...guestOrder(meal.id), customer: { name: 'Wa Client', phone: '+216 22 333 444' }, source: 'whatsapp' };
  const ok = await staff.post('/api/staff/orders', { ...base, paymentStatus: 'paid' });
  assert.equal(ok.status, 201, JSON.stringify(ok.body));
  const o = ctx.db.get('SELECT * FROM orders WHERE id = ?', ok.body.order.id);
  assert.equal(o.source, 'whatsapp');
  assert.equal(o.payment_status, 'paid');
  assert.equal(o.customer_phone, '21622333444');
  const online = await staff.post('/api/staff/orders', { ...base, paymentMethod: 'online', paymentStatus: 'paid', paymentReference: 'X1' });
  assert.equal(online.status, 400);
  assert.equal((await client(ctx.base).post('/api/staff/orders', base)).status, 401);
});

test('late orders raise one staff alert per order and status', async () => {
  const { notifyLateOrders } = await import('../services/notifications.js');
  const { isOrderLate } = await import('../../shared/orderStatus.js');
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const { body } = await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  ctx.db.run('UPDATE orders SET status_changed_at = ? WHERE id = ?', new Date(Date.now() - 3600_000).toISOString(), body.order.id);
  assert.ok(notifyLateOrders(ctx.db, isOrderLate) >= 1);
  const again = notifyLateOrders(ctx.db, isOrderLate);
  const staff = await loggedIn(ctx.base, 'staff');
  const n = await staff.get('/api/notifications');
  assert.ok(n.body.items.some((x) => x.type === 'order.late' && x.title.includes(body.order.number)));
  assert.equal(again, 0, 'no duplicate alerts');
});
