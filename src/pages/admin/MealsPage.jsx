import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Plus } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import { DataTable, PageHeader, SearchInput, Badge } from '@/components/ui/Data';
import { Select, Checkbox } from '@/components/ui/Form';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { AvailabilityBadge } from '@/components/domain/Badges';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { qs } from '@/lib/api';
import { P } from '@shared/permissions';
import { formatMoney, formatNutrient, pct } from '@/utils/format';
import { AVAILABILITY_LABELS } from '@/components/domain/labels';

export default function MealsPage() {
  const { t, base } = useDash();
  const { can } = useAuth();
  const navigate = useNavigate();
  const [f, setF] = useState({ search: '', categoryId: '', availability: '', sort: 'name', includeArchived: false });
  const { data, error, loading, reload } = useApi(`/api/meals${qs({ ...f, includeArchived: f.includeArchived ? 1 : undefined })}`);
  const cats = useApi('/api/categories');
  const catName = (id) => cats.data?.items.find((c) => c.id === id)?.name ?? '—';
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e }));
  useEffect(() => { document.title = `${t('Meals')} · Healthy Kitchen`; }, [t]);

  return (
    <div>
      <PageHeader title={t('Meals')} subtitle={t('Nutrition and cost are calculated from each recipe. Every change is versioned.')}
        actions={can(P.MEALS_CREATE) && <Link to={`${base}/meals/new`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest px-4 text-sm font-semibold text-linen"><Plus className="h-4 w-4" /> {t('New meal')}</Link>} />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput value={f.search} onChange={set('search')} placeholder={t('Search meals')} className="lg:col-span-2" />
        <Select value={f.categoryId} onChange={set('categoryId')} aria-label={t('Category')}>
          <option value="">{t('All categories')}</option>
          {(cats.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
        <Select value={f.availability} onChange={set('availability')} aria-label={t('Availability')}>
          <option value="">{t('Any availability')}</option>
          {Object.entries(AVAILABILITY_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </Select>
        <Select value={f.sort} onChange={set('sort')} aria-label={t('Sort')}>
          <option value="name">{t('Sort: menu order')}</option>
          <option value="popularity">{t('Sort: best sellers (30 days)')}</option>
        </Select>
      </div>
      <Checkbox checked={f.includeArchived} onChange={(v) => setF((x) => ({ ...x, includeArchived: v }))} label={t('Show archived meals')} />
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <DataTable
          className="mt-2"
          rows={data.items}
          onRowClick={(m) => navigate(`${base}/meals/${m.id}`)}
          empty={<EmptyState title={t('No meals found')} />}
          columns={[
            { key: 'name', header: t('Meal'), mobile: 'title', render: (m) => (
              <span className="flex items-center gap-3">
                {m.imageUrl ? <img src={m.imageUrl} alt="" className="hidden h-10 w-10 rounded-lg object-cover md:block" /> : null}
                <span><span className="font-semibold">{m.name}</span>{m.archivedAt && <Badge className="ms-2">{t('Archived')}</Badge>}<span className="block text-xs text-stone">{catName(m.categoryId)}</span></span>
              </span>
            ) },
            { key: 'price', header: t('Price'), className: 'tabular-nums', render: (m) => formatMoney(m.priceMillimes) },
            { key: 'kcal', header: t('Per serving'), render: (m) => m.nutrition ? <span className="text-xs tabular-nums">{formatNutrient(m.nutrition.kcal, 'kcal')} kcal · {Math.round(m.nutrition.protein)} g P</span> : '—' },
            ...(data.items[0]?.costPerServing !== undefined ? [{ key: 'margin', header: t('Est. margin'), className: 'tabular-nums', render: (m) => (
              <span className={m.marginPct != null && m.marginPct < 50 ? 'font-semibold text-clay' : ''}>{pct(m.marginPct)}{!m.costComplete && <span className="text-stone" title={t('Some ingredients have no cost')}> *</span>}</span>
            ) }] : []),
            { key: 'availability', header: t('Availability'), render: (m) => <span className="flex items-center gap-1.5"><AvailabilityBadge state={m.availability.state} t={t} />{m.availability.servingsPossible != null && m.availability.state !== 'unavailable' && <span className="text-xs text-stone">{m.availability.servingsPossible}</span>}</span> },
            { key: 'sold', header: t('Sold (30 d)'), className: 'tabular-nums', render: (m) => m.unitsSold30d },
          ]}
        />
      )}
    </div>
  );
}
