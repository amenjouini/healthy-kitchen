/** Meals, ingredients, categories, delivery zones, settings. */
import { v, validate } from '../http/validate.js';
import { badRequest } from '../http/errors.js';
import { can } from '../http/router.js';
import { P } from '../../shared/permissions.js';
import { costPerBaseUnit } from '../../shared/units.js';
import { NUTRIENT_KEYS } from '../../shared/nutrition.js';
import {
  listMeals, getMeal, createMeal, updateMeal, archiveMeal, listMealVersions, computeRecipe, listCategories, upsertCategory,
} from '../services/meals.js';
import { listIngredients, getIngredient, createIngredient, updateIngredient, archiveIngredient, stockState } from '../services/ingredients.js';
import { listZones, upsertZone } from '../services/customers.js';
import { getSettings, updateSettings } from '../services/settings.js';
import { frequentPairs } from '../services/analytics.js';

const NUTRIENT_MAX = { sodium: 100_000, kcal: 900 };
const nutritionSchema = Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, v.number({ min: 0, max: NUTRIENT_MAX[k] ?? 100 }).default(0)]));
const imageUrl = () => v.string({ max: 500, pattern: /^(\/uploads\/[a-f0-9]{32}\.(jpg|png|webp)|https:\/\/\S+)$/ }).nullable();

const ingredientSchema = (partial) => {
  const req = (rule) => (partial ? rule.optional() : rule);
  return {
    name: req(v.text({ max: 120 })), nameEn: v.string({ max: 120 }).nullable(), nameAr: v.string({ max: 120 }).nullable(),
    detail: v.string({ max: 200 }).nullable(), detailEn: v.string({ max: 200 }).nullable(), detailAr: v.string({ max: 200 }).nullable(),
    baseUnit: req(v.oneOf(['g', 'ml', 'pc'])), gramsPerUnit: v.number({ min: 0.001, max: 10_000 }).optional(),
    nutrition: partial ? v.object(nutritionSchema).optional() : v.object(nutritionSchema),
    /** DT per kg (g), per L (ml) or per piece (pc). */
    costPerPricingUnit: v.money().nullable(),
    trackStock: v.boolean().optional(), reorderLevel: v.number({ min: 0, max: 1e7 }).optional(),
    customerSelectable: v.boolean().optional(), portionQty: v.number({ min: 0.001, max: 10_000 }).nullable(),
    portionPrice: v.money().nullable(), color: v.string({ max: 20, pattern: /^#[0-9a-fA-F]{3,8}$/ }).nullable(),
    openingStock: partial ? v.number().optional() : v.number({ min: 0, max: 1e7 }).optional(),
  };
};

function ingredientInput(data, existingBaseUnit) {
  const baseUnit = data.baseUnit ?? existingBaseUnit;
  if (data.baseUnit && data.baseUnit !== 'g' && data.gramsPerUnit == null) {
    throw badRequest('grams_per_unit_required', data.baseUnit === 'ml' ? 'Enter the density (grams per ml)' : 'Enter the weight of one piece in grams');
  }
  const out = { ...data };
  if (data.costPerPricingUnit !== undefined) {
    out.costPerUnit = data.costPerPricingUnit == null ? null : costPerBaseUnit(data.costPerPricingUnit, baseUnit);
    delete out.costPerPricingUnit;
  }
  if (data.portionPrice !== undefined) { out.portionPriceMillimes = data.portionPrice; delete out.portionPrice; }
  return out;
}

const mealSchema = (partial) => {
  const req = (rule) => (partial ? rule.optional() : rule);
  return {
    name: req(v.text({ max: 120 })), nameEn: v.string({ max: 120 }).nullable(), nameAr: v.string({ max: 120 }).nullable(),
    description: v.string({ max: 600 }).nullable(), descriptionEn: v.string({ max: 600 }).nullable(), descriptionAr: v.string({ max: 600 }).nullable(),
    tag: v.string({ max: 40 }).nullable(), tagEn: v.string({ max: 40 }).nullable(), tagAr: v.string({ max: 40 }).nullable(),
    categoryId: v.id().nullable(), imageUrl: imageUrl(), price: req(v.money({ max: 10_000_000 })),
    servings: v.int({ min: 1, max: 100 }).optional(), prepMinutes: v.int({ min: 0, max: 600 }).optional(),
    isAvailable: v.boolean().optional(), isFeatured: v.boolean().optional(), sortOrder: v.int({ min: 0, max: 10_000 }).optional(),
    recipe: (partial ? (r) => r.optional() : (r) => r)(v.array(v.object({ ingredientId: v.id(), quantity: v.number({ min: 0.001, max: 1e6 }) }), { min: 1, max: 60 })),
    versionReason: v.string({ max: 200 }).optional(),
  };
};

function mealInput(data) {
  const out = { ...data };
  if (data.price !== undefined) { out.priceMillimes = data.price; delete out.price; }
  return out;
}

/** Customer-facing meal shape: no cost/margin, availability state only. */
function publicMeal(m) {
  return {
    id: m.id, slug: m.slug, name: m.name, nameEn: m.nameEn, nameAr: m.nameAr, description: m.description,
    descriptionEn: m.descriptionEn, descriptionAr: m.descriptionAr, tag: m.tag, tagEn: m.tagEn, tagAr: m.tagAr,
    categoryId: m.categoryId, categoryKey: m.categoryKey, imageUrl: m.imageUrl, priceMillimes: m.priceMillimes,
    nutrition: m.nutrition, servingWeightG: m.servingWeightG, isFeatured: m.isFeatured,
    availability: m.availability.state === 'low_stock' ? 'available' : m.availability.state, // customers see available/out
    ...(m.recipe && { ingredients: m.recipe.map((r) => ({ name: r.name, nameEn: r.nameEn, nameAr: r.nameAr })) }),
  };
}

const EDIT_MEAL_PERMS = [P.MEALS_CREATE, P.MEALS_EDIT, P.ORDERS_CREATE, P.ORDERS_VIEW, P.INVENTORY_VIEW];

export default function register(r, { db, config, whatsapp }) {
  // ─── Public catalogue ───────────────────────────────────────────────────────
  r.get('/api/catalog/meals', { auth: 'public' }, (ctx) => {
    const q = validate({ categoryId: v.id().optional(), featured: v.boolean().optional() }, ctx.query);
    // Ingredient names (no quantities or costs) so the menu can list what is in each dish.
    const names = new Map();
    for (const r of db.all('SELECT mi.meal_id, i.name, i.name_en, i.name_ar FROM meal_ingredients mi JOIN ingredients i ON i.id = mi.ingredient_id ORDER BY mi.sort_order')) {
      if (!names.has(r.meal_id)) names.set(r.meal_id, []);
      names.get(r.meal_id).push({ name: r.name, nameEn: r.name_en, nameAr: r.name_ar });
    }
    return {
      items: listMeals(db, q).filter((m) => m.availability.state !== 'unavailable')
        .map((m) => ({ ...publicMeal(m), ingredients: names.get(m.id) ?? [] })),
    };
  });

  r.get('/api/catalog/meals/:id', { auth: 'public' }, (ctx) => {
    const meal = getMeal(db, ctx.params.id);
    if (meal.availability.state === 'unavailable') return { meal: { ...publicMeal(meal), availability: 'unavailable' } };
    return { meal: publicMeal(meal) };
  });

  r.get('/api/catalog/ingredients', { auth: 'public' }, () => {
    const enforce = getSettings(db)['inventory.enforce'];
    return { items: listIngredients(db, { customerSelectable: true }).map((i) => ({
      id: i.id, name: i.name, nameEn: i.nameEn, nameAr: i.nameAr, detail: i.detail, detailEn: i.detailEn, detailAr: i.detailAr,
      baseUnit: i.baseUnit, gramsPerUnit: i.gramsPerUnit, nutrition: i.nutrition, portionQty: i.portionQty,
      portionPriceMillimes: i.portionPriceMillimes, color: i.color,
      available: !(enforce && i.trackStock && i.availableQty < i.portionQty),
    })) };
  });

  r.get('/api/catalog/info', { auth: 'public' }, () => {
    const settings = getSettings(db);
    return {
      categories: listCategories(db),
      zones: listZones(db),
      acceptingOrders: settings['kitchen.acceptingOrders'],
      onlinePaymentAvailable: Boolean(config.payments.provider), // no gateway connected yet
      whatsappConnected: Boolean(whatsapp),
      bundles: frequentPairs(db, { minOrders: 3, limit: 4 }),
    };
  });

  // ─── Meals (staff/admin) ────────────────────────────────────────────────────
  r.get('/api/meals', { anyPerm: EDIT_MEAL_PERMS }, (ctx) => {
    const q = validate({
      search: v.string({ max: 100 }).optional(), categoryId: v.id().optional(), includeArchived: v.boolean().optional(),
      availability: v.oneOf(['available', 'low_stock', 'out_of_stock', 'unavailable']).optional(), sort: v.oneOf(['name', 'popularity']).optional(),
    }, ctx.query);
    return { items: listMeals(db, { ...q, includeCost: can(ctx, P.FINANCE_VIEW) }) };
  });

  r.get('/api/meals/:id', { anyPerm: EDIT_MEAL_PERMS }, (ctx) => ({ meal: getMeal(db, ctx.params.id, { includeCost: can(ctx, P.FINANCE_VIEW) }) }));

  r.get('/api/meals/:id/versions', { anyPerm: [P.MEALS_EDIT, P.MEALS_CREATE] }, (ctx) => {
    const meal = getMeal(db, ctx.params.id, { includeRecipe: false });
    const versions = listMealVersions(db, meal.id);
    const finance = can(ctx, P.FINANCE_VIEW);
    return { items: finance ? versions : versions.map(({ costPerServing, costComplete, ...rest }) => rest) };
  });

  /** Authoritative server-side calculation for the builder (the client previews with the same shared code). */
  r.post('/api/meals/preview', { anyPerm: [P.MEALS_EDIT, P.MEALS_CREATE] }, (ctx) => {
    const data = validate({
      servings: v.int({ min: 1, max: 100 }).default(1),
      recipe: v.array(v.object({ ingredientId: v.id(), quantity: v.number({ min: 0.001, max: 1e6 }) }), { min: 0, max: 60 }),
    }, ctx.body);
    const { result } = computeRecipe(db, data.recipe, data.servings);
    const finance = can(ctx, P.FINANCE_VIEW);
    return {
      perServing: result.perServing, total: result.total, totalWeightG: result.totalWeightG, servingWeightG: result.servingWeightG,
      ...(finance && { costPerServing: result.costPerServing, costComplete: result.costComplete }),
    };
  });

  r.post('/api/meals', { perm: P.MEALS_CREATE }, (ctx) => {
    ctx.status = 201;
    return { meal: createMeal(db, ctx.actor, mealInput(validate(mealSchema(false), ctx.body))) };
  });

  r.patch('/api/meals/:id', { perm: P.MEALS_EDIT }, (ctx) => ({
    meal: updateMeal(db, ctx.actor, Number(ctx.params.id), mealInput(validate(mealSchema(true), ctx.body))),
  }));

  r.post('/api/meals/:id/archive', { perm: P.MEALS_EDIT }, (ctx) => {
    const { archived } = validate({ archived: v.boolean() }, ctx.body);
    return { meal: archiveMeal(db, ctx.actor, Number(ctx.params.id), archived) };
  });

  // ─── Ingredients ────────────────────────────────────────────────────────────
  const seeCost = (ctx) => can(ctx, P.FINANCE_VIEW) || can(ctx, P.INGREDIENTS_MANAGE);
  const stripCost = (ctx, i) => (seeCost(ctx) ? i : { ...i, costPerUnit: undefined });

  r.get('/api/ingredients', { anyPerm: [P.INGREDIENTS_MANAGE, P.INVENTORY_VIEW, P.MEALS_CREATE, P.MEALS_EDIT] }, (ctx) => {
    const q = validate({ search: v.string({ max: 100 }).optional(), includeArchived: v.boolean().optional(), stock: v.oneOf(['low', 'out']).optional() }, ctx.query);
    return { items: listIngredients(db, q).map((i) => stripCost(ctx, i)) };
  });

  r.get('/api/ingredients/:id', { anyPerm: [P.INGREDIENTS_MANAGE, P.INVENTORY_VIEW, P.MEALS_CREATE, P.MEALS_EDIT] }, (ctx) => {
    const ing = getIngredient(db, Number(ctx.params.id));
    return { ingredient: { ...stripCost(ctx, ing), stockState: stockState(ing) } };
  });

  r.post('/api/ingredients', { perm: P.INGREDIENTS_MANAGE }, (ctx) => {
    const data = ingredientInput(validate(ingredientSchema(false), ctx.body));
    if (data.openingStock > 0 && !can(ctx, P.INVENTORY_MANAGE)) throw badRequest('forbidden_opening_stock', 'Opening stock requires inventory permission');
    ctx.status = 201;
    return { ingredient: createIngredient(db, ctx.actor, data) };
  });

  r.patch('/api/ingredients/:id', { perm: P.INGREDIENTS_MANAGE }, (ctx) => {
    const id = Number(ctx.params.id);
    const existing = getIngredient(db, id);
    const data = validate(ingredientSchema(true), ctx.body);
    delete data.openingStock; // stock only changes through inventory movements
    return { ingredient: updateIngredient(db, ctx.actor, id, ingredientInput(data, existing.baseUnit)) };
  });

  r.post('/api/ingredients/:id/archive', { perm: P.INGREDIENTS_MANAGE }, (ctx) => {
    const { archived } = validate({ archived: v.boolean() }, ctx.body);
    return { ingredient: archiveIngredient(db, ctx.actor, Number(ctx.params.id), archived) };
  });

  // ─── Categories, zones, settings ────────────────────────────────────────────
  const categorySchema = { name: v.text({ max: 60 }), nameEn: v.string({ max: 60 }).nullable(), nameAr: v.string({ max: 60 }).nullable(), sortOrder: v.int({ min: 0 }).optional(), isActive: v.boolean().optional() };
  r.get('/api/categories', { anyPerm: EDIT_MEAL_PERMS }, () => ({ items: listCategories(db, { includeInactive: true }) }));
  r.post('/api/categories', { perm: P.MEALS_EDIT }, (ctx) => ({ id: upsertCategory(db, ctx.actor, null, validate(categorySchema, ctx.body)) }));
  r.patch('/api/categories/:id', { perm: P.MEALS_EDIT }, (ctx) => ({
    id: upsertCategory(db, ctx.actor, Number(ctx.params.id), validate({ ...categorySchema, name: v.text({ max: 60 }).optional() }, ctx.body)),
  }));

  const zoneSchema = (partial) => ({
    city: partial ? v.text({ max: 80 }).optional() : v.text({ max: 80 }), fee: v.money().optional(), minOrder: v.money().optional(),
    isActive: v.boolean().optional(), sortOrder: v.int({ min: 0 }).optional(),
  });
  const zoneInput = (d) => ({ city: d.city, feeMillimes: d.fee, minOrderMillimes: d.minOrder, isActive: d.isActive, sortOrder: d.sortOrder });
  r.get('/api/zones', { anyPerm: [P.SETTINGS_MANAGE, P.ORDERS_CREATE, P.ORDERS_VIEW] }, () => ({ items: listZones(db, { includeInactive: true }) }));
  r.post('/api/zones', { perm: P.SETTINGS_MANAGE }, (ctx) => ({ id: upsertZone(db, ctx.actor, null, zoneInput(validate(zoneSchema(false), ctx.body))) }));
  r.patch('/api/zones/:id', { perm: P.SETTINGS_MANAGE }, (ctx) => ({ id: upsertZone(db, ctx.actor, Number(ctx.params.id), zoneInput(validate(zoneSchema(true), ctx.body))) }));

  r.get('/api/settings', { anyPerm: [P.SETTINGS_MANAGE, P.ORDERS_VIEW] }, () => ({ settings: getSettings(db) }));
  r.patch('/api/settings', { perm: P.SETTINGS_MANAGE }, (ctx) => {
    const schema = {
      'inventory.enforce': v.boolean().optional(), 'inventory.lowStockServings': v.int({ min: 0, max: 1000 }).optional(),
      'kitchen.acceptingOrders': v.boolean().optional(), 'kitchen.parallelCooks': v.int({ min: 1, max: 50 }).optional(),
    };
    return { settings: updateSettings(db, ctx.actor, validate(schema, ctx.body)) };
  });

  /** Staff can pause/resume online ordering from the kitchen. */
  r.post('/api/kitchen/accepting', { perm: P.ORDERS_MANAGE }, (ctx) => {
    const { accepting } = validate({ accepting: v.boolean() }, ctx.body);
    return { settings: updateSettings(db, ctx.actor, { 'kitchen.acceptingOrders': accepting }) };
  });
}
