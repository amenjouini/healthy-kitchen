import { useEffect, useState } from 'react';
import { CheckCircle2, CircleSlash, Plus } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import Button from '@/components/ui/Button';
import { Card, CardHeader, PageHeader, Badge } from '@/components/ui/Data';
import { Checkbox, Input, TextField } from '@/components/ui/Form';
import { Alert, Spinner, useToast } from '@/components/ui/Feedback';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { P } from '@shared/permissions';

function KitchenSettings() {
  const { t } = useDash();
  const toast = useToast();
  const { data, setData } = useApi('/api/settings');
  if (!data) return <Spinner />;
  const s = data.settings;
  const save = async (patch) => {
    try { const r = await api.patch('/api/settings', patch); setData({ settings: r.settings }); toast(t('Saved')); } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };
  return (
    <Card className="p-4">
      <CardHeader className="px-0 pt-0" title={t('Kitchen rules')} />
      <Checkbox checked={s['kitchen.acceptingOrders']} onChange={(v) => save({ 'kitchen.acceptingOrders': v })} label={t('Accept online orders')} description={t('Staff can still create WhatsApp / phone orders while paused.')} />
      <Checkbox checked={s['inventory.enforce']} onChange={(v) => save({ 'inventory.enforce': v })} label={t('Block orders when stock is insufficient')}
        description={t('Recommended. Turn off only while opening stock is being entered — orders will then be accepted even without stock.')} />
      {!s['inventory.enforce'] && <Alert tone="warning" className="my-2">{t('Stock enforcement is off: meals can be oversold.')}</Alert>}
      <div className="mt-2 grid gap-3 sm:grid-cols-2">
        <TextField label={t('"Low stock" when ≤ N servings remain')} type="number" min={0} defaultValue={s['inventory.lowStockServings']} onBlur={(e) => save({ 'inventory.lowStockServings': Number(e.target.value) })} />
        <TextField label={t('Cooks working in parallel')} type="number" min={1} defaultValue={s['kitchen.parallelCooks']} onBlur={(e) => save({ 'kitchen.parallelCooks': Number(e.target.value) })} hint={t('Used for the prep-time estimate on the kitchen board.')} />
      </div>
    </Card>
  );
}

function Zones() {
  const { t } = useDash();
  const toast = useToast();
  const { data, reload } = useApi('/api/zones');
  const [draft, setDraft] = useState({ city: '', fee: '', minOrder: '' });
  const add = async () => {
    try { await api.post('/api/zones', { city: draft.city, fee: draft.fee || '0', minOrder: draft.minOrder || '0' }); setDraft({ city: '', fee: '', minOrder: '' }); reload(); } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };
  const update = async (id, patch) => {
    try { await api.patch(`/api/zones/${id}`, patch); reload(); toast(t('Saved')); } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };
  return (
    <Card className="p-4">
      <CardHeader className="px-0 pt-0" title={t('Delivery zones')} subtitle={t('Customers can only choose these cities. Fees are added to the order total by the server.')} />
      <ul className="mt-3 flex flex-col gap-2">
        {(data?.items ?? []).map((z) => (
          <li key={z.id} className="grid grid-cols-2 items-center gap-2 rounded-xl bg-linen/60 p-2 sm:grid-cols-[1fr_120px_120px_auto]">
            <span className="col-span-2 font-semibold sm:col-span-1">{z.city} {!z.isActive && <Badge>{t('Inactive')}</Badge>}</span>
            <Input aria-label={t('Fee (DT)')} inputMode="decimal" defaultValue={z.feeMillimes / 1000} onBlur={(e) => Number(e.target.value) * 1000 !== z.feeMillimes && update(z.id, { fee: e.target.value || '0' })} />
            <Input aria-label={t('Minimum order (DT)')} inputMode="decimal" defaultValue={z.minOrderMillimes / 1000} onBlur={(e) => Number(e.target.value) * 1000 !== z.minOrderMillimes && update(z.id, { minOrder: e.target.value || '0' })} />
            <Button size="sm" variant="ghost" onClick={() => update(z.id, { isActive: !z.isActive })}>{t(z.isActive ? 'Disable' : 'Enable')}</Button>
          </li>
        ))}
      </ul>
      <p className="mt-1 text-xs text-stone">{t('Columns: fee · minimum order (DT)')}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-[1fr_120px_120px_auto]">
        <Input className="col-span-2 sm:col-span-1" placeholder={t('City')} value={draft.city} onChange={(e) => setDraft((d) => ({ ...d, city: e.target.value }))} />
        <Input placeholder={t('Fee (DT)')} inputMode="decimal" value={draft.fee} onChange={(e) => setDraft((d) => ({ ...d, fee: e.target.value }))} />
        <Input placeholder={t('Min. order (DT)')} inputMode="decimal" value={draft.minOrder} onChange={(e) => setDraft((d) => ({ ...d, minOrder: e.target.value }))} />
        <Button onClick={add} disabled={!draft.city.trim()}><Plus className="h-4 w-4" /> {t('Add')}</Button>
      </div>
    </Card>
  );
}

function Categories() {
  const { t } = useDash();
  const toast = useToast();
  const { data, reload } = useApi('/api/categories');
  const [draft, setDraft] = useState({ name: '', nameEn: '', nameAr: '' });
  const add = async () => {
    try { await api.post('/api/categories', { ...draft, nameEn: draft.nameEn || null, nameAr: draft.nameAr || null }); setDraft({ name: '', nameEn: '', nameAr: '' }); reload(); } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };
  const toggle = async (c) => { await api.patch(`/api/categories/${c.id}`, { isActive: !c.isActive }); reload(); };
  return (
    <Card className="p-4">
      <CardHeader className="px-0 pt-0" title={t('Menu categories')} />
      <ul className="mt-3 flex flex-wrap gap-2">
        {(data?.items ?? []).map((c) => (
          <li key={c.id}><button type="button" onClick={() => toggle(c)} className={`min-h-10 cursor-pointer rounded-full px-3 text-sm font-semibold ${c.isActive ? 'bg-sage/25 text-moss' : 'bg-sand text-stone line-through'}`} title={t('Click to enable/disable')}>{c.name}{c.nameEn ? ` · ${c.nameEn}` : ''}</button></li>
        ))}
      </ul>
      <div className="mt-3 grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
        <Input placeholder={t('Name (French)')} value={draft.name} onChange={(e) => setDraft((d) => ({ ...d, name: e.target.value }))} />
        <Input placeholder={t('Name (English)')} value={draft.nameEn} onChange={(e) => setDraft((d) => ({ ...d, nameEn: e.target.value }))} />
        <Input placeholder={t('Name (Arabic)')} dir="rtl" value={draft.nameAr} onChange={(e) => setDraft((d) => ({ ...d, nameAr: e.target.value }))} />
        <Button onClick={add} disabled={!draft.name.trim()}><Plus className="h-4 w-4" /> {t('Add')}</Button>
      </div>
    </Card>
  );
}

function Row({ ok, title, children }) {
  return (
    <li className="flex gap-3 rounded-xl bg-linen/60 p-3">
      {ok ? <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-moss" /> : <CircleSlash className="mt-0.5 h-5 w-5 shrink-0 text-stone" />}
      <div><p className="font-semibold">{title}</p><div className="text-sm text-muted">{children}</div></div>
    </li>
  );
}

function Integrations() {
  const { t } = useDash();
  const { data } = useApi('/api/system/status');
  if (!data) return null;
  const outbox = data.whatsapp.outbox;
  return (
    <Card className="p-4">
      <CardHeader className="px-0 pt-0" title={t('Integrations')} />
      <ul className="mt-3 flex flex-col gap-2">
        <Row ok={data.whatsapp.connected} title="WhatsApp Cloud API">
          {data.whatsapp.connected ? t('Connected — incoming messages and order updates are active.') : t('Not configured. Set the WHATSAPP_* variables on the server (see README). Order updates are recorded as "skipped".')}
          {Object.keys(outbox).length > 0 && <p className="mt-1 text-xs">{t('Message outbox')}: {Object.entries(outbox).map(([k, n]) => `${t(k)} ${n}`).join(' · ')}</p>}
        </Row>
        <Row ok={Boolean(data.payments.onlineProvider)} title={t('Online payments')}>
          {data.payments.onlineProvider ? data.payments.onlineProvider : t('No payment gateway connected — customers can pay cash; staff can record online/transfer payments with a reference.')}
        </Row>
      </ul>
    </Card>
  );
}

export default function SettingsPage() {
  const { t } = useDash();
  const { can } = useAuth();
  useEffect(() => { document.title = `${t('Settings')} · Healthy Kitchen`; }, [t]);
  return (
    <div className="flex flex-col gap-4">
      <PageHeader title={t('Settings')} />
      <div className="grid gap-4 xl:grid-cols-2">
        {can(P.SETTINGS_MANAGE) && <KitchenSettings />}
        {can(P.SETTINGS_MANAGE) && <Integrations />}
        {can(P.SETTINGS_MANAGE) && <Zones />}
        {can(P.MEALS_EDIT) && <Categories />}
      </div>
      <p className="text-xs text-stone">{t('All prices are in Tunisian dinars (DT, 3 decimals).')}</p>
    </div>
  );
}
