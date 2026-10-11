/** Back-office: customers, staff & roles, payments, finance, analytics, audit, uploads. */
import { v, validate } from '../http/validate.js';
import { badRequest, forbidden } from '../http/errors.js';
import { can, requirePerm } from '../http/router.js';
import { P, ALL_PERMISSIONS } from '../../shared/permissions.js';
import { listCustomers, getCustomer, updateCustomer } from '../services/customers.js';
import { listStaff, createStaff, updateStaff, listRoles, saveRole, deleteRole } from '../services/users.js';
import { listPayments } from '../services/payments.js';
import {
  financeOverview, listExpenses, createExpense, updateExpense, deleteExpense, EXPENSE_CATEGORIES,
  listSalaryPayments, saveSalaryPayment, generateSalaryPeriod,
} from '../services/finance.js';
import { mealAnalytics, ingredientAnalytics, cityAnalytics, timeAnalytics, summary, rangeToTimestamps } from '../services/analytics.js';
import { computeInsights } from '../services/insights.js';
import { listAudit } from '../services/audit.js';
import { saveUpload, readPrivateUpload } from '../services/uploads.js';
import { outboxStats } from '../services/whatsapp.js';
import { listMeals } from '../services/meals.js';

/** Default range: last 30 days in business time. */
function rangeQuery(ctx) {
  const offset = ctx.config.utcOffsetMinutes;
  const today = new Date(Date.now() + offset * 60_000).toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() + offset * 60_000 - 29 * 86400_000).toISOString().slice(0, 10);
  const q = validate({ from: v.date().default(monthAgo), to: v.date().default(today) }, ctx.query);
  if (q.from > q.to) throw badRequest('invalid_range', '"from" must be before "to"');
  return q;
}

function actorCtx(ctx) {
  return { userId: ctx.user.id, roleId: ctx.user.role_id, roleKey: ctx.roleKey, permissions: ctx.permissions };
}

export default function register(r, { db, config, whatsapp }) {
  // ─── Customers ──────────────────────────────────────────────────────────────
  r.get('/api/customers', { perm: P.CUSTOMERS_VIEW }, (ctx) => listCustomers(db, validate({
    search: v.string({ max: 100 }).optional(), city: v.string({ max: 80 }).optional(),
    segment: v.oneOf(['new', 'regular', 'frequent', 'high_value', 'lapsed']).optional(),
    sort: v.oneOf(['recent', 'spent', 'orders', 'name']).optional(),
    page: v.int({ min: 1 }).default(1), pageSize: v.int({ min: 1, max: 200 }).default(50),
  }, ctx.query)));

  r.get('/api/customers/:id', { perm: P.CUSTOMERS_VIEW }, (ctx) => ({ customer: getCustomer(db, Number(ctx.params.id)) }));

  r.patch('/api/customers/:id', { perm: P.CUSTOMERS_VIEW, anyPerm: [P.ORDERS_MANAGE, P.STAFF_MANAGE] }, (ctx) => ({
    customer: updateCustomer(db, ctx.actor, Number(ctx.params.id), validate({
      name: v.text({ max: 120 }).optional(), phone: v.phone().optional(), email: v.email().nullable(),
      city: v.string({ max: 80 }).nullable(), address: v.string({ max: 300 }).nullable(), notes: v.string({ max: 1000 }).nullable(),
    }, ctx.body)),
  }));

  // ─── Staff & roles ──────────────────────────────────────────────────────────
  r.get('/api/staff', { perm: P.STAFF_VIEW }, (ctx) => ({
    items: listStaff(db, { includeSalary: can(ctx, P.SALARIES_MANAGE), search: ctx.query.search }),
  }));

  const staffSchema = (partial) => ({
    name: partial ? v.text({ max: 120 }).optional() : v.text({ max: 120 }),
    email: partial ? v.email().optional() : v.email(),
    phone: v.phone().nullable(),
    password: partial ? v.string({ min: 8, max: 200, trim: false }).optional() : v.string({ min: 8, max: 200, trim: false }),
    roleId: partial ? v.id().optional() : v.id(),
    isActive: v.boolean().optional(),
    jobTitle: v.string({ max: 80 }).nullable(), hireDate: v.date().nullable(),
    salary: v.money().nullable(), salaryPeriod: v.oneOf(['monthly', 'weekly', 'daily', 'hourly']).optional(),
    staffNotes: v.string({ max: 1000 }).nullable(),
  });
  const staffInput = (ctx, d) => {
    if ((d.salary !== undefined || d.salaryPeriod) && !can(ctx, P.SALARIES_MANAGE)) throw forbidden('Salary changes require salary permission');
    const { salary, ...rest } = d;
    return salary !== undefined ? { ...rest, salaryMillimes: salary } : rest;
  };

  r.post('/api/staff', { perm: P.STAFF_MANAGE }, async (ctx) => {
    ctx.status = 201;
    return { user: await createStaff(db, ctx.actor, actorCtx(ctx), staffInput(ctx, validate(staffSchema(false), ctx.body))) };
  });

  r.patch('/api/staff/:id', { perm: P.STAFF_MANAGE }, async (ctx) => ({
    user: await updateStaff(db, ctx.actor, actorCtx(ctx), Number(ctx.params.id), staffInput(ctx, validate(staffSchema(true), ctx.body))),
  }));

  r.get('/api/roles', { anyPerm: [P.STAFF_VIEW, P.ROLES_MANAGE] }, () => ({ items: listRoles(db), allPermissions: ALL_PERMISSIONS }));

  const roleSchema = { name: v.text({ max: 60 }), description: v.string({ max: 200 }).nullable(), permissions: v.array(v.string({ max: 60 }), { max: 100 }) };
  r.post('/api/roles', { perm: P.ROLES_MANAGE }, (ctx) => ({ role: saveRole(db, ctx.actor, actorCtx(ctx), null, validate(roleSchema, ctx.body)) }));
  r.patch('/api/roles/:id', { perm: P.ROLES_MANAGE }, (ctx) => ({ role: saveRole(db, ctx.actor, actorCtx(ctx), Number(ctx.params.id), validate(roleSchema, ctx.body)) }));
  r.delete('/api/roles/:id', { perm: P.ROLES_MANAGE }, (ctx) => { deleteRole(db, ctx.actor, Number(ctx.params.id)); return { ok: true }; });

  // ─── Payments ───────────────────────────────────────────────────────────────
  r.get('/api/payments', { anyPerm: [P.FINANCE_VIEW, P.PAYMENTS_MANAGE] }, (ctx) => listPayments(db, validate({
    status: v.oneOf(['pending', 'paid', 'failed', 'refunded', 'partially_refunded', 'cancelled']).optional(),
    method: v.oneOf(['cash', 'online']).optional(), search: v.string({ max: 100 }).optional(),
    from: v.datetime().optional(), to: v.datetime().optional(),
    page: v.int({ min: 1 }).default(1), pageSize: v.int({ min: 1, max: 200 }).default(50),
  }, ctx.query)));

  // ─── Finance ────────────────────────────────────────────────────────────────
  r.get('/api/finance/overview', { perm: P.FINANCE_VIEW }, (ctx) => financeOverview(db, { ...rangeQuery(ctx), utcOffsetMinutes: config.utcOffsetMinutes }));

  r.get('/api/finance/meal-margins', { perm: P.FINANCE_VIEW }, () => ({
    items: listMeals(db, { includeCost: true, sort: 'popularity' }).map((m) => ({
      id: m.id, name: m.name, priceMillimes: m.priceMillimes, costPerServing: m.costPerServing, costComplete: m.costComplete,
      marginMillimes: m.marginMillimes, marginPct: m.marginPct, unitsSold30d: m.unitsSold30d,
    })),
  }));

  const expenseSchema = (partial) => ({
    category: partial ? v.oneOf(EXPENSE_CATEGORIES).optional() : v.oneOf(EXPENSE_CATEGORIES),
    amount: partial ? v.money().optional() : v.money(),
    expenseDate: partial ? v.date().optional() : v.date(),
    description: partial ? v.text({ max: 300 }).optional() : v.text({ max: 300 }),
    reference: v.string({ max: 120 }).nullable(),
    attachmentId: v.string({ max: 32, pattern: /^[a-f0-9]{32}$/ }).nullable(),
  });
  const expenseInput = ({ amount, ...rest }) => (amount !== undefined ? { ...rest, amountMillimes: amount } : rest);

  r.get('/api/expenses', { perm: P.FINANCE_VIEW }, (ctx) => listExpenses(db, validate({
    category: v.oneOf(EXPENSE_CATEGORIES).optional(), from: v.date().optional(), to: v.date().optional(), search: v.string({ max: 100 }).optional(),
    page: v.int({ min: 1 }).default(1), pageSize: v.int({ min: 1, max: 200 }).default(50),
  }, ctx.query)));
  r.post('/api/expenses', { perm: P.EXPENSES_MANAGE }, (ctx) => { ctx.status = 201; return { expense: createExpense(db, ctx.actor, expenseInput(validate(expenseSchema(false), ctx.body))) }; });
  r.patch('/api/expenses/:id', { perm: P.EXPENSES_MANAGE }, (ctx) => ({ expense: updateExpense(db, ctx.actor, Number(ctx.params.id), expenseInput(validate(expenseSchema(true), ctx.body))) }));
  r.delete('/api/expenses/:id', { perm: P.EXPENSES_MANAGE }, (ctx) => { deleteExpense(db, ctx.actor, Number(ctx.params.id)); return { ok: true }; });

  const period = () => v.string({ pattern: /^\d{4}-(0[1-9]|1[0-2])$|^\d{4}-W\d{2}$/, max: 8 });
  r.get('/api/salaries', { perm: P.SALARIES_MANAGE }, (ctx) => ({
    items: listSalaryPayments(db, validate({ period: period().optional(), userId: v.id().optional(), status: v.oneOf(['pending', 'paid', 'cancelled']).optional() }, ctx.query)),
  }));
  r.post('/api/salaries/generate', { perm: P.SALARIES_MANAGE }, (ctx) => generateSalaryPeriod(db, ctx.actor, validate({ period: period() }, ctx.body).period));
  const salarySchema = (partial) => ({
    userId: partial ? v.id().optional() : v.id(), period: partial ? period().optional() : period(),
    amount: partial ? v.money().optional() : v.money(), status: v.oneOf(['pending', 'paid', 'cancelled']).optional(),
    paidAt: v.date().optional(), notes: v.string({ max: 500 }).nullable(),
  });
  const salaryInput = ({ amount, ...rest }) => (amount !== undefined ? { ...rest, amountMillimes: amount } : rest);
  r.post('/api/salaries', { perm: P.SALARIES_MANAGE }, (ctx) => { ctx.status = 201; return { salary: saveSalaryPayment(db, ctx.actor, null, salaryInput(validate(salarySchema(false), ctx.body))) }; });
  r.patch('/api/salaries/:id', { perm: P.SALARIES_MANAGE }, (ctx) => ({ salary: saveSalaryPayment(db, ctx.actor, Number(ctx.params.id), salaryInput(validate(salarySchema(true), ctx.body))) }));

  // ─── Analytics & insights ──────────────────────────────────────────────────
  r.get('/api/analytics', { perm: P.ANALYTICS_VIEW }, (ctx) => {
    const range = rangeQuery(ctx);
    const ts = rangeToTimestamps(range.from, range.to, config.utcOffsetMinutes);
    const finance = can(ctx, P.FINANCE_VIEW);
    let meals = mealAnalytics(db, ts);
    let ingredients = ingredientAnalytics(db, ts);
    if (!finance) {
      // Margin/cost figures are financial information.
      meals = meals.map(({ estimatedCostMillimes, estimatedMarginMillimes, currentCostPerServing, currentMarginPct, ...m }) => m);
      ingredients = ingredients.map(({ usedCostMillimes, wastedCostMillimes, costPerUnit, ...i }) => i);
    }
    return {
      range, summary: summary(db, ts), meals, ingredients, cities: cityAnalytics(db, ts),
      time: timeAnalytics(db, { ...ts, utcOffsetMinutes: config.utcOffsetMinutes }),
    };
  });

  r.get('/api/insights', { perm: P.ANALYTICS_VIEW }, (ctx) => {
    let items = computeInsights(db, config);
    if (!can(ctx, P.FINANCE_VIEW)) items = items.filter((i) => !['high_sales_low_margin', 'expensive_ingredient'].includes(i.type));
    return { items };
  });

  // ─── Audit & system ─────────────────────────────────────────────────────────
  r.get('/api/audit', { perm: P.AUDIT_VIEW }, (ctx) => listAudit(db, validate({
    entityType: v.string({ max: 40 }).optional(), entityId: v.string({ max: 40 }).optional(), userId: v.id().optional(),
    action: v.string({ max: 60 }).optional(), from: v.datetime().optional(), to: v.datetime().optional(),
    page: v.int({ min: 1 }).default(1), pageSize: v.int({ min: 1, max: 200 }).default(50),
  }, ctx.query)));

  r.get('/api/system/status', { anyPerm: [P.SETTINGS_MANAGE, P.WHATSAPP_USE] }, () => ({
    whatsapp: { connected: Boolean(whatsapp), provider: whatsapp?.name ?? null, outbox: outboxStats(db) },
    payments: { onlineProvider: config.payments.provider || null },
  }));

  // ─── Uploads ───────────────────────────────────────────────────────────────
  r.post('/api/uploads', { anyPerm: [P.MEALS_CREATE, P.MEALS_EDIT, P.EXPENSES_MANAGE] }, (ctx) => {
    const data = validate({
      fileName: v.text({ max: 200 }), mime: v.oneOf(['image/jpeg', 'image/png', 'image/webp', 'application/pdf']),
      dataBase64: v.string({ min: 4, max: 7_500_000 }), visibility: v.oneOf(['public', 'private']),
    }, ctx.body);
    if (data.visibility === 'public') requirePerm(ctx, can(ctx, P.MEALS_EDIT) ? P.MEALS_EDIT : P.MEALS_CREATE);
    else requirePerm(ctx, P.EXPENSES_MANAGE);
    ctx.status = 201;
    return { upload: saveUpload(db, ctx.actor, config.uploadsDir, data) };
  });

  r.get('/api/uploads/:id', { perm: P.FINANCE_VIEW }, (ctx) => {
    const { row, buffer } = readPrivateUpload(db, config.uploadsDir, ctx.params.id);
    ctx.rawResponse = {
      headers: { 'Content-Type': row.mime, 'Content-Disposition': `inline; filename="${row.file_name.replace(/[^\w.-]/g, '_')}"`, 'Cache-Control': 'private, no-store' },
      body: buffer,
    };
  });
}
