import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, loggedIn, mealByEn, guestOrder } from './helpers.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

test('unauthenticated requests to protected endpoints get 401', async () => {
  const anon = client(ctx.base);
  for (const path of ['/api/orders', '/api/finance/overview', '/api/staff', '/api/inventory', '/api/audit', '/api/notifications']) {
    assert.equal((await anon.get(path)).status, 401, path);
  }
});

test('staff cannot reach admin-only functionality (enforced by the API)', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const forbiddenCalls = [
    ['get', '/api/finance/overview'], ['get', '/api/expenses'], ['get', '/api/payments'], ['get', '/api/salaries'],
    ['get', '/api/analytics'], ['get', '/api/audit'], ['get', '/api/customers'], ['get', '/api/staff'],
    ['post', '/api/staff', { name: 'x', email: 'x@x.tn', password: '12345678', roleId: 1 }],
    ['post', '/api/expenses', { category: 'rent', amount: '1', expenseDate: '2026-01-01', description: 'x' }],
    ['post', '/api/meals', { name: 'x', price: '1', recipe: [{ ingredientId: 1, quantity: 1 }] }],
    ['patch', '/api/settings', { 'inventory.enforce': false }],
    ['post', '/api/roles', { name: 'x', permissions: [] }],
  ];
  for (const [method, path, body] of forbiddenCalls) {
    const r = await staff[method](path, body);
    assert.equal(r.status, 403, `${method} ${path} → ${r.status}`);
  }
  // …while their own work is allowed
  assert.equal((await staff.get('/api/orders')).status, 200);
  assert.equal((await staff.get('/api/inventory')).status, 200);
  assert.equal((await staff.get('/api/staff/overview')).status, 200);
});

test('staff order view hides cost/margin and payment references', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const admin = await loggedIn(ctx.base, 'admin');
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  const { body } = await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  const s = await staff.get(`/api/orders/${body.order.id}`);
  assert.equal(s.body.order.estimatedCostMillimes, undefined);
  assert.equal(s.body.order.payments[0].providerReference, undefined);
  assert.equal(s.body.order.payments[0].amountMillimes, body.order.totalMillimes, 'staff still sees the amount to collect');
  const a = await admin.get(`/api/orders/${body.order.id}`);
  assert.notEqual(a.body.order.estimatedCostMillimes, undefined);
});

test('customers cannot use staff endpoints', async () => {
  const customer = await loggedIn(ctx.base, 'customer');
  assert.equal((await customer.get('/api/orders')).status, 403);
  assert.equal((await customer.post('/api/orders/1/transition', { to: 'accepted' })).status, 403);
  assert.equal((await customer.post('/api/inventory/movements', { ingredientId: 1, type: 'purchase', quantity: 1 })).status, 403);
});

test('role escalation is blocked', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const superAdminRole = ctx.db.get(`SELECT id FROM roles WHERE key = 'super_admin'`).id;
  const staffRole = ctx.db.get(`SELECT id FROM roles WHERE key = 'staff'`).id;
  // admin (no roles.manage) cannot create a super admin
  let r = await admin.post('/api/staff', { name: 'Evil', email: 'evil@test.local', password: 'password123', roleId: superAdminRole });
  assert.equal(r.status, 403);
  r = await admin.post('/api/staff', { name: 'Cook', email: 'cook@test.local', password: 'password123', roleId: staffRole, salary: '1200' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.user.salaryMillimes, 1_200_000);
  // nobody can change their own role
  const me = ctx.db.get(`SELECT id FROM users WHERE email = 'admin@test.local'`).id;
  r = await admin.patch(`/api/staff/${me}`, { roleId: superAdminRole });
  assert.equal(r.status, 403);
  // super admin can edit role permissions, but not the super_admin role itself
  const sa = await loggedIn(ctx.base, 'super_admin');
  r = await sa.patch(`/api/roles/${superAdminRole}`, { name: 'x', permissions: [] });
  assert.equal(r.status, 403);
  r = await sa.post('/api/roles', { name: 'Cashier', permissions: ['orders.view', 'payments.collect'] });
  assert.equal(r.status, 200);
  r = await sa.post('/api/roles', { name: 'Bad', permissions: ['root.everything'] });
  assert.equal(r.status, 400);
  // manager cannot grant a role holding permissions the manager lacks
  const adminRole = ctx.db.get(`SELECT id FROM roles WHERE key = 'admin'`).id;
  ctx.db.run(`INSERT OR IGNORE INTO role_permissions (role_id, permission) SELECT id, 'staff.manage' FROM roles WHERE key = 'manager'`);
  const manager = await loggedIn(ctx.base, 'manager');
  r = await manager.post('/api/staff', { name: 'Boss', email: 'boss@test.local', password: 'password123', roleId: adminRole });
  assert.equal(r.status, 403);
});

test('deactivated users lose access immediately', async () => {
  const sa = await loggedIn(ctx.base, 'super_admin');
  const staffSession = await loggedIn(ctx.base, 'staff');
  const staffId = ctx.db.get(`SELECT id FROM users WHERE email = 'staff@test.local'`).id;
  assert.equal((await sa.patch(`/api/staff/${staffId}`, { isActive: false })).status, 200);
  assert.equal((await staffSession.get('/api/orders')).status, 401);
  const relog = await client(ctx.base).post('/api/auth/login', { email: 'staff@test.local', password: 'test-password-123' });
  assert.equal(relog.status, 403);
  await sa.patch(`/api/staff/${staffId}`, { isActive: true });
});

test('CSRF: non-JSON or cross-origin state changes are rejected', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const form = await staff.raw('POST', '/api/orders/1/transition', 'to=accepted', { 'Content-Type': 'application/x-www-form-urlencoded' });
  assert.equal(form.status, 415);
  const cross = await staff.raw('POST', '/api/orders/1/transition', JSON.stringify({ to: 'accepted' }), { 'Content-Type': 'application/json', Origin: 'https://evil.example' });
  assert.equal(cross.status, 403);
});

test('login: wrong password rejected; session cookie is HttpOnly; logout ends it', async () => {
  const bad = await client(ctx.base).post('/api/auth/login', { email: 'staff@test.local', password: 'nope-nope' });
  assert.equal(bad.status, 401);
  const res = await fetch(`${ctx.base}/api/auth/login`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email: 'staff@test.local', password: 'test-password-123' }) });
  assert.match(res.headers.get('set-cookie'), /HttpOnly/);
  assert.match(res.headers.get('set-cookie'), /SameSite=Lax/);
  const c = await loggedIn(ctx.base, 'staff');
  await c.post('/api/auth/logout');
  assert.equal((await c.get('/api/orders')).status, 401);
});

test('signup creates a customer account (no staff permissions) and links an existing phone', async () => {
  const meal = mealByEn(ctx.db, 'Verdure Salad');
  await client(ctx.base).post('/api/orders', { ...guestOrder(meal.id), customer: { name: 'Prior Guest', phone: '97 000 111' } });
  const c = client(ctx.base);
  const r = await c.post('/api/auth/signup', { name: 'New', email: 'new@test.local', password: 'password123', phone: '97000111' });
  assert.equal(r.status, 201);
  assert.deepEqual(r.body.user.permissions, []);
  const orders = await c.get('/api/me/orders');
  assert.equal(orders.body.items.length, 1, 'previous guest order now visible in the account');
  assert.equal((await client(ctx.base).post('/api/auth/signup', { name: 'Dup', email: 'new@test.local', password: 'password123' })).status, 409);
});

test('health check is public and reports the database', async () => {
  const r = await client(ctx.base).get('/api/health');
  assert.equal(r.status, 200);
  assert.equal(r.body.status, 'ok');
  assert.equal(r.body.db, true);
});
