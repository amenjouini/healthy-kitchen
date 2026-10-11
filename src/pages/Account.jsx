import { useEffect, useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import { LogOut, Package, RotateCcw } from 'lucide-react';
import Button from '@/components/ui/Button';
import { TextField } from '@/components/ui/Form';
import { Card } from '@/components/ui/Data';
import { EmptyState, Spinner, useToast } from '@/components/ui/Feedback';
import { OrderStatusBadge } from '@/components/domain/Badges';
import { useAuth } from '@/context/AuthContext';
import { useCart } from '@/context/CartContext';
import { useApi } from '@/hooks/useApi';
import { useCatalogIngredients, useCatalogMeals } from '@/hooks/useCatalog';
import { useLang, useT, localized } from '@/i18n/LangContext';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatMoney } from '@/utils/format';
import { customBowlToCartItem, mealToCartItem } from '@/utils/cart';
import { calculateRecipe } from '@shared/nutrition';

function Profile({ user, t, onSaved }) {
  const toast = useToast();
  const [form, setForm] = useState({ name: user.name ?? '', phone: user.customer?.phone ?? '', city: user.customer?.city ?? '', address: user.customer?.address ?? '' });
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.patch('/api/me/profile', form);
      onSaved(r.user);
      toast(t('Saved'));
    } catch (err) { toast(errorMessage(err, t), 'danger'); } finally { setSaving(false); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  return (
    <form onSubmit={save} className="grid gap-3">
      <TextField label={t('Full name')} value={form.name} onChange={set('name')} />
      <TextField label={t('Phone (WhatsApp)')} value={form.phone} onChange={set('phone')} type="tel" />
      <TextField label={t('City')} value={form.city} onChange={set('city')} />
      <TextField as="textarea" label={t('Address')} value={form.address} onChange={set('address')} rows={2} />
      <Button type="submit" loading={saving} className="justify-self-start">{t('Save')}</Button>
    </form>
  );
}

function PasswordForm({ t }) {
  const toast = useToast();
  const [form, setForm] = useState({ currentPassword: '', newPassword: '' });
  const [saving, setSaving] = useState(false);
  const save = async (e) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.post('/api/auth/password', form);
      setForm({ currentPassword: '', newPassword: '' });
      toast(t('Password updated'));
    } catch (err) { toast(errorMessage(err, t), 'danger'); } finally { setSaving(false); }
  };
  return (
    <form onSubmit={save} className="grid gap-3">
      <TextField label={t('Current password')} type="password" autoComplete="current-password" value={form.currentPassword} onChange={(e) => setForm((f) => ({ ...f, currentPassword: e.target.value }))} />
      <TextField label={t('New password (8+ characters)')} type="password" autoComplete="new-password" minLength={8} value={form.newPassword} onChange={(e) => setForm((f) => ({ ...f, newPassword: e.target.value }))} />
      <Button type="submit" variant="secondary" loading={saving} className="justify-self-start">{t('Change password')}</Button>
    </form>
  );
}

export default function Account() {
  const { user, ready, logout, setUser, isStaff } = useAuth();
  const { lang, dir } = useLang();
  const t = useT();
  const toast = useToast();
  const cart = useCart();
  const navigate = useNavigate();
  const { data, loading } = useApi(user && !isStaff ? '/api/me/orders' : null, { poll: 30000 });
  const { data: meals } = useCatalogMeals();
  const { data: ingredients } = useCatalogIngredients();

  useEffect(() => { document.title = `${t('My account')} · Healthy Kitchen`; }, [t]);
  if (!ready) return <div className="pt-32"><Spinner /></div>;
  if (!user) return <Navigate to="/login?next=/account" replace />;

  /** Reorder at TODAY's prices; anything no longer available is skipped and reported. */
  const reorder = (order) => {
    let added = 0;
    let skipped = 0;
    for (const item of order.items) {
      if (item.kind === 'custom') {
        const picks = item.custom.map((c) => {
          const ingredient = ingredients?.find((i) => i.id === c.ingredientId);
          return { ingredient, portions: ingredient ? Math.min(3, Math.max(1, Math.round(c.quantity / ingredient.portionQty))) : 1 };
        });
        if (picks.some((p) => !p.ingredient || !p.ingredient.available)) { skipped += 1; continue; }
        const kcal = calculateRecipe(picks.map((p) => ({ ingredient: p.ingredient, quantity: p.ingredient.portionQty * p.portions }))).total.kcal;
        cart.add(customBowlToCartItem(picks, kcal, lang), item.quantity, { openCart: false });
        added += 1;
        continue;
      }
      const meal = meals?.find((m) => m.id === item.mealId);
      if (!meal || meal.availability !== 'available') { skipped += 1; continue; }
      cart.add(mealToCartItem(meal), item.quantity, { openCart: false });
      added += 1;
    }
    if (added) cart.setOpen(true);
    toast(skipped ? t('{n} item(s) are no longer available and were skipped', { n: skipped }) : t('Added to your cart at current prices'), skipped && !added ? 'danger' : 'success');
  };

  return (
    <div dir={dir} className="mx-auto max-w-5xl px-4 pb-24 pt-24 sm:px-8 sm:pt-28">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">{t('My account')}</p>
          <h1 className="mt-1 font-serif text-4xl font-semibold sm:text-5xl">{t('Hello, {name}', { name: user.name.split(' ')[0] })}</h1>
        </div>
        <div className="flex gap-2">
          {isStaff && <Link to={user.permissions.length ? '/staff' : '/'} className="inline-flex min-h-11 items-center rounded-xl bg-forest px-4 text-sm font-semibold text-linen">{t('Open dashboard')}</Link>}
          <Button variant="secondary" onClick={async () => { await logout(); navigate('/'); }}><LogOut className="h-4 w-4" /> {t('Sign out')}</Button>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_340px]">
        <section>
          <h2 className="mb-3 font-serif text-2xl font-semibold">{t('My orders')}</h2>
          {loading && <Spinner />}
          {data && data.items.length === 0 && (
            <EmptyState icon={Package} title={t('No orders yet')} action={<Link to="/menu" className="inline-flex min-h-11 items-center rounded-xl bg-forest px-5 text-sm font-semibold text-linen">{t('Browse the menu')}</Link>} />
          )}
          <ul className="flex flex-col gap-3">
            {data?.items.map((o) => (
              <Card as="li" key={o.id} className="p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <Link to={`/track/${o.number}?t=${o.trackingToken}`} className="font-semibold text-forest underline-offset-2 hover:underline">{o.number}</Link>
                    <p className="text-xs text-stone">{formatDateTime(o.createdAt, lang)}</p>
                  </div>
                  <OrderStatusBadge status={o.status} t={t} />
                </div>
                <p className="mt-2 text-sm text-muted">{o.items.map((i) => `${i.quantity}× ${i.kind === 'custom' ? t('Custom bowl') : localized(meals?.find((m) => m.id === i.mealId) ?? { name: i.name }, 'name', lang)}`).join(' · ')}</p>
                <div className="mt-3 flex items-center justify-between gap-3">
                  <span className="font-serif text-xl font-bold">{formatMoney(o.totalMillimes)}</span>
                  <Button size="sm" variant="secondary" onClick={() => reorder(o)}><RotateCcw className="h-4 w-4" /> {t('Reorder')}</Button>
                </div>
              </Card>
            ))}
          </ul>
        </section>
        <aside className="flex flex-col gap-4">
          <Card className="p-4 sm:p-5"><h2 className="mb-3 font-semibold">{t('Profile')}</h2><Profile user={user} t={t} onSaved={setUser} /></Card>
          <Card className="p-4 sm:p-5"><h2 className="mb-3 font-semibold">{t('Password')}</h2><PasswordForm t={t} /></Card>
        </aside>
      </div>
    </div>
  );
}
