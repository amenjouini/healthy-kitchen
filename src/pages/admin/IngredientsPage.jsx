import { useEffect, useState } from 'react';
import { Plus } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { DataTable, PageHeader, SearchInput, Badge } from '@/components/ui/Data';
import { TextField, Checkbox, Segmented } from '@/components/ui/Form';
import { Alert, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui/Feedback';
import { StockBadge } from '@/components/domain/Badges';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage, qs } from '@/lib/api';
import { P } from '@shared/permissions';
import { NUTRIENTS, nutritionWarnings } from '@shared/nutrition';
import { formatMoney, formatQuantity, costPerPricingUnit, PRICING_UNIT } from '@/utils/format';
import { NUTRIENT_LABELS, msg } from '@/components/domain/labels';

const WARNINGS = {
  macros_exceed_100g: msg('Protein + carbs + fat + fiber exceed 100 g per 100 g.'),
  sugar_exceeds_carbs: msg('Sugars cannot exceed carbohydrates.'),
  satfat_exceeds_fat: msg('Saturated fat cannot exceed total fat.'),
  kcal_above_900: msg('More than 900 kcal per 100 g is not possible (pure fat is ~900).'),
  kcal_inconsistent_with_macros: msg('Calories differ by more than 20% from 4×protein + 4×carbs + 9×fat — check the values.'),
};

function toForm(i) {
  return {
    name: i?.name ?? '', nameEn: i?.nameEn ?? '', nameAr: i?.nameAr ?? '', detail: i?.detail ?? '',
    baseUnit: i?.baseUnit ?? 'g', gramsPerUnit: i?.baseUnit && i.baseUnit !== 'g' ? String(i.gramsPerUnit) : '',
    nutrition: Object.fromEntries(NUTRIENTS.map((n) => [n.key, i ? String(i.nutrition[n.key] ?? 0) : ''])),
    cost: i?.costPerUnit != null ? String(costPerPricingUnit(i.costPerUnit, i.baseUnit) / 1000) : '',
    trackStock: i?.trackStock ?? true, reorderLevel: i ? String(i.reorderLevel) : '0', openingStock: '',
    customerSelectable: i?.customerSelectable ?? false, portionQty: i?.portionQty ? String(i.portionQty) : '', portionPrice: i?.portionPriceMillimes != null ? String(i.portionPriceMillimes / 1000) : '',
    color: i?.color ?? '',
  };
}

function IngredientEditor({ ingredient, onClose, onSaved }) {
  const { t } = useDash();
  const { can } = useAuth();
  const toast = useToast();
  const isNew = !ingredient;
  const [form, setForm] = useState(() => toForm(ingredient));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));
  const setN = (k) => (e) => setForm((f) => ({ ...f, nutrition: { ...f.nutrition, [k]: e.target.value } }));
  const num = (v) => Number(String(v).replace(',', '.'));
  const per100 = Object.fromEntries(NUTRIENTS.map((n) => [n.key, num(form.nutrition[n.key]) || 0]));
  const warnings = nutritionWarnings(per100);

  const save = async () => {
    setBusy(true); setError(null);
    const body = {
      name: form.name, nameEn: form.nameEn || null, nameAr: form.nameAr || null, detail: form.detail || null,
      baseUnit: form.baseUnit, ...(form.baseUnit !== 'g' && { gramsPerUnit: num(form.gramsPerUnit) }),
      nutrition: per100, costPerPricingUnit: form.cost ? form.cost.replace(',', '.') : null,
      trackStock: form.trackStock, reorderLevel: num(form.reorderLevel) || 0,
      customerSelectable: form.customerSelectable,
      portionQty: form.customerSelectable && form.portionQty ? num(form.portionQty) : null,
      portionPrice: form.customerSelectable && form.portionPrice ? form.portionPrice.replace(',', '.') : null,
      color: form.color || null,
      ...(isNew && form.openingStock && { openingStock: num(form.openingStock) }),
    };
    try {
      if (isNew) await api.post('/api/ingredients', body);
      else await api.patch(`/api/ingredients/${ingredient.id}`, body);
      toast(t(isNew ? 'Ingredient created' : 'Ingredient saved — meals using it were recalculated'));
      onSaved();
      onClose();
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const archive = async () => {
    try { await api.post(`/api/ingredients/${ingredient.id}/archive`, { archived: !ingredient.archivedAt }); onSaved(); onClose(); } catch (err) { setError(err); }
  };

  return (
    <Modal open onClose={onClose} title={isNew ? t('New ingredient') : ingredient.name} size="xl"
      footer={(
        <div className="flex flex-wrap justify-between gap-2">
          {!isNew ? <Button variant="ghost" onClick={archive}>{t(ingredient.archivedAt ? 'Restore' : 'Archive')}</Button> : <span />}
          <Button size="lg" loading={busy} disabled={!form.name.trim()} onClick={save}>{t(isNew ? 'Create ingredient' : 'Save')}</Button>
        </div>
      )}>
      <div className="grid gap-5 lg:grid-cols-2">
        <div className="flex flex-col gap-3">
          <TextField label={t('Name (French)')} required value={form.name} onChange={set('name')} />
          <div className="grid grid-cols-2 gap-3">
            <TextField label={t('Name (English)')} value={form.nameEn} onChange={set('nameEn')} />
            <TextField label={t('Name (Arabic)')} dir="rtl" value={form.nameAr} onChange={set('nameAr')} />
          </div>
          <TextField label={t('Short description')} value={form.detail} onChange={set('detail')} />
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-olive">{t('Measured in')}</p>
            <Segmented value={form.baseUnit} onChange={set('baseUnit')} options={[{ value: 'g', label: t('grams') }, { value: 'ml', label: t('millilitres') }, { value: 'pc', label: t('pieces') }]} />
          </div>
          {form.baseUnit !== 'g' && (
            <TextField label={form.baseUnit === 'ml' ? t('Density (grams per ml)') : t('Weight of one piece (grams)')} inputMode="decimal" required value={form.gramsPerUnit} onChange={set('gramsPerUnit')}
              hint={form.baseUnit === 'ml' ? t('Water 1.0 · olive oil 0.91 · milk 1.03') : t('e.g. one egg ≈ 50 g')} />
          )}
          {(can(P.FINANCE_VIEW) || can(P.INGREDIENTS_MANAGE)) && (
            <TextField label={t('Cost per {unit} (DT)', { unit: PRICING_UNIT[form.baseUnit] })} inputMode="decimal" value={form.cost} onChange={set('cost')} hint={t('Used for meal cost and margin estimates.')} />
          )}
          <Checkbox checked={form.trackStock} onChange={(v) => setForm((f) => ({ ...f, trackStock: v }))} label={t('Track stock')} description={t('Turn off for things not worth counting (salt, water…). Untracked items never block orders.')} />
          {form.trackStock && (
            <div className="grid grid-cols-2 gap-3">
              <TextField label={t('Reorder level ({unit})', { unit: form.baseUnit })} inputMode="decimal" value={form.reorderLevel} onChange={set('reorderLevel')} />
              {isNew && can(P.INVENTORY_MANAGE) && <TextField label={t('Opening stock ({unit})', { unit: form.baseUnit })} inputMode="decimal" value={form.openingStock} onChange={set('openingStock')} />}
            </div>
          )}
          <Checkbox checked={form.customerSelectable} onChange={(v) => setForm((f) => ({ ...f, customerSelectable: v }))} label={t('Available in "Build your own bowl"')} />
          {form.customerSelectable && (
            <div className="grid grid-cols-3 gap-3">
              <TextField label={t('Portion ({unit})', { unit: form.baseUnit })} inputMode="decimal" value={form.portionQty} onChange={set('portionQty')} />
              <TextField label={t('Portion price (DT)')} inputMode="decimal" value={form.portionPrice} onChange={set('portionPrice')} />
              <TextField label={t('Colour')} type="color" value={form.color || '#c8d8b0'} onChange={set('color')} className="[&_input]:p-1" />
            </div>
          )}
        </div>
        <div>
          <p className="mb-2 text-sm font-semibold">{t('Nutrition per 100 g')}</p>
          <div className="grid grid-cols-2 gap-3">
            {NUTRIENTS.map((n) => (
              <TextField key={n.key} label={`${t(NUTRIENT_LABELS[n.key])} (${n.unit})`} inputMode="decimal" value={form.nutrition[n.key]} onChange={setN(n.key)} />
            ))}
          </div>
          {warnings.length > 0 && <Alert tone="warning" className="mt-3" title={t('Please double-check')}><ul className="list-disc ps-4">{warnings.map((w) => <li key={w}>{t(WARNINGS[w])}</li>)}</ul></Alert>}
          <p className="mt-2 text-xs text-stone">{t('Use values for the ingredient as it is weighed in the recipe (e.g. cooked rice vs dry rice).')}</p>
        </div>
      </div>
      {error && <Alert tone="danger" className="mt-3">{errorMessage(error, t)}</Alert>}
    </Modal>
  );
}

export default function IngredientsPage() {
  const { t } = useDash();
  const { can } = useAuth();
  const [search, setSearch] = useState('');
  const [archived, setArchived] = useState(false);
  const [editing, setEditing] = useState(null);
  const { data, error, loading, reload } = useApi(`/api/ingredients${qs({ includeArchived: archived ? 1 : undefined })}`);
  useEffect(() => { document.title = `${t('Ingredients')} · Healthy Kitchen`; }, [t]);
  const items = (data?.items ?? []).filter((i) => !search || [i.name, i.nameEn].some((s) => s?.toLowerCase().includes(search.toLowerCase())));
  const manage = can(P.INGREDIENTS_MANAGE);

  return (
    <div>
      <PageHeader title={t('Ingredients')} subtitle={t('Nutrition is stored per 100 g. Changing an ingredient creates new versions of the meals that use it.')}
        actions={manage && <Button onClick={() => setEditing('new')}><Plus className="h-4 w-4" /> {t('New ingredient')}</Button>} />
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center">
        <SearchInput value={search} onChange={setSearch} placeholder={t('Search ingredient')} className="flex-1" />
        <Checkbox checked={archived} onChange={setArchived} label={t('Show archived')} />
      </div>
      {error ? <ErrorState error={error} onRetry={reload} t={t} /> : loading ? <Spinner /> : (
        <DataTable
          rows={items}
          onRowClick={manage ? (i) => setEditing(i) : undefined}
          empty={<EmptyState title={t('No ingredients')} />}
          columns={[
            { key: 'name', header: t('Ingredient'), mobile: 'title', render: (i) => <span className="font-semibold">{i.name}{i.archivedAt && <Badge className="ms-2">{t('Archived')}</Badge>}{i.customerSelectable && <Badge tone="green" className="ms-2">{t('Builder')}</Badge>}</span> },
            { key: 'kcal', header: t('kcal / 100 g'), className: 'tabular-nums', render: (i) => i.nutrition.kcal },
            { key: 'macros', header: t('P / C / F (g)'), className: 'tabular-nums', render: (i) => `${i.nutrition.protein} / ${i.nutrition.carbs} / ${i.nutrition.fat}` },
            { key: 'unit', header: t('Unit'), render: (i) => (i.baseUnit === 'g' ? 'g' : `${i.baseUnit} (${i.gramsPerUnit} g)`) },
            ...(items[0] && 'costPerUnit' in items[0] ? [{ key: 'cost', header: t('Cost'), className: 'tabular-nums', render: (i) => (i.costPerUnit != null ? `${formatMoney(costPerPricingUnit(i.costPerUnit, i.baseUnit))}/${PRICING_UNIT[i.baseUnit]}` : <span className="text-clay">{t('missing')}</span>) }] : []),
            { key: 'stock', header: t('Available'), className: 'tabular-nums', render: (i) => <span className="flex items-center gap-2">{formatQuantity(i.availableQty, i.baseUnit)} <StockBadge state={i.stockState} t={t} /></span> },
          ]}
        />
      )}
      {editing && <IngredientEditor ingredient={editing === 'new' ? null : editing} onClose={() => setEditing(null)} onSaved={reload} />}
    </div>
  );
}
