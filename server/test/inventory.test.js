import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, loggedIn, mealByEn, ingredientByEn, guestOrder } from './helpers.js';

let ctx;
before(async () => { ctx = await startTestServer({ stock: 10_000 }); });
after(async () => { await ctx.close(); });

function setStock(name, qty) {
  const ing = ingredientByEn(ctx.db, name);
  ctx.db.run('UPDATE ingredients SET stock_qty = ? WHERE id = ?', qty, ing.id);
  ctx.db.run(`UPDATE inventory_reservations SET status = 'released' WHERE ingredient_id = ?`, ing.id);
  return ing;
}

test('insufficient stock blocks the order with details; enough stock succeeds', async () => {
  const meal = mealByEn(ctx.db, 'Protein Harvest'); // 150 g chicken / serving
  setStock('Organic Chicken', 400);
  const tooMany = await client(ctx.base).post('/api/orders', { ...guestOrder(meal.id), items: [{ mealId: meal.id, quantity: 3 }] });
  assert.equal(tooMany.status, 409);
  assert.equal(tooMany.body.error.code, 'insufficient_stock');
  assert.equal(tooMany.body.error.details.shortages[0].name, 'Poulet Bio');
  assert.equal(tooMany.body.error.details.shortages[0].required, 450);
  const ok = await client(ctx.base).post('/api/orders', { ...guestOrder(meal.id), items: [{ mealId: meal.id, quantity: 2 }] });
  assert.equal(ok.status, 201);
  // 100 g left available → meal is now out of stock for customers
  const catalog = await client(ctx.base).get('/api/catalog/meals');
  assert.equal(catalog.body.items.find((m) => m.id === meal.id).availability, 'out_of_stock');
});

test('simultaneous orders for the last portion: exactly one succeeds (no overselling)', async () => {
  const meal = mealByEn(ctx.db, 'Protein Harvest');
  setStock('Organic Chicken', 150);
  const results = await Promise.all(Array.from({ length: 5 }, () => client(ctx.base).post('/api/orders', guestOrder(meal.id))));
  assert.equal(results.filter((r) => r.status === 201).length, 1);
  assert.equal(results.filter((r) => r.status === 409).length, 4);
});

test('cancel releases reservation so stock becomes orderable again', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const meal = mealByEn(ctx.db, 'Protein Harvest');
  setStock('Organic Chicken', 150);
  const first = await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  assert.equal((await client(ctx.base).post('/api/orders', guestOrder(meal.id))).status, 409);
  await staff.post(`/api/orders/${first.body.order.id}/transition`, { to: 'cancelled', reason: 'customer_request' });
  assert.equal((await client(ctx.base).post('/api/orders', guestOrder(meal.id))).status, 201);
});

test('meal availability states: manual unavailable overrides stock; low stock flagged', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const meal = mealByEn(ctx.db, 'Forest Elixir');
  setStock('Banana', 300); // 100 g / serving → 3 servings ≤ low-stock threshold (5)
  let list = await admin.get('/api/meals');
  assert.equal(list.body.items.find((m) => m.id === meal.id).availability.state, 'low_stock');
  await admin.patch(`/api/meals/${meal.id}`, { isAvailable: false });
  list = await admin.get('/api/meals');
  assert.equal(list.body.items.find((m) => m.id === meal.id).availability.state, 'unavailable');
  const r = await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  assert.equal(r.body.error.code, 'meal_unavailable');
  await admin.patch(`/api/meals/${meal.id}`, { isAvailable: true });
});

test('manual movements: purchase, waste, count adjustment — all recorded with user & reason', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const ing = setStock('Sweet Potato', 1000);
  let r = await staff.post('/api/inventory/movements', { ingredientId: ing.id, type: 'purchase', quantity: 10_000 });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.movement.stockAfter, 11_000);
  r = await staff.post('/api/inventory/movements', { ingredientId: ing.id, type: 'waste', quantity: 500 });
  assert.equal(r.status, 400, 'waste requires a reason');
  r = await staff.post('/api/inventory/movements', { ingredientId: ing.id, type: 'waste', quantity: 500, reason: 'Dropped tray' });
  assert.equal(r.body.movement.stockAfter, 10_500);
  r = await staff.post('/api/inventory/movements', { ingredientId: ing.id, type: 'spoilage', quantity: 99_999, reason: 'x' });
  assert.equal(r.status, 409, 'cannot remove more than on hand');
  r = await staff.post('/api/inventory/movements', { ingredientId: ing.id, type: 'adjustment', countedQuantity: 10_200, reason: 'Weekly count' });
  assert.equal(r.body.movement.quantity, -300);
  const movements = await staff.get(`/api/inventory/movements?ingredientId=${ing.id}`);
  const types = movements.body.items.map((m) => m.type);
  assert.deepEqual(types.slice(0, 3), ['adjustment', 'waste', 'purchase']);
  assert.ok(movements.body.items.slice(0, 3).every((m) => m.userName === 'staff' && m.createdAt));
  // Staff cannot update cost or book expenses
  r = await staff.post('/api/inventory/movements', { ingredientId: ing.id, type: 'purchase', quantity: 1, unitCostPerPricingUnit: '4', updateCost: true });
  assert.equal(r.status, 403);
});

test('purchase with cost (admin): updates ingredient cost → new meal version; expense booked', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const ing = ingredientByEn(ctx.db, 'Sweet Potato');
  const meal = mealByEn(ctx.db, 'Quinoa Harvest Plate');
  const versionBefore = ctx.db.get('SELECT current_version_id v FROM meals WHERE id = ?', meal.id).v;
  const r = await admin.post('/api/inventory/movements', { ingredientId: ing.id, type: 'purchase', quantity: 5000, unitCostPerPricingUnit: '4.5', updateCost: true, recordExpense: true });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(ctx.db.get('SELECT cost_per_unit c FROM ingredients WHERE id = ?', ing.id).c, 4.5);
  assert.notEqual(ctx.db.get('SELECT current_version_id v FROM meals WHERE id = ?', meal.id).v, versionBefore);
  const expense = ctx.db.get('SELECT * FROM expenses WHERE inventory_movement_id = ?', r.body.movement.id);
  assert.equal(expense.amount_millimes, 22_500);
  assert.equal(expense.category, 'ingredients');
});

test('requirement check: 20 × meal needs 20 × recipe', async () => {
  const staff = await loggedIn(ctx.base, 'staff');
  const meal = mealByEn(ctx.db, 'Protein Harvest');
  setStock('Organic Chicken', 10_000);
  const r = await staff.post('/api/inventory/check', { items: [{ mealId: meal.id, quantity: 20 }] });
  const chicken = r.body.lines.find((l) => l.name === 'Poulet Bio');
  assert.equal(chicken.required, 3000);
  assert.equal(chicken.enough, true);
});
