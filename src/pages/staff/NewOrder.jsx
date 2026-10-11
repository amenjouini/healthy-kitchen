import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { Minus, Plus, MessageCircle } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import Button from '@/components/ui/Button';
import { Card, PageHeader, SearchInput } from '@/components/ui/Data';
import { TextField, Segmented } from '@/components/ui/Form';
import { Alert, Spinner, useToast } from '@/components/ui/Feedback';
import { AvailabilityBadge } from '@/components/domain/Badges';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { P } from '@shared/permissions';
import { normalizePhone } from '@shared/phone';
import { formatMoney, formatTime } from '@/utils/format';
import { SOURCE_LABELS } from '@/components/domain/labels';

function ConversationPanel({ conversation, t }) {
  const inbound = conversation.messages.filter((m) => m.direction === 'in').slice(-6);
  return (
    <Card className="p-4">
      <p className="flex items-center gap-2 text-sm font-semibold"><MessageCircle className="h-4 w-4 text-sage" /> {t('Latest WhatsApp messages')}</p>
      <ul className="mt-2 flex flex-col gap-2">
        {inbound.map((m) => (
          <li key={m.id} className="rounded-xl rounded-ss-sm bg-white px-3 py-2 text-sm shadow-sm">
            {m.body}
            <span className="block text-end text-[10px] text-stone">{formatTime(m.createdAt)}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

export default function NewOrder() {
  const { t, base } = useDash();
  const { can } = useAuth();
  const toast = useToast();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const conversationId = params.get('conversation');
  const meals = useApi('/api/meals');
  const zones = useApi('/api/zones');
  const conv = useApi(conversationId ? `/api/whatsapp/conversations/${conversationId}` : null);
  const c = conv.data?.conversation;

  const [form, setForm] = useState({
    source: conversationId ? 'whatsapp' : 'phone', name: '', phone: '', fulfillment: 'delivery', zoneId: '', address: '', city: '',
    notes: '', requestedFor: '', paymentMethod: 'cash', paymentStatus: 'pending', paymentReference: '',
  });
  const [qty, setQty] = useState({});
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  // Prefill from the WhatsApp conversation without overwriting what staff typed.
  const name = form.name || c?.customer?.name || c?.profileName || '';
  const phone = form.phone || (c ? `+${c.phone}` : '');
  const address = form.address || c?.customer?.address || '';
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e?.target ? e.target.value : e }));

  const activeZones = (zones.data?.items ?? []).filter((z) => z.isActive);
  const zone = activeZones.find((z) => String(z.id) === String(form.zoneId));
  const orderable = useMemo(() => (meals.data?.items ?? []).filter((m) => !m.archivedAt && m.availability.state !== 'unavailable'), [meals.data]);
  const visible = orderable.filter((m) => !search || m.name.toLowerCase().includes(search.toLowerCase()) || m.nameEn?.toLowerCase().includes(search.toLowerCase()));
  const lines = orderable.filter((m) => qty[m.id] > 0).map((m) => ({ meal: m, quantity: qty[m.id] }));
  const subtotal = lines.reduce((s, l) => s + l.meal.priceMillimes * l.quantity, 0);
  const fee = form.fulfillment === 'delivery' && zone ? zone.feeMillimes : 0;
  const step = (id, d) => setQty((q) => ({ ...q, [id]: Math.max(0, Math.min(50, (q[id] ?? 0) + d)) }));
  const canMarkPaid = can(P.PAYMENTS_MANAGE) || (form.paymentMethod === 'cash' && can(P.PAYMENTS_COLLECT));

  const submit = async () => {
    setError(null);
    if (!lines.length) { setError({ message: t('Add at least one meal') }); return; }
    if (!name.trim()) { setError({ message: t('Customer name is required') }); return; }
    if (phone && !normalizePhone(phone)) { setError({ message: t('Please enter a valid phone number') }); return; }
    setBusy(true);
    try {
      const { order } = await api.post('/api/staff/orders', {
        source: form.source,
        items: lines.map((l) => ({ mealId: l.meal.id, quantity: l.quantity })),
        customer: { name: name.trim(), ...(phone && { phone }) },
        fulfillment: form.fulfillment,
        ...(form.fulfillment === 'delivery' ? { zoneId: Number(form.zoneId) || undefined, address: address.trim() || undefined } : { city: form.city || undefined }),
        ...(form.notes.trim() && { notes: form.notes.trim() }),
        ...(form.requestedFor && { requestedFor: new Date(form.requestedFor).toISOString() }),
        paymentMethod: form.paymentMethod,
        paymentStatus: canMarkPaid ? form.paymentStatus : 'pending',
        ...(form.paymentReference.trim() && { paymentReference: form.paymentReference.trim() }),
        ...(conversationId && { whatsappConversationId: Number(conversationId) }),
      });
      toast(t('Order {number} created', { number: order.number }));
      navigate(`${base}/orders/${order.id}`);
    } catch (err) {
      setError(err);
    } finally {
      setBusy(false);
    }
  };

  if (meals.loading || zones.loading) return <Spinner />;

  return (
    <div>
      <PageHeader title={t('New order')} subtitle={t('For WhatsApp, phone and walk-in customers. Prices and stock are checked by the server.')} />
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">{t('Meals')}</h2>
            <SearchInput value={search} onChange={setSearch} placeholder={t('Search meals')} className="mb-3" />
            <ul className="grid gap-2 sm:grid-cols-2">
              {visible.map((m) => {
                const q = qty[m.id] ?? 0;
                const blocked = m.availability.state === 'out_of_stock';
                return (
                  <li key={m.id} className={`flex items-center gap-3 rounded-xl border p-2.5 ${q ? 'border-moss bg-moss/5' : 'border-sage/25 bg-white/70'}`}>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold">{m.name}</p>
                      <p className="flex flex-wrap items-center gap-1.5 text-xs text-stone">{formatMoney(m.priceMillimes)} {m.availability.state !== 'available' && <AvailabilityBadge state={m.availability.state} t={t} />}</p>
                    </div>
                    <div className="flex items-center">
                      <motion.button whileTap={{ scale: 0.85 }} type="button" disabled={!q} onClick={() => step(m.id, -1)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-moss disabled:opacity-30" aria-label="−"><Minus className="h-4 w-4" /></motion.button>
                      <span className="w-6 text-center font-bold tabular-nums">{q}</span>
                      <motion.button whileTap={{ scale: 0.85 }} type="button" disabled={blocked} onClick={() => step(m.id, 1)} className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl bg-forest text-linen disabled:opacity-30" aria-label="+"><Plus className="h-4 w-4" /></motion.button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </Card>

          <Card className="p-4">
            <h2 className="mb-3 font-semibold">{t('Customer')}</h2>
            <div className="mb-3"><Segmented value={form.source} onChange={set('source')} options={['whatsapp', 'phone', 'walk_in'].map((s) => ({ value: s, label: t(SOURCE_LABELS[s]) }))} /></div>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextField label={t('Name')} required value={name} onChange={set('name')} />
              <TextField label={t('Phone')} type="tel" value={phone} onChange={set('phone')} hint={form.source === 'walk_in' ? t('Optional for walk-in') : undefined} />
            </div>
            <div className="mt-3"><Segmented value={form.fulfillment} onChange={set('fulfillment')} options={[{ value: 'delivery', label: t('Delivery') }, { value: 'pickup', label: t('Pickup') }]} /></div>
            {form.fulfillment === 'delivery' ? (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField as="select" label={t('City')} required value={form.zoneId} onChange={set('zoneId')}>
                  <option value="">{t('Choose…')}</option>
                  {activeZones.map((z) => <option key={z.id} value={z.id}>{z.city} · {formatMoney(z.feeMillimes)}</option>)}
                </TextField>
                <TextField label={t('Requested time (optional)')} type="datetime-local" value={form.requestedFor} onChange={set('requestedFor')} />
                <TextField as="textarea" label={t('Address')} required rows={2} value={address} onChange={set('address')} className="sm:col-span-2" />
              </div>
            ) : (
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <TextField label={t('City (optional)')} value={form.city} onChange={set('city')} />
                <TextField label={t('Requested time (optional)')} type="datetime-local" value={form.requestedFor} onChange={set('requestedFor')} />
              </div>
            )}
            <TextField as="textarea" className="mt-3" label={t('Notes')} rows={2} value={form.notes} onChange={set('notes')} placeholder={t('Allergies, substitutions, delivery instructions…')} />
          </Card>
        </div>

        <div className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          {c && <ConversationPanel conversation={c} t={t} />}
          <Card className="p-4">
            <h2 className="mb-3 font-semibold">{t('Payment')}</h2>
            <Segmented value={form.paymentMethod} onChange={set('paymentMethod')} options={[{ value: 'cash', label: t('Cash') }, { value: 'online', label: t('Online') }]} />
            {canMarkPaid && (
              <div className="mt-3"><Segmented value={form.paymentStatus} onChange={set('paymentStatus')} options={[{ value: 'pending', label: t('To collect') }, { value: 'paid', label: t('Already paid') }]} /></div>
            )}
            {form.paymentMethod === 'online' && <TextField className="mt-3" label={t('Transaction reference')} value={form.paymentReference} onChange={set('paymentReference')} hint={t('Required when marking an online payment as paid')} />}
          </Card>
          <Card className="p-4">
            <ul className="flex flex-col gap-1 text-sm">
              {lines.map((l) => <li key={l.meal.id} className="flex justify-between gap-2"><span>{l.quantity}× {l.meal.name}</span><span className="tabular-nums">{formatMoney(l.meal.priceMillimes * l.quantity)}</span></li>)}
              {!lines.length && <li className="text-stone">{t('No meals selected')}</li>}
            </ul>
            <dl className="mt-3 grid grid-cols-2 gap-y-1 border-t border-sage/20 pt-2 text-sm">
              <dt className="text-stone">{t('Delivery')}</dt><dd className="text-end tabular-nums">{formatMoney(fee)}</dd>
              <dt className="font-semibold">{t('Total (estimate)')}</dt><dd className="text-end font-serif text-xl font-bold tabular-nums">{formatMoney(subtotal + fee)}</dd>
            </dl>
            {error && <Alert tone="danger" className="mt-3" title={error.code ? errorMessage(error, t) : error.message}>
              {error.details?.shortages && <ul className="list-disc ps-4">{error.details.shortages.map((s) => <li key={s.ingredientId}>{s.name}</li>)}</ul>}
            </Alert>}
            <Button size="lg" className="mt-3 w-full" loading={busy} onClick={submit}>{t('Create order')}</Button>
          </Card>
        </div>
      </div>
    </div>
  );
}
