/** Test harness: full app on an in-memory DB + a cookie-keeping JSON client per user. */
import http from 'node:http';
import crypto from 'node:crypto';
import { loadConfig } from '../config.js';
import { createApp } from '../app.js';
import { openDatabase } from '../db/database.js';
import { seedCatalog } from '../db/seed.js';
import { upsertUserWithRole } from '../services/users.js';
import { recordMovement } from '../services/inventory.js';
import { upsertZone } from '../services/customers.js';

export const PASSWORD = 'test-password-123';

export async function startTestServer({ whatsapp = {}, stock = 10_000 } = {}) {
  const db = openDatabase(':memory:');
  seedCatalog(db);
  const config = loadConfig({
    dbPath: ':memory:', uploadsDir: `${process.env.TEMP ?? '/tmp'}/hk-test-uploads-${crypto.randomBytes(4).toString('hex')}`,
    whatsapp: { ...loadConfig().whatsapp, provider: '', ...whatsapp },
    rateLimits: {},
  });
  const app = createApp(config, { db });
  for (const role of ['super_admin', 'admin', 'manager', 'staff', 'customer']) {
    await upsertUserWithRole(db, { email: `${role}@test.local`, name: role, password: PASSWORD, roleKey: role });
  }
  db.run(`INSERT INTO customers (name, phone, email, user_id, created_at, updated_at)
    SELECT 'Customer', '21650000000', email, id, 'x', 'x' FROM users WHERE email = 'customer@test.local'`);
  upsertZone(db, null, null, { city: 'Tunis', feeMillimes: 5000, minOrderMillimes: 0 });
  for (const ing of db.all('SELECT id FROM ingredients')) {
    recordMovement(db, null, { ingredientId: ing.id, type: 'opening', quantity: stock });
  }
  const server = http.createServer(app.handle);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  return { app, db, base, close: () => new Promise((resolve) => server.close(resolve)) };
}

export function client(base) {
  let cookie = '';
  async function request(method, path, body, headers = {}) {
    const res = await fetch(base + path, {
      method,
      headers: { ...(body !== undefined && { 'Content-Type': 'application/json' }), ...(cookie && { Cookie: cookie }), ...headers },
      body: body !== undefined ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined,
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0];
    const text = await res.text();
    let json;
    try { json = JSON.parse(text); } catch { json = text; }
    return { status: res.status, body: json };
  }
  return {
    get: (p, h) => request('GET', p, undefined, h),
    post: (p, b = {}, h) => request('POST', p, b, h),
    patch: (p, b = {}, h) => request('PATCH', p, b, h),
    del: (p, h) => request('DELETE', p, {}, h),
    raw: request,
    async login(role) {
      const r = await request('POST', '/api/auth/login', { email: `${role}@test.local`, password: PASSWORD });
      if (r.status !== 200) throw new Error(`login ${role} failed: ${JSON.stringify(r.body)}`);
      return this;
    },
  };
}

export async function loggedIn(base, role) {
  return client(base).login(role);
}

export function mealByEn(db, nameEn) {
  return db.get('SELECT * FROM meals WHERE name_en = ?', nameEn);
}

export function ingredientByEn(db, nameEn) {
  return db.get('SELECT * FROM ingredients WHERE name_en = ?', nameEn);
}

export const guestOrder = (mealId, extra = {}) => ({
  items: [{ mealId, quantity: 1 }],
  customer: { name: 'Guest', phone: '98 111 222' },
  fulfillment: 'pickup',
  paymentMethod: 'cash',
  ...extra,
});
