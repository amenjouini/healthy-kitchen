import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, BellRing, BellOff, ChefHat, Package, PackageX, Plus, Timer } from 'lucide-react';
import OrderCard from '@/components/dashboard/OrderCard';
import { useDash } from '@/components/dashboard/DashboardContext';
import Button from '@/components/ui/Button';
import { Card, Stat, PageHeader, Badge } from '@/components/ui/Data';
import { Segmented } from '@/components/ui/Form';
import { Alert, EmptyState, ErrorState, Spinner, useToast } from '@/components/ui/Feedback';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { P } from '@shared/permissions';
import { formatQuantity } from '@/utils/format';
import { STATUS_LABELS } from '@/components/domain/labels';

const COLUMNS = ['new', 'accepted', 'preparing', 'ready'];

/** Short two-tone chime via WebAudio (no audio files). Browsers require a prior user gesture. */
function chime() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [880, 1320].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, ctx.currentTime + i * 0.18);
      gain.gain.exponentialRampToValueAtTime(0.25, ctx.currentTime + i * 0.18 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + i * 0.18 + 0.3);
      osc.connect(gain).connect(ctx.destination);
      osc.start(ctx.currentTime + i * 0.18);
      osc.stop(ctx.currentTime + i * 0.18 + 0.32);
    });
  } catch { /* audio unavailable */ }
}

export default function KitchenBoard() {
  const { t, base } = useDash();
  const { can } = useAuth();
  const toast = useToast();
  const overview = useApi('/api/staff/overview', { poll: 10000 });
  const orders = useApi('/api/orders?active=1&withItems=1&sort=oldest&pageSize=200', { poll: 10000 });
  const [tab, setTab] = useState('new');
  const [sound, setSound] = useState(() => { try { return localStorage.getItem('hk_chime') === '1'; } catch { return false; } });
  const lastNewIds = useRef(null);

  const list = useMemo(() => orders.data?.items ?? [], [orders.data]);
  const byStatus = Object.fromEntries(COLUMNS.map((s) => [s, list.filter((o) => o.status === s)]));
  const ov = overview.data;

  // Chime when an order we have not seen before arrives in "new".
  useEffect(() => {
    const ids = new Set(list.filter((o) => o.status === 'new').map((o) => o.id));
    if (lastNewIds.current && sound && [...ids].some((id) => !lastNewIds.current.has(id))) chime();
    lastNewIds.current = ids;
  }, [list, sound]);

  useEffect(() => { document.title = `${t('Kitchen')} · Healthy Kitchen`; }, [t]);

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    try { localStorage.setItem('hk_chime', next ? '1' : '0'); } catch { /* ignore */ }
    if (next) chime();
  };

  const toggleAccepting = async () => {
    try {
      await api.post('/api/kitchen/accepting', { accepting: !ov.acceptingOrders });
      overview.reload();
      toast(t(ov.acceptingOrders ? 'Online ordering paused' : 'Online ordering resumed'));
    } catch (err) { toast(errorMessage(err, t), 'danger'); }
  };

  const onChange = () => { orders.reload(); overview.reload(); };

  if (orders.error) return <ErrorState error={orders.error} onRetry={orders.reload} t={t} />;

  return (
    <div>
      <PageHeader
        title={t('Today in the kitchen')}
        actions={(
          <>
            <Button variant="secondary" onClick={toggleSound} aria-pressed={sound}>{sound ? <BellRing className="h-4 w-4" /> : <BellOff className="h-4 w-4" />} {t(sound ? 'Sound on' : 'Sound off')}</Button>
            {can(P.ORDERS_CREATE) && <Link to={`${base}/new-order`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-forest px-4 text-sm font-semibold text-linen"><Plus className="h-4 w-4" /> {t('New order')}</Link>}
          </>
        )}
      />

      {ov && !ov.acceptingOrders && (
        <Alert tone="warning" className="mb-4" title={t('Online ordering is paused')}>
          <button type="button" onClick={toggleAccepting} className="mt-1 min-h-9 cursor-pointer font-semibold underline">{t('Resume online ordering')}</button>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        {COLUMNS.map((s) => <Stat key={s} label={t(STATUS_LABELS[s])} value={ov?.counts[s] ?? '–'} />)}
        <Stat label={t('Late')} value={ov?.late.length ?? '–'} tone={ov?.late.length ? 'red' : undefined} icon={AlertTriangle} />
        <Stat label={t('Completed today')} value={ov?.counts.completedToday ?? '–'} hint={ov?.counts.refusedToday ? t('{n} refused', { n: ov.counts.refusedToday }) : undefined} />
      </div>

      {ov && (
        <div className="mt-3 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <Card className="flex flex-wrap items-center gap-x-6 gap-y-2 p-4">
            <span className="flex items-center gap-2 text-sm"><ChefHat className="h-5 w-5 text-sage" /><b className="text-lg">{ov.workload.mealsPreparing}</b> {t('meals preparing')}</span>
            <span className="flex items-center gap-2 text-sm"><Package className="h-5 w-5 text-sage" /><b className="text-lg">{ov.workload.mealsQueued}</b> {t('meals in the queue')}</span>
            <span className="flex items-center gap-2 text-sm"><Timer className="h-5 w-5 text-sage" />{t('≈ {n} min of work', { n: ov.workload.estimatedMinutes })}</span>
            {ov.acceptingOrders && can(P.ORDERS_MANAGE) && <button type="button" onClick={toggleAccepting} className="ms-auto min-h-9 cursor-pointer text-xs font-semibold text-stone underline">{t('Pause online ordering')}</button>}
          </Card>
          {ov.lowStock && (ov.lowStock.length > 0 || ov.mealsAtRisk?.length > 0) && (
            <Card className="p-4">
              <p className="flex items-center gap-2 text-sm font-semibold"><PackageX className="h-4 w-4 text-clay" /> {t('Stock warnings')}</p>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {ov.mealsAtRisk?.map((m) => <Badge key={`m${m.id}`} tone={m.state === 'out_of_stock' ? 'red' : 'amber'}>{m.name}{m.servingsPossible != null ? ` · ${m.servingsPossible}` : ''}</Badge>)}
                {ov.lowStock.map((i) => <Badge key={i.id} tone={i.stockState === 'out' ? 'red' : 'amber'}>{i.name} · {formatQuantity(Math.max(0, i.availableQty), i.baseUnit)}</Badge>)}
              </div>
              {ov.forecast?.length > 0 && <p className="mt-2 text-xs text-stone">{t('Runs out within 3 days at current usage')}: {ov.forecast.map((f) => f.name).join(', ')}</p>}
              <Link to={`${base}/inventory`} className="mt-2 inline-flex min-h-9 items-center text-xs font-semibold text-moss underline">{t('Open stock')}</Link>
            </Card>
          )}
        </div>
      )}

      {orders.loading ? <Spinner /> : (
        <>
          {/* Phones: one status at a time */}
          <div className="mt-5 lg:hidden">
            <Segmented value={tab} onChange={setTab} className="w-full" options={COLUMNS.map((s) => ({ value: s, label: t(STATUS_LABELS[s]), count: byStatus[s].length }))} />
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <AnimatePresence mode="popLayout">
                {byStatus[tab].map((o) => <OrderCard key={o.id} order={o} onChange={onChange} />)}
              </AnimatePresence>
            </div>
            {byStatus[tab].length === 0 && <EmptyState title={t('Nothing here')} />}
          </div>
          {/* Desktop: four columns */}
          <div className="mt-6 hidden gap-4 lg:grid lg:grid-cols-4">
            {COLUMNS.map((s) => (
              <section key={s} className="flex min-w-0 flex-col gap-3">
                <h2 className="flex items-center justify-between text-sm font-bold uppercase tracking-wide text-stone">
                  {t(STATUS_LABELS[s])}
                  <span className="rounded-full bg-moss/10 px-2 text-xs text-moss">{byStatus[s].length}</span>
                </h2>
                <AnimatePresence mode="popLayout">
                  {byStatus[s].map((o) => <OrderCard key={o.id} order={o} onChange={onChange} />)}
                </AnimatePresence>
                {byStatus[s].length === 0 && <motion.p layout className="rounded-2xl border border-dashed border-sage/30 py-8 text-center text-sm text-stone">{t('Nothing here')}</motion.p>}
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
