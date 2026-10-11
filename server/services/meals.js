/**
 * Meals: recipe (ingredients × quantity), price, servings, availability.
 *
 * Nutrition and cost are NEVER accepted from the client: they are computed here
 * with shared/nutrition.js and frozen into an immutable `meal_versions` row.
 * Orders point at the version they were placed with, so later edits to a meal
 * or one of its ingredients never change historical orders.
 */
import { nowIso } from '../db/database.js';
import { badRequest, notFound } from '../http/errors.js';
import { calculateRecipe, roundNutrition } from '../../shared/nutrition.js';
import { audit, diff } from './audit.js';
import { loadIngredientsForRecipe, mapIngredient } from './ingredients.js';
import { getAvailabilityMap } from './inventory.js';
import { getSettings } from './settings.js';

function slugify(text) {
  return String(text).normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'meal';
}

function uniqueSlug(db, base, exceptId = null) {
  let slug = base;
  for (let i = 2; db.get('SELECT id FROM meals WHERE slug = ? AND id IS NOT ?', slug, exceptId); i += 1) slug = `${base}-${i}`;
  return slug;
}

/**
 * Authoritative calculation for a recipe definition.
 * @param {Array<{ ingredientId: number, quantity: number }>} recipe quantities for the WHOLE recipe
 */
export function computeRecipe(db, recipe, servings) {
  const ids = recipe.map((l) => l.ingredientId);
  if (new Set(ids).size !== ids.length) throw badRequest('duplicate_ingredient', 'Each ingredient can appear only once in a recipe');
  const ingredients = loadIngredientsForRecipe(db, ids);
  const result = calculateRecipe(recipe.map((l) => ({ ingredient: ingredients.get(l.ingredientId), quantity: l.quantity })), { servings });
  const snapshot = recipe.map((l) => {
    const ing = ingredients.get(l.ingredientId);
    return {
      ingredientId: ing.id, name: ing.name, quantity: l.quantity, baseUnit: ing.baseUnit,
      grams: ing.baseUnit === 'g' ? l.quantity : l.quantity * ing.gramsPerUnit,
      per100g: ing.nutrition, costPerUnit: ing.costPerUnit,
    };
  });
  return { result, snapshot };
}

function currentRecipe(db, mealId) {
  return db.all('SELECT ingredient_id AS ingredientId, quantity FROM meal_ingredients WHERE meal_id = ? ORDER BY sort_order, ingredient_id', mealId);
}

/**
 * Freeze the meal's current price/recipe/nutrition into a new version
 * (no-op when nothing changed since the current version).
 */
export function snapshotMeal(db, actor, mealId, reason) {
  const meal = db.get('SELECT * FROM meals WHERE id = ?', mealId);
  const recipe = currentRecipe(db, mealId);
  const { result, snapshot } = computeRecipe(db, recipe, meal.servings);
  const nutrition = roundNutrition(result.perServing);
  const payload = {
    price: meal.price_millimes, servings: meal.servings, recipe: JSON.stringify(snapshot), nutrition: JSON.stringify(nutrition),
  };
  const current = meal.current_version_id ? db.get('SELECT * FROM meal_versions WHERE id = ?', meal.current_version_id) : null;
  if (current && current.price_millimes === payload.price && current.servings === payload.servings
    && current.recipe_json === payload.recipe && current.nutrition_json === payload.nutrition) {
    return current.id;
  }
  const version = (db.get('SELECT MAX(version) AS v FROM meal_versions WHERE meal_id = ?', mealId).v ?? 0) + 1;
  const { lastInsertRowid } = db.run(
    `INSERT INTO meal_versions (meal_id, version, price_millimes, servings, recipe_json, nutrition_json,
       serving_weight_g, cost_per_serving, cost_complete, reason, created_by, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    mealId, version, payload.price, payload.servings, payload.recipe, payload.nutrition,
    Math.round(result.servingWeightG * 100) / 100, Math.round(result.costPerServing * 100) / 100, result.costComplete,
    reason ?? null, actor?.userId ?? null, nowIso(),
  );
  db.run('UPDATE meals SET current_version_id = ? WHERE id = ?', lastInsertRowid, mealId);
  return lastInsertRowid;
}

/** Called when an ingredient's nutrition/unit/cost changes. */
export function resnapshotMealsUsingIngredient(db, actor, ingredientId, reason) {
  const meals = db.all('SELECT DISTINCT meal_id FROM meal_ingredients WHERE ingredient_id = ?', ingredientId);
  for (const { meal_id: mealId } of meals) snapshotMeal(db, actor, mealId, reason);
  return meals.length;
}

function mapMeal(row, version, { includeCost }) {
  const nutrition = version ? JSON.parse(version.nutrition_json) : null;
  const meal = {
    id: row.id, slug: row.slug, name: row.name, nameEn: row.name_en, nameAr: row.name_ar,
    description: row.description, descriptionEn: row.description_en, descriptionAr: row.description_ar,
    tag: row.tag, tagEn: row.tag_en, tagAr: row.tag_ar,
    categoryId: row.category_id, categoryKey: row.category_key ?? null,
    imageUrl: row.image_url, priceMillimes: row.price_millimes, servings: row.servings, prepMinutes: row.prep_minutes,
    isAvailable: Boolean(row.is_available), isFeatured: Boolean(row.is_featured), sortOrder: row.sort_order,
    archivedAt: row.archived_at, createdAt: row.created_at, updatedAt: row.updated_at,
    version: version?.version ?? null, versionId: version?.id ?? null,
    nutrition, servingWeightG: version?.serving_weight_g ?? null,
  };
  if (includeCost && version) {
    meal.costPerServing = version.cost_per_serving;
    meal.costComplete = Boolean(version.cost_complete);
    meal.marginMillimes = row.price_millimes - version.cost_per_serving;
    meal.marginPct = row.price_millimes > 0 ? ((row.price_millimes - version.cost_per_serving) / row.price_millimes) * 100 : null;
  }
  return meal;
}

/**
 * Availability for each meal:
 *  unavailable  – archived or switched off manually
 *  out_of_stock – some tracked ingredient cannot cover one serving (only when stock enforcement is on)
 *  low_stock    – ≤ N servings possible, or an ingredient is under its reorder level
 *  available
 * `servingsPossible` treats each meal independently (meals sharing an ingredient compete
 * for it); the exact check happens atomically when an order is placed.
 */
export function computeAvailability(db, meals) {
  const settings = getSettings(db);
  const stock = getAvailabilityMap(db);
  const recipes = db.all(`SELECT mi.meal_id, mi.ingredient_id, mi.quantity, m.servings FROM meal_ingredients mi JOIN meals m ON m.id = mi.meal_id`);
  const byMeal = new Map();
  for (const r of recipes) {
    if (!byMeal.has(r.meal_id)) byMeal.set(r.meal_id, []);
    byMeal.get(r.meal_id).push({ ingredientId: r.ingredient_id, perServing: r.quantity / r.servings });
  }
  return new Map(meals.map((m) => {
    let servingsPossible = Infinity;
    let belowReorder = false;
    const limiting = [];
    for (const line of byMeal.get(m.id) ?? []) {
      const s = stock.get(line.ingredientId);
      if (!s || !s.trackStock) continue;
      const possible = Math.floor((Math.max(0, s.available) + 1e-9) / line.perServing);
      if (possible < servingsPossible) servingsPossible = possible;
      if (s.available <= s.reorderLevel) belowReorder = true;
      if (possible <= settings['inventory.lowStockServings']) limiting.push({ ingredientId: line.ingredientId, name: s.name, servingsPossible: possible });
    }
    let state = 'available';
    if (m.archivedAt || !m.isAvailable) state = 'unavailable';
    else if (servingsPossible === 0 && settings['inventory.enforce']) state = 'out_of_stock';
    else if (servingsPossible <= settings['inventory.lowStockServings'] || belowReorder) state = 'low_stock';
    return [m.id, { state, servingsPossible: Number.isFinite(servingsPossible) ? servingsPossible : null, limiting }];
  }));
}

function attachAvailability(db, meals) {
  const availability = computeAvailability(db, meals);
  return meals.map((m) => ({ ...m, availability: availability.get(m.id) }));
}

const MEAL_SELECT = `SELECT m.*, c.key AS category_key FROM meals m LEFT JOIN categories c ON c.id = m.category_id`;

export function listMeals(db, { includeArchived = false, categoryId, search, availability, featured, includeCost = false, sort } = {}) {
  const where = [];
  const params = [];
  if (!includeArchived) where.push('m.archived_at IS NULL');
  if (categoryId) { where.push('m.category_id = ?'); params.push(categoryId); }
  if (featured) where.push('m.is_featured = 1');
  if (search) { where.push('(m.name LIKE ? OR m.name_en LIKE ? OR m.name_ar LIKE ?)'); params.push(`%${search}%`, `%${search}%`, `%${search}%`); }
  const rows = db.all(`${MEAL_SELECT} ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY m.sort_order, m.name COLLATE NOCASE`, ...params);
  const versions = new Map(
    db.all(`SELECT * FROM meal_versions WHERE id IN (SELECT current_version_id FROM meals)`).map((v) => [v.id, v]),
  );
  let meals = attachAvailability(db, rows.map((r) => mapMeal(r, versions.get(r.current_version_id), { includeCost })));
  if (availability) meals = meals.filter((m) => m.availability.state === availability);

  // Popularity = units sold in completed/active orders over the last 30 days.
  const since = new Date(Date.now() - 30 * 86400_000).toISOString();
  const sold = new Map(db.all(
    `SELECT oi.meal_id, SUM(oi.quantity) AS units FROM order_items oi JOIN orders o ON o.id = oi.order_id
     WHERE o.created_at >= ? AND o.status NOT IN ('refused','cancelled') AND oi.meal_id IS NOT NULL GROUP BY oi.meal_id`, since,
  ).map((r) => [r.meal_id, r.units]));
  meals = meals.map((m) => ({ ...m, unitsSold30d: sold.get(m.id) ?? 0 }));
  if (sort === 'popularity') meals.sort((a, b) => b.unitsSold30d - a.unitsSold30d);
  return meals;
}

export function getMeal(db, id, { includeCost = false, includeRecipe = true } = {}) {
  const row = db.get(`${MEAL_SELECT} WHERE m.id = ? OR m.slug = ?`, Number(id) || -1, String(id));
  if (!row) throw notFound('Meal');
  const version = row.current_version_id ? db.get('SELECT * FROM meal_versions WHERE id = ?', row.current_version_id) : null;
  const [meal] = attachAvailability(db, [mapMeal(row, version, { includeCost })]);
  if (includeRecipe) {
    const lines = db.all(
      `SELECT mi.quantity, mi.sort_order, i.* FROM meal_ingredients mi JOIN ingredients i ON i.id = mi.ingredient_id
       WHERE mi.meal_id = ? ORDER BY mi.sort_order, i.name`, row.id,
    );
    meal.recipe = lines.map((l) => {
      const ing = mapIngredient(l);
      return {
        ingredientId: ing.id, name: ing.name, nameEn: ing.nameEn, nameAr: ing.nameAr, quantity: l.quantity,
        baseUnit: ing.baseUnit, gramsPerUnit: ing.gramsPerUnit, nutrition: ing.nutrition,
        ...(includeCost && { costPerUnit: ing.costPerUnit }),
      };
    });
  }
  return meal;
}

export function listMealVersions(db, mealId) {
  return db.all(
    `SELECT v.*, u.name AS created_by_name FROM meal_versions v LEFT JOIN users u ON u.id = v.created_by
     WHERE v.meal_id = ? ORDER BY v.version DESC`, mealId,
  ).map((v) => ({
    id: v.id, version: v.version, priceMillimes: v.price_millimes, servings: v.servings,
    nutrition: JSON.parse(v.nutrition_json), recipe: JSON.parse(v.recipe_json),
    servingWeightG: v.serving_weight_g, costPerServing: v.cost_per_serving, costComplete: Boolean(v.cost_complete),
    reason: v.reason, createdBy: v.created_by_name, createdAt: v.created_at,
  }));
}

const FIELD_COLUMNS = {
  name: 'name', nameEn: 'name_en', nameAr: 'name_ar', description: 'description', descriptionEn: 'description_en',
  descriptionAr: 'description_ar', tag: 'tag', tagEn: 'tag_en', tagAr: 'tag_ar', categoryId: 'category_id',
  imageUrl: 'image_url', priceMillimes: 'price_millimes', servings: 'servings', prepMinutes: 'prep_minutes',
  isAvailable: 'is_available', isFeatured: 'is_featured', sortOrder: 'sort_order',
};

/** A meal cannot be offered to customers without a price. */
function assertSellable(price, available) {
  if (available && !(price > 0)) throw badRequest('price_required', 'Set a price before making this meal available');
}

function writeRecipe(db, mealId, recipe) {
  db.run('DELETE FROM meal_ingredients WHERE meal_id = ?', mealId);
  recipe.forEach((line, i) => {
    db.run('INSERT INTO meal_ingredients (meal_id, ingredient_id, quantity, sort_order) VALUES (?, ?, ?, ?)', mealId, line.ingredientId, line.quantity, i);
  });
}

export function createMeal(db, actor, data) {
  return db.tx(() => {
    if (!data.recipe?.length) throw badRequest('recipe_required', 'A meal needs at least one ingredient');
    computeRecipe(db, data.recipe, data.servings ?? 1); // validates ingredients before writing anything
    assertSellable(data.priceMillimes, data.isAvailable ?? true);
    const cols = {};
    for (const [k, col] of Object.entries(FIELD_COLUMNS)) if (data[k] !== undefined) cols[col] = data[k];
    const now = nowIso();
    Object.assign(cols, { slug: uniqueSlug(db, slugify(data.nameEn || data.name)), created_by: actor?.userId ?? null, created_at: now, updated_at: now });
    const keys = Object.keys(cols);
    const { lastInsertRowid: id } = db.run(
      `INSERT INTO meals (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`, ...keys.map((k) => cols[k]),
    );
    writeRecipe(db, id, data.recipe);
    snapshotMeal(db, actor, id, 'Created');
    const meal = getMeal(db, id, { includeCost: true });
    audit(db, actor, 'meal.create', 'meal', id, undefined, { name: meal.name, priceMillimes: meal.priceMillimes, recipe: data.recipe });
    return meal;
  });
}

export function updateMeal(db, actor, id, data) {
  return db.tx(() => {
    const before = getMeal(db, id, { includeCost: true });
    const cols = {};
    for (const [k, col] of Object.entries(FIELD_COLUMNS)) if (data[k] !== undefined) cols[col] = data[k];
    if (data.recipe) {
      if (!data.recipe.length) throw badRequest('recipe_required', 'A meal needs at least one ingredient');
      computeRecipe(db, data.recipe, data.servings ?? before.servings);
    }
    assertSellable(data.priceMillimes ?? before.priceMillimes, data.isAvailable ?? before.isAvailable);
    if (Object.keys(cols).length) {
      cols.updated_at = nowIso();
      const keys = Object.keys(cols);
      db.run(`UPDATE meals SET ${keys.map((k) => `${k} = ?`).join(', ')} WHERE id = ?`, ...keys.map((k) => cols[k]), before.id);
    }
    if (data.recipe) writeRecipe(db, before.id, data.recipe);
    snapshotMeal(db, actor, before.id, data.versionReason ?? 'Edited');
    const after = getMeal(db, before.id, { includeCost: true });

    const changes = diff(before, after, ['name', 'priceMillimes', 'servings', 'categoryId', 'isAvailable', 'isFeatured', 'imageUrl', 'prepMinutes', 'recipe']);
    if (changes) {
      audit(db, actor, 'meal.update', 'meal', before.id, changes.old, changes.new);
      if ('priceMillimes' in changes.new) {
        audit(db, actor, 'meal.price_change', 'meal', before.id, { priceMillimes: before.priceMillimes }, { priceMillimes: after.priceMillimes });
      }
    }
    return after;
  });
}

export function archiveMeal(db, actor, id, archived = true) {
  return db.tx(() => {
    const meal = getMeal(db, id, { includeRecipe: false });
    db.run('UPDATE meals SET archived_at = ?, updated_at = ? WHERE id = ?', archived ? nowIso() : null, nowIso(), meal.id);
    audit(db, actor, archived ? 'meal.archive' : 'meal.restore', 'meal', meal.id);
    return getMeal(db, meal.id, { includeCost: true });
  });
}

// ─── Categories ──────────────────────────────────────────────────────────────

export function listCategories(db, { includeInactive = false } = {}) {
  return db.all(`SELECT * FROM categories ${includeInactive ? '' : 'WHERE is_active = 1'} ORDER BY sort_order, name`).map((c) => ({
    id: c.id, key: c.key, name: c.name, nameEn: c.name_en, nameAr: c.name_ar, sortOrder: c.sort_order, isActive: Boolean(c.is_active),
  }));
}

export function upsertCategory(db, actor, id, data) {
  return db.tx(() => {
    if (id) {
      const before = db.get('SELECT * FROM categories WHERE id = ?', id);
      if (!before) throw notFound('Category');
      db.run(
        'UPDATE categories SET name = ?, name_en = ?, name_ar = ?, sort_order = ?, is_active = ? WHERE id = ?',
        data.name ?? before.name, data.nameEn ?? before.name_en, data.nameAr ?? before.name_ar,
        data.sortOrder ?? before.sort_order, data.isActive ?? before.is_active, id,
      );
      audit(db, actor, 'category.update', 'category', id, before, data);
      return id;
    }
    const { lastInsertRowid } = db.run(
      'INSERT INTO categories (key, name, name_en, name_ar, sort_order) VALUES (?, ?, ?, ?, ?)',
      slugify(data.nameEn || data.name), data.name, data.nameEn ?? null, data.nameAr ?? null, data.sortOrder ?? 0,
    );
    audit(db, actor, 'category.create', 'category', lastInsertRowid, undefined, data);
    return lastInsertRowid;
  });
}
