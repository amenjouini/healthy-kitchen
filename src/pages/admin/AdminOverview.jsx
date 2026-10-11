import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { AlertTriangle, ChefHat, PackageX, Wallet } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import { ChartCard, TimeSeriesChart } from '@/components/dashboard/AnalyticsChart';
import { InsightsList, PeriodPicker } from '@/components/dashboard/Insights';
import { Card, PageHeader, Stat, Bar, Badge } from '@/components/ui/Data';
import { Spinner } from '@/components/ui/Feedback';
import { useApi } from '@/hooks/useApi';
import { usePeriod } from '@/hooks/usePeriod';
import { useAuth } from '@/context/AuthContext';
import { qs } from '@/lib/api';
import { P } from '@shared/permissions';
import { formatMoney, formatDate } from '@/utils/format';

const dinars = (m) => formatMoney(m, { symbol: '' });

export default function AdminOverview() {
  const { t, base } = useDash();
  const { can, user } = useAuth();
  const period = usePeriod(30);
  const range = qs({ from: period.from, to: period.to });
  const finance = useApi(can(P.FINANCE_VIEW) ? `/api/finance/overview${range}` : null);
  const analytics = useApi(can(P.ANALYTICS_VIEW) ? `/api/analytics${range}` : null);
  const insights = useApi(can(P.ANALYTICS_VIEW) ? '/api/insights' : null);
  const kitchen = useApi(can(P.ORDERS_VIEW) ? '/api/staff/overview' : null, { poll: 20000 });
  useEffect(() => { document.title = `${t('Overview')} · Healthy Kitchen`; }, [t]);

  const f = finance.data;
  const a = analytics.data;
  const k = kitchen.data;
  const topMeals = (a?.meals ?? []).filter((m) => m.units > 0).slice(0, 6);
  const maxUnits = Math.max(1, ...topMeals.map((m) => m.units));

  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('Hello, {name}', { name: user.name.split(' ')[0] })} subtitle={t('Business overview')} actions={<PeriodPicker days={period.days} setDays={period.setDays} />} />

      {f && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('Revenue received')} value={dinars(f.revenue.netMillimes)} hint={t('DT · payments minus refunds')} icon={Wallet} />
          <Stat label={t('Expenses')} value={dinars(f.expenses.totalMillimes)} hint={t('DT · incl. paid salaries')} />
          <Stat label={t('Estimated result')} value={dinars(f.estimatedResultMillimes)} tone={f.estimatedResultMillimes < 0 ? 'red' : undefined} hint={t('Revenue − expenses (not statutory accounts)')} />
          <Stat label={t('Average order')} value={dinars(f.orders.averageOrderMillimes)} hint={t('{n} completed orders', { n: f.orders.completed })} />
        </div>
      )}
      {!f && a && (
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Stat label={t('Orders')} value={a.summary.soldOrders} />
          <Stat label={t('Average order')} value={dinars(a.summary.averageOrderMillimes)} hint="DT" />
          <Stat label={t('Customers')} value={a.summary.customers} />
          <Stat label={t('Refused')} value={a.summary.refused} />
        </div>
      )}

      <div className="grid gap-4 xl:grid-cols-3">
        {k && (
          <Card className="p-4 xl:col-span-1">
            <h3 className="flex items-center gap-2 font-semibold"><ChefHat className="h-4 w-4 text-sage" /> {t('Kitchen right now')}</h3>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center">
              {[['new', 'New'], ['accepted', 'Accepted'], ['preparing', 'Preparing'], ['ready', 'Ready']].map(([key, label]) => (
                <Link key={key} to={`${base}/orders?status=${key}`} className="rounded-xl bg-linen/70 py-2">
                  <p className="font-serif text-2xl font-bold">{k.counts[key]}</p>
                  <p className="text-[11px] text-stone">{t(label)}</p>
                </Link>
              ))}
            </div>
            <p className="mt-3 text-sm text-muted">{t('{n} completed today', { n: k.counts.completedToday })} · {t('≈ {n} min of work', { n: k.workload.estimatedMinutes })}</p>
            {!k.acceptingOrders && <Badge tone="amber" className="mt-2">{t('Online ordering is paused')}</Badge>}
          </Card>
        )}
        {k && (k.late.length > 0 || k.lowStock?.length > 0 || k.mealsAtRisk?.length > 0 || (f && f.outstandingCash.orders > 0)) && (
          <Card className="p-4 xl:col-span-2">
            <h3 className="flex items-center gap-2 font-semibold"><AlertTriangle className="h-4 w-4 text-clay" /> {t('Needs attention')}</h3>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {k.late.length > 0 && <li><Link className="font-semibold text-clay underline" to={`${base}/orders?late=1`}>{t('{n} late orders', { n: k.late.length })}</Link> — {k.late.map((o) => o.number).join(', ')}</li>}
              {k.mealsAtRisk?.length > 0 && <li className="flex flex-wrap items-center gap-1.5"><PackageX className="h-4 w-4 text-clay" /> {t('Meals at risk')}: {k.mealsAtRisk.map((m) => <Badge key={m.id} tone={m.state === 'out_of_stock' ? 'red' : 'amber'}>{m.name}</Badge>)}</li>}
              {k.lowStock?.length > 0 && <li><Link className="underline" to={`${base}/inventory`}>{t('{n} ingredients low or out of stock', { n: k.lowStock.length })}</Link></li>}
              {f && f.outstandingCash.orders > 0 && <li>{t('{n} completed orders still marked unpaid ({amount})', { n: f.outstandingCash.orders, amount: formatMoney(f.outstandingCash.totalMillimes) })} — <Link className="underline" to={`${base}/orders?status=completed&paymentStatus=pending`}>{t('review')}</Link></li>}
            </ul>
          </Card>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-3">
        {f && (
          <ChartCard
            className="xl:col-span-2"
            title={t('Revenue and expenses per day')}
            subtitle={t('DT · same scale')}
            series={[{ key: 'revenue', label: t('Revenue') }, { key: 'expenses', label: t('Expenses') }]}
            rows={f.series}
            columns={[{ key: 'day', header: t('Day') }, { key: 'revenue', header: t('Revenue'), render: (r) => formatMoney(r.revenue) }, { key: 'expenses', header: t('Expenses'), render: (r) => formatMoney(r.expenses) }]}
          >
            {f.series.length ? (
              <TimeSeriesChart data={f.series} xKey="day" format={(v) => dinars(v)} labelFormat={(d) => formatDate(d)}
                series={[{ key: 'revenue', label: t('Revenue') }, { key: 'expenses', label: t('Expenses') }]} />
            ) : <p className="py-10 text-center text-sm text-stone">{t('No data for this period')}</p>}
          </ChartCard>
        )}
        {a && (
          <Card className="p-4">
            <h3 className="font-semibold">{t('Best sellers')}</h3>
            <p className="text-xs text-stone">{t('Portions sold in the period')}</p>
            <ul className="mt-3 flex flex-col gap-2.5">
              {topMeals.map((m) => (
                <li key={m.mealId}>
                  <div className="flex justify-between gap-2 text-sm"><span className="truncate">{m.name}</span><b className="tabular-nums">{m.units}</b></div>
                  <Bar value={m.units} max={maxUnits} className="mt-1" />
                </li>
              ))}
              {!topMeals.length && <li className="text-sm text-stone">{t('No data for this period')}</li>}
            </ul>
            <Link to={`${base}/analytics`} className="mt-3 inline-flex min-h-9 items-center text-sm font-semibold text-moss underline">{t('Open analytics')}</Link>
          </Card>
        )}
      </div>

      {insights.data && <InsightsList items={insights.data.items} />}
      {(finance.loading || analytics.loading) && <Spinner />}
    </div>
  );
}
