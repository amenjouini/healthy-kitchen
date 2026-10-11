import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ClipboardCheck, PackagePlus } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { Card, DataTable, PageHeader, Pagination, SearchInput, Badge } from '@/components/ui/Data';
import { Checkbox, Segmented, Select, TextField } from '@/components/ui/Form';
import { Alert, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui/Feedback';
import { StockBadge } from '@/components/domain/Badges';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage, qs } from '@/lib/api';
import { P } from '@shared/permissions';
import { formatDateTime, formatMoney, formatQuantity, costPerPricingUnit, PRICING_UNIT } from '@/utils/format';
import { MOVEMENT_LABELS } from '@/components/domain/labels';
import { cn } from '@/utils/cn';

const MANUAL_TYPES = ['purchase', 'waste', 'spoilage', 'damage', 'consumption', 'adjustment', 'return'];
const REMOVALS = ['waste', 'spoilage', 'damage', 'consumption', 'return'];
const BIG_UNIT = { g: { unit: 'kg', factor: 1000 }, ml: { unit: 'L', factor: 1000 } };

function MovementDialog({ open, onClose, items, initialId, onSaved }) {
  const { t } = useDash();
  const { can } = useAuth();
  const toast = useToast();
  const [form, setForm] = useState({ ingredientId: initialId ? String(initialId) : '', type: 'purchase', amount: '', big: true, reason: '', cost: '', updateCost: true, recordExpense: false, reference: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ing = items.find((i) => String(i.id) === form.ingredientId);
  const big = ing && BIG_UNIT[ing.baseUnit];
  const factor = big && form.big ? big.factor : 1;
  const unitLabel = ing ? (big && form.big ? big.unit : ing.baseUnit) : '';
  const qty = Number(String(form.amount).replace(',', '.')) * factor;
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const isAdjust = form.type === 'adjustment';

  const save = async () => {
    setBusy(true); setError(null);
    try {
      await api.post('/api/inventory/movements', {
        ingredientId: Number(form.ingredientId), type: form.type,
        ...(isAdjust ? { countedQuantity: qty } : { quantity: qty }),
        ...(form.reason.trim() && { reason: form.reason.trim() }),
        ...(form.type === 'purchase' && form.cost && { unitCostPerPricingUnit: form.cost, updateCost: can(P.INGREDIENTS_MANAGE) && form.updateCost, recordExpense: can(P.EXPENSES_MANAGE) && form.recordExpense }),
        ...(form.reference.trim() && { reference: form.reference.trim() }),
      });
      toast(t('Stock movement recorded'));
      onSaved();
      onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  return (
    <Modal open={open} onClose={onClose} title={t('Record stock movement')} size="md"
      footer={<Button size="lg" className="w-full" loading={busy} disabled={!ing || !(qty >= 0) || form.amount === ''} onClick={save}>{t('Save movement')}</Button>}>
      <div className="flex flex-col gap-3">
        <TextField as="select" label={t('Ingredient')} value={form.ingredientId} onChange={set('ingredientId')} required>
          <option value="">{t('Choose…')}</option>
          {items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
        </TextField>
        <div className="flex flex-wrap gap-1.5">
          {MANUAL_TYPES.map((type) => (
            <button key={type} type="button" onClick={() => setForm((f) => ({ ...f, type }))}
              className={cn('min-h-10 cursor-pointer rounded-xl px-3 text-sm font-semibold', form.type === type ? (REMOVALS.includes(type) ? 'bg-clay text-white' : 'bg-forest text-linen') : 'bg-white/70 text-olive')}>
              {REMOVALS.includes(type) ? '−' : type === 'adjustment' ? '=' : '+'} {t(MOVEMENT_LABELS[type])}
            </button>
          ))}
        </div>
        {ing && (
          <p className="text-sm text-stone">
            {t('On hand')}: <b className="text-forest">{formatQuantity(ing.stockQty, ing.baseUnit)}</b> · {t('Reserved')}: {formatQuantity(ing.reservedQty, ing.baseUnit)}
          </p>
        )}
        <div className="flex items-end gap-2">
          <TextField className="flex-1" label={isAdjust ? t('Counted quantity on the shelf') : t('Quantity')} inputMode="decimal" value={form.amount} onChange={set('amount')} required />
          {big && <Segmented value={form.big ? 'big' : 'base'} onChange={(v) => setForm((f) => ({ ...f, big: v === 'big' }))} options={[{ value: 'big', label: big.unit }, { value: 'base', label: ing.baseUnit }]} />}
          {!big && ing && <span className="pb-3 text-sm text-stone">{unitLabel}</span>}
        </div>
        {ing && isAdjust && form.amount !== '' && <p className="text-sm">{t('Change')}: <b>{formatQuantity(qty - ing.stockQty, ing.baseUnit)}</b></p>}
        <TextField label={form.type === 'purchase' ? t('Supplier / note (optional)') : `${t('Reason')} *`} value={form.reason} onChange={set('reason')} placeholder={REMOVALS.includes(form.type) ? t('e.g. dropped tray, expired, staff meal…') : ''} />
        {form.type === 'purchase' && ing && (
          <div className="rounded-xl bg-linen/70 p-3">
            <TextField label={t('Cost per {unit} (DT, optional)', { unit: PRICING_UNIT[ing.baseUnit] })} inputMode="decimal" value={form.cost} onChange={set('cost')} hint={ing.costPerUnit != null ? `${t('Current')}: ${formatMoney(costPerPricingUnit(ing.costPerUnit, ing.baseUnit))}` : undefined} />
            {form.cost && can(P.INGREDIENTS_MANAGE) && <Checkbox checked={form.updateCost} onChange={(v) => setForm((f) => ({ ...f, updateCost: v }))} label={t('Update ingredient cost')} description={t('Meal cost estimates are recalculated (new meal versions).')} />}
            {form.cost && can(P.EXPENSES_MANAGE) && <Checkbox checked={form.recordExpense} onChange={(v) => setForm((f) => ({ ...f, recordExpense: v }))} label={t('Record as an expense')} description={t('Adds an "Ingredients" expense for this purchase.')} />}
            {form.cost && form.recordExpense && <TextField className="mt-2" label={t('Invoice reference')} value={form.reference} onChange={set('reference')} />}
          </div>
        )}
        {error && <Alert tone="danger">{errorMessage(error, t)}</Alert>}
      </div>
    </Modal>
  );
}

function RequirementCheck() {
  const { t } = useDash();
  const meals = useApi('/api/meals');
  const [mealId, setMealId] = useState('');
  const [count, setCount] = useState('10');
  const [result, setResult] = useState(null);
  const check = async () => {
    const r = await api.post('/api/inventory/check', { items: [{ mealId: Number(mealId), quantity: Number(count) || 1 }] });
    setResult(r.lines);
  };
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 font-semibold"><ClipboardCheck className="h-4 w-4 text-sage" /> {t('Can we make it?')}</p>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <TextField as="select" className="min-w-48 flex-1" label={t('Meal')} value={mealId} onChange={(e) => { setMealId(e.target.value); setResult(null); }}>
          <option value="">{t('Choose…')}</option>
          {(meals.data?.items ?? []).map((m) => <option key={m.id} value={m.id}>{m.name}</option>)}
        </TextField>
        <TextField className="w-24" label={t('Portions')} inputMode="numeric" value={count} onChange={(e) => { setCount(e.target.value); setResult(null); }} />
        <Button variant="secondary" disabled={!mealId} onClick={check}>{t('Check')}</Button>
      </div>
      {result && (
        <ul className="mt-3 flex flex-col gap-1 text-sm">
          {result.map((l) => (
            <li key={l.ingredientId} className="flex justify-between gap-2">
              <span>{l.name}</span>
              <span className={l.enough ? 'text-moss' : 'font-semibold text-clay'}>{formatQuantity(l.required, l.baseUnit)} / {formatQuantity(Math.max(0, l.available), l.baseUnit)} {l.enough ? '✓' : '✕'}</span>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}

function Movements() {
  const { t, base } = useDash();
  const [f, setF] = useState({ type: '', page: 1 });
  const { data, loading, error, reload } = useApi(`/api/inventory/movements${qs({ type: f.type, page: f.page, pageSize: 40 })}`);
  return (
    <div>
      <Select className="mb-3 sm:w-64" value={f.type} onChange={(e) => setF({ type: e.target.value, page: 1 })} aria-label={t('Movement type')}>
        <option value="">{t('All movements')}</option>
        {Object.entries(MOVEMENT_LABELS).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
      </Select>
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <>
          <DataTable
            rows={data.items}
            empty={<EmptyState title={t('No movements yet')} />}
            columns={[
              { key: 'ing', header: t('Ingredient'), mobile: 'title', render: (m) => <span className="font-semibold">{m.ingredientName}</span> },
              { key: 'type', header: t('Type'), render: (m) => <Badge tone={m.quantity < 0 ? (m.type === 'consumption' ? 'neutral' : 'red') : 'green'}>{t(MOVEMENT_LABELS[m.type])}</Badge> },
              { key: 'qty', header: t('Quantity'), className: 'tabular-nums', render: (m) => <span className={m.quantity < 0 ? 'text-clay' : 'text-moss'}>{m.quantity > 0 ? '+' : ''}{formatQuantity(m.quantity, m.baseUnit)}</span> },
              { key: 'after', header: t('Stock after'), className: 'tabular-nums', render: (m) => formatQuantity(m.stockAfter, m.baseUnit) },
              { key: 'reason', header: t('Reason'), render: (m) => m.orderNumber ? <Link className="text-moss underline" to={`${base}/orders/${m.orderId}`} onClick={(e) => e.stopPropagation()}>{m.orderNumber}</Link> : (m.reason ?? '—') },
              { key: 'by', header: t('By'), render: (m) => m.userName ?? t('System') },
              { key: 'at', header: t('When'), render: (m) => <span className="text-xs text-stone">{formatDateTime(m.createdAt)}</span> },
            ]}
          />
          <Pagination page={f.page} pageSize={data.pageSize} total={data.total} onChange={(page) => setF((x) => ({ ...x, page }))} t={t} />
        </>
      )}
    </div>
  );
}

export default function InventoryPage() {
  const { t } = useDash();
  const { can } = useAuth();
  const [tab, setTab] = useState('stock');
  const [filter, setFilter] = useState('');
  const [search, setSearch] = useState('');
  const [dialog, setDialog] = useState(null);
  const { data, error, loading, reload } = useApi(`/api/inventory${qs({ stock: filter })}`, { poll: 30000 });
  useEffect(() => { document.title = `${t('Stock')} · Healthy Kitchen`; }, [t]);

  const items = (data?.items ?? []).filter((i) => !search || i.name.toLowerCase().includes(search.toLowerCase()));
  const lowCount = (data?.items ?? []).filter((i) => i.stockState !== 'ok').length;

  return (
    <div>
      <PageHeader
        title={t('Stock')}
        subtitle={t('Available = on hand − reserved for accepted orders. Stock only changes through recorded movements.')}
        actions={can(P.INVENTORY_MANAGE) && <Button onClick={() => setDialog({ id: null })}><PackagePlus className="h-4 w-4" /> {t('Record movement')}</Button>}
      />
      <Segmented className="mb-4" value={tab} onChange={setTab} options={[{ value: 'stock', label: t('Current stock') }, { value: 'movements', label: t('Movements') }]} />
      {tab === 'movements' ? <Movements /> : (
        <div className="grid gap-4 xl:grid-cols-[1fr_320px]">
          <div>
            <div className="mb-3 flex flex-col gap-2 sm:flex-row">
              <SearchInput value={search} onChange={setSearch} placeholder={t('Search ingredient')} className="flex-1" />
              <Segmented value={filter} onChange={setFilter} options={[{ value: '', label: t('All') }, { value: 'low', label: t('Low'), count: lowCount || undefined }, { value: 'out', label: t('Out') }]} />
            </div>
            {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
              <DataTable
                rows={items}
                onRowClick={can(P.INVENTORY_MANAGE) ? (i) => setDialog({ id: i.id }) : undefined}
                empty={<EmptyState title={t('Nothing here')} />}
                columns={[
                  { key: 'name', header: t('Ingredient'), mobile: 'title', render: (i) => <span className="font-semibold">{i.name}{!i.trackStock && <span className="ms-2 text-xs font-normal text-stone">{t('not tracked')}</span>}</span> },
                  { key: 'state', header: t('State'), render: (i) => <StockBadge state={i.stockState} t={t} /> },
                  { key: 'available', header: t('Available'), className: 'tabular-nums font-semibold', render: (i) => formatQuantity(i.availableQty, i.baseUnit) },
                  { key: 'reserved', header: t('Reserved'), className: 'tabular-nums', render: (i) => formatQuantity(i.reservedQty, i.baseUnit) },
                  { key: 'stock', header: t('On hand'), className: 'tabular-nums', render: (i) => formatQuantity(i.stockQty, i.baseUnit) },
                  { key: 'reorder', header: t('Reorder at'), className: 'tabular-nums', render: (i) => formatQuantity(i.reorderLevel, i.baseUnit) },
                  { key: 'days', header: t('Days left'), className: 'tabular-nums', render: (i) => (i.daysLeft == null ? '—' : <span className={i.daysLeft < 3 ? 'font-semibold text-clay' : ''}>{i.daysLeft.toFixed(1)}</span>) },
                ]}
              />
            )}
            <p className="mt-2 text-xs text-stone">{t('"Days left" divides available stock by the average daily use of the last 14 days — an estimate, not a forecast model.')}</p>
          </div>
          <div className="flex flex-col gap-4"><RequirementCheck /></div>
        </div>
      )}
      {dialog && <MovementDialog open onClose={() => setDialog(null)} items={data?.items ?? []} initialId={dialog.id} onSaved={reload} />}
    </div>
  );
}
