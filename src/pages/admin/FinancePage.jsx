import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Paperclip, Plus, Info } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import { ChartCard, BarsChart } from '@/components/dashboard/AnalyticsChart';
import { PeriodPicker } from '@/components/dashboard/Insights';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { Card, DataTable, PageHeader, Pagination, SearchInput, Stat, Badge } from '@/components/ui/Data';
import { Segmented, Select, TextField, Input } from '@/components/ui/Form';
import { Alert, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui/Feedback';
import { PaymentBadge } from '@/components/domain/Badges';
import { useApi } from '@/hooks/useApi';
import { usePeriod } from '@/hooks/usePeriod';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage, fileToBase64, qs } from '@/lib/api';
import { P } from '@shared/permissions';
import { formatDate, formatDateTime, formatMoney, isoDay, pct } from '@/utils/format';
import { EXPENSE_LABELS, PAYMENT_METHOD_LABELS, PAYMENT_STATUS_LABELS } from '@/components/domain/labels';

const money = (m) => formatMoney(m, { fixed: true });

function Overview() {
  const { t } = useDash();
  const period = usePeriod(30);
  const { data: f, loading, error, reload } = useApi(`/api/finance/overview${qs({ from: period.from, to: period.to })}`);
  const margins = useApi('/api/finance/meal-margins');
  if (error) return <ErrorState error={error} onRetry={reload} t={t} />;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <PeriodPicker days={period.days} setDays={period.setDays} />
        <p className="flex items-center gap-1 text-xs text-stone"><Info className="h-3.5 w-3.5" /> {t('Management figures (cash basis, estimates). Not statutory accounting; no VAT handling.')}</p>
      </div>
      {loading ? <Spinner /> : (
        <>
          <div className="grid gap-4 lg:grid-cols-[1fr_1fr]">
            <Card className="p-4">
              <h3 className="font-semibold">{t('Result for the period')}</h3>
              <dl className="mt-3 flex flex-col gap-1.5 text-sm tabular-nums">
                <div className="flex justify-between"><dt>{t('Payments received')}</dt><dd>{money(f.revenue.grossMillimes)}</dd></div>
                <div className="flex justify-between text-stone"><dt>− {t('Refunds')}</dt><dd>{money(f.revenue.refundedMillimes)}</dd></div>
                <div className="flex justify-between border-t border-sage/20 pt-1.5 font-semibold"><dt>{t('Revenue')}</dt><dd>{money(f.revenue.netMillimes)}</dd></div>
                <div className="flex justify-between text-stone"><dt>− {t('Expenses')}</dt><dd>{money(f.expenses.totalMillimes)}</dd></div>
                <div className={`flex justify-between border-t border-sage/20 pt-1.5 text-base font-bold ${f.estimatedResultMillimes < 0 ? 'text-clay' : ''}`}><dt>= {t('Estimated result')}</dt><dd>{money(f.estimatedResultMillimes)}</dd></div>
              </dl>
            </Card>
            <Card className="p-4">
              <h3 className="font-semibold">{t('Estimated gross margin on food')}</h3>
              <p className="text-xs text-stone">{t('Completed orders · ingredient cost from recipe snapshots')}</p>
              <dl className="mt-3 flex flex-col gap-1.5 text-sm tabular-nums">
                <div className="flex justify-between"><dt>{t('Food sales')}</dt><dd>{money(f.estimatedGrossMargin.foodSalesMillimes)}</dd></div>
                <div className="flex justify-between text-stone"><dt>− {t('Est. ingredient cost')}</dt><dd>{money(f.estimatedGrossMargin.estimatedIngredientCostMillimes)}</dd></div>
                <div className="flex justify-between border-t border-sage/20 pt-1.5 font-semibold"><dt>{t('Est. gross margin')}</dt><dd>{money(f.estimatedGrossMargin.marginMillimes)} · {pct(f.estimatedGrossMargin.marginPct)}</dd></div>
              </dl>
            </Card>
          </div>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('Completed orders')} value={f.orders.completed} hint={t('{a} refused · {b} cancelled', { a: f.orders.refused, b: f.orders.cancelled })} />
            <Stat label={t('Average order')} value={formatMoney(f.orders.averageOrderMillimes, { symbol: '' })} hint="DT" />
            {['cash', 'online'].map((m) => {
              const row = f.paymentMethods.find((x) => x.method === m);
              return <Stat key={m} label={t(PAYMENT_METHOD_LABELS[m])} value={formatMoney(row?.netMillimes ?? 0, { symbol: '' })} hint={t('DT · {n} payments', { n: row?.count ?? 0 })} />;
            })}
          </div>
          {f.outstandingCash.orders > 0 && <Alert tone="warning">{t('{n} completed orders are still marked unpaid ({amount}).', { n: f.outstandingCash.orders, amount: formatMoney(f.outstandingCash.totalMillimes) })}</Alert>}
          <div className="grid gap-4 lg:grid-cols-2">
            <ChartCard title={t('Expenses by category')} subtitle="DT"
              rows={f.expenses.byCategory} columns={[{ key: 'category', header: t('Category'), render: (r) => t(EXPENSE_LABELS[r.category]) }, { key: 'totalMillimes', header: t('Total'), render: (r) => money(r.totalMillimes) }]}>
              {f.expenses.byCategory.length ? (
                <BarsChart layout="horizontal" height={Math.max(160, f.expenses.byCategory.length * 34)} data={f.expenses.byCategory.map((e) => ({ ...e, label: t(EXPENSE_LABELS[e.category]) }))}
                  xKey="label" valueKey="totalMillimes" label={t('Expenses')} format={(v) => formatMoney(v, { symbol: '' })} />
              ) : <p className="py-8 text-center text-sm text-stone">{t('No expenses in this period')}</p>}
            </ChartCard>
            <Card className="p-4">
              <h3 className="font-semibold">{t('Meal margins (current recipes)')}</h3>
              <p className="text-xs text-stone">{t('Price vs. estimated ingredient cost per serving. * = some ingredient costs missing.')}</p>
              {margins.data && (
                <table className="mt-3 w-full text-sm">
                  <thead><tr className="text-xs uppercase text-stone"><th className="text-start">{t('Meal')}</th><th className="text-end">{t('Cost')}</th><th className="text-end">{t('Margin')}</th><th className="text-end">{t('Sold 30 d')}</th></tr></thead>
                  <tbody>
                    {margins.data.items.map((m) => (
                      <tr key={m.id} className="border-t border-sage/10">
                        <td className="py-1.5">{m.name}</td>
                        <td className="text-end tabular-nums">{formatMoney(Math.round(m.costPerServing ?? 0))}</td>
                        <td className={`text-end tabular-nums ${m.marginPct != null && m.marginPct < 50 ? 'font-semibold text-clay' : ''}`}>{pct(m.marginPct)}{!m.costComplete && '*'}</td>
                        <td className="text-end tabular-nums">{m.unitsSold30d}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}

function ExpenseEditor({ expense, onClose, onSaved }) {
  const { t } = useDash();
  const toast = useToast();
  const [form, setForm] = useState({
    category: expense?.category ?? 'ingredients', amount: expense ? String(expense.amountMillimes / 1000) : '', expenseDate: expense?.expenseDate ?? isoDay(0),
    description: expense?.description ?? '', reference: expense?.reference ?? '', attachmentId: expense?.attachmentId ?? null,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const linked = expense?.salaryPaymentId;
  const upload = async (file) => {
    if (!file) return;
    try {
      const r = await api.post('/api/uploads', { fileName: file.name, mime: file.type, dataBase64: await fileToBase64(file), visibility: 'private' });
      setForm((f) => ({ ...f, attachmentId: r.upload.id }));
      toast(t('File attached'));
    } catch (err) { setError(err); }
  };
  const save = async () => {
    setBusy(true); setError(null);
    const body = { ...form, amount: form.amount.replace(',', '.'), reference: form.reference || null };
    try {
      if (expense) await api.patch(`/api/expenses/${expense.id}`, body); else await api.post('/api/expenses', body);
      onSaved(); onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };
  const remove = async () => {
    try { await api.del(`/api/expenses/${expense.id}`); toast(t('Expense deleted')); onSaved(); onClose(); } catch (err) { setError(err); }
  };
  return (
    <Modal open onClose={onClose} title={expense ? t('Edit expense') : t('New expense')}
      footer={!linked && (
        <div className="flex justify-between gap-2">
          {expense ? <Button variant="dangerOutline" onClick={remove}>{t('Delete')}</Button> : <span />}
          <Button loading={busy} onClick={save} disabled={!form.amount || !form.description.trim()}>{t('Save')}</Button>
        </div>
      )}>
      {linked && <Alert className="mb-3">{t('This expense comes from a salary payment — edit it in Salaries.')}</Alert>}
      <div className="grid gap-3 sm:grid-cols-2">
        <TextField as="select" label={t('Category')} value={form.category} onChange={set('category')} disabled={Boolean(linked)}>
          {Object.entries(EXPENSE_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </TextField>
        <TextField label={t('Amount (DT)')} inputMode="decimal" required value={form.amount} onChange={set('amount')} disabled={Boolean(linked)} />
        <TextField label={t('Date')} type="date" required value={form.expenseDate} onChange={set('expenseDate')} disabled={Boolean(linked)} />
        <TextField label={t('Reference / invoice no.')} value={form.reference} onChange={set('reference')} disabled={Boolean(linked)} />
        <TextField className="sm:col-span-2" label={t('Description')} required value={form.description} onChange={set('description')} disabled={Boolean(linked)} />
      </div>
      {!linked && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-sage/30 bg-white/70 px-4 text-sm font-semibold">
            <Paperclip className="h-4 w-4" /> {t(form.attachmentId ? 'Replace attachment' : 'Attach receipt (PDF / image)')}
            <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          </label>
          {form.attachmentId && <a className="text-sm text-moss underline" href={`/api/uploads/${form.attachmentId}`} target="_blank" rel="noreferrer">{t('View attachment')}</a>}
        </div>
      )}
      {error && <Alert tone="danger" className="mt-3">{errorMessage(error, t)}</Alert>}
    </Modal>
  );
}

function Expenses() {
  const { t } = useDash();
  const { can } = useAuth();
  const [f, setF] = useState({ category: '', from: isoDay(-29), to: isoDay(0), search: '', page: 1 });
  const [editing, setEditing] = useState(null);
  const { data, loading, error, reload } = useApi(`/api/expenses${qs({ ...f, pageSize: 40 })}`);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e, page: 1 }));
  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <SearchInput value={f.search} onChange={set('search')} placeholder={t('Search')} />
        <Select value={f.category} onChange={set('category')} aria-label={t('Category')}>
          <option value="">{t('All categories')}</option>
          {Object.entries(EXPENSE_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </Select>
        <Input type="date" value={f.from} onChange={set('from')} aria-label={t('From')} />
        <Input type="date" value={f.to} onChange={set('to')} aria-label={t('To')} />
        {can(P.EXPENSES_MANAGE) && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('New expense')}</Button>}
      </div>
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <>
          <p className="mb-2 text-sm text-muted">{t('{n} expenses · total {amount}', { n: data.total, amount: money(data.totalMillimes) })}</p>
          <DataTable rows={data.items} onRowClick={can(P.EXPENSES_MANAGE) ? (e) => setEditing(e) : undefined} empty={<EmptyState title={t('No expenses in this period')} />}
            columns={[
              { key: 'desc', header: t('Description'), mobile: 'title', render: (e) => <span className="font-semibold">{e.description}{e.attachmentId && <Paperclip className="ms-1 inline h-3.5 w-3.5 text-stone" />}</span> },
              { key: 'cat', header: t('Category'), render: (e) => <Badge>{t(EXPENSE_LABELS[e.category])}</Badge> },
              { key: 'amount', header: t('Amount'), className: 'tabular-nums text-end', render: (e) => money(e.amountMillimes) },
              { key: 'date', header: t('Date'), render: (e) => formatDate(e.expenseDate) },
              { key: 'ref', header: t('Reference'), render: (e) => e.reference ?? '—' },
              { key: 'by', header: t('Added by'), render: (e) => e.createdBy ?? t('System') },
            ]} />
          <Pagination page={f.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setF((x) => ({ ...x, page }))} t={t} />
        </>
      )}
      {editing && <ExpenseEditor expense={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}

function Salaries() {
  const { t } = useDash();
  const toast = useToast();
  const [period, setPeriod] = useState(isoDay(0).slice(0, 7));
  const { data, loading, reload } = useApi(`/api/salaries${qs({ period })}`);
  const generate = async () => {
    try { const r = await api.post('/api/salaries/generate', { period }); toast(t('{n} salary lines created', { n: r.created })); reload(); } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };
  const setStatus = async (s, status) => {
    try { await api.patch(`/api/salaries/${s.id}`, { status }); toast(t('Saved')); reload(); } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };
  const total = (data?.items ?? []).filter((s) => s.status !== 'cancelled').reduce((sum, s) => sum + s.amountMillimes, 0);
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-end gap-2">
        <TextField label={t('Month')} type="month" value={period} onChange={(e) => setPeriod(e.target.value)} />
        <Button variant="secondary" onClick={generate}>{t('Create lines from salaries')}</Button>
      </div>
      <p className="mb-3 text-xs text-stone">{t('Marking a salary as paid records it as a "Salaries" expense automatically.')}</p>
      {loading ? <Spinner /> : (
        <>
          <DataTable rows={data.items} empty={<EmptyState title={t('No salary lines for this month')}>{t('Set salaries on team members, then create the lines.')}</EmptyState>}
            columns={[
              { key: 'name', header: t('Employee'), mobile: 'title', render: (s) => <span className="font-semibold">{s.employeeName}</span> },
              { key: 'amount', header: t('Amount'), className: 'tabular-nums', render: (s) => money(s.amountMillimes) },
              { key: 'status', header: t('Status'), render: (s) => <Badge tone={s.status === 'paid' ? 'green' : s.status === 'cancelled' ? 'neutral' : 'amber'}>{t(s.status === 'paid' ? 'Paid' : s.status === 'cancelled' ? 'Cancelled' : 'To pay')}</Badge> },
              { key: 'paid', header: t('Paid on'), render: (s) => (s.paidAt ? formatDate(s.paidAt) : '—') },
              { key: 'actions', header: '', render: (s) => (
                <span className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                  {s.status !== 'paid' && <Button size="sm" onClick={() => setStatus(s, 'paid')}>{t('Mark paid')}</Button>}
                  {s.status === 'paid' && <Button size="sm" variant="ghost" onClick={() => setStatus(s, 'pending')}>{t('Undo')}</Button>}
                  {s.status === 'pending' && <Button size="sm" variant="ghost" onClick={() => setStatus(s, 'cancelled')}>{t('Cancel')}</Button>}
                </span>
              ) },
            ]} />
          {data.items.length > 0 && <p className="mt-2 text-sm font-semibold">{t('Total')}: {money(total)}</p>}
        </>
      )}
    </div>
  );
}

function Payments() {
  const { t, base } = useDash();
  const navigate = useNavigate();
  const [f, setF] = useState({ status: '', method: '', search: '', page: 1 });
  const { data, loading, error, reload } = useApi(`/api/payments${qs({ ...f, pageSize: 40 })}`);
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e?.target ? e.target.value : e, page: 1 }));
  return (
    <div>
      <div className="mb-3 grid gap-2 sm:grid-cols-3">
        <SearchInput value={f.search} onChange={set('search')} placeholder={t('Order, customer or reference')} />
        <Select value={f.status} onChange={set('status')} aria-label={t('Status')}>
          <option value="">{t('All statuses')}</option>
          {Object.entries(PAYMENT_STATUS_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </Select>
        <Select value={f.method} onChange={set('method')} aria-label={t('Method')}>
          <option value="">{t('All methods')}</option>
          {Object.entries(PAYMENT_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
        </Select>
      </div>
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <>
          <DataTable rows={data.items} onRowClick={(p) => navigate(`${base}/orders/${p.orderId}`)} empty={<EmptyState title={t('No payments')} />}
            columns={[
              { key: 'order', header: t('Order'), mobile: 'title', render: (p) => <span className="font-semibold">{p.orderNumber}<span className="block text-xs font-normal text-stone">{p.customerName}</span></span> },
              { key: 'status', header: t('Payment'), render: (p) => <PaymentBadge status={p.status} method={p.method} t={t} /> },
              { key: 'amount', header: t('Amount'), className: 'tabular-nums', render: (p) => money(p.amountMillimes) },
              { key: 'refunded', header: t('Refunded'), className: 'tabular-nums', render: (p) => (p.refundedMillimes ? money(p.refundedMillimes) : '—') },
              { key: 'ref', header: t('Reference'), render: (p) => <span className="font-mono text-xs">{p.providerReference ?? '—'}</span> },
              { key: 'date', header: t('Paid at'), render: (p) => <span className="text-xs text-stone">{p.paidAt ? formatDateTime(p.paidAt) : '—'}</span> },
            ]} />
          <Pagination page={f.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setF((x) => ({ ...x, page }))} t={t} />
        </>
      )}
    </div>
  );
}

export default function FinancePage() {
  const { t } = useDash();
  const { can } = useAuth();
  const [tab, setTab] = useState('overview');
  useEffect(() => { document.title = `${t('Finance')} · Healthy Kitchen`; }, [t]);
  const tabs = [
    { value: 'overview', label: t('Overview') },
    { value: 'expenses', label: t('Expenses') },
    ...(can(P.SALARIES_MANAGE) ? [{ value: 'salaries', label: t('Salaries') }] : []),
    { value: 'payments', label: t('Payments') },
  ];
  return (
    <div>
      <PageHeader title={t('Finance')} />
      <div className="-mx-3 mb-4 overflow-x-auto px-3"><Segmented value={tab} onChange={setTab} options={tabs} /></div>
      {tab === 'overview' && <Overview />}
      {tab === 'expenses' && <Expenses />}
      {tab === 'salaries' && <Salaries />}
      {tab === 'payments' && <Payments />}
    </div>
  );
}
