/**
 * Business insights: explicit, rule-based observations computed from real data.
 * Each rule has a minimum-data threshold and returns the numbers it is based on,
 * so nothing is shown when there is not enough history. Not AI, not predictions.
 */
import { mealAnalytics, ingredientAnalytics, cityAnalytics, timeAnalytics } from './analytics.js';

const DAY = 86400_000;

function windowTs(daysAgoStart, daysAgoEnd) {
  return { fromTs: new Date(Date.now() - daysAgoStart * DAY).toISOString(), toTs: new Date(Date.now() - daysAgoEnd * DAY).toISOString() };
}

export function computeInsights(db, { utcOffsetMinutes }) {
  const insights = [];
  const thisWeek = windowTs(7, 0);
  const lastWeek = windowTs(14, 7);
  const month = windowTs(30, 0);

  // 1. Week-over-week meal sales change (both weeks need ≥ 5 units and a ≥ 25 % change).
  const lastByMeal = new Map(mealAnalytics(db, lastWeek).map((m) => [m.mealId, m]));
  for (const m of mealAnalytics(db, thisWeek)) {
    const prev = lastByMeal.get(m.mealId);
    if (!prev || m.units < 5 || prev.units < 5) continue;
    const change = (m.units - prev.units) / prev.units;
    if (Math.abs(change) >= 0.25) {
      insights.push({
        type: change > 0 ? 'meal_sales_up' : 'meal_sales_down', severity: change > 0 ? 'positive' : 'warning',
        params: { meal: m.name, thisWeek: m.units, lastWeek: prev.units, changePct: Math.round(change * 100) },
      });
    }
  }

  const meals30 = mealAnalytics(db, month).filter((m) => m.units > 0);
  const totalUnits = meals30.reduce((s, m) => s + m.units, 0);

  // 2. Strong seller with weak estimated margin (top-third by units, margin < 50 %, cost data complete).
  if (meals30.length >= 3 && totalUnits >= 20) {
    const cutoff = [...meals30].sort((a, b) => b.units - a.units)[Math.floor(meals30.length / 3)]?.units ?? Infinity;
    for (const m of meals30) {
      if (m.units >= cutoff && m.costComplete && m.currentMarginPct != null && m.currentMarginPct < 50) {
        insights.push({ type: 'high_sales_low_margin', severity: 'warning', params: { meal: m.name, units: m.units, marginPct: Math.round(m.currentMarginPct) } });
      }
    }
  }

  // 3. Frequently cancelled/refused meal (≥ 5 cancelled units and ≥ 20 % of demand).
  for (const m of mealAnalytics(db, month)) {
    if (m.cancelledUnits >= 5 && m.cancellationRate >= 0.2) {
      insights.push({ type: 'meal_often_cancelled', severity: 'warning', params: { meal: m.name, cancelled: m.cancelledUnits, ratePct: Math.round(m.cancellationRate * 100) } });
    }
  }

  // 4. Leading city (≥ 10 orders overall, leader ≥ 30 % share).
  const cities = cityAnalytics(db, month);
  const cityOrders = cities.reduce((s, c) => s + c.orders, 0);
  if (cityOrders >= 10 && cities[0] && cities[0].city !== '—' && cities[0].orders / cityOrders >= 0.3) {
    insights.push({ type: 'top_city', severity: 'info', params: { city: cities[0].city, orders: cities[0].orders, sharePct: Math.round((cities[0].orders / cityOrders) * 100) } });
  }

  // 5. Peak ordering window (≥ 20 orders; best 2 consecutive hours with ≥ 30 % of orders).
  const byHour = timeAnalytics(db, { ...month, utcOffsetMinutes }).byHour;
  const hourOrders = byHour.reduce((s, h) => s + h.orders, 0);
  if (hourOrders >= 20) {
    const counts = Array.from({ length: 24 }, (_, h) => byHour.find((b) => b.bucket === h)?.orders ?? 0);
    let best = 0;
    for (let h = 1; h < 24; h += 1) if (counts[h] + counts[h - 1] > counts[best] + counts[(best + 23) % 24]) best = h;
    const start = (best + 23) % 24;
    const share = (counts[start] + counts[best]) / hourOrders;
    if (share >= 0.3) insights.push({ type: 'peak_hours', severity: 'info', params: { from: `${String(start).padStart(2, '0')}:00`, to: `${String(best + 1).padStart(2, '0')}:00`, sharePct: Math.round(share * 100) } });
  }

  // 6. Ingredients: high usage AND high cost (top-3 by usage cost with ≥ 25 % of total), and waste.
  const ingredients = ingredientAnalytics(db, month);
  const usedCost = ingredients.reduce((s, i) => s + (i.usedCostMillimes ?? 0), 0);
  if (usedCost > 0) {
    for (const i of ingredients.slice(0, 3)) {
      if ((i.usedCostMillimes ?? 0) / usedCost >= 0.25) {
        insights.push({ type: 'expensive_ingredient', severity: 'info', params: { ingredient: i.name, costMillimes: i.usedCostMillimes, sharePct: Math.round((i.usedCostMillimes / usedCost) * 100) } });
      }
    }
  }
  for (const i of ingredients) {
    if (i.wasted > 0 && i.wasteRate >= 0.1 && (i.wastedCostMillimes ?? 0) >= 5000) {
      insights.push({ type: 'high_waste', severity: 'warning', params: { ingredient: i.name, ratePct: Math.round(i.wasteRate * 100), costMillimes: i.wastedCostMillimes } });
    }
  }
  return insights;
}
