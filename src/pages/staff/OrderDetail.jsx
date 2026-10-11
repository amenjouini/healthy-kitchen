import { Link, useParams } from 'react-router-dom';
import { ArrowLeft, MapPin, MessageCircle, Phone, Store, AlertTriangle } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import OrderActions from '@/components/dashboard/OrderActions';
import PaymentPanel from '@/components/dashboard/PaymentPanel';
import { Card, Badge } from '@/components/ui/Data';
import { ErrorState, Spinner, Alert } from '@/components/ui/Feedback';
import { OrderStatusBadge, SourceBadge } from '@/components/domain/Badges';
import { MacroLine } from '@/components/domain/NutritionFacts';
import { useApi } from '@/hooks/useApi';
import { useAuth } from '@/context/AuthContext';
import { P } from '@shared/permissions';
import { elapsed, formatDateTime, formatMoney, formatPhone, formatQuantity } from '@/utils/format';
import { FULFILLMENT_LABELS, REFUSAL_LABELS, STATUS_LABELS } from '@/components/domain/labels';

export default function OrderDetail() {
  const { id } = useParams();
  const { t, base } = useDash();
  const { can } = useAuth();
  const { data, error, loading, reload, setData } = useApi(`/api/orders/${id}`, { poll: 15000 });
  if (loading) return <Spinner />;
  if (error) return <ErrorState error={error} onRetry={reload} t={t} />;
  const o = data.order;
  const finance = o.estimatedCostMillimes !== undefined;

  return (
    <div className="flex flex-col gap-4">
      <Link to={`${base}/orders`} className="inline-flex min-h-11 items-center gap-1 self-start text-sm font-semibold text-moss"><ArrowLeft className="h-4 w-4" /> {t('Orders')}</Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="font-serif text-4xl font-bold leading-none">{o.number}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm text-stone">
            <OrderStatusBadge status={o.status} t={t} />
            <SourceBadge source={o.source} t={t} />
            <span>{formatDateTime(o.createdAt)}</span>
            {o.late && <Badge tone="red"><AlertTriangle className="h-3 w-3" /> {t('Late')} · {elapsed(o.statusChangedAt)}</Badge>}
          </div>
        </div>
      </div>

      {o.status === 'refused' && <Alert tone="danger" title={`${t('Refused')}: ${t(REFUSAL_LABELS[o.refusalReason] ?? o.refusalReason ?? '')}`}>{o.statusNote}</Alert>}
      {o.status === 'cancelled' && <Alert tone="warning" title={`${t('Cancelled')}: ${t(REFUSAL_LABELS[o.cancellationReason] ?? o.cancellationReason ?? '')}`}>{o.statusNote}</Alert>}

      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="flex flex-col gap-4">
          <Card className="p-4"><OrderActions order={o} onChange={(order) => setData({ order })} /></Card>

          <Card className="p-4">
            <h2 className="font-semibold">{t('Items to prepare')}</h2>
            <ul className="mt-3 flex flex-col gap-4">
              {o.items.map((item) => (
                <li key={item.id} className="rounded-xl bg-linen/60 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <p className="text-lg font-semibold"><span className="me-2 rounded-md bg-forest px-2 py-0.5 text-linen">{item.quantity}×</span>{item.kind === 'custom' ? t('Custom bowl') : item.name}</p>
                    <span className="text-sm tabular-nums text-stone">{formatMoney(item.lineTotalMillimes)}</span>
                  </div>
                  {item.notes && <p className="mt-1 text-sm font-semibold text-clay">“{item.notes}”</p>}
                  <ul className="mt-2 grid gap-x-4 gap-y-0.5 text-sm text-olive sm:grid-cols-2">
                    {item.components.map((c) => (
                      <li key={c.ingredientId} className="flex justify-between gap-2 border-b border-sage/10 py-0.5">
                        <span>{c.name}</span><span className="tabular-nums">{formatQuantity(c.quantity * item.quantity, c.baseUnit)}</span>
                      </li>
                    ))}
                  </ul>
                  <MacroLine nutrition={item.nutrition} t={t} className="mt-2" />
                </li>
              ))}
            </ul>
            {o.notes && <p className="mt-3 rounded-lg bg-mint/40 p-3 text-sm text-moss"><b>{t('Customer note')}:</b> {o.notes}</p>}
          </Card>

          <Card className="p-4">
            <h2 className="font-semibold">{t('History')}</h2>
            <ol className="mt-3 flex flex-col gap-2 text-sm">
              {o.history.map((h, i) => (
                <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 border-b border-sage/10 pb-2">
                  <span><b>{t(STATUS_LABELS[h.to])}</b>{h.reason && ` — ${t(REFUSAL_LABELS[h.reason] ?? h.reason)}`}{h.note && <span className="block text-xs text-muted">{h.note}</span>}</span>
                  <span className="text-xs text-stone">{h.by ?? t('Customer / system')} · {formatDateTime(h.at)}</span>
                </li>
              ))}
            </ol>
          </Card>
        </div>

        <div className="flex flex-col gap-4">
          <Card className="p-4">
            <h2 className="font-semibold">{t('Customer')}</h2>
            <p className="mt-2 text-lg font-semibold">{o.customerName}</p>
            {o.customerPhone && (
              <div className="mt-2 flex flex-wrap gap-2">
                <a href={`tel:+${o.customerPhone}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-sage/30 bg-white/70 px-3 text-sm font-semibold"><Phone className="h-4 w-4" /> {formatPhone(o.customerPhone)}</a>
                {o.whatsappConversationId && can(P.WHATSAPP_USE) ? (
                  <Link to={`${base}/whatsapp/${o.whatsappConversationId}`} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sage/25 px-3 text-sm font-semibold text-moss"><MessageCircle className="h-4 w-4" /> {t('Conversation')}</Link>
                ) : (
                  <a href={`https://wa.me/${o.customerPhone}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-sage/25 px-3 text-sm font-semibold text-moss"><MessageCircle className="h-4 w-4" /> WhatsApp</a>
                )}
              </div>
            )}
            <p className="mt-3 flex items-start gap-2 text-sm">
              {o.fulfillment === 'pickup' ? <Store className="mt-0.5 h-4 w-4 shrink-0" /> : <MapPin className="mt-0.5 h-4 w-4 shrink-0" />}
              <span>{t(FULFILLMENT_LABELS[o.fulfillment])}{o.city ? ` · ${o.city}` : ''}{o.address && <span className="block text-muted">{o.address}</span>}</span>
            </p>
            {o.requestedFor && <p className="mt-2 text-sm font-semibold text-[#7a5212]">{t('Requested for')} {formatDateTime(o.requestedFor)}</p>}
            {can(P.CUSTOMERS_VIEW) && base === '/admin' && <Link to={`/admin/customers/${o.customerId}`} className="mt-2 inline-flex min-h-9 items-center text-sm font-semibold text-moss underline">{t('Customer profile')}</Link>}
          </Card>

          <PaymentPanel order={o} onChange={reload} />

          <Card className="p-4 text-sm">
            <h2 className="mb-2 font-semibold">{t('Totals')}</h2>
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-stone">{t('Subtotal')}</dt><dd className="text-end tabular-nums">{formatMoney(o.subtotalMillimes)}</dd>
              <dt className="text-stone">{t('Delivery')}</dt><dd className="text-end tabular-nums">{formatMoney(o.deliveryFeeMillimes)}</dd>
              {o.discountMillimes > 0 && <><dt className="text-stone">{t('Discount')}</dt><dd className="text-end tabular-nums">−{formatMoney(o.discountMillimes)}</dd></>}
              <dt className="font-semibold">{t('Total')}</dt><dd className="text-end font-bold tabular-nums">{formatMoney(o.totalMillimes)}</dd>
              {finance && (
                <>
                  <dt className="mt-2 text-stone">{t('Est. ingredient cost')}</dt><dd className="mt-2 text-end tabular-nums">{formatMoney(o.estimatedCostMillimes)}</dd>
                  <dt className="text-stone">{t('Est. gross margin')}</dt><dd className="text-end tabular-nums">{formatMoney(o.estimatedMarginMillimes)}</dd>
                </>
              )}
            </dl>
            {finance && <p className="mt-2 text-[11px] text-stone">{t('Estimates from recipe costs at order time; excludes labour, packaging and waste.')}</p>}
          </Card>

          {o.reservations.length > 0 && (
            <Card className="p-4 text-sm">
              <h2 className="mb-2 font-semibold">{t('Stock for this order')}</h2>
              <ul className="flex flex-col gap-1">
                {o.reservations.map((r) => (
                  <li key={r.ingredientId} className="flex justify-between gap-2">
                    <span>{r.name}</span>
                    <span className="tabular-nums text-stone">{formatQuantity(r.quantity, r.baseUnit)} · {t(r.status === 'active' ? 'reserved' : r.status === 'consumed' ? 'used' : 'released')}</span>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
