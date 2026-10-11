import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, client, loggedIn, mealByEn, ingredientByEn, guestOrder } from './helpers.js';

let ctx;
before(async () => { ctx = await startTestServer(); });
after(async () => { await ctx.close(); });

test('meal builder: server computes nutrition; client-sent nutrition is ignored', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const chicken = ingredientByEn(ctx.db, 'Organic Chicken');
  const oil = ingredientByEn(ctx.db, 'Extra Virgin Olive Oil');
  const r = await admin.post('/api/meals', {
    name: 'Chicken Bowl Test', price: '19.5', servings: 1,
    recipe: [{ ingredientId: chicken.id, quantity: 150 }, { ingredientId: oil.id, quantity: 10 }],
    nutrition: { kcal: 1 }, costPerServing: 0,
  });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const m = r.body.meal;
  assert.equal(m.priceMillimes, 19500);
  assert.equal(m.nutrition.kcal, 247.5 + 884 * 0.091);
  assert.equal(m.nutrition.protein, 46.5);
  assert.equal(m.servingWeightG, 159.1);
  assert.equal(m.version, 1);
});

test('servings: a 2-serving recipe halves per-serving nutrition and stock per order', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const chicken = ingredientByEn(ctx.db, 'Organic Chicken');
  const r = await admin.post('/api/meals', { name: 'Family Chicken', price: '30', servings: 2, recipe: [{ ingredientId: chicken.id, quantity: 400 }] });
  assert.equal(r.body.meal.nutrition.kcal, 330);
  const o = await client(ctx.base).post('/api/orders', guestOrder(r.body.meal.id));
  assert.equal(ctx.db.get('SELECT quantity FROM inventory_reservations WHERE order_id = ?', o.body.order.id).quantity, 200);
});

test('preview endpoint matches the saved calculation', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const chicken = ingredientByEn(ctx.db, 'Organic Chicken');
  const p = await admin.post('/api/meals/preview', { servings: 1, recipe: [{ ingredientId: chicken.id, quantity: 200 }] });
  assert.equal(p.body.perServing.kcal, 330);
  assert.equal(p.body.totalWeightG, 200);
});

test('history is immutable: ingredient & price changes create versions, old orders keep snapshots', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const meal = mealByEn(ctx.db, 'Protein Harvest');
  const chicken = ingredientByEn(ctx.db, 'Organic Chicken');
  const order = await client(ctx.base).post('/api/orders', guestOrder(meal.id));
  const before = JSON.parse(ctx.db.get('SELECT nutrition_json FROM order_items WHERE order_id = ?', order.body.order.id).nutrition_json);

  const upd = await admin.patch(`/api/ingredients/${chicken.id}`, { nutrition: { kcal: 170, protein: 31, carbs: 0, fat: 3.6, satFat: 1, fiber: 0, sugar: 0, sodium: 74 } });
  assert.equal(upd.status, 200, JSON.stringify(upd.body));
  const priced = await admin.patch(`/api/meals/${meal.id}`, { price: '26' });
  assert.equal(priced.body.meal.priceMillimes, 26000);
  assert.ok(priced.body.meal.version >= 3);
  assert.ok(Math.abs(priced.body.meal.nutrition.kcal - before.kcal - 7.5) < 1e-6, 'meal reflects +5 kcal/100 g × 150 g');

  const after = ctx.db.get('SELECT nutrition_json, unit_price_millimes FROM order_items WHERE order_id = ?', order.body.order.id);
  assert.deepEqual(JSON.parse(after.nutrition_json), before);
  assert.equal(after.unit_price_millimes, 24000);
  const versions = await admin.get(`/api/meals/${meal.id}/versions`);
  assert.ok(versions.body.items.length >= 3);
  assert.ok(ctx.db.get(`SELECT 1 FROM audit_logs WHERE action = 'meal.price_change' AND entity_id = ?`, String(meal.id)));
  assert.ok(ctx.db.get(`SELECT 1 FROM audit_logs WHERE action = 'ingredient.update' AND entity_id = ?`, String(chicken.id)));
});

test('ingredient validation: units, portions, archive rules', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  let r = await admin.post('/api/ingredients', { name: 'Milk', baseUnit: 'ml', nutrition: { kcal: 42 } });
  assert.equal(r.body.error.code, 'grams_per_unit_required');
  r = await admin.post('/api/ingredients', { name: 'Milk', baseUnit: 'ml', gramsPerUnit: 1.03, nutrition: { kcal: 42, protein: 3.4, carbs: 5, fat: 1 }, costPerPricingUnit: '1.6' });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  assert.equal(r.body.ingredient.costPerUnit, 1.6, '1.6 DT/L = 1.6 millimes/ml');
  r = await admin.post('/api/ingredients', { name: 'Bad', baseUnit: 'g', nutrition: { kcal: 5000 } });
  assert.equal(r.status, 400);
  r = await admin.post('/api/ingredients', { name: 'Pick me', baseUnit: 'g', nutrition: { kcal: 10 }, customerSelectable: true });
  assert.equal(r.body.error.code, 'portion_required');
  const chicken = ingredientByEn(ctx.db, 'Organic Chicken');
  r = await admin.post(`/api/ingredients/${chicken.id}/archive`, { archived: true });
  assert.equal(r.body.error.code, 'ingredient_in_use');
});

test('a draft meal cannot go live without a price', async () => {
  const admin = await loggedIn(ctx.base, 'admin');
  const draft = mealByEn(ctx.db, 'Green Power Bowl');
  let r = await admin.patch(`/api/meals/${draft.id}`, { isAvailable: true });
  assert.equal(r.body.error.code, 'price_required');
  r = await admin.patch(`/api/meals/${draft.id}`, { isAvailable: true, price: '22' });
  assert.equal(r.status, 200);
});

test('public catalogue never exposes cost data; drafts hidden', async () => {
  const r = await client(ctx.base).get('/api/catalog/meals');
  assert.ok(r.body.items.length >= 3);
  for (const m of r.body.items) {
    assert.equal(m.costPerServing, undefined);
    assert.equal(m.marginPct, undefined);
  }
  assert.ok(!r.body.items.some((m) => m.nameEn === 'Citrus Detox Plate'));
  const ing = await client(ctx.base).get('/api/catalog/ingredients');
  assert.equal(ing.body.items.length, 6);
  assert.equal(ing.body.items[0].costPerUnit, undefined);
});
