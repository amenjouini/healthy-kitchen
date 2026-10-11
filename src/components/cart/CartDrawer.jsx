import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Minus, Plus, ShoppingBag, Trash2 } from 'lucide-react';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import { EmptyState } from '@/components/ui/Feedback';
import { useCart } from '@/context/CartContext';
import { useLang, useT } from '@/i18n/LangContext';
import { formatMoney } from '@/utils/format';
import { useCatalogMeals } from '@/hooks/useCatalog';
import { cartItemName } from '@/utils/cart';

export function QuantityStepper({ value, onChange, min = 0, max = 50, label }) {
  return (
    <div className="inline-flex items-center rounded-xl border border-sage/30 bg-white/80" role="group" aria-label={label}>
      <motion.button whileTap={{ scale: 0.85 }} type="button" className="flex h-10 w-10 cursor-pointer items-center justify-center text-moss disabled:opacity-40" onClick={() => onChange(value - 1)} disabled={value <= min} aria-label="−">
        {value <= 1 && min === 0 ? <Trash2 className="h-4 w-4" /> : <Minus className="h-4 w-4" />}
      </motion.button>
      <span className="w-8 text-center text-sm font-bold tabular-nums">{value}</span>
      <motion.button whileTap={{ scale: 0.85 }} type="button" className="flex h-10 w-10 cursor-pointer items-center justify-center text-moss disabled:opacity-40" onClick={() => onChange(value + 1)} disabled={value >= max} aria-label="+">
        <Plus className="h-4 w-4" />
      </motion.button>
    </div>
  );
}

export default function CartDrawer() {
  const cart = useCart();
  const { lang, dir } = useLang();
  const t = useT();
  const navigate = useNavigate();
  const { data: meals } = useCatalogMeals();
  // Meals that became unavailable since they were added are flagged before checkout.
  const unavailable = new Set((meals ?? []).filter((m) => m.availability !== 'available').map((m) => m.id));

  return (
    <Modal
      open={cart.open}
      onClose={() => cart.setOpen(false)}
      title={t('Your order')}
      side="right"
      dir={dir}
      footer={cart.items.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-baseline justify-between">
            <span className="text-sm text-muted">{t('Subtotal')}</span>
            <span className="font-serif text-2xl font-bold">{formatMoney(cart.subtotalMillimes)}</span>
          </div>
          <Button size="lg" onClick={() => { cart.setOpen(false); navigate('/checkout'); }}>{t('Checkout')}</Button>
        </div>
      )}
    >
      {cart.items.length === 0 ? (
        <EmptyState icon={ShoppingBag} title={t('Your cart is empty')}>
          <Button variant="secondary" className="mt-2" onClick={() => { cart.setOpen(false); navigate('/menu'); }}>{t('Browse the menu')}</Button>
        </EmptyState>
      ) : (
        <ul className="flex flex-col gap-3">
          {cart.items.map((item) => (
            <motion.li layout key={item.key} className="flex gap-3 rounded-2xl bg-white/70 p-3">
              {item.imageUrl ? (
                <img src={item.imageUrl} alt="" className="h-16 w-16 shrink-0 rounded-xl object-cover" />
              ) : (
                <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-xl bg-mint/50 font-serif text-xl font-bold text-moss">HK</div>
              )}
              <div className="min-w-0 flex-1">
                <p className="font-semibold leading-snug">{cartItemName(item, lang, t)}</p>
                {item.custom && <p className="truncate text-xs text-stone">{item.summary}</p>}
                {item.kcal != null && <p className="text-xs text-stone">{Math.round(item.kcal)} kcal</p>}
                {item.mealId && unavailable.has(item.mealId) && <p className="text-xs font-semibold text-clay">{t('Currently unavailable')}</p>}
                <div className="mt-2 flex items-center justify-between gap-2">
                  <QuantityStepper value={item.quantity} onChange={(q) => cart.setQuantity(item.key, q)} label={t('Quantity')} />
                  <span className="font-semibold tabular-nums">{formatMoney(item.unitPriceMillimes * item.quantity)}</span>
                </div>
              </div>
            </motion.li>
          ))}
          <p className="text-xs text-stone">{t('Prices are confirmed when you place the order.')}</p>
        </ul>
      )}
    </Modal>
  );
}
