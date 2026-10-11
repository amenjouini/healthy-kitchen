import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  calculateRecipe, nutritionForGrams, toGrams, formatNutrient, nutritionWarnings, roundNutrition,
} from '../nutrition.js';

const chicken = {
  id: 1, name: 'Chicken', baseUnit: 'g', costPerUnit: 25, // 25 millimes/g = 25 DT/kg
  nutrition: { kcal: 165, protein: 31, carbs: 0, fat: 3.6, satFat: 1, fiber: 0, sugar: 0, sodium: 74 },
};
const rice = {
  id: 2, name: 'Rice', baseUnit: 'g', costPerUnit: 4,
  nutrition: { kcal: 130, protein: 2.7, carbs: 28.2, fat: 0.3, satFat: 0.1, fiber: 0.4, sugar: 0.1, sodium: 1 },
};
const oliveOil = {
  id: 3, name: 'Olive oil', baseUnit: 'ml', gramsPerUnit: 0.91, costPerUnit: 30,
  nutrition: { kcal: 884, protein: 0, carbs: 0, fat: 100, satFat: 13.8, fiber: 0, sugar: 0, sodium: 2 },
};
const egg = {
  id: 4, name: 'Egg', baseUnit: 'pc', gramsPerUnit: 50, costPerUnit: null,
  nutrition: { kcal: 143, protein: 12.6, carbs: 0.7, fat: 9.5, satFat: 3.1, fiber: 0, sugar: 0.4, sodium: 142 },
};

const close = (a, b, eps = 1e-9) => assert.ok(Math.abs(a - b) < eps, `${a} ≉ ${b}`);

test('100 g returns the per-100 g values exactly', () => {
  const n = nutritionForGrams(chicken.nutrition, 100);
  assert.deepEqual(n, chicken.nutrition);
});

test('200 g doubles every nutrient', () => {
  const n = nutritionForGrams(chicken.nutrition, 200);
  close(n.kcal, 330); close(n.protein, 62); close(n.fat, 7.2); close(n.sodium, 148);
});

test('150 g chicken = 247.5 kcal / 46.5 g protein (spec example)', () => {
  const r = calculateRecipe([{ ingredient: chicken, quantity: 150 }]);
  close(r.total.kcal, 247.5); close(r.total.protein, 46.5); close(r.total.carbs, 0); close(r.total.fat, 5.4);
  assert.equal(formatNutrient(r.total.kcal, 'kcal'), '247.5');
});

test('decimal quantities are exact', () => {
  const r = calculateRecipe([{ ingredient: chicken, quantity: 12.5 }]);
  close(r.total.kcal, 20.625); close(r.total.protein, 3.875);
  close(r.totalWeightG, 12.5);
});

test('multiple ingredients sum correctly incl. ml density and pieces', () => {
  const r = calculateRecipe([
    { ingredient: chicken, quantity: 150 },
    { ingredient: rice, quantity: 100 },
    { ingredient: oliveOil, quantity: 10 }, // 10 ml × 0.91 = 9.1 g
    { ingredient: egg, quantity: 1 }, // 1 piece = 50 g
  ]);
  close(r.totalWeightG, 150 + 100 + 9.1 + 50);
  close(r.total.kcal, 247.5 + 130 + 884 * 0.091 + 143 * 0.5);
  close(r.total.fat, 5.4 + 0.3 + 9.1 + 4.75);
  close(r.total.sodium, 111 + 1 + 0.182 + 71);
  // Cost: 150×25 + 100×4 + 10×30 = 4450 millimes; egg has no cost → incomplete.
  close(r.totalCost, 4450);
  assert.equal(r.costComplete, false);
});

test('servings divide totals; serving weight follows', () => {
  const lines = [{ ingredient: chicken, quantity: 300 }, { ingredient: rice, quantity: 200 }];
  const one = calculateRecipe(lines, { servings: 1 });
  const two = calculateRecipe(lines, { servings: 2 });
  close(two.perServing.kcal, one.total.kcal / 2);
  close(two.perServing.protein, (93 + 5.4) / 2);
  close(two.servingWeightG, 250);
  close(two.costPerServing, (300 * 25 + 200 * 4) / 2);
  assert.equal(two.costComplete, true);
});

test('per-100 g of a finished meal is weight-normalised', () => {
  const r = calculateRecipe([{ ingredient: chicken, quantity: 100 }, { ingredient: rice, quantity: 100 }]);
  close(r.per100g.kcal, (165 + 130) / 2);
});

test('rejects invalid input', () => {
  assert.throws(() => calculateRecipe([{ ingredient: chicken, quantity: 0 }]), RangeError);
  assert.throws(() => calculateRecipe([{ ingredient: chicken, quantity: -5 }]), RangeError);
  assert.throws(() => calculateRecipe([{ ingredient: chicken, quantity: Number.NaN }]), RangeError);
  assert.throws(() => calculateRecipe([], { servings: 0 }), RangeError);
  assert.throws(() => toGrams(1, { baseUnit: 'pc', gramsPerUnit: 0 }), RangeError);
  assert.throws(() => toGrams(1, { baseUnit: 'kg' }), RangeError);
});

test('empty recipe is all zeros', () => {
  const r = calculateRecipe([]);
  assert.equal(r.total.kcal, 0); assert.equal(r.totalWeightG, 0); assert.equal(r.per100g.kcal, 0);
});

test('roundNutrition removes float noise', () => {
  const r = roundNutrition({ kcal: 0.1 + 0.2, protein: 46.50000000001 });
  assert.equal(r.kcal, 0.3); assert.equal(r.protein, 46.5);
});

test('nutrition warnings catch obvious data-entry mistakes', () => {
  assert.deepEqual(nutritionWarnings(chicken.nutrition), []);
  assert.ok(nutritionWarnings({ kcal: 50, protein: 31, carbs: 0, fat: 3.6 }).includes('kcal_inconsistent_with_macros'));
  assert.ok(nutritionWarnings({ kcal: 100, carbs: 5, sugar: 10 }).includes('sugar_exceeds_carbs'));
  assert.ok(nutritionWarnings({ protein: 60, carbs: 60 }).includes('macros_exceed_100g'));
});
