/**
 * Healthy Kitchen — the single authoritative nutrition & recipe-cost calculator.
 *
 * Imported by BOTH the server (authoritative values that get persisted and
 * snapshotted into orders) and the client (live preview in the meal builders).
 * There must be no other nutrition math anywhere in the codebase.
 *
 * Conventions
 * ───────────
 * • Ingredient nutrition is always stored per 100 g.
 * • Ingredient quantities (recipes, stock) are expressed in the ingredient's
 *   base unit: 'g', 'ml' or 'pc' (piece). `gramsPerUnit` converts a base unit to
 *   grams (g → 1, ml → density in g/ml, pc → weight of one piece in g).
 * • Ingredient cost is stored in millimes (1 DT = 1000 millimes) per base unit.
 * • Calculations keep full precision. Rounding happens only for display
 *   (formatNutrient) or for storage (roundNutrition, 4 decimals).
 */

/** Nutrients tracked by the platform, with their display unit. */
export const NUTRIENTS = [
  { key: 'kcal', unit: 'kcal', label: 'Calories', decimals: 1 },
  { key: 'protein', unit: 'g', label: 'Protein', decimals: 1 },
  { key: 'carbs', unit: 'g', label: 'Carbohydrates', decimals: 1 },
  { key: 'fat', unit: 'g', label: 'Fat', decimals: 1 },
  { key: 'satFat', unit: 'g', label: 'Saturated fat', decimals: 1 },
  { key: 'fiber', unit: 'g', label: 'Fiber', decimals: 1 },
  { key: 'sugar', unit: 'g', label: 'Sugar', decimals: 1 },
  { key: 'sodium', unit: 'mg', label: 'Sodium', decimals: 0 },
];

export const NUTRIENT_KEYS = NUTRIENTS.map((n) => n.key);

/** Base units an ingredient can be measured in. */
export const BASE_UNITS = {
  g: { key: 'g', label: 'grams', short: 'g', fixedGramsPerUnit: 1 },
  ml: { key: 'ml', label: 'millilitres', short: 'ml', fixedGramsPerUnit: null },
  pc: { key: 'pc', label: 'pieces', short: 'pc', fixedGramsPerUnit: null },
};

/** Reference daily intake used for "% of daily reference" displays (EU RI, 2000 kcal diet). */
export const DAILY_REFERENCE = { kcal: 2000, protein: 50, carbs: 260, fat: 70, satFat: 20, sugar: 90, sodium: 2400 };

export function emptyNutrition() {
  return Object.fromEntries(NUTRIENT_KEYS.map((k) => [k, 0]));
}

function assertFiniteNonNegative(value, what) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
    throw new RangeError(`${what} must be a finite number ≥ 0 (got ${value})`);
  }
}

/**
 * Grams represented by `quantity` base units of `ingredient`.
 * @param {number} quantity
 * @param {{ baseUnit: 'g'|'ml'|'pc', gramsPerUnit?: number }} ingredient
 */
export function toGrams(quantity, ingredient) {
  assertFiniteNonNegative(quantity, 'Quantity');
  const fixed = BASE_UNITS[ingredient.baseUnit]?.fixedGramsPerUnit;
  if (ingredient.baseUnit && !BASE_UNITS[ingredient.baseUnit]) {
    throw new RangeError(`Unknown base unit "${ingredient.baseUnit}"`);
  }
  const factor = fixed ?? ingredient.gramsPerUnit;
  assertFiniteNonNegative(factor, 'gramsPerUnit');
  if (factor === 0) throw new RangeError('gramsPerUnit must be greater than 0');
  return quantity * factor;
}

/**
 * Nutrition contained in `grams` of a food whose values are given per 100 g.
 * @param {Record<string, number>} per100g
 * @param {number} grams
 */
export function nutritionForGrams(per100g, grams) {
  assertFiniteNonNegative(grams, 'Grams');
  const out = emptyNutrition();
  for (const key of NUTRIENT_KEYS) {
    const v = per100g[key] ?? 0;
    assertFiniteNonNegative(v, `Nutrient "${key}"`);
    out[key] = (v * grams) / 100;
  }
  return out;
}

export function addNutrition(a, b) {
  const out = emptyNutrition();
  for (const key of NUTRIENT_KEYS) out[key] = (a[key] ?? 0) + (b[key] ?? 0);
  return out;
}

export function scaleNutrition(n, factor) {
  assertFiniteNonNegative(factor, 'Factor');
  const out = emptyNutrition();
  for (const key of NUTRIENT_KEYS) out[key] = (n[key] ?? 0) * factor;
  return out;
}

/** Round every nutrient (storage precision; avoids float noise like 46.50000000001). */
export function roundNutrition(n, decimals = 4) {
  const f = 10 ** decimals;
  const out = emptyNutrition();
  for (const key of NUTRIENT_KEYS) out[key] = Math.round((n[key] ?? 0) * f) / f;
  return out;
}

/**
 * Calculate a recipe.
 *
 * @param {Array<{ ingredient: {
 *   id?: number, name?: string, baseUnit: 'g'|'ml'|'pc', gramsPerUnit?: number,
 *   nutrition: Record<string, number>, costPerUnit?: number|null }, quantity: number }>} lines
 *   `quantity` is in the ingredient's base unit for the WHOLE recipe.
 * @param {{ servings?: number }} [options] number of servings the recipe yields (≥ 1).
 */
export function calculateRecipe(lines, { servings = 1 } = {}) {
  if (!Array.isArray(lines)) throw new TypeError('lines must be an array');
  if (!Number.isFinite(servings) || servings < 1) throw new RangeError('servings must be ≥ 1');

  let total = emptyNutrition();
  let totalWeightG = 0;
  let totalCost = 0;
  let costComplete = true;

  const detailed = lines.map(({ ingredient, quantity }) => {
    if (!(quantity > 0)) throw new RangeError(`Quantity for "${ingredient.name ?? ingredient.id}" must be > 0`);
    const grams = toGrams(quantity, ingredient);
    const nutrition = nutritionForGrams(ingredient.nutrition, grams);
    const hasCost = typeof ingredient.costPerUnit === 'number' && ingredient.costPerUnit > 0;
    const cost = hasCost ? quantity * ingredient.costPerUnit : 0;
    if (!hasCost) costComplete = false;

    total = addNutrition(total, nutrition);
    totalWeightG += grams;
    totalCost += cost;
    return { ingredientId: ingredient.id, name: ingredient.name, quantity, grams, nutrition, cost, hasCost };
  });

  const perServing = scaleNutrition(total, 1 / servings);
  return {
    servings,
    lines: detailed,
    total,
    perServing,
    totalWeightG,
    servingWeightG: totalWeightG / servings,
    /** Estimated ingredient cost in millimes (estimate — excludes labour, packaging, waste). */
    totalCost,
    costPerServing: totalCost / servings,
    /** false when at least one ingredient has no cost recorded → cost is an underestimate. */
    costComplete,
    /** Nutrition per 100 g of finished meal (useful for labels). */
    per100g: totalWeightG > 0 ? scaleNutrition(total, 100 / totalWeightG) : emptyNutrition(),
  };
}

/**
 * Energy from macros using Atwater factors (4/4/9). Used only as a data-quality
 * warning when entering ingredient values — never to replace entered kcal.
 */
export function atwaterKcal(n) {
  return 4 * (n.protein ?? 0) + 4 * (n.carbs ?? 0) + 9 * (n.fat ?? 0);
}

/**
 * Check entered per-100 g values for obvious mistakes.
 * @returns {string[]} warning codes (empty when plausible)
 */
export function nutritionWarnings(per100g) {
  const warnings = [];
  const macroGrams = (per100g.protein ?? 0) + (per100g.carbs ?? 0) + (per100g.fat ?? 0) + (per100g.fiber ?? 0);
  if (macroGrams > 100.5) warnings.push('macros_exceed_100g');
  if ((per100g.sugar ?? 0) > (per100g.carbs ?? 0) + 0.01) warnings.push('sugar_exceeds_carbs');
  if ((per100g.satFat ?? 0) > (per100g.fat ?? 0) + 0.01) warnings.push('satfat_exceeds_fat');
  if ((per100g.kcal ?? 0) > 900) warnings.push('kcal_above_900');
  const expected = atwaterKcal(per100g);
  const kcal = per100g.kcal ?? 0;
  if (expected > 20 && Math.abs(kcal - expected) / expected > 0.2) warnings.push('kcal_inconsistent_with_macros');
  return warnings;
}

/** Display formatting: trims trailing zeros (247.5 → "247.5", 330.0 → "330"). */
export function formatNutrient(value, key) {
  const def = NUTRIENTS.find((n) => n.key === key);
  const decimals = def ? def.decimals : 1;
  const f = 10 ** decimals;
  const rounded = Math.round((value ?? 0) * f) / f;
  return String(Number(rounded.toFixed(decimals)));
}

export function nutrientUnit(key) {
  return NUTRIENTS.find((n) => n.key === key)?.unit ?? '';
}

/** Percentage of the daily reference intake, or null when no reference exists. */
export function percentOfDailyReference(value, key) {
  const ref = DAILY_REFERENCE[key];
  return ref ? (value / ref) * 100 : null;
}
