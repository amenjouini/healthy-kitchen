import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { UtensilsCrossed } from 'lucide-react';
import DishCard from '@/components/menu/DishCard';
import DishModal from '@/components/menu/DishModal';
import { Segmented } from '@/components/ui/Form';
import { SearchInput } from '@/components/ui/Data';
import { EmptyState, ErrorState, Skeleton, Alert, useToast } from '@/components/ui/Feedback';
import { useCatalogInfo, useCatalogMeals } from '@/hooks/useCatalog';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { useLang, useT, localized } from '@/i18n/LangContext';
import { api } from '@/lib/api';
import { useApi } from '@/hooks/useApi';
import { mealToCartItem } from '@/utils/cart';
import { formatMoney } from '@/utils/format';
import { msg } from '@/components/domain/labels';

const REASONS = { you_ordered: msg('You loved this'), ordered_together: msg('Often ordered together'), popular: msg('Popular this month') };

export default function Menu() {
  const { lang, dir } = useLang();
  const t = useT();
  const toast = useToast();
  const cart = useCart();
  const { user } = useAuth();
  const { data: meals, error, loading, reload } = useCatalogMeals();
  const { data: info } = useCatalogInfo();
  const { data: recs } = useApi('/api/me/recommendations');
  const { data: favData, setData: setFav } = useApi(user ? '/api/me/favorites' : null);
  const [params, setParams] = useSearchParams();
  const [category, setCategory] = useState('all');
  const [search, setSearch] = useState('');
  const [onlyFavorites, setOnlyFavorites] = useState(false);
  const openSlug = params.get('m');
  const favorites = useMemo(() => new Set(favData?.mealIds ?? []), [favData]);

  useEffect(() => { document.title = `${t('Menu')} · Healthy Kitchen`; }, [t]);

  const filtered = useMemo(() => (meals ?? []).filter((m) => {
    if (category !== 'all' && m.categoryKey !== category) return false;
    if (onlyFavorites && !favorites.has(m.id)) return false;
    if (search) {
      const q = search.toLowerCase();
      return [m.name, m.nameEn, m.nameAr, m.description, m.descriptionEn].some((s) => s?.toLowerCase().includes(q));
    }
    return true;
  }), [meals, category, search, onlyFavorites, favorites]);

  const byId = useMemo(() => new Map((meals ?? []).map((m) => [m.id, m])), [meals]);
  const recommended = (recs?.items ?? []).map((r) => ({ meal: byId.get(r.mealId), reason: r.reason })).filter((r) => r.meal && r.meal.availability === 'available').slice(0, 3);
  const bundles = (info?.bundles ?? []).map((b) => b.mealIds.map((id) => byId.get(id))).filter((pair) => pair.every((m) => m?.availability === 'available')).slice(0, 2);
  const active = openSlug ? (meals ?? []).find((m) => m.slug === openSlug) : null;

  const add = (meal, qty = 1) => {
    cart.add(mealToCartItem(meal), qty, { openCart: false });
    toast(t('{name} added to your order', { name: localized(meal, 'name', lang) }));
  };

  const toggleFavorite = async (meal) => {
    const isFav = favorites.has(meal.id);
    setFav((d) => ({ mealIds: isFav ? (d?.mealIds ?? []).filter((id) => id !== meal.id) : [...(d?.mealIds ?? []), meal.id] }));
    try {
      if (isFav) await api.del(`/api/me/favorites/${meal.id}`);
      else await api.post(`/api/me/favorites/${meal.id}`);
    } catch {
      toast(t('Could not update favourites'), 'danger');
    }
  };

  const cardProps = (meal, reason) => ({
    meal, lang, t, reason,
    onOpen: () => setParams({ m: meal.slug }),
    onAdd: () => add(meal),
    favorite: favorites.has(meal.id),
    onToggleFavorite: user ? () => toggleFavorite(meal) : undefined,
  });

  const categories = [{ value: 'all', label: t('All') }, ...(info?.categories ?? []).map((c) => ({ value: c.key, label: localized(c, 'name', lang) }))];

  return (
    <div dir={dir} className="mx-auto max-w-6xl px-4 pb-20 pt-24 sm:px-8 sm:pt-28">
      <motion.header initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">{t('Full menu')}</p>
        <h1 className="mt-2 font-serif text-5xl font-semibold leading-none text-forest sm:text-6xl">{t('Our dishes')}</h1>
        <p className="mt-3 max-w-xl text-sm text-muted">{t('Nutrition for every dish is calculated from the exact quantity of each ingredient.')}</p>
      </motion.header>

      {info && !info.acceptingOrders && <Alert tone="warning" className="mb-6" title={t('We are not taking online orders right now')}>{t('You can still browse the menu.')}</Alert>}

      {recommended.length > 0 && (
        <section className="mb-10">
          <h2 className="mb-4 font-serif text-3xl font-semibold">{t(user ? 'Picked for you' : 'Popular right now')}</h2>
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {recommended.map(({ meal, reason }) => <DishCard key={meal.id} {...cardProps(meal, t(REASONS[reason]))} />)}
          </div>
        </section>
      )}

      <div className="sticky top-16 z-20 -mx-4 mb-6 flex flex-col gap-3 bg-cream/95 px-4 py-3 backdrop-blur sm:top-[72px] sm:-mx-8 sm:flex-row sm:items-center sm:justify-between sm:px-8">
        <div className="-mx-1 overflow-x-auto px-1"><Segmented value={category} onChange={setCategory} options={categories} /></div>
        <div className="flex items-center gap-2">
          {user && (
            <button type="button" onClick={() => setOnlyFavorites((v) => !v)} className={`min-h-11 cursor-pointer whitespace-nowrap rounded-xl px-3 text-sm font-semibold ${onlyFavorites ? 'bg-clay text-white' : 'bg-white/70 text-olive'}`} aria-pressed={onlyFavorites}>
              ♥ {t('Favourites')}
            </button>
          )}
          <SearchInput value={search} onChange={setSearch} placeholder={t('Search dishes')} className="w-full sm:w-64" />
        </div>
      </div>

      {error && <ErrorState error={error} onRetry={reload} t={t} />}
      {loading && <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-96" />)}</div>}
      {!loading && !error && filtered.length === 0 && <EmptyState icon={UtensilsCrossed} title={t('No dishes match your search')} />}
      <motion.div layout className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {filtered.map((meal) => <DishCard key={meal.id} {...cardProps(meal)} />)}
      </motion.div>

      {bundles.length > 0 && (
        <section className="mt-14">
          <h2 className="font-serif text-3xl font-semibold">{t('Often ordered together')}</h2>
          <p className="mb-4 text-sm text-stone">{t('Based on real orders from our customers.')}</p>
          <div className="grid gap-4 sm:grid-cols-2">
            {bundles.map((pair) => (
              <div key={pair.map((m) => m.id).join('-')} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-sage/20 bg-white/70 p-4">
                <p className="font-semibold">{pair.map((m) => localized(m, 'name', lang)).join(' + ')}</p>
                <button type="button" onClick={() => pair.forEach((m) => add(m))} className="min-h-11 cursor-pointer rounded-full bg-sage px-4 text-sm font-semibold text-forest hover:bg-mint">
                  {t('Add both')} · {formatMoney(pair.reduce((s, m) => s + m.priceMillimes, 0))}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      <DishModal meal={active} open={Boolean(active)} onClose={() => setParams({})} onAdd={(q) => { add(active, q); setParams({}); }} lang={lang} t={t} dir={dir} />
    </div>
  );
}
