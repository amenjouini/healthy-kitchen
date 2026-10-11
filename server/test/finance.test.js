import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, loggedIn, mealByEn, guestOrder } from './helpers.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

async function completedOrder(staff, method = 'cash') {
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const r = method === 'cash'
    ? await client(ctx.base).post('/api/orders', guestOrder(meal.id))
    : await staff.post('/api/staff/orders', { ...guestOrder(meal.id), source: 'phone', paymentMethod: 'online' });
  for (const to of ['accepted', 'preparing', 'ready', 'completed']) await staff.post(`/api/orders/${r.body.order.id}/transition`, { to });
  return r.body.order.id;
}

test('payments: staff collects cash; online needs payments.manage and a reference; refunds tracked', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const admin = await loggedIn(ctx.base, 'admin');
  const cashId = await completedOrder(staff, 'cash');
  let r = await staff.post(`/api/orders/${cashId}/payment/paid`, {});
  assert.equal(r.status, 200, JSON.stringify(r.body));
  assert.equal(r.body.payments[0].status, 'paid');
  assert.equal((await staff.post(`/api/orders/${cashId}/payment/paid`, {})).body.error.code, 'already_paid');

  const onlineId = await completedOrder(staff, 'online');
  assert.equal((await staff.post(`/api/orders/${onlineId}/payment/paid`, { reference: 'TX-1' })).status, 403);
  assert.equal((await admin.post(`/api/orders/${onlineId}/payment/paid`, {})).body.error.code, 'reference_required');
  r = await admin.post(`/api/orders/${onlineId}/payment/paid`, { reference: 'TX-1' });
  assert.equal(r.body.payments[0].providerReference, 'TX-1');

  r = await admin.post(`/api/orders/${onlineId}/payment/refund`, { amount: '5', reason: 'Missing drink' });
  assert.equal(r.body.payments[0].status, 'partially_refunded');
  assert.equal(r.body.payments[0].refundedMillimes, 5000);
  r = await admin.post(`/api/orders/${onlineId}/payment/refund`, { amount: '9999', reason: 'x' });
  assert.equal(r.body.error.code, 'invalid_refund_amount');
  r = await admin.post(`/api/orders/${onlineId}/payment/refund`, { reason: 'Full refund' });
  assert.equal(r.body.payments[0].status, 'refunded');
  assert.equal(ctx.db.get('SELECT payment_status s FROM orders WHERE id = ?', onlineId).s, 'refunded');
  assert.ok(ctx.db.get(`SELECT 1 FROM audit_logs WHERE action = 'payment.refund' AND entity_id = ?`, String(onlineId)));
});

test('paid order that is later cancelled raises a refund alert for payment managers', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const manager = await loggedIn(ctx.base, 'manager');
  const admin = await loggedIn(ctx.base, 'admin');
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const r = await staff.post('/api/staff/orders', { ...guestOrder(meal.id), source: 'phone', paymentStatus: 'paid' });
  await staff.post(`/api/orders/${r.body.order.id}/transition`, { to: 'accepted' });
  await manager.post(`/api/orders/${r.body.order.id}/transition`, { to: 'cancelled', reason: 'customer_request' });
  const notes = await admin.get('/api/notifications');
  assert.ok(notes.body.items.some((n) => n.type === 'payment.issue' && n.body.includes('refund')));
  const staffNotes = await staff.get('/api/notifications');
  assert.ok(!staffNotes.body.items.some((n) => n.type === 'payment.issue'), 'staff do not receive finance alerts');
});

test('expenses and salaries feed the overview; paid salary posts an expense', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const staffUser = ctx.db.get(`SELECT id FROM users WHERE email = 'staff@test.local'`).id;
  const today = new Date().toISOString().slice(0, 10);
  let r = await admin.post('/api/expenses', { category: 'rent', amount: '1500', expenseDate: today, description: 'October rent' });
  assert.equal(r.status, 201);
  r = await admin.post('/api/salaries', { userId: staffUser, period: today.slice(0, 7), amount: '1100', status: 'paid' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(ctx.db.get('SELECT amount_millimes a FROM expenses WHERE salary_payment_id = ?', r.body.salary.id).a, 1_100_000);
  // un-paying removes the linked expense
  await admin.patch(`/api/salaries/${r.body.salary.id}`, { status: 'pending' });
  assert.equal(ctx.db.get('SELECT COUNT(*) c FROM expenses WHERE salary_payment_id = ?', r.body.salary.id).c, 0);
  await admin.patch(`/api/salaries/${r.body.salary.id}`, { status: 'paid' });

  const o = await admin.get('/api/finance/overview');
  assert.equal(o.status, 200);
  assert.equal(o.body.expenses.totalMillimes, 1_500_000 + 1_100_000);
  assert.equal(o.body.estimatedResultMillimes, o.body.revenue.netMillimes - o.body.expenses.totalMillimes);
  assert.ok(o.body.paymentMethods.length >= 1);
  const margins = await admin.get('/api/finance/meal-margins');
  assert.ok(margins.body.items.length > 0);
  const manager = await loggedIn(ctx.base, 'manager');
  assert.equal((await manager.get('/api/finance/overview')).status, 403);
  const analytics = await manager.get('/api/analytics');
  assert.equal(analytics.status, 200);
  assert.equal(analytics.body.meals[0].estimatedMarginMillimes, undefined, 'manager sees sales, not margins');
});

test('audit log records who/what with old and new values', async () => {
  const sa = await loggedIn(ctx.base, 'super_admin');
  const r = await sa.get('/api/audit?action=expense');
  assert.ok(r.body.items.length >= 1);
  assert.ok(r.body.items[0].userName);
});
