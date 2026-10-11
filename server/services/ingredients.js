/**
 * Ingredients: nutrition per 100 g, units, cost and stock level.
 * Stock is never edited here — only via inventory movements (services/inventory.js).
 */
import { nowIso } from '../db/database.js';
import { conflict, notFound, badRequest } from '../http/errors.js';
import { audit, diff } from './audit.js';
import { resnapshotMealsUsingIngredient } from './meals.js';
import { recordMovement } from './inventory.js';

/** DB column ↔ shared nutrient key. */
export const NUTRIENT_COLUMNS = {
  kcal: 'kcal', protein: 'protein_g', carbs: 'carbs_g', fat: 'fat_g',
  satFat: 'sat_fat_g', fiber: 'fiber_g', sugar: 'sugar_g', sodium: 'sodium_mg',
};

export function mapIngredient(row) {
  if (!row) return null;
  const nutrition = {};
  for (const [key, col] of Object.entries(NUTRIENT_COLUMNS)) nutrition[key] = row[col];
  return {
    id: row.id,
    name: row.name,
    nameEn: row.name_en,
    nameAr: row.name_ar,
    detail: row.detail,
    detailEn: row.detail_en,
    detailAr: row.detail_ar,
    baseUnit: row.base_unit,
    gramsPerUnit: row.grams_per_unit,
    nutrition,
    costPerUnit: row.cost_per_unit,
    trackStock: Boolean(row.track_stock),
    stockQty: row.stock_qty,
    reorderLevel: row.reorder_level,
    customerSelectable: Boolean(row.is_customer_selectable),
    portionQty: row.portion_qty,
    portionPriceMillimes: row.portion_price_millimes,
    color: row.color,
    archivedAt: row.archived_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    ...(row.reserved_qty !== undefined && {
      reservedQty: row.reserved_qty,
      availableQty: row.stock_qty - row.reserved_qty,
    }),
  };
}

const RESERVED_SUBQUERY = `COALESCE((SELECT SUM(r.quantity) FROM inventory_reservations r
  WHERE r.ingredient_id = i.id AND r.status = 'active'), 0)`;

export function getIngredientRow(db, id) {
  return db.get(`SELECT i.*, ${RESERVED_SUBQUERY} AS reserved_qty FROM ingredients i WHERE i.id = ?`, id);
}

export function getIngredient(db, id) {
  const row = getIngredientRow(db, id);
  if (!row) throw notFound('Ingredient');
  const usedIn = db.all(
    `SELECT m.id, m.name, mi.quantity, m.servings FROM meal_ingredients mi JOIN meals m ON m.id = mi.meal_id
     WHERE mi.ingredient_id = ? AND m.archived_at IS NULL ORDER BY m.name`,
    id,
  );
  return { ...mapIngredient(row), usedIn: usedIn.map((m) => ({ id: m.id, name: m.name, quantityPerServing: m.quantity / m.servings })) };
}

export function listIngredients(db, { search, includeArchived = false, stock, customerSelectable } = {}) {
  const where = [];
  const params = [];
  if (!includeArchived) where.push('i.archived_at IS NULL');
  if (search) {
    where.push('(i.name LIKE ? OR i.name_en LIKE ? OR i.name_ar LIKE ?)');
    params.push(`%${search}%`, `%${search}%`, `%${search}%`);
  }
  if (customerSelectable) where.push('i.is_customer_selectable = 1 AND i.portion_qty IS NOT NULL AND i.portion_price_millimes IS NOT NULL');
  const rows = db.all(
    `SELECT i.*, ${RESERVED_SUBQUERY} AS reserved_qty FROM ingredients i
     ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY i.name COLLATE NOCASE`,
    ...params,
  );
  let items = rows.map(mapIngredient).map((i) => ({ ...i, stockState: stockState(i) }));
  if (stock === 'low') items = items.filter((i) => i.stockState !== 'ok');
  if (stock === 'out') items = items.filter((i) => i.stockState === 'out');
  return items;
}

/** ok | low | out — based on AVAILABLE quantity (stock minus reservations). */
export function stockState(ing) {
  if (!ing.trackStock) return 'ok';
  const available = ing.availableQty ?? ing.stockQty;
  if (available <= 0) return 'out';
  if (available <= ing.reorderLevel) return 'low';
  return 'ok';
}

function toColumns(data) {
  const cols = {};
  const map = {
    name: 'name', nameEn: 'name_en', nameAr: 'name_ar', detail: 'detail', detailEn: 'detail_en', detailAr: 'detail_ar',
    baseUnit: 'base_unit', gramsPerUnit: 'grams_per_unit', costPerUnit: 'cost_per_unit', trackStock: 'track_stock',
    reorderLevel: 'reorder_level', customerSelectable: 'is_customer_selectable', portionQty: 'portion_qty',
    portionPriceMillimes: 'portion_price_millimes', color: 'color',
  };
  for (const [k, col] of Object.entries(map)) if (data[k] !== undefined) cols[col] = data[k];
  if (data.nutrition) {
    for (const [key, col] of Object.entries(NUTRIENT_COLUMNS)) {
      if (data.nutrition[key] !== undefined) cols[col] = data.nutrition[key];
    }
  }
  if (data.baseUnit === 'g') cols.grams_per_unit = 1;
  return cols;
}

function validateSelectable(cols, existing = {}) {
  const merged = { ...existing, ...cols };
  if (merged.is_customer_selectable && (!merged.portion_qty || merged.portion_price_millimes == null)) {
    throw badRequest('portion_required', 'Customer-selectable ingredients need a portion size and portion price');
  }
}

export function createIngredient(db, actor, data) {
  return db.tx(() => {
    const cols = toColumns(data);
    validateSelectable(cols);
    const now = nowIso();
    cols.created_at = now;
    cols.updated_at = now;
    const keys = Object.keys(cols);
    const { lastInsertRowid: id } = db.run(
      `INSERT INTO ingredients (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`,
      ...keys.map((k) => cols[k]),
    );
    audit(db, actor, 'ingredient.create', 'ingredient', id, undefined, data);
    if (data.openingStock > 0) {
      recordMovement(db, actor, { ingredientId: id, type: 'opening', quantity: data.openingStock, reason: 'Opening stock', unitCost: data.costPerUnit ?? null });
    }
    return getIngredient(db, id);
  });
}

export function updateIngredient(db, actor, id, data) {
  return db.tx(() => {
    const beforeRow = db.get('SELECT * FROM ingredients WHERE id = ?', id);
    if (!beforeRow) throw notFound('Ingredient');
    const before = mapIngredient(beforeRow);
    const cols = toColumns(data);
    validateSelectable(cols, beforeRow);
    if (!Object.keys(cols).length) return getIngredient(db, id);
    cols.updated_at = nowIso();
    const keys = Object.keys(cols);
    db.run(`UPDATE ingredients SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => cols[k]), id);
    const after = mapIngredient(db.get('SELECT * FROM ingredients WHERE id = ?', id));
    const changes = diff(before, after, ['name', 'baseUnit', 'gramsPerUnit', 'nutrition', 'costPerUnit', 'reorderLevel', 'trackStock', 'customerSelectable', 'portionQty', 'portionPriceMillimes']);
    if (changes) audit(db, actor, 'ingredient.update', 'ingredient', id, changes.old, changes.new);

    // Nutrition / unit / cost changes flow into every meal using this ingredient as a NEW
    // meal version. Existing orders keep the snapshot they were placed with.
    const affectsMeals = changes && ['nutrition', 'baseUnit', 'gramsPerUnit', 'costPerUnit', 'name'].some((k) => k in changes.new);
    if (affectsMeals) resnapshotMealsUsingIngredient(db, actor, id, `Ingredient "${after.name}" updated`);
    return getIngredient(db, id);
  });
}

export function archiveIngredient(db, actor, id, archived = true) {
  return db.tx(() => {
    const row = db.get('SELECT * FROM ingredients WHERE id = ?', id);
    if (!row) throw notFound('Ingredient');
    if (archived) {
      const meals = db.all(
        `SELECT m.name FROM meal_ingredients mi JOIN meals m ON m.id = mi.meal_id
         WHERE mi.ingredient_id = ? AND m.archived_at IS NULL`, id,
      );
      if (meals.length) {
        throw conflict('ingredient_in_use', `Used by active meals: ${meals.map((m) => m.name).join(', ')}`, { meals: meals.map((m) => m.name) });
      }
    }
    db.run('UPDATE ingredients SET archived_at = ?, updated_at = ? WHERE id = ?', archived ? nowIso() : null, nowIso(), id);
    audit(db, actor, archived ? 'ingredient.archive' : 'ingredient.restore', 'ingredient', id);
    return getIngredient(db, id);
  });
}

/** Load ingredients by id for calculations; throws if any is missing or archived. */
export function loadIngredientsForRecipe(db, ids) {
  if (!ids.length) return new Map();
  const rows = db.all(`SELECT * FROM ingredients WHERE id IN (${ids.map(() => '?').join(',')})`, ...ids);
  const map = new Map(rows.map((r) => [r.id, mapIngredient(r)]));
  const missing = ids.filter((id) => !map.has(id));
  if (missing.length) throw badRequest('unknown_ingredient', `Unknown ingredient id(s): ${missing.join(', ')}`);
  const archived = [...map.values()].filter((i) => i.archivedAt);
  if (archived.length) throw badRequest('archived_ingredient', `Archived ingredient(s): ${archived.map((i) => i.name).join(', ')}`);
  return map;
}
