/**
 * Unit helpers. Quantities are stored in base units (g | ml | pc); people think in
 * kg / L / pieces when buying, so costs are entered "per kg", "per L" or "per piece".
 */

/** The unit a cost is entered in, for a given base unit. */
export const PRICING_UNIT = { g: 'kg', ml: 'L', pc: 'pc' };
const BASE_PER_PRICING_UNIT = { g: 1000, ml: 1000, pc: 1 };

/** millimes per kg|L|pc → millimes per g|ml|pc (what is stored). */
export function costPerBaseUnit(millimesPerPricingUnit, baseUnit) {
  return millimesPerPricingUnit / BASE_PER_PRICING_UNIT[baseUnit];
}

/** millimes per g|ml|pc → millimes per kg|L|pc (what is displayed). */
export function costPerPricingUnit(costPerUnit, baseUnit) {
  return costPerUnit == null ? null : costPerUnit * BASE_PER_PRICING_UNIT[baseUnit];
}

/** 1500, 'g' → "1.5 kg"; 250, 'g' → "250 g"; 3, 'pc' → "3 pc". */
export function formatQuantity(qty, baseUnit) {
  const value = Number(qty) || 0;
  const round = (n, d = 2) => String(Number((Math.round(n * 10 ** d) / 10 ** d).toFixed(d)));
  if ((baseUnit === 'g' || baseUnit === 'ml') && Math.abs(value) >= 1000) {
    return `${round(value / 1000)} ${baseUnit === 'g' ? 'kg' : 'L'}`;
  }
  return `${round(value, baseUnit === 'pc' ? 2 : 1)} ${baseUnit}`;
}
