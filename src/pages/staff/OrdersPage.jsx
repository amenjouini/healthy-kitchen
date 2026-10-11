import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Plus } from 'lucide-react';
import OrdersTable from '@/components/dashboard/OrdersTable';
import { useDash } from '@/components/dashboard/DashboardContext';
import { PageHeader, Pagination, SearchInput } from '@/components/ui/Data';
import { Segmented, Select, Input } from '@/components/ui/Form';
import { ErrorState, Spinner } from '@/components/ui/Feedback';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { qs } from '@/lib/api';
import { P } from '@shared/permissions';
import { ORDER_SOURCES } from '@shared/orderStatus';
import { PAYMENT_STATUS_LABELS, SOURCE_LABELS, STATUS_LABELS } from '@/components/domain/labels';

const STATUS_TABS = ['active', 'new', 'accepted', 'preparing', 'ready', 'completed', 'refused', 'cancelled', 'all'];

/** Local-midnight date (YYYY-MM-DD) → ISO instant. */
const dayStart = (d) => (d ? new Date(`${d}T00:00:00`).toISOString() : undefined);
const dayEnd = (d) => (d ? new Date(new Date(`${d}T00:00:00`).getTime() + 86400000).toISOString() : undefined);

export default function OrdersPage() {
  const { t, base } = useDash();
  const { can } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get('search') ?? '');
  const f = Object.fromEntries(params);
  const status = f.status ?? 'active';
  const page = Number(f.page ?? 1);

  // Debounce the free-text search into the URL so filters are shareable/bookmarkable.
  useEffect(() => {
    const id = setTimeout(() => setParams((p) => {
      const n = new URLSearchParams(p);
      if (search) n.set('search', search); else n.delete('search');
      n.delete('page');
      return n;
    }, { replace: true }), 300);
    return () => clearTimeout(id);
  }, [search, setParams]);

  const update = (key, value) => setParams((p) => {
    const n = new URLSearchParams(p);
    if (value) n.set(key, value); else n.delete(key);
    if (key !== 'page') n.delete('page');
    return n;
  });

  const query = qs({
    ...(status === 'active' ? { active: 1 } : status === 'all' ? {} : { status }),
    late: f.late, search: f.search, source: f.source, paymentStatus: f.paymentStatus, paymentMethod: f.paymentMethod,
    city: f.city, from: dayStart(f.from), to: dayEnd(f.to), page, pageSize: 30,
  });
  const { data, error, loading, reload } = useApi(`/api/orders${query}`, { poll: 20000 });

  useEffect(() => { document.title = `${t('Orders')} · Healthy Kitchen`; }, [t]);

  return (
    <div>
      <PageHeader
        title={t('Orders')}
        subtitle={data ? t('{n} orders', { n: data.total }) : undefined}
        actions={can(P.ORDERS_CREATE) && <Link to={`${base}/new-order`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest px-4 text-sm font-semibold text-linen"><Plus className="h-4 w-4" /> {t('New order')}</Link>}
      />
      <div className="-mx-3 mb-3 overflow-x-auto px-3">
        <Segmented size="sm" value={status} onChange={(v) => update('status', v === 'active' ? '' : v)}
          options={STATUS_TABS.map((s) => ({ value: s, label: s === 'active' ? t('In progress') : s === 'all' ? t('All') : t(STATUS_LABELS[s]) }))} />
      </div>
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-6">
        <SearchInput value={search} onChange={setSearch} placeholder={t('Number, name or phone')} className="sm:col-span-2" />
        <Select value={f.source ?? ''} onChange={(e) => update('source', e.target.value)} aria-label={t('Source')}>
          <option value="">{t('All sources')}</option>
          {ORDER_SOURCES.map((s) => <option key={s} value={s}>{t(SOURCE_LABELS[s])}</option>)}
        </Select>
        <Select value={f.paymentStatus ?? ''} onChange={(e) => update('paymentStatus', e.target.value)} aria-label={t('Payment')}>
          <option value="">{t('All payments')}</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </Select>
        <Input type="date" value={f.from ?? ''} onChange={(e) => update('from', e.target.value)} aria-label={t('From')} />
        <Input type="date" value={f.to ?? ''} onChange={(e) => update('to', e.target.value)} aria-label={t('To')} />
      </div>
      {f.late && <button type="button" onClick={() => update('late', '')} className="mb-3 min-h-9 cursor-pointer rounded-full bg-clay/10 px-3 text-xs font-semibold text-clay">{t('Late only')} ✕</button>}
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <>
          <OrdersTable orders={data.items} />
          <Pagination page={page} pageSize={data.pageSize} total={data.total} onChange={(p) => update('page', String(p))} t={t} />
        </>
      )}
    </div>
  );
}
