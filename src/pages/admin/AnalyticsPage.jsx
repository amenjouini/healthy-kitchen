import { useEffect, useState } from 'react';
import { useDash } from '@/components/dashboard/DashboardContext';
import { ChartCard, BarsChart } from '@/components/dashboard/AnalyticsChart';
import { InsightsList, PeriodPicker } from '@/components/dashboard/Insights';
import { DataTable, PageHeader, Stat, Bar } from '@/components/ui/Data';
import { Segmented } from '@/components/ui/Form';
import { EmptyState, ErrorState, Spinner } from '@/components/ui/Feedback';
import { useApi } from '@/hooks/useApi';
import { usePeriod } from '@/hooks/usePeriod';
import { qs } from '@/lib/api';
import { formatDate, formatMoney, formatQuantity, pct } from '@/utils/format';
import { SOURCE_LABELS } from '@/components/domain/labels';

const dt = (m) => formatMoney(m, { symbol: '' });
const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function Meals({ meals, t }) {
  const max = Math.max(1, ...meals.map((m) => m.units));
  const finance = meals[0] && 'estimatedMarginMillimes' in meals[0];
  return (
    <DataTable rows={meals} rowKey={(m) => m.mealId} empty={<EmptyState title={t('No data for this period')} />}
      columns={[
        { key: 'name', header: t('Meal'), mobile: 'title', render: (m) => <span className="font-semibold">{m.name}</span> },
        { key: 'units', header: t('Portions sold'), render: (m) => <span className="flex min-w-28 items-center gap-2 tabular-nums"><b className="w-8">{m.units}</b><Bar value={m.units} max={max} /></span> },
        { key: 'revenue', header: t('Revenue'), className: 'tabular-nums', render: (m) => formatMoney(m.revenueMillimes) },
        ...(finance ? [
          { key: 'margin', header: t('Est. margin'), className: 'tabular-nums', render: (m) => formatMoney(m.estimatedMarginMillimes) },
          { key: 'marginPct', header: t('Margin % (current)'), className: 'tabular-nums', render: (m) => <span className={m.currentMarginPct != null && m.currentMarginPct < 50 ? 'font-semibold text-clay' : ''}>{pct(m.currentMarginPct)}</span> },
        ] : []),
        { key: 'cancel', header: t('Refused / cancelled'), className: 'tabular-nums', render: (m) => (m.cancelledUnits ? `${m.cancelledUnits} (${pct(m.cancellationRate * 100)})` : '—') },
        { key: 'reorder', header: t('Re-ordered by'), className: 'tabular-nums', render: (m) => (m.customers ? `${pct(m.reorderRate * 100)} ${t('of customers')}` : '—') },
      ]} />
  );
}

function Ingredients({ items, t }) {
  const finance = items[0] && 'usedCostMillimes' in items[0];
  const rows = items.filter((i) => i.used > 0 || i.wasted > 0 || i.purchased > 0);
  return (
    <DataTable rows={rows} rowKey={(i) => i.ingredientId} empty={<EmptyState title={t('No stock movements in this period')} />}
      columns={[
        { key: 'name', header: t('Ingredient'), mobile: 'title', render: (i) => <span className="font-semibold">{i.name}</span> },
        { key: 'used', header: t('Used'), className: 'tabular-nums', render: (i) => formatQuantity(i.used, i.baseUnit) },
        ...(finance ? [{ key: 'cost', header: t('Cost of use'), className: 'tabular-nums', render: (i) => (i.usedCostMillimes != null ? formatMoney(i.usedCostMillimes) : '—') }] : []),
        { key: 'wasted', header: t('Wasted'), className: 'tabular-nums', render: (i) => (i.wasted ? <span className={i.wasteRate >= 0.1 ? 'font-semibold text-clay' : ''}>{formatQuantity(i.wasted, i.baseUnit)} ({pct(i.wasteRate * 100)})</span> : '—') },
        ...(finance ? [{ key: 'wcost', header: t('Waste cost'), className: 'tabular-nums', render: (i) => (i.wastedCostMillimes ? formatMoney(i.wastedCostMillimes) : '—') }] : []),
        { key: 'purchased', header: t('Purchased'), className: 'tabular-nums', render: (i) => (i.purchased ? formatQuantity(i.purchased, i.baseUnit) : '—') },
      ]} />
  );
}

function Cities({ cities, t }) {
  return (
    <DataTable rows={cities} rowKey={(c) => c.city} empty={<EmptyState title={t('No data for this period')} />}
      columns={[
        { key: 'city', header: t('City'), mobile: 'title', render: (c) => <span className="font-semibold">{c.city === '—' ? t('Pickup / unknown') : c.city}</span> },
        { key: 'orders', header: t('Orders'), className: 'tabular-nums', render: (c) => c.orders },
        { key: 'revenue', header: t('Order value'), className: 'tabular-nums', render: (c) => formatMoney(c.revenueMillimes) },
        { key: 'aov', header: t('Average order'), className: 'tabular-nums', render: (c) => formatMoney(c.averageOrderMillimes) },
        { key: 'customers', header: t('Customers'), className: 'tabular-nums', render: (c) => c.customers },
        { key: 'top', header: t('Most popular'), render: (c) => c.topMeals.map((m) => `${m.name} (${m.units})`).join(', ') },
      ]} />
  );
}

function Time({ time, t }) {
  const hours = Array.from({ length: 24 }, (_, h) => ({ hour: `${String(h).padStart(2, '0')}h`, orders: time.byHour.find((b) => b.bucket === h)?.orders ?? 0 }));
  const weekdays = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ day: t(WEEKDAYS[d]), orders: time.byWeekday.find((b) => b.bucket === d)?.orders ?? 0 }));
  const days = time.byDay.map((d) => ({ day: d.bucket, orders: d.orders, revenue: d.revenueMillimes }));
  const months = time.byMonth.map((d) => ({ month: d.bucket, orders: d.orders, revenue: d.revenueMillimes }));
  const cols = (key, label) => [{ key, header: label }, { key: 'orders', header: t('Orders') }];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <ChartCard className="lg:col-span-2" title={t('Orders per day')} rows={days} columns={[...cols('day', t('Day')), { key: 'revenue', header: t('Order value'), render: (r) => formatMoney(r.revenue) }]}>
        <BarsChart data={days} xKey="day" valueKey="orders" label={t('Orders')} labelFormat={(d) => formatDate(d)} height={220} />
      </ChartCard>
      <ChartCard title={t('Orders by hour of day')} rows={hours} columns={cols('hour', t('Hour'))}>
        <BarsChart data={hours} xKey="hour" valueKey="orders" label={t('Orders')} />
      </ChartCard>
      <ChartCard title={t('Orders by weekday')} rows={weekdays} columns={cols('day', t('Day'))}>
        <BarsChart data={weekdays} xKey="day" valueKey="orders" label={t('Orders')} />
      </ChartCard>
      {months.length > 1 && (
        <ChartCard className="lg:col-span-2" title={t('Orders per month')} subtitle={t('Seasonal patterns become visible after several months of history.')} rows={months} columns={cols('month', t('Month'))}>
          <BarsChart data={months} xKey="month" valueKey="orders" label={t('Orders')} />
        </ChartCard>
      )}
    </div>
  );
}

export default function AnalyticsPage() {
  const { t } = useDash();
  const period = usePeriod(30);
  const [tab, setTab] = useState('meals');
  const { data, error, loading, reload } = useApi(`/api/analytics${qs({ from: period.from, to: period.to })}`);
  const insights = useApi('/api/insights');
  useEffect(() => { document.title = `${t('Analytics')} · Healthy Kitchen`; }, [t]);

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('Analytics')} subtitle={t('Descriptive statistics on recorded orders and stock movements.')} actions={<PeriodPicker days={period.days} setDays={period.setDays} />} />
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
            <Stat label={t('Orders')} value={data.summary.soldOrders} hint={t('{n} refused', { n: data.summary.refused })} />
            <Stat label={t('Order value')} value={dt(data.summary.orderValueMillimes)} hint="DT" />
            <Stat label={t('Average order')} value={dt(data.summary.averageOrderMillimes)} hint="DT" />
            <Stat label={t('Customers')} value={data.summary.customers} />
            <Stat label={t('By source')} value={Object.values(data.summary.sources).reduce((a, b) => a + b, 0)}
              hint={Object.entries(data.summary.sources).map(([s, n]) => `${t(SOURCE_LABELS[s])} ${n}`).join(' · ')} className="col-span-2 lg:col-span-1" />
          </div>
          <div className="-mx-3 overflow-x-auto px-3">
            <Segmented value={tab} onChange={setTab} options={[{ value: 'meals', label: t('Meals') }, { value: 'ingredients', label: t('Ingredients') }, { value: 'cities', label: t('Cities') }, { value: 'time', label: t('Time') }]} />
          </div>
          {tab === 'meals' && <Meals meals={data.meals} t={t} />}
          {tab === 'ingredients' && <Ingredients items={data.ingredients} t={t} />}
          {tab === 'cities' && <Cities cities={data.cities} t={t} />}
          {tab === 'time' && <Time time={data.time} t={t} />}
        </>
      )}
      {insights.data && <InsightsList items={insights.data.items} />}
      <p className="text-xs text-stone">{t('Predictions (demand, stock depletion, churn) are not modelled yet. The order, stock and customer history collected here is the training data they will need.')}</p>
    </div>
  );
}
