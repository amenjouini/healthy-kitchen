import { motion } from 'framer-motion';
import { Heart, Plus } from 'lucide-react';
import { localized } from '@/i18n/LangContext';
import { formatMoney } from '@/utils/format';
import { MacroLine } from '@/components/domain/NutritionFacts';
import { cn } from '@/utils/cn';

export default function DishCard({ meal, lang, t, onOpen, onAdd, favorite, onToggleFavorite, reason }) {
  const soldOut = meal.availability !== 'available';
  const tag = localized(meal, 'tag', lang);
  return (
    <motion.article
      layout
      whileHover={{ y: -6 }}
      transition={{ type: 'spring', stiffness: 300, damping: 24 }}
      className="group flex flex-col overflow-hidden rounded-3xl border border-sage/20 bg-sand shadow-[0_4px_20px_rgba(26,46,26,0.06)]"
    >
      <button type="button" onClick={onOpen} className="relative block cursor-pointer overflow-hidden text-start" aria-label={localized(meal, 'name', lang)}>
        {meal.imageUrl ? (
          <motion.img whileHover={{ scale: 1.05 }} transition={{ duration: 0.6 }} src={meal.imageUrl} alt="" loading="lazy" className={cn('h-52 w-full object-cover sm:h-56', soldOut && 'grayscale')} />
        ) : <div className="h-52 w-full bg-mint/50 sm:h-56" />}
        {tag && <span className="absolute start-3 top-3 rounded-full bg-cream/90 px-3 py-1 text-xs font-semibold text-moss backdrop-blur">{tag}</span>}
        {reason && <span className="absolute bottom-3 start-3 rounded-full bg-forest/80 px-3 py-1 text-xs font-semibold text-mint">{reason}</span>}
        {soldOut && <span className="absolute inset-x-0 bottom-0 bg-forest/75 py-2 text-center text-sm font-semibold text-linen">{t('Sold out for now')}</span>}
      </button>
      <div className="flex flex-1 flex-col p-5">
        <div className="flex items-start justify-between gap-3">
          <h3 className="font-serif text-2xl font-bold leading-tight text-forest">{localized(meal, 'name', lang)}</h3>
          {onToggleFavorite && (
            <motion.button whileTap={{ scale: 0.8 }} type="button" onClick={onToggleFavorite} className="-me-2 -mt-1 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full hover:bg-moss/8" aria-pressed={favorite} aria-label={t(favorite ? 'Remove from favourites' : 'Add to favourites')}>
              <Heart className={cn('h-5 w-5', favorite ? 'fill-clay text-clay' : 'text-stone')} />
            </motion.button>
          )}
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-stone">{localized(meal, 'description', lang)}</p>
        <MacroLine nutrition={meal.nutrition} t={t} className="mt-2" />
        <div className="mt-auto flex items-center justify-between gap-3 pt-4">
          <span className="font-serif text-2xl font-bold text-forest">{formatMoney(meal.priceMillimes)}</span>
          <motion.button
            whileTap={{ scale: 0.94 }}
            type="button"
            disabled={soldOut}
            onClick={onAdd}
            className="inline-flex min-h-11 cursor-pointer items-center gap-1.5 rounded-full bg-forest px-5 text-sm font-semibold text-linen hover:bg-moss disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Plus className="h-4 w-4" aria-hidden /> {t('Add')}
          </motion.button>
        </div>
      </div>
    </motion.article>
  );
}
