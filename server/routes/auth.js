/** Authentication + the signed-in customer's own data (orders, favourites, profile). */
import { v, validate } from '../http/validate.js';
import { badRequest, notFound } from '../http/errors.js';
import { authenticate, createSession, destroySession, publicUser, signupCustomer, changePassword, rolePermissions } from '../services/users.js';
import { listOrders } from '../services/orders.js';
import { recommendationsFor } from '../services/analytics.js';
import { nowIso } from '../db/database.js';

const SESSION_COOKIE = 'hk_session';

function startSession(ctx, userId) {
  const { token } = createSession(ctx.db, userId, { days: ctx.config.sessionDays, ip: ctx.ip, userAgent: ctx.req.headers['user-agent'] });
  ctx.setCookie(SESSION_COOKIE, token, { maxAge: ctx.config.sessionDays * 86400 });
}

function currentUser(db, userId) {
  const user = db.get('SELECT u.*, r.key AS role_key, r.name AS role_name, r.is_staff FROM users u JOIN roles r ON r.id = u.role_id WHERE u.id = ?', userId);
  return publicUser(user, rolePermissions(db, user.role_id), db);
}

function customerOf(ctx) {
  const c = ctx.db.get('SELECT * FROM customers WHERE user_id = ?', ctx.user.id);
  if (!c) throw notFound('Customer profile');
  return c;
}

export default function register(r, { db }) {
  r.post('/api/auth/login', { auth: 'public', rateLimit: 'login' }, async (ctx) => {
    const { email, password } = validate({ email: v.email(), password: v.string({ min: 1, max: 200, trim: false }) }, ctx.body);
    const user = await authenticate(db, email, password);
    startSession(ctx, user.id);
    return { user: currentUser(db, user.id) };
  });

  r.post('/api/auth/signup', { auth: 'public', rateLimit: 'signup' }, async (ctx) => {
    const data = validate({
      name: v.text({ max: 120 }), email: v.email(), password: v.string({ min: 8, max: 200, trim: false }), phone: v.phone().optional(),
    }, ctx.body);
    const userId = await signupCustomer(db, data);
    startSession(ctx, userId);
    ctx.status = 201;
    return { user: currentUser(db, userId) };
  });

  r.post('/api/auth/logout', { auth: 'optional' }, (ctx) => {
    destroySession(db, ctx.cookies[SESSION_COOKIE]);
    ctx.setCookie(SESSION_COOKIE, '', { maxAge: 0 });
    return { ok: true };
  });

  r.get('/api/auth/me', { auth: 'optional' }, (ctx) => ({ user: ctx.user ? currentUser(db, ctx.user.id) : null }));

  r.post('/api/auth/password', {}, async (ctx) => {
    const { currentPassword, newPassword } = validate({
      currentPassword: v.string({ min: 1, max: 200, trim: false }), newPassword: v.string({ min: 8, max: 200, trim: false }),
    }, ctx.body);
    await changePassword(db, ctx.user.id, currentPassword, newPassword);
    return { ok: true };
  });

  // ─── Customer self-service ──────────────────────────────────────────────────
  r.get('/api/me/orders', {}, (ctx) => {
    const c = customerOf(ctx);
    const q = validate({ page: v.int({ min: 1 }).default(1) }, ctx.query);
    const result = listOrders(db, { customerId: c.id, page: q.page, pageSize: 20, withItems: true });
    // Tracking tokens let the account page link to the tracking view.
    const tokens = new Map(db.all('SELECT id, tracking_token FROM orders WHERE customer_id = ?', c.id).map((o) => [o.id, o.tracking_token]));
    return {
      ...result,
      items: result.items.map((o) => ({
        id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, totalMillimes: o.totalMillimes,
        paymentMethod: o.paymentMethod, paymentStatus: o.paymentStatus, fulfillment: o.fulfillment, trackingToken: tokens.get(o.id),
        items: db.all('SELECT meal_id, kind, name, quantity, components_json FROM order_items WHERE order_id = ?', o.id).map((i) => ({
          mealId: i.meal_id, kind: i.kind, name: i.name, quantity: i.quantity,
          custom: i.kind === 'custom' ? JSON.parse(i.components_json).map((c2) => ({ ingredientId: c2.ingredientId, quantity: c2.quantity })) : null,
        })),
      })),
    };
  });

  r.patch('/api/me/profile', {}, (ctx) => {
    const data = validate({
      name: v.text({ max: 120 }).optional(), phone: v.phone().nullable(), city: v.string({ max: 80 }).nullable(), address: v.string({ max: 300 }).nullable(),
    }, ctx.body);
    const c = customerOf(ctx);
    if (data.phone && db.get('SELECT 1 FROM customers WHERE phone = ? AND id != ?', data.phone, c.id)) {
      throw badRequest('phone_taken', 'This phone number is linked to another customer — contact us to merge accounts');
    }
    db.tx(() => {
      db.run('UPDATE customers SET name = COALESCE(?, name), phone = ?, city = ?, address = ?, updated_at = ? WHERE id = ?',
        data.name ?? null, data.phone !== undefined ? data.phone : c.phone, data.city !== undefined ? data.city : c.city,
        data.address !== undefined ? data.address : c.address, nowIso(), c.id);
      if (data.name || data.phone !== undefined) {
        db.run('UPDATE users SET name = COALESCE(?, name), phone = ?, updated_at = ? WHERE id = ?', data.name ?? null, data.phone !== undefined ? data.phone : ctx.user.phone, nowIso(), ctx.user.id);
      }
    });
    return { user: currentUser(db, ctx.user.id) };
  });

  r.get('/api/me/favorites', {}, (ctx) => {
    const c = customerOf(ctx);
    return { mealIds: db.all('SELECT meal_id FROM favorites WHERE customer_id = ? ORDER BY created_at DESC', c.id).map((f) => f.meal_id) };
  });

  r.post('/api/me/favorites/:mealId', {}, (ctx) => {
    const c = customerOf(ctx);
    const mealId = Number(ctx.params.mealId);
    if (!db.get('SELECT 1 FROM meals WHERE id = ? AND archived_at IS NULL', mealId)) throw notFound('Meal');
    db.run('INSERT OR IGNORE INTO favorites (customer_id, meal_id) VALUES (?, ?)', c.id, mealId);
    return { ok: true };
  });

  r.delete('/api/me/favorites/:mealId', {}, (ctx) => {
    const c = customerOf(ctx);
    db.run('DELETE FROM favorites WHERE customer_id = ? AND meal_id = ?', c.id, Number(ctx.params.mealId));
    return { ok: true };
  });

  /** Data-driven suggestions (own history + "often ordered together" + best sellers). */
  r.get('/api/me/recommendations', { auth: 'optional' }, (ctx) => {
    const c = ctx.user ? db.get('SELECT id FROM customers WHERE user_id = ?', ctx.user.id) : null;
    return { items: recommendationsFor(db, c?.id ?? null) };
  });
}
