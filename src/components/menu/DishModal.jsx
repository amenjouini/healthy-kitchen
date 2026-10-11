import { useState } from 'react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { NutritionFacts } from '@/components/domain/NutritionFacts';
import { QuantityStepper } from '@/components/cart/CartDrawer';
import { localized } from '@/i18n/LangContext';
import { formatMoney } from '@/utils/format';

export default function DishModal({ meal, open, onClose, onAdd, lang, t, dir }) {
  const [qty, setQty] = useState(1);
  if (!meal) return null;
  const soldOut = meal.availability !== 'available';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={localized(meal, 'name', lang)}
      subtitle={localized(meal, 'tag', lang)}
      size="lg"
      dir={dir}
      footer={(
        <div className="flex items-center justify-between gap-3">
          <QuantityStepper value={qty} onChange={setQty} min={1} label={t('Quantity')} />
          <Button size="lg" disabled={soldOut} onClick={() => { onAdd(qty); setQty(1); }} className="flex-1 sm:flex-none">
            {soldOut ? t('Sold out for now') : `${t('Add to order')} · ${formatMoney(meal.priceMillimes * qty)}`}
          </Button>
        </div>
      )}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <div>
          {meal.imageUrl && <img src={meal.imageUrl} alt="" className="h-56 w-full rounded-2xl object-cover sm:h-64" />}
          <p className="mt-4 text-sm leading-relaxed text-muted">{localized(meal, 'description', lang)}</p>
          {meal.ingredients?.length > 0 && (
            <div className="mt-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-stone">{t('Ingredients')}</p>
              <p className="mt-1 text-sm text-forest">{meal.ingredients.map((i) => localized(i, 'name', lang)).join(' · ')}</p>
            </div>
          )}
        </div>
        <NutritionFacts nutrition={meal.nutrition} weightG={meal.servingWeightG} t={t} />
      </div>
    </Modal>
  );
}
