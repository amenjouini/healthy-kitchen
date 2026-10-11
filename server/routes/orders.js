/** Orders: customer checkout & tracking, staff workflow, payments, notifications. */
import { v, validate } from '../http/validate.js';
import { badRequest, notFound } from '../http/errors.js';
import { can } from '../http/router.js';
import { P } from '../../shared/permissions.js';
import { ORDER_STATUSES, ORDER_SOURCES, PAYMENT_STATUSES, REFUSAL_REASONS, CANCELLATION_REASONS } from '../../shared/orderStatus.js';
import { createOrder, getOrder, getOrderForCustomer, listOrders, transitionOrder, kitchenOverview } from '../services/orders.js';
import { markPaid, markFailed, refund } from '../services/payments.js';
import { listNotifications, markNotificationsRead } from '../services/notifications.js';
import { listIngredients } from '../services/ingredients.js';
import { stockForecast } from '../services/inventory.js';
import { computeAvailability, listMeals } from '../services/meals.js';

const itemSchema = v.object({
  mealId: v.id().optional(),
  custom: v.array(v.object({ ingredientId: v.id(), portions: v.int({ min: 1, max: 3 }).default(1) }), { min: 1, max: 10 }).optional(),
  quantity: v.int({ min: 1, max: 50 }),
  notes: v.string({ max: 200 }).optional(),
});

const baseOrderSchema = {
  items: v.array(itemSchema, { min: 1, max: 30 }),
  customer: v.object({ name: v.text({ max: 120 }), phone: v.phone(), email: v.email().optional() }),
  fulfillment: v.oneOf(['delivery', 'pickup']),
  zoneId: v.id().optional(),
  address: v.string({ max: 300 }).optional(),
  notes: v.string({ max: 500 }).optional(),
  paymentMethod: v.oneOf(['cash', 'online']),
  requestedFor: v.datetime().optional(),
};

function checkItems(items) {
  for (const it of items) {
    if (Boolean(it.mealId) === Boolean(it.custom)) throw badRequest('invalid_item', 'Each item needs either a meal or a custom selection');
  }
}

function checkRequestedFor(requestedFor) {
  if (!requestedFor) return;
  const t = Date.parse(requestedFor);
  if (t < Date.now() - 5 * 60_000 || t > Date.now() + 7 * 86400_000) throw badRequest('invalid_requested_for', 'Choose a time within the next 7 days');
}

function trackingResponse(db, number, ctx) {
  const token = ctx.query.t ?? ctx.body?.token;
  return { order: getOrderForCustomer(db, number, { token, customerUserId: ctx.user?.id }) };
}

export default function register(r, { db, config, kickOutbox }) {
  // ─── Customer ───────────────────────────────────────────────────────────────
  r.post('/api/orders', { auth: 'optional', rateLimit: 'order' }, (ctx) => {
    const input = validate(baseOrderSchema, ctx.body);
    checkItems(input.items);
    checkRequestedFor(input.requestedFor);
    // Totals, prices, nutrition and stock are computed server-side; any such fields sent by the client are ignored.
    const result = createOrder(db, { ...input, source: 'web' }, { actor: ctx.actor, isStaff: false, userId: ctx.user?.id ?? null });
    kickOutbox();
    ctx.status = 201;
    return { order: result };
  });

  r.get('/api/track/:number', { auth: 'optional', rateLimit: 'track' }, (ctx) => trackingResponse(db, ctx.params.number, ctx));

  /** A signed-in customer may cancel their own order while it is still "new". */
  r.post('/api/track/:number/cancel', {}, (ctx) => {
    // Only the owner's account may cancel; anyone else gets 404 (no hint that the order exists).
    const order = db.get(
      'SELECT o.id FROM orders o JOIN customers c ON c.id = o.customer_id WHERE o.number = ? AND c.user_id = ?', ctx.params.number, ctx.user.id,
    );
    if (!order) throw notFound('Order');
    transitionOrder(db, order.id, 'cancelled', { reason: 'customer_request' }, { actor: ctx.actor, permissions: [], customerUserId: ctx.user.id });
    kickOutbox();
    return trackingResponse(db, ctx.params.number, ctx);
  });

  // ─── Staff ──────────────────────────────────────────────────────────────────
  r.post('/api/staff/orders', { perm: P.ORDERS_CREATE }, (ctx) => {
    const input = validate({
      ...baseOrderSchema,
      customer: v.object({ name: v.text({ max: 120 }), phone: v.phone().optional(), email: v.email().optional() }),
      source: v.oneOf(ORDER_SOURCES.filter((s) => s !== 'web')),
      city: v.string({ max: 80 }).optional(),
      paymentStatus: v.oneOf(['pending', 'paid']).default('pending'),
      paymentReference: v.string({ max: 120 }).optional(),
      whatsappConversationId: v.id().optional(),
    }, ctx.body);
    checkItems(input.items);
    checkRequestedFor(input.requestedFor);
    if (input.paymentStatus === 'paid') {
      const allowed = can(ctx, P.PAYMENTS_MANAGE) || (input.paymentMethod === 'cash' && can(ctx, P.PAYMENTS_COLLECT));
      if (!allowed) throw badRequest('payment_permission', 'You cannot record this payment as paid');
      if (input.paymentMethod === 'online' && !input.paymentReference) throw badRequest('reference_required', 'Online payments need a transaction reference');
    }
    if (input.source === 'whatsapp' && input.whatsappConversationId && !db.get('SELECT 1 FROM whatsapp_conversations WHERE id = ?', input.whatsappConversationId)) {
      throw notFound('Conversation');
    }
    const result = createOrder(db, input, { actor: ctx.actor, isStaff: true });
    kickOutbox();
    ctx.status = 201;
    return { order: result };
  });

  r.get('/api/orders', { perm: P.ORDERS_VIEW }, (ctx) => {
    const f = validate({
      status: v.string({ max: 100, pattern: new RegExp(`^(${ORDER_STATUSES.join('|')})(,(${ORDER_STATUSES.join('|')}))*$`) }).optional(),
      active: v.boolean().optional(), late: v.boolean().optional(), search: v.string({ max: 100 }).optional(), city: v.string({ max: 80 }).optional(),
      paymentMethod: v.oneOf(['cash', 'online']).optional(), paymentStatus: v.oneOf(PAYMENT_STATUSES).optional(),
      source: v.oneOf(ORDER_SOURCES).optional(), fulfillment: v.oneOf(['delivery', 'pickup']).optional(),
      customerId: v.id().optional(), from: v.datetime().optional(), to: v.datetime().optional(),
      withItems: v.boolean().optional(), sort: v.oneOf(['newest', 'oldest']).optional(),
      page: v.int({ min: 1 }).default(1), pageSize: v.int({ min: 1, max: 200 }).default(50),
    }, ctx.query);
    return listOrders(db, f);
  });

  r.get('/api/orders/:id', { perm: P.ORDERS_VIEW }, (ctx) => ({
    order: getOrder(db, ctx.params.id, { view: can(ctx, P.FINANCE_VIEW) || can(ctx, P.PAYMENTS_MANAGE) ? 'finance' : 'staff' }),
  }));

  r.post('/api/orders/:id/transition', { anyPerm: [P.ORDERS_MANAGE, P.ORDERS_CANCEL] }, (ctx) => {
    const data = validate({
      to: v.oneOf(ORDER_STATUSES),
      reason: v.oneOf([...new Set([...REFUSAL_REASONS, ...CANCELLATION_REASONS])]).optional(),
      note: v.string({ max: 500 }).optional(),
      collectCash: v.boolean().optional(),
    }, ctx.body);
    const id = Number(ctx.params.id);
    transitionOrder(db, id, data.to, data, { actor: ctx.actor, permissions: ctx.permissions });
    kickOutbox();
    return { order: getOrder(db, id, { view: can(ctx, P.FINANCE_VIEW) ? 'finance' : 'staff' }) };
  });

  // ─── Payments on an order ──────────────────────────────────────────────────
  r.post('/api/orders/:id/payment/paid', { anyPerm: [P.PAYMENTS_COLLECT, P.PAYMENTS_MANAGE] }, (ctx) => {
    const data = validate({ method: v.oneOf(['cash', 'online']).optional(), reference: v.string({ max: 120 }).optional(), notes: v.string({ max: 300 }).optional() }, ctx.body);
    const payments = markPaid(db, ctx.actor, ctx.permissions, Number(ctx.params.id), data);
    kickOutbox();
    return { payments };
  });

  r.post('/api/orders/:id/payment/failed', { perm: P.PAYMENTS_MANAGE }, (ctx) => {
    const data = validate({ notes: v.string({ max: 300 }).optional() }, ctx.body);
    return { payments: markFailed(db, ctx.actor, Number(ctx.params.id), data) };
  });

  r.post('/api/orders/:id/payment/refund', { perm: P.PAYMENTS_MANAGE }, (ctx) => {
    const data = validate({ amount: v.money().optional(), reason: v.text({ max: 300 }) }, ctx.body);
    return { payments: refund(db, ctx.actor, Number(ctx.params.id), { amountMillimes: data.amount, reason: data.reason }) };
  });

  // ─── Kitchen overview ──────────────────────────────────────────────────────
  r.get('/api/staff/overview', { perm: P.ORDERS_VIEW }, (ctx) => {
    const overview = kitchenOverview(db, config);
    if (can(ctx, P.INVENTORY_VIEW)) {
      overview.lowStock = listIngredients(db, { stock: 'low' }).map((i) => ({
        id: i.id, name: i.name, baseUnit: i.baseUnit, availableQty: i.availableQty, reorderLevel: i.reorderLevel, stockState: i.stockState,
      }));
      overview.forecast = stockForecast(db).filter((f) => f.daysLeft != null && f.daysLeft < 3).slice(0, 8);
      const meals = listMeals(db);
      const availability = computeAvailability(db, meals);
      overview.mealsAtRisk = meals.filter((m) => ['low_stock', 'out_of_stock'].includes(availability.get(m.id).state))
        .map((m) => ({ id: m.id, name: m.name, state: availability.get(m.id).state, servingsPossible: availability.get(m.id).servingsPossible }));
    }
    return overview;
  });

  // ─── Notifications ─────────────────────────────────────────────────────────
  r.get('/api/notifications', {}, (ctx) => {
    const q = validate({ unreadOnly: v.boolean().optional(), limit: v.int({ min: 1, max: 100 }).default(30) }, ctx.query);
    return listNotifications(db, { userId: ctx.user.id, permissions: ctx.permissions, ...q });
  });

  r.post('/api/notifications/read', {}, (ctx) => {
    const { ids } = validate({ ids: v.array(v.id(), { max: 500 }).optional() }, ctx.body);
    markNotificationsRead(db, { userId: ctx.user.id, permissions: ctx.permissions, ids });
    return { ok: true };
  });
}
