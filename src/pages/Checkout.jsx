import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Banknote, CreditCard, ShoppingBag, Store, Truck } from 'lucide-react';
import Button from '@/components/ui/Button';
import { TextField } from '@/components/ui/Form';
import { Card } from '@/components/ui/Data';
import { Alert, EmptyState } from '@/components/ui/Feedback';
import { QuantityStepper } from '@/components/cart/CartDrawer';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useCatalogInfo, invalidateCatalog } from '@/hooks/useCatalog';
import { useLang, useT } from '@/i18n/LangContext';
import { api, errorMessage } from '@/lib/api';
import { formatMoney } from '@/utils/format';
import { cartItemName } from '@/utils/cart';
import { normalizePhone } from '@shared/phone';
import { cn } from '@/utils/cn';

function Choice({ selected, onClick, icon: Icon, title, subtitle, disabled }) {
  return (
    <motion.button
      type="button"
      whileTap={disabled ? undefined : { scale: 0.97 }}
      onClick={onClick}
      disabled={disabled}
      aria-pressed={selected}
      className={cn(
        'flex min-h-16 flex-1 cursor-pointer items-center gap-3 rounded-2xl border p-3 text-start',
        selected ? 'border-moss bg-moss/8 ring-2 ring-sage/40' : 'border-sage/30 bg-white/70',
        disabled && 'cursor-not-allowed opacity-50',
      )}
    >
      <Icon className="h-5 w-5 shrink-0 text-moss" aria-hidden />
      <span>
        <span className="block text-sm font-semibold">{title}</span>
        {subtitle && <span className="block text-xs text-stone">{subtitle}</span>}
      </span>
    </motion.button>
  );
}

export default function Checkout() {
  const cart = useCart();
  const { user } = useAuth();
  const { lang, dir } = useLang();
  const t = useT();
  const navigate = useNavigate();
  const { data: info } = useCatalogInfo();
  const [form, setForm] = useState(() => ({
    name: user?.name ?? '', phone: user?.customer?.phone ?? user?.phone ?? '', email: user?.email ?? '',
    fulfillment: 'delivery', zoneId: '', address: user?.customer?.address ?? '', notes: '', requestedFor: '', paymentMethod: 'cash',
  }));
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [serverError, setServerError] = useState(null);

  useEffect(() => { document.title = `${t('Checkout')} · Healthy Kitchen`; }, [t]);
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e?.target ? e.target.value : e }));

  const zones = useMemo(() => info?.zones ?? [], [info]);
  // Default to the customer's saved city when it matches a delivery zone.
  const savedZone = user?.customer?.city ? zones.find((z) => z.city.toLowerCase() === user.customer.city.toLowerCase()) : null;
  const zoneId = form.zoneId || (savedZone ? String(savedZone.id) : '');
  const zone = zones.find((z) => String(z.id) === zoneId);

  const deliveryFee = form.fulfillment === 'delivery' && zone ? zone.feeMillimes : 0;
  const total = cart.subtotalMillimes + deliveryFee;
  const belowMinimum = form.fulfillment === 'delivery' && zone && cart.subtotalMillimes < zone.minOrderMillimes;

  const validate = () => {
    const e = {};
    if (!form.name.trim()) e.name = t('Please enter your name');
    if (!normalizePhone(form.phone)) e.phone = t('Please enter a valid phone number');
    if (form.fulfillment === 'delivery') {
      if (!zoneId) e.zoneId = t('Choose your city');
      if (!form.address.trim()) e.address = t('Please enter your address');
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const payload = useMemo(() => ({
    items: cart.items.map((i) => (i.custom ? { custom: i.custom, quantity: i.quantity } : { mealId: i.mealId, quantity: i.quantity })),
    customer: { name: form.name.trim(), phone: form.phone, ...(form.email && { email: form.email }) },
    fulfillment: form.fulfillment,
    ...(form.fulfillment === 'delivery' && { zoneId: Number(zoneId), address: form.address.trim() }),
    ...(form.notes.trim() && { notes: form.notes.trim() }),
    ...(form.requestedFor && { requestedFor: new Date(form.requestedFor).toISOString() }),
    paymentMethod: form.paymentMethod,
  }), [cart.items, form, zoneId]);

  const submit = async (e) => {
    e.preventDefault();
    setServerError(null);
    if (!validate() || belowMinimum) return;
    setSubmitting(true);
    try {
      const { order } = await api.post('/api/orders', payload);
      cart.clear();
      invalidateCatalog(); // stock changed
      navigate(`/track/${order.number}?t=${order.trackingToken}&new=1`);
    } catch (err) {
      if (['insufficient_stock', 'meal_unavailable', 'ingredient_unavailable'].includes(err.code)) invalidateCatalog();
      setServerError(err);
    } finally {
      setSubmitting(false);
    }
  };

  if (cart.items.length === 0) {
    return (
      <div dir={dir} className="mx-auto max-w-xl px-4 pb-20 pt-28">
        <EmptyState icon={ShoppingBag} title={t('Your cart is empty')} action={<Link to="/menu" className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-forest px-5 text-sm font-semibold text-linen">{t('Browse the menu')}</Link>} />
      </div>
    );
  }

  return (
    <form dir={dir} onSubmit={submit} noValidate className="mx-auto grid max-w-6xl gap-6 px-4 pb-24 pt-24 sm:px-8 sm:pt-28 lg:grid-cols-[1fr_380px]">
      <div className="flex flex-col gap-5">
        <h1 className="font-serif text-4xl font-semibold sm:text-5xl">{t('Checkout')}</h1>
        {info && !info.acceptingOrders && <Alert tone="warning" title={t('We are not taking online orders right now')} />}

        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">{t('Your details')}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <TextField label={t('Full name')} value={form.name} onChange={set('name')} error={errors.name} required autoComplete="name" />
            <TextField label={t('Phone (WhatsApp)')} value={form.phone} onChange={set('phone')} error={errors.phone} required type="tel" inputMode="tel" autoComplete="tel" placeholder="98 123 456" />
            <TextField label={t('Email (optional)')} value={form.email} onChange={set('email')} type="email" autoComplete="email" className="sm:col-span-2" />
          </div>
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">{t('Delivery or pickup')}</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Choice selected={form.fulfillment === 'delivery'} onClick={() => setForm((f) => ({ ...f, fulfillment: 'delivery' }))} icon={Truck} title={t('Delivery')} subtitle={zones.length ? t('{n} cities served', { n: zones.length }) : t('No delivery zones yet')} disabled={!zones.length} />
            <Choice selected={form.fulfillment === 'pickup'} onClick={() => setForm((f) => ({ ...f, fulfillment: 'pickup' }))} icon={Store} title={t('Pickup')} subtitle={t('Collect at the kitchen')} />
          </div>
          {form.fulfillment === 'delivery' && (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <TextField as="select" label={t('City')} value={zoneId} onChange={set('zoneId')} error={errors.zoneId} required>
                <option value="">{t('Choose…')}</option>
                {zones.map((z) => <option key={z.id} value={z.id}>{z.city} — {z.feeMillimes ? formatMoney(z.feeMillimes) : t('free delivery')}</option>)}
              </TextField>
              <TextField label={t('Preferred time (optional)')} type="datetime-local" value={form.requestedFor} onChange={set('requestedFor')} />
              <TextField as="textarea" label={t('Address')} value={form.address} onChange={set('address')} error={errors.address} required rows={2} className="sm:col-span-2" autoComplete="street-address" />
            </div>
          )}
          {form.fulfillment === 'pickup' && (
            <TextField className="mt-4 sm:max-w-xs" label={t('Pickup time (optional)')} type="datetime-local" value={form.requestedFor} onChange={set('requestedFor')} />
          )}
          <TextField as="textarea" className="mt-3" label={t('Notes for the kitchen (optional)')} value={form.notes} onChange={set('notes')} rows={2} maxLength={500} placeholder={t('Allergies, no onions, door code…')} />
        </Card>

        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">{t('Payment')}</h2>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Choice selected={form.paymentMethod === 'cash'} onClick={() => setForm((f) => ({ ...f, paymentMethod: 'cash' }))} icon={Banknote} title={t('Cash')} subtitle={t('Pay on delivery or pickup')} />
            <Choice selected={form.paymentMethod === 'online'} onClick={() => setForm((f) => ({ ...f, paymentMethod: 'online' }))} icon={CreditCard} title={t('Online payment')} subtitle={info?.onlinePaymentAvailable ? t('Card') : t('Coming soon')} disabled={!info?.onlinePaymentAvailable} />
          </div>
        </Card>
      </div>

      <aside className="lg:sticky lg:top-24 lg:self-start">
        <Card className="p-4 sm:p-5">
          <h2 className="mb-3 font-semibold">{t('Order summary')}</h2>
          <ul className="flex flex-col gap-3">
            {cart.items.map((item) => (
              <li key={item.key} className="flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{cartItemName(item, lang, t)}</p>
                  {item.custom && <p className="truncate text-xs text-stone">{item.summary}</p>}
                  <p className="text-xs text-stone tabular-nums">{formatMoney(item.unitPriceMillimes)}</p>
                </div>
                <QuantityStepper value={item.quantity} onChange={(q) => cart.setQuantity(item.key, q)} label={t('Quantity')} />
              </li>
            ))}
          </ul>
          <dl className="mt-4 flex flex-col gap-1.5 border-t border-sage/20 pt-3 text-sm">
            <div className="flex justify-between"><dt className="text-muted">{t('Subtotal')}</dt><dd className="tabular-nums">{formatMoney(cart.subtotalMillimes)}</dd></div>
            {form.fulfillment === 'delivery' && <div className="flex justify-between"><dt className="text-muted">{t('Delivery')}</dt><dd className="tabular-nums">{zone ? formatMoney(deliveryFee) : '—'}</dd></div>}
            <div className="flex justify-between pt-1 text-base font-bold"><dt>{t('Total')}</dt><dd className="font-serif text-2xl tabular-nums">{formatMoney(total)}</dd></div>
          </dl>
          {belowMinimum && <Alert tone="warning" className="mt-3">{t('Minimum order for {city} is {amount}.', { city: zone.city, amount: formatMoney(zone.minOrderMillimes) })}</Alert>}
          {serverError && (
            <Alert tone="danger" className="mt-3" title={errorMessage(serverError, t)}>
              {serverError.details?.shortages && (
                <ul className="mt-1 list-disc ps-4">{serverError.details.shortages.map((s) => <li key={s.ingredientId}>{s.name}</li>)}</ul>
              )}
            </Alert>
          )}
          <Button type="submit" size="lg" loading={submitting} disabled={belowMinimum || (info && !info.acceptingOrders)} className="mt-4 w-full">
            {t('Place order')} · {formatMoney(total)}
          </Button>
          <p className="mt-2 text-center text-xs text-stone">{t('You will receive a tracking link right after ordering.')}</p>
        </Card>
      </aside>
    </form>
  );
}
