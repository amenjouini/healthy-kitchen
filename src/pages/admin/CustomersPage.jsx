import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, MessageCircle, Phone } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import OrdersTable from '@/components/dashboard/OrdersTable';
import Button from '@/components/ui/Button';
import { Card, DataTable, PageHeader, Pagination, SearchInput, Stat, Badge } from '@/components/ui/Data';
import { Select, TextField } from '@/components/ui/Form';
import { EmptyState, ErrorState, Spinner, useToast } from '@/components/ui/Feedback';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage, qs } from '@/lib/api';
import { P } from '@shared/permissions';
import { formatDate, formatMoney, formatPhone } from '@/utils/format';
import { SEGMENT_LABELS } from '@/components/domain/labels';

const SEGMENT_TONES = { new: 'blue', regular: 'neutral', frequent: 'green', high_value: 'purple', lapsed: 'amber' };

export function CustomersList() {
  const { t, base } = useDash();
  const navigate = useNavigate();
  const [f, setF] = useState({ search: '', city: '', segment: '', sort: 'recent', page: 1 });
  const [search, setSearch] = useState('');
  useEffect(() => { const id = setTimeout(() => setF((x) => ({ ...x, search, page: 1 })), 300); return () => clearTimeout(id); }, [search]);
  const zones = useApi('/api/zones');
  const { data, error, loading, reload } = useApi(`/api/customers${qs({ ...f, pageSize: 40 })}`);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value, page: 1 }));
  useEffect(() => { document.title = `${t('Customers')} · Healthy Kitchen`; }, [t]);

  return (
    <div>
      <PageHeader title={t('Customers')} subtitle={t('Web, WhatsApp and phone customers in one list, matched by phone number.')} />
      <div className="mb-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput value={search} onChange={setSearch} placeholder={t('Name, phone or email')} className="lg:col-span-2" />
        <Select value={f.city} onChange={set('city')} aria-label={t('City')}>
          <option value="">{t('All cities')}</option>
          {(zones.data?.items ?? []).map((z) => <option key={z.id} value={z.city}>{z.city}</option>)}
        </Select>
        <Select value={f.segment} onChange={set('segment')} aria-label={t('Segment')}>
          <option value="">{t('All segments')}</option>
          {Object.entries(SEGMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </Select>
        <Select value={f.sort} onChange={set('sort')} aria-label={t('Sort')}>
          <option value="recent">{t('Sort: last order')}</option>
          <option value="spent">{t('Sort: total spent')}</option>
          <option value="orders">{t('Sort: number of orders')}</option>
          <option value="name">{t('Sort: name')}</option>
        </Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <>
          <DataTable
            rows={data.items}
            onRowClick={(c) => navigate(`${base}/customers/${c.id}`)}
            empty={<EmptyState title={t('No customers found')} />}
            columns={[
              { key: 'name', header: t('Customer'), mobile: 'title', render: (c) => <span className="font-semibold">{c.name}{c.userId && <Badge className="ms-2" tone="green">{t('Account')}</Badge>}</span> },
              { key: 'phone', header: t('Phone'), render: (c) => (c.phone ? formatPhone(c.phone) : '—') },
              { key: 'city', header: t('City'), render: (c) => c.city ?? '—' },
              { key: 'orders', header: t('Orders'), className: 'tabular-nums', render: (c) => c.orderCount },
              { key: 'spent', header: t('Spent'), className: 'tabular-nums', render: (c) => formatMoney(c.spentMillimes) },
              { key: 'segment', header: t('Segment'), render: (c) => <Badge tone={SEGMENT_TONES[c.segment]}>{t(SEGMENT_LABELS[c.segment])}</Badge> },
              { key: 'last', header: t('Last order'), render: (c) => (c.lastOrderAt ? formatDate(c.lastOrderAt) : '—') },
            ]}
          />
          <Pagination page={f.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setF((x) => ({ ...x, page }))} t={t} />
        </>
      )}
    </div>
  );
}

export function CustomerDetail() {
  const { id } = useParams();
  const { t, base } = useDash();
  const { can } = useAuth();
  const toast = useToast();
  const { data, error, loading, reload } = useApi(`/api/customers/${id}`);
  const [notes, setNotes] = useState(null);
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} t={t} />;
  const c = data.customer;
  const canEdit = can(P.ORDERS_MANAGE) || can(P.STAFF_MANAGE);
  const saveNotes = async () => {
    try { await api.patch(`/api/customers/${id}`, { notes: notes ?? '' }); toast(t('Saved')); reload(); } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };

  return (
    <div className="flex flex-col gap-4">
      <Link to={`${base}/customers`} className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-moss"><ArrowLeft className="h-4 w-4" /> {t('Customers')}</Link>
      <PageHeader title={c.name} subtitle={<span className="flex flex-wrap items-center gap-2"><Badge tone={SEGMENT_TONES[c.segment]}>{t(SEGMENT_LABELS[c.segment])}</Badge>{t('Customer since {date}', { date: formatDate(c.createdAt) })}</span>}
        actions={c.phone && (
          <>
            <a href={`tel:+${c.phone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sage/30 bg-white/70 px-3 text-sm font-semibold"><Phone className="h-4 w-4" /> {formatPhone(c.phone)}</a>
            <a href={`https://wa.me/${c.phone}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sage/25 px-3 text-sm font-semibold text-moss"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
          </>
        )} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Stat label={t('Orders')} value={c.orderCount} />
        <Stat label={t('Spent (completed)')} value={formatMoney(c.spentMillimes, { symbol: '' })} hint="DT" />
        <Stat label={t('Average order')} value={formatMoney(c.averageOrderMillimes, { symbol: '' })} hint="DT" />
        <Stat label={t('Last order')} value={c.lastOrderAt ? formatDate(c.lastOrderAt) : '—'} className="[&_p:nth-child(2)]:text-xl" />
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          <h2 className="mb-2 font-semibold">{t('Order history')}</h2>
          <OrdersTable orders={c.orders.map((o) => ({ ...o, customerName: c.name }))} />
        </div>
        <div className="flex flex-col gap-4">
          <Card className="p-4 text-sm">
            <h3 className="mb-2 font-semibold">{t('Details')}</h3>
            <p>{c.email ?? '—'}</p>
            <p className="mt-1">{c.city ?? '—'}{c.address && <span className="block text-muted">{c.address}</span>}</p>
          </Card>
          <Card className="p-4">
            <h3 className="mb-2 font-semibold">{t('Favourite meals')}</h3>
            {c.topMeals.length ? <ul className="text-sm">{c.topMeals.map((m) => <li key={m.name} className="flex justify-between"><span>{m.name}</span><b className="tabular-nums">{m.units}</b></li>)}</ul> : <p className="text-sm text-stone">—</p>}
          </Card>
          <Card className="p-4">
            <TextField as="textarea" label={t('Internal notes')} rows={3} value={notes ?? c.notes ?? ''} onChange={(e) => setNotes(e.target.value)} disabled={!canEdit} placeholder={t('Allergies, preferences, delivery hints…')} />
            {canEdit && <Button className="mt-2" size="sm" variant="secondary" onClick={saveNotes} disabled={notes == null}>{t('Save')}</Button>}
          </Card>
        </div>
      </div>
      {!c.orders.length && <EmptyState title={t('No orders yet')} />}
    </div>
  );
}
