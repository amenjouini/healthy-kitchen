/** Inventory: stock levels, movement ledger, manual movements, requirement checks. */
import { v, validate } from '../http/validate.js';
import { forbidden, notFound } from '../http/errors.js';
import { can } from '../http/router.js';
import { P } from '../../shared/permissions.js';
import { costPerBaseUnit } from '../../shared/units.js';
import { listIngredients, updateIngredient } from '../services/ingredients.js';
import { listMovements, recordManualMovement, stockForecast, checkRequirements, MANUAL_MOVEMENT_TYPES } from '../services/inventory.js';
import { createExpense } from '../services/finance.js';

export default function register(r, { db }) {
  r.get('/api/inventory', { perm: P.INVENTORY_VIEW }, (ctx) => {
    const q = validate({ search: v.string({ max: 100 }).optional(), stock: v.oneOf(['low', 'out']).optional() }, ctx.query);
    const forecast = new Map(stockForecast(db).map((f) => [f.ingredientId, f]));
    const showCost = can(ctx, P.FINANCE_VIEW) || can(ctx, P.INGREDIENTS_MANAGE);
    return {
      items: listIngredients(db, q).map((i) => ({
        id: i.id, name: i.name, baseUnit: i.baseUnit, trackStock: i.trackStock, stockQty: i.stockQty, reservedQty: i.reservedQty,
        availableQty: i.availableQty, reorderLevel: i.reorderLevel, stockState: i.stockState,
        avgDailyUse: forecast.get(i.id)?.avgDailyUse ?? 0, daysLeft: forecast.get(i.id)?.daysLeft ?? null,
        ...(showCost && { costPerUnit: i.costPerUnit }),
      })),
    };
  });

  r.get('/api/inventory/movements', { perm: P.INVENTORY_VIEW }, (ctx) => {
    const q = validate({
      ingredientId: v.id().optional(), type: v.oneOf([...MANUAL_MOVEMENT_TYPES, 'opening']).optional(),
      from: v.datetime().optional(), to: v.datetime().optional(),
      page: v.int({ min: 1 }).default(1), pageSize: v.int({ min: 1, max: 200 }).default(50),
    }, ctx.query);
    return listMovements(db, q);
  });

  r.post('/api/inventory/movements', { perm: P.INVENTORY_MANAGE }, (ctx) => {
    const data = validate({
      ingredientId: v.id(), type: v.oneOf(MANUAL_MOVEMENT_TYPES),
      quantity: v.number({ min: 0.001, max: 1e7 }).optional(), countedQuantity: v.number({ min: 0, max: 1e7 }).optional(),
      reason: v.string({ max: 300 }).optional(),
      unitCostPerPricingUnit: v.money().optional(), // DT per kg / L / piece
      updateCost: v.boolean().default(false), recordExpense: v.boolean().default(false), reference: v.string({ max: 120 }).optional(),
    }, ctx.body);
    const ing = db.get('SELECT base_unit FROM ingredients WHERE id = ?', data.ingredientId);
    if (!ing) throw notFound('Ingredient');
    if (data.updateCost && !can(ctx, P.INGREDIENTS_MANAGE)) throw forbidden('Updating ingredient cost requires ingredient management permission');
    if (data.recordExpense && !can(ctx, P.EXPENSES_MANAGE)) throw forbidden('Recording an expense requires expense permission');
    const unitCost = data.unitCostPerPricingUnit != null ? costPerBaseUnit(data.unitCostPerPricingUnit, ing.base_unit) : null;
    const movement = recordManualMovement(db, ctx.actor, { ...data, unitCost }, {
      updateIngredientCost: data.updateCost ? (id, cost) => updateIngredient(db, ctx.actor, id, { costPerUnit: cost }) : null,
      recordExpense: data.recordExpense ? (e) => createExpense(db, ctx.actor, e) : null,
    });
    ctx.status = 201;
    return { movement };
  });

  /** "Can we make 20 × Chicken Bowl?" — aggregated ingredient requirement vs. available stock. */
  r.post('/api/inventory/check', { perm: P.INVENTORY_VIEW }, (ctx) => {
    const { items } = validate({ items: v.array(v.object({ mealId: v.id(), quantity: v.int({ min: 1, max: 10_000 }) }), { min: 1, max: 50 }) }, ctx.body);
    const requirements = new Map();
    for (const it of items) {
      const meal = db.get('SELECT servings FROM meals WHERE id = ?', it.mealId);
      if (!meal) throw notFound('Meal');
      for (const line of db.all('SELECT ingredient_id, quantity FROM meal_ingredients WHERE meal_id = ?', it.mealId)) {
        requirements.set(line.ingredient_id, (requirements.get(line.ingredient_id) ?? 0) + (line.quantity / meal.servings) * it.quantity);
      }
    }
    return { lines: checkRequirements(db, requirements) };
  });
}
