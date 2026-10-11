import { motion } from 'framer-motion';
import { NUTRIENTS, formatNutrient, percentOfDailyReference } from '@shared/nutrition';
import { cn } from '@/utils/cn';
import { NUTRIENT_LABELS } from './labels';

/**
 * Nutrition panel used everywhere (menu, builders, admin). Values come from the shared
 * calculator or from server snapshots — this component never computes nutrition itself.
 */
export function NutritionFacts({ nutrition, weightG, t, compact = false, dark = false, className }) {
  if (!nutrition) return null;
  const rows = NUTRIENTS.filter((n) => !compact || ['kcal', 'protein', 'carbs', 'fat'].includes(n.key));
  return (
    <div className={cn('rounded-2xl', dark ? 'bg-white/5 text-linen' : 'bg-white/70 text-forest', 'p-4', className)}>
      <div className="flex items-baseline justify-between">
        <p className={cn('text-xs font-semibold uppercase tracking-wide', dark ? 'text-linen/60' : 'text-stone')}>{t('Nutrition per serving')}</p>
        {weightG ? <p className={cn('text-xs', dark ? 'text-linen/50' : 'text-stone')}>{Math.round(weightG)} g</p> : null}
      </div>
      <dl className="mt-2 divide-y divide-sage/15">
        {rows.map((n) => {
          const ref = percentOfDailyReference(nutrition[n.key] ?? 0, n.key);
          const indent = n.key === 'satFat' || n.key === 'sugar';
          return (
            <div key={n.key} className={cn('flex items-center justify-between gap-3 py-1.5 text-sm', indent && 'ps-3 text-[13px]')}>
              <dt className={cn(n.key === 'kcal' && 'font-semibold', indent && (dark ? 'text-linen/70' : 'text-muted'))}>{t(NUTRIENT_LABELS[n.key])}</dt>
              <dd className="flex items-baseline gap-2 tabular-nums">
                <motion.span key={nutrition[n.key]} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }} className={cn('font-semibold', n.key === 'kcal' && 'text-base')}>
                  {formatNutrient(nutrition[n.key] ?? 0, n.key)} {n.unit}
                </motion.span>
                {ref != null && !compact && <span className={cn('w-10 text-end text-[11px]', dark ? 'text-linen/45' : 'text-stone')}>{Math.round(ref)}%</span>}
              </dd>
            </div>
          );
        })}
      </dl>
      {!compact && <p className={cn('mt-2 text-[11px] leading-snug', dark ? 'text-linen/45' : 'text-stone')}>{t('% of daily reference intake (2,000 kcal adult). Calculated from ingredient quantities.')}</p>}
    </div>
  );
}

/** One-line macro summary: "461 kcal · 54 g P · 33 g C · 13 g F" */
export function MacroLine({ nutrition, t, className }) {
  if (!nutrition) return null;
  return (
    <p className={cn('text-xs text-stone tabular-nums', className)}>
      {formatNutrient(nutrition.kcal, 'kcal')} kcal · {Math.round(nutrition.protein)} g {t('protein')} · {Math.round(nutrition.carbs)} g {t('carbs')} · {Math.round(nutrition.fat)} g {t('fat')}
    </p>
  );
}
