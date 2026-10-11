import { useMemo } from 'react';
import { calculateRecipe } from '@shared/nutrition';

/**
 * Live recipe calculation for builders. Wraps the single shared calculator
 * (shared/nutrition.js) — the server runs the exact same code when saving/ordering.
 * Invalid lines (missing ingredient or quantity ≤ 0) are skipped for the preview.
 * @param {Array<{ ingredient: object, quantity: number }>} lines
 */
export function useNutritionCalculator(lines, servings = 1) {
  return useMemo(() => {
    const valid = lines.filter((l) => l.ingredient && Number(l.quantity) > 0);
    try {
      return calculateRecipe(valid.map((l) => ({ ingredient: l.ingredient, quantity: Number(l.quantity) })), { servings: Math.max(1, Number(servings) || 1) });
    } catch {
      return calculateRecipe([], { servings: 1 });
    }
  }, [lines, servings]);
}
