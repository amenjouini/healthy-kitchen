/**
 * Expenses, salaries and the management accounting overview.
 *
 * This is management reporting, NOT statutory accounting: revenue is cash-basis
 * (payments received minus refunds, by payment date), costs of goods are ESTIMATES
 * from recipe cost snapshots, and no tax/VAT handling is performed.
 * Paid salaries automatically post a linked expense, so all costs come from one table.
 */
import { nowIso } from '../db/database.js';
import { badRequest, conflict, notFound } from '../http/errors.js';
import { audit } from './audit.js';

export const EXPENSE_CATEGORIES = ['ingredients', 'packaging', 'delivery', 'salaries', 'rent', 'marketing', 'utilities', 'equipment', 'other'];

function mapExpense(e) {
  return {
    id: e.id, category: e.category, amountMillimes: e.amount_millimes, expenseDate: e.expense_date, description: e.description,
    reference: e.reference, attachmentId: e.attachment_id, salaryPaymentId: e.salary_payment_id,
    inventoryMovementId: e.inventory_movement_id, createdBy: e.created_by_name ?? null, createdAt: e.created_at,
  };
}

export function listExpenses(db, { category, from, to, search, page = 1, pageSize = 50 }) {
  const where = [];
  const params = [];
  if (category) { where.push('e.category = ?'); params.push(category); }
  if (from) { where.push('e.expense_date >= ?'); params.push(from); }
  if (to) { where.push('e.expense_date <= ?'); params.push(to); }
  if (search) { where.push('(e.description LIKE ? OR e.reference LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
  const clause = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const summary = db.get(`SELECT COUNT(*) AS n, COALESCE(SUM(amount_millimes), 0) AS total FROM expenses e ${clause}`, ...params);
  const items = db.all(
    `SELECT e.*, u.name AS created_by_name FROM expenses e LEFT JOIN users u ON u.id = e.created_by ${clause}
     ORDER BY e.expense_date DESC, e.id DESC LIMIT ? OFFSET ?`, ...params, pageSize, (page - 1) * pageSize,
  ).map(mapExpense);
  return { total: summary.n, totalMillimes: summary.total, page, pageSize, items };
}

export function createExpense(db, actor, data) {
  return db.tx(() => {
    const ts = nowIso();
    const { lastInsertRowid: id } = db.run(
      `INSERT INTO expenses (category, amount_millimes, expense_date, description, reference, attachment_id, salary_payment_id,
         inventory_movement_id, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      data.category, data.amountMillimes, data.expenseDate, data.description, data.reference ?? null, data.attachmentId ?? null,
      data.salaryPaymentId ?? null, data.inventoryMovementId ?? null, actor?.userId ?? null, ts, ts,
    );
    audit(db, actor, 'expense.create', 'expense', id, undefined, data);
    return mapExpense(db.get('SELECT * FROM expenses WHERE id = ?', id));
  });
}

export function updateExpense(db, actor, id, data) {
  return db.tx(() => {
    const before = db.get('SELECT * FROM expenses WHERE id = ?', id);
    if (!before) throw notFound('Expense');
    if (before.salary_payment_id) throw conflict('linked_expense', 'Salary expenses are managed from the salary payment');
    db.run(
      `UPDATE expenses SET category = ?, amount_millimes = ?, expense_date = ?, description = ?, reference = ?, attachment_id = ?, updated_at = ? WHERE id = ?`,
      data.category ?? before.category, data.amountMillimes ?? before.amount_millimes, data.expenseDate ?? before.expense_date,
      data.description ?? before.description, data.reference !== undefined ? data.reference : before.reference,
      data.attachmentId !== undefined ? data.attachmentId : before.attachment_id, nowIso(), id,
    );
    const after = db.get('SELECT * FROM expenses WHERE id = ?', id);
    audit(db, actor, 'expense.update', 'expense', id, mapExpense(before), mapExpense(after));
    return mapExpense(after);
  });
}

export function deleteExpense(db, actor, id) {
  return db.tx(() => {
    const before = db.get('SELECT * FROM expenses WHERE id = ?', id);
    if (!before) throw notFound('Expense');
    if (before.salary_payment_id) throw conflict('linked_expense', 'Salary expenses are managed from the salary payment');
    db.run('DELETE FROM expenses WHERE id = ?', id);
    audit(db, actor, 'expense.delete', 'expense', id, mapExpense(before), undefined);
  });
}

// ─── Salaries ────────────────────────────────────────────────────────────────

function mapSalary(s) {
  return {
    id: s.id, userId: s.user_id, employeeName: s.employee_name, period: s.period, amountMillimes: s.amount_millimes,
    status: s.status, paidAt: s.paid_at, notes: s.notes, createdAt: s.created_at,
  };
}

export function listSalaryPayments(db, { period, userId, status }) {
  const where = [];
  const params = [];
  if (period) { where.push('s.period = ?'); params.push(period); }
  if (userId) { where.push('s.user_id = ?'); params.push(userId); }
  if (status) { where.push('s.status = ?'); params.push(status); }
  return db.all(
    `SELECT s.*, u.name AS employee_name FROM salary_payments s JOIN users u ON u.id = s.user_id
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY s.period DESC, u.name`, ...params,
  ).map(mapSalary);
}

/** Create pending salary lines for every active staff member with a salary, for a period. */
export function generateSalaryPeriod(db, actor, period) {
  return db.tx(() => {
    const staff = db.all(
      `SELECT u.id, sp.salary_millimes FROM users u JOIN roles r ON r.id = u.role_id JOIN staff_profiles sp ON sp.user_id = u.id
       WHERE r.is_staff = 1 AND u.is_active = 1 AND sp.salary_millimes > 0`,
    );
    let created = 0;
    const ts = nowIso();
    for (const s of staff) {
      const r = db.run(
        `INSERT OR IGNORE INTO salary_payments (user_id, period, amount_millimes, status, created_by, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?)`,
        s.id, period, s.salary_millimes, actor?.userId ?? null, ts, ts,
      );
      created += r.changes;
    }
    audit(db, actor, 'salary.generate', 'salary_period', period, undefined, { created });
    return { created };
  });
}

export function saveSalaryPayment(db, actor, id, data) {
  return db.tx(() => {
    const ts = nowIso();
    let row;
    if (id) {
      row = db.get('SELECT * FROM salary_payments WHERE id = ?', id);
      if (!row) throw notFound('Salary payment');
      db.run(
        'UPDATE salary_payments SET amount_millimes = ?, notes = ?, updated_at = ? WHERE id = ?',
        data.amountMillimes ?? row.amount_millimes, data.notes !== undefined ? data.notes : row.notes, ts, id,
      );
      if (row.status === 'paid' && data.amountMillimes != null) {
        db.run('UPDATE expenses SET amount_millimes = ?, updated_at = ? WHERE salary_payment_id = ?', data.amountMillimes, ts, id);
      }
    } else {
      if (!db.get('SELECT 1 FROM users WHERE id = ?', data.userId)) throw badRequest('unknown_user', 'Unknown employee');
      if (db.get('SELECT 1 FROM salary_payments WHERE user_id = ? AND period = ?', data.userId, data.period)) {
        throw conflict('salary_exists', 'A salary line already exists for this employee and period');
      }
      id = db.run(
        `INSERT INTO salary_payments (user_id, period, amount_millimes, status, notes, created_by, created_at, updated_at) VALUES (?, ?, ?, 'pending', ?, ?, ?, ?)`,
        data.userId, data.period, data.amountMillimes, data.notes ?? null, actor?.userId ?? null, ts, ts,
      ).lastInsertRowid;
    }
    if (data.status && data.status !== (row?.status ?? 'pending')) setSalaryStatus(db, actor, id, data.status, data.paidAt);
    const after = db.get('SELECT s.*, u.name AS employee_name FROM salary_payments s JOIN users u ON u.id = s.user_id WHERE s.id = ?', id);
    audit(db, actor, row ? 'salary.update' : 'salary.create', 'salary_payment', id, row ? mapSalary(row) : undefined, mapSalary(after));
    return mapSalary(after);
  });
}

function setSalaryStatus(db, actor, id, status, paidAt) {
  const s = db.get('SELECT s.*, u.name AS employee_name FROM salary_payments s JOIN users u ON u.id = s.user_id WHERE s.id = ?', id);
  const ts = nowIso();
  if (status === 'paid') {
    const date = paidAt ?? ts.slice(0, 10);
    db.run(`UPDATE salary_payments SET status = 'paid', paid_at = ?, updated_at = ? WHERE id = ?`, date, ts, id);
    db.run(
      `INSERT INTO expenses (category, amount_millimes, expense_date, description, salary_payment_id, created_by, created_at, updated_at)
       VALUES ('salaries', ?, ?, ?, ?, ?, ?, ?)`,
      s.amount_millimes, date, `Salary ${s.period} — ${s.employee_name}`, id, actor?.userId ?? null, ts, ts,
    );
  } else {
    db.run('UPDATE salary_payments SET status = ?, paid_at = NULL, updated_at = ? WHERE id = ?', status, ts, id);
    db.run('DELETE FROM expenses WHERE salary_payment_id = ?', id);
  }
  audit(db, actor, `salary.${status}`, 'salary_payment', id, { status: s.status }, { status });
}

// ─── Overview ────────────────────────────────────────────────────────────────

/**
 * @param {{ from: string, to: string }} range ISO dates (YYYY-MM-DD), inclusive.
 */
export function financeOverview(db, { from, to, utcOffsetMinutes = 60 }) {
  const fromTs = new Date(Date.parse(`${from}T00:00:00Z`) - utcOffsetMinutes * 60_000).toISOString();
  const toTs = new Date(Date.parse(`${to}T00:00:00Z`) + 86400_000 - utcOffsetMinutes * 60_000).toISOString();
  const shift = `${utcOffsetMinutes >= 0 ? '+' : ''}${utcOffsetMinutes} minutes`;

  const revenue = db.get(
    `SELECT COALESCE(SUM(amount_millimes), 0) AS gross, COALESCE(SUM(refunded_millimes), 0) AS refunded
     FROM payments WHERE status IN ('paid','refunded','partially_refunded') AND paid_at >= ? AND paid_at < ?`, fromTs, toTs,
  );
  const byMethod = db.all(
    `SELECT method, COUNT(*) AS n, COALESCE(SUM(amount_millimes - refunded_millimes), 0) AS net FROM payments
     WHERE status IN ('paid','refunded','partially_refunded') AND paid_at >= ? AND paid_at < ? GROUP BY method`, fromTs, toTs,
  );
  const expensesByCategory = db.all(
    `SELECT category, COALESCE(SUM(amount_millimes), 0) AS total, COUNT(*) AS n FROM expenses
     WHERE expense_date >= ? AND expense_date <= ? GROUP BY category ORDER BY total DESC`, from, to,
  );
  const expenses = expensesByCategory.reduce((s, e) => s + e.total, 0);
  const orders = db.get(
    `SELECT COUNT(*) AS total, SUM(status = 'completed') AS completed, SUM(status = 'refused') AS refused, SUM(status = 'cancelled') AS cancelled,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN total_millimes END), 0) AS completed_value,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN estimated_cost_millimes END), 0) AS est_cogs,
       COALESCE(SUM(CASE WHEN status = 'completed' THEN subtotal_millimes - discount_millimes END), 0) AS food_sales
     FROM orders WHERE created_at >= ? AND created_at < ?`, fromTs, toTs,
  );
  const outstanding = db.get(
    `SELECT COUNT(*) AS n, COALESCE(SUM(total_millimes), 0) AS total FROM orders WHERE status = 'completed' AND payment_status = 'pending'`,
  );
  const daily = db.all(
    `SELECT date(paid_at, ?) AS day, SUM(amount_millimes - refunded_millimes) AS revenue FROM payments
     WHERE status IN ('paid','refunded','partially_refunded') AND paid_at >= ? AND paid_at < ? GROUP BY day ORDER BY day`, shift, fromTs, toTs,
  );
  const dailyExpenses = db.all(
    `SELECT expense_date AS day, SUM(amount_millimes) AS expenses FROM expenses WHERE expense_date >= ? AND expense_date <= ? GROUP BY day`, from, to,
  );
  const series = new Map();
  for (const d of daily) series.set(d.day, { day: d.day, revenue: d.revenue, expenses: 0 });
  for (const d of dailyExpenses) series.set(d.day, { ...(series.get(d.day) ?? { day: d.day, revenue: 0 }), expenses: d.expenses });

  const netRevenue = revenue.gross - revenue.refunded;
  return {
    range: { from, to },
    revenue: { grossMillimes: revenue.gross, refundedMillimes: revenue.refunded, netMillimes: netRevenue },
    expenses: { totalMillimes: expenses, byCategory: expensesByCategory.map((e) => ({ category: e.category, totalMillimes: e.total, count: e.n })) },
    estimatedResultMillimes: netRevenue - expenses,
    orders: {
      total: orders.total, completed: orders.completed ?? 0, refused: orders.refused ?? 0, cancelled: orders.cancelled ?? 0,
      averageOrderMillimes: orders.completed ? Math.round(orders.completed_value / orders.completed) : 0,
    },
    estimatedGrossMargin: {
      foodSalesMillimes: orders.food_sales, estimatedIngredientCostMillimes: Math.round(orders.est_cogs),
      marginMillimes: Math.round(orders.food_sales - orders.est_cogs),
      marginPct: orders.food_sales > 0 ? ((orders.food_sales - orders.est_cogs) / orders.food_sales) * 100 : null,
    },
    paymentMethods: byMethod.map((m) => ({ method: m.method, count: m.n, netMillimes: m.net })),
    outstandingCash: { orders: outstanding.n, totalMillimes: outstanding.total },
    series: [...series.values()].sort((a, b) => a.day.localeCompare(b.day)),
  };
}
