/** Helpers to turn catalogue data into cart lines (display snapshot only — the server re-prices). */
import { localized } from '@/i18n/LangContext';

export function mealToCartItem(meal) {
  return {
    mealId: meal.id,
    name: { fr: meal.name, en: meal.nameEn || meal.name, ar: meal.nameAr || meal.name },
    unitPriceMillimes: meal.priceMillimes,
    kcal: meal.nutrition?.kcal ?? null,
    imageUrl: meal.imageUrl,
  };
}

/** @param {Array<{ ingredient: object, portions: number }>} picks */
export function customBowlToCartItem(picks, kcal, lang) {
  return {
    custom: picks.map((p) => ({ ingredientId: p.ingredient.id, portions: p.portions })),
    name: 'custom',
    summary: picks.map((p) => `${p.portions > 1 ? `${p.portions}× ` : ''}${localized(p.ingredient, 'name', lang)}`).join(', '),
    unitPriceMillimes: picks.reduce((s, p) => s + p.ingredient.portionPriceMillimes * p.portions, 0),
    kcal,
  };
}

export function cartItemName(item, lang, t) {
  if (item.custom) return t('Custom bowl');
  if (typeof item.name === 'string') return item.name;
  return (lang === 'en' && item.name?.en) || (lang === 'ar' && item.name?.ar) || item.name?.fr || '';
}
