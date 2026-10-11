import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Archive, History, ImageUp, Plus, RotateCcw, Trash2 } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import Button from '@/components/ui/Button';
import { Card, PageHeader, Badge } from '@/components/ui/Data';
import { TextField, Checkbox, Input, Select } from '@/components/ui/Form';
import { Alert, ErrorState, Spinner, useToast } from '@/components/ui/Feedback';
import { NutritionFacts } from '@/components/domain/NutritionFacts';
import { AvailabilityBadge } from '@/components/domain/Badges';
import { useApi } from '@/hooks/useApi';
import { useNutritionCalculator } from '@/hooks/useNutritionCalculator';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage, fileToBase64 } from '@/lib/api';
import { P } from '@shared/permissions';
import { formatMoney, formatNutrient, formatDateTime, pct } from '@/utils/format';
import { parseMoney } from '@shared/money';
import { toGrams } from '@shared/nutrition';

const EMPTY = {
  name: '', nameEn: '', nameAr: '', description: '', descriptionEn: '', descriptionAr: '', tag: '', tagEn: '', tagAr: '',
  categoryId: '', imageUrl: '', price: '', servings: 1, prepMinutes: 10, isAvailable: true, isFeatured: false,
};

function fromMeal(m) {
  return {
    ...EMPTY, ...Object.fromEntries(Object.keys(EMPTY).map((k) => [k, m[k] ?? EMPTY[k]])),
    categoryId: m.categoryId ? String(m.categoryId) : '', price: String(m.priceMillimes / 1000),
  };
}

function Versions({ mealId }) {
  const { t } = useDash();
  const { data } = useApi(`/api/meals/${mealId}/versions`);
  if (!data) return <Spinner />;
  return (
    <ul className="flex flex-col gap-2 text-sm">
      {data.items.map((v) => (
        <li key={v.id} className="rounded-xl bg-linen/70 p-3">
          <div className="flex justify-between gap-2"><b>v{v.version}</b><span className="text-xs text-stone">{formatDateTime(v.createdAt)}{v.createdBy ? ` · ${v.createdBy}` : ''}</span></div>
          <p className="text-xs text-muted">{v.reason}</p>
          <p className="mt-1 text-xs tabular-nums">{formatMoney(v.priceMillimes)} · {formatNutrient(v.nutrition.kcal, 'kcal')} kcal · {v.recipe.length} {t('ingredients')}{v.costPerServing != null ? ` · ${t('cost')} ${formatMoney(v.costPerServing)}` : ''}</p>
        </li>
      ))}
    </ul>
  );
}

export default function MealEditor() {
  const { id } = useParams();
  const isNew = id === 'new';
  const { t, base } = useDash();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const mealReq = useApi(isNew ? null : `/api/meals/${id}`);
  const ingredientsReq = useApi('/api/ingredients');
  const cats = useApi('/api/categories');
  const [form, setForm] = useState(null);
  const [recipe, setRecipe] = useState(null);
  const [picker, setPicker] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [showVersions, setShowVersions] = useState(false);
  const meal = mealReq.data?.meal;
  const canSave = isNew ? can(P.MEALS_CREATE) : can(P.MEALS_EDIT);

  // Initialise the editable copy once data has arrived (derived during render, not in an effect).
  if (!form && (isNew || meal)) {
    setForm(isNew ? EMPTY : fromMeal(meal));
    setRecipe(isNew ? [] : meal.recipe.map((r) => ({ ingredientId: r.ingredientId, quantity: String(r.quantity) })));
  }
  useEffect(() => { document.title = `${isNew ? t('New meal') : meal?.name ?? t('Meal')} · Healthy Kitchen`; }, [t, isNew, meal]);

  const ingredients = useMemo(() => new Map((ingredientsReq.data?.items ?? []).map((i) => [i.id, i])), [ingredientsReq.data]);
  const lines = useMemo(() => (recipe ?? []).map((l) => ({ ingredient: ingredients.get(l.ingredientId), quantity: Number(String(l.quantity).replace(',', '.')) })), [recipe, ingredients]);
  const calc = useNutritionCalculator(lines, form?.servings);
  const showCost = (ingredientsReq.data?.items ?? []).some((i) => i.costPerUnit !== undefined);
  const priceMillimes = (() => { try { return form?.price ? parseMoney(String(form.price).replace(',', '.')) : null; } catch { return null; } })();
  const margin = priceMillimes != null && priceMillimes > 0 ? ((priceMillimes - calc.costPerServing) / priceMillimes) * 100 : null;

  if (mealReq.error) return <ErrorState error={mealReq.error} onRetry={mealReq.reload} t={t} />;
  if (!form || ingredientsReq.loading) return <Spinner />;

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? (e.target.type === 'checkbox' ? e.target.checked : e.target.value) : e }));
  const available = (ingredientsReq.data?.items ?? []).filter((i) => !i.archivedAt && !recipe.some((l) => l.ingredientId === i.id));
  const addIngredient = (ingId) => {
    const ing = ingredients.get(Number(ingId));
    if (!ing) return;
    setRecipe((r) => [...r, { ingredientId: ing.id, quantity: ing.baseUnit === 'pc' ? '1' : '100' }]);
    setPicker('');
  };

  const uploadImage = async (file) => {
    if (!file) return;
    try {
      const r = await api.post('/api/uploads', { fileName: file.name, mime: file.type, dataBase64: await fileToBase64(file), visibility: 'public' });
      setForm((f) => ({ ...f, imageUrl: r.upload.url }));
    } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };

  const save = async () => {
    setBusy(true); setError(null);
    const opt = (v) => (v === '' ? null : v);
    const body = {
      name: form.name, nameEn: opt(form.nameEn), nameAr: opt(form.nameAr), description: opt(form.description), descriptionEn: opt(form.descriptionEn),
      descriptionAr: opt(form.descriptionAr), tag: opt(form.tag), tagEn: opt(form.tagEn), tagAr: opt(form.tagAr),
      categoryId: form.categoryId ? Number(form.categoryId) : null, imageUrl: opt(form.imageUrl), price: String(form.price).replace(',', '.'),
      servings: Number(form.servings) || 1, prepMinutes: Number(form.prepMinutes) || 0, isAvailable: form.isAvailable, isFeatured: form.isFeatured,
      // Only ids + quantities are sent: the server computes nutrition and cost itself.
      recipe: recipe.map((l) => ({ ingredientId: l.ingredientId, quantity: Number(String(l.quantity).replace(',', '.')) })),
    };
    try {
      const r = isNew ? await api.post('/api/meals', body) : await api.patch(`/api/meals/${id}`, body);
      toast(t('Meal saved (version {v})', { v: r.meal.version }));
      if (isNew) navigate(`${base}/meals/${r.meal.id}`, { replace: true });
      else { mealReq.setData({ meal: r.meal }); setForm(fromMeal(r.meal)); }
    } catch (err) { setError(err); } finally { setBusy(false); }
  };

  const archive = async (archived) => {
    try {
      const r = await api.post(`/api/meals/${id}/archive`, { archived });
      mealReq.setData({ meal: r.meal });
      toast(t(archived ? 'Meal archived' : 'Meal restored'));
    } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };

  return (
    <div>
      <Link to={`${base}/meals`} className="mb-2 inline-flex min-h-11 items-center gap-1 text-sm font-semibold text-moss"><ArrowLeft className="h-4 w-4" /> {t('Meals')}</Link>
      <PageHeader
        title={isNew ? t('New meal') : meal.name}
        subtitle={!isNew && <span className="flex flex-wrap items-center gap-2">v{meal.version} · <AvailabilityBadge state={meal.availability.state} t={t} />{meal.archivedAt && <Badge>{t('Archived')}</Badge>}</span>}
        actions={!isNew && can(P.MEALS_EDIT) && (
          <>
            <Button variant="ghost" onClick={() => setShowVersions((v) => !v)}><History className="h-4 w-4" /> {t('History')}</Button>
            {meal.archivedAt ? <Button variant="secondary" onClick={() => archive(false)}><RotateCcw className="h-4 w-4" /> {t('Restore')}</Button>
              : <Button variant="dangerOutline" onClick={() => archive(true)}><Archive className="h-4 w-4" /> {t('Archive')}</Button>}
          </>
        )}
      />

      <div className="grid gap-4 xl:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-1 font-semibold">{t('Recipe')}</h2>
            <p className="mb-3 text-xs text-stone">{t('Quantities for the whole recipe. Nutrition per serving = total ÷ servings.')}</p>
            <ul className="flex flex-col gap-2">
              {recipe.map((l, idx) => {
                const ing = ingredients.get(l.ingredientId);
                const line = calc.lines.find((x) => x.ingredientId === l.ingredientId);
                return (
                  <li key={l.ingredientId} className="grid grid-cols-[1fr_auto] items-center gap-2 rounded-xl bg-linen/60 p-2.5 sm:grid-cols-[1fr_150px_auto]">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{ing?.name ?? `#${l.ingredientId}`}</p>
                      <p className="text-xs text-stone tabular-nums">
                        {line ? `${Math.round(line.grams * 10) / 10} g · ${formatNutrient(line.nutrition.kcal, 'kcal')} kcal · ${formatNutrient(line.nutrition.protein, 'protein')} g P` : t('Enter a quantity')}
                        {showCost && line && (line.hasCost ? ` · ${formatMoney(line.cost)}` : ` · ${t('no cost')}`)}
                      </p>
                    </div>
                    <div className="col-span-2 row-start-2 flex items-center gap-1.5 sm:col-span-1 sm:row-start-auto">
                      <Input inputMode="decimal" aria-label={t('Quantity')} value={l.quantity} onChange={(e) => setRecipe((r) => r.map((x, i) => (i === idx ? { ...x, quantity: e.target.value } : x)))} className="text-end" />
                      <span className="w-6 text-sm text-stone">{ing?.baseUnit}</span>
                    </div>
                    <button type="button" onClick={() => setRecipe((r) => r.filter((_, i) => i !== idx))} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-clay hover:bg-clay/8" aria-label={t('Remove')}><Trash2 className="h-4 w-4" /></button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-3 flex gap-2">
              <Select value={picker} onChange={(e) => addIngredient(e.target.value)} aria-label={t('Add ingredient')} className="flex-1">
                <option value="">{t('+ Add an ingredient…')}</option>
                {available.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.baseUnit})</option>)}
              </Select>
              {can(P.INGREDIENTS_MANAGE) && <Link to={`${base}/ingredients`} className="inline-flex min-h-11 items-center gap-1 rounded-xl px-3 text-sm font-semibold text-moss hover:bg-moss/8"><Plus className="h-4 w-4" /> {t('New ingredient')}</Link>}
            </div>
            <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <TextField label={t('Servings')} type="number" min={1} max={100} value={form.servings} onChange={set('servings')} />
              <TextField label={t('Prep minutes')} type="number" min={0} value={form.prepMinutes} onChange={set('prepMinutes')} />
              <div className="col-span-2 flex flex-col justify-end text-sm text-muted">
                <p>{t('Total weight')}: <b className="text-forest">{Math.round(calc.totalWeightG)} g</b></p>
                <p>{t('Per serving')}: <b className="text-forest">{Math.round(calc.servingWeightG)} g</b></p>
              </div>
            </div>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-semibold">{t('Menu details')}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('Name (French)')} required value={form.name} onChange={set('name')} />
              <TextField label={t('Price (DT)')} required inputMode="decimal" value={form.price} onChange={set('price')} />
              <TextField as="select" label={t('Category')} value={form.categoryId} onChange={set('categoryId')}>
                <option value="">—</option>
                {(cats.data?.items ?? []).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </TextField>
              <TextField label={t('Tag (French)')} value={form.tag} onChange={set('tag')} placeholder={t('e.g. Chef\'s pick')} />
              <TextField as="textarea" className="sm:col-span-2" label={t('Description (French)')} rows={2} value={form.description} onChange={set('description')} />
            </div>
            <details className="mt-3 rounded-xl bg-linen/50 p-3">
              <summary className="min-h-9 cursor-pointer text-sm font-semibold">{t('English & Arabic')}</summary>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField label={t('Name (English)')} value={form.nameEn} onChange={set('nameEn')} />
                <TextField label={t('Name (Arabic)')} dir="rtl" value={form.nameAr} onChange={set('nameAr')} />
                <TextField label={t('Tag (English)')} value={form.tagEn} onChange={set('tagEn')} />
                <TextField label={t('Tag (Arabic)')} dir="rtl" value={form.tagAr} onChange={set('tagAr')} />
                <TextField as="textarea" label={t('Description (English)')} rows={2} value={form.descriptionEn} onChange={set('descriptionEn')} />
                <TextField as="textarea" label={t('Description (Arabic)')} dir="rtl" rows={2} value={form.descriptionAr} onChange={set('descriptionAr')} />
              </div>
            </details>
            <div className="mt-3 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField label={t('Image URL')} value={form.imageUrl} onChange={set('imageUrl')} placeholder="https://…" />
              <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl border border-sage/30 bg-white/70 px-4 text-sm font-semibold">
                <ImageUp className="h-4 w-4" /> {t('Upload')}
                <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => uploadImage(e.target.files?.[0])} />
              </label>
            </div>
            {form.imageUrl && <img src={form.imageUrl} alt="" className="mt-3 h-40 w-full rounded-xl object-cover sm:w-64" />}
            <div className="mt-2 flex flex-wrap gap-x-6">
              <Checkbox checked={form.isAvailable} onChange={(v) => setForm((f) => ({ ...f, isAvailable: v }))} label={t('Available for ordering')} description={t('Switch off to hide it even when ingredients are in stock.')} />
              <Checkbox checked={form.isFeatured} onChange={(v) => setForm((f) => ({ ...f, isFeatured: v }))} label={t('Featured on the home page')} />
            </div>
          </Card>
          {showVersions && !isNew && <Card className="p-4"><h2 className="mb-3 font-semibold">{t('Version history')}</h2><Versions mealId={id} /></Card>}
        </div>

        <div className="flex flex-col gap-4 xl:sticky xl:top-20 xl:self-start">
          <NutritionFacts nutrition={calc.perServing} weightG={calc.servingWeightG} t={t} className="border border-sage/20" />
          {showCost && (
            <Card className="p-4 text-sm">
              <h3 className="mb-2 font-semibold">{t('Cost & margin (estimate)')}</h3>
              <dl className="grid grid-cols-2 gap-y-1">
                <dt className="text-stone">{t('Ingredient cost / serving')}</dt><dd className="text-end tabular-nums">{formatMoney(Math.round(calc.costPerServing))}</dd>
                <dt className="text-stone">{t('Selling price')}</dt><dd className="text-end tabular-nums">{priceMillimes != null ? formatMoney(priceMillimes) : '—'}</dd>
                <dt className="font-semibold">{t('Est. gross margin')}</dt><dd className={`text-end font-semibold tabular-nums ${margin != null && margin < 50 ? 'text-clay' : ''}`}>{pct(margin)}</dd>
              </dl>
              {!calc.costComplete && recipe.length > 0 && <p className="mt-2 text-xs text-[#7a5212]">{t('Some ingredients have no cost — the estimate is too low.')}</p>}
              <p className="mt-2 text-[11px] text-stone">{t('Excludes labour, packaging, energy and waste.')}</p>
            </Card>
          )}
          {error && <Alert tone="danger" title={errorMessage(error, t)} />}
          {canSave && <Button size="lg" loading={busy} disabled={!recipe.length || !form.name.trim() || !form.price} onClick={save}>{t(isNew ? 'Create meal' : 'Save changes')}</Button>}
          <p className="text-xs text-stone">{t('The server recalculates nutrition and cost when saving. Past orders keep the values they were placed with.')}</p>
          {lines.some((l) => l.ingredient && l.quantity > 0 && l.ingredient.baseUnit !== 'g') && (
            <p className="text-xs text-stone">{t('Liquids and pieces are converted to grams')}: {lines.filter((l) => l.ingredient && l.quantity > 0 && l.ingredient.baseUnit !== 'g').map((l) => `${l.quantity} ${l.ingredient.baseUnit} ${l.ingredient.name} = ${Math.round(toGrams(l.quantity, l.ingredient))} g`).join(' · ')}</p>
          )}
        </div>
      </div>
    </div>
  );
}
