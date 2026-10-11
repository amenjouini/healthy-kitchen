import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { CheckCircle2, Copy, XCircle } from 'lucide-react';
import OrderTimeline from '@/components/domain/OrderTimeline';
import { PaymentBadge } from '@/components/domain/Badges';
import { Card } from '@/components/ui/Data';
import { Alert, ErrorState, Spinner, useToast } from '@/components/ui/Feedback';
import Button from '@/components/ui/Button';
import { useApi } from '@/hooks/useApi';
import { useLang, useT } from '@/i18n/LangContext';
import { api, errorMessage } from '@/lib/api';
import { formatDateTime, formatMoney, formatNutrient } from '@/utils/format';
import { FULFILLMENT_LABELS, REFUSAL_LABELS, msg } from '@/components/domain/labels';

const HEADLINES = {
  new: msg('We have received your order'), accepted: msg('Your order is confirmed'), preparing: msg('Your meal is being prepared'),
  ready: msg('Your order is ready'), completed: msg('Enjoy your meal!'), refused: msg('We could not accept this order'), cancelled: msg('This order was cancelled'),
};

export default function Track() {
  const { number } = useParams();
  const [params] = useSearchParams();
  const token = params.get('t');
  const isNew = params.get('new') === '1';
  const { lang, dir } = useLang();
  const t = useT();
  const toast = useToast();
  // Poll while the order is active so the customer sees progress without refreshing.
  const { data, error, loading, setData } = useApi(`/api/track/${encodeURIComponent(number)}${token ? `?t=${encodeURIComponent(token)}` : ''}`, { poll: 20000 });
  const [cancelling, setCancelling] = useState(false);
  const order = data?.order;

  useEffect(() => { document.title = `${t('Order')} ${number} · Healthy Kitchen`; }, [t, number]);

  if (loading) return <div className="pt-32"><Spinner /></div>;
  if (error) {
    return (
      <div dir={dir} className="mx-auto max-w-xl px-4 pb-20 pt-28">
        <ErrorState error={{ message: error.status === 404 ? t('We could not find this order. Check the link you received.') : errorMessage(error, t) }} t={t} />
      </div>
    );
  }

  const cancel = async () => {
    setCancelling(true);
    try {
      const r = await api.post(`/api/track/${number}/cancel`, {});
      setData(r);
      toast(t('Order cancelled'));
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setCancelling(false);
    }
  };

  const closed = order.timeline.outcome;
  const totalKcal = order.items.reduce((s, i) => s + i.nutrition.kcal * i.quantity, 0);

  return (
    <div dir={dir} className="mx-auto grid max-w-5xl gap-6 px-4 pb-24 pt-24 sm:px-8 sm:pt-28 md:grid-cols-[1fr_340px]">
      <div className="flex flex-col gap-5">
        {isNew && (
          <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ type: 'spring', stiffness: 260, damping: 20 }}>
            <Alert tone="success" title={t('Thank you! Your order has been placed.')}>{t('Keep this page — it updates automatically.')}</Alert>
          </motion.div>
        )}
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.18em] text-sage">{t('Order')} {order.number}</p>
          <h1 className="mt-2 font-serif text-4xl font-semibold leading-tight sm:text-5xl">{t(HEADLINES[order.status])}</h1>
          <p className="mt-2 text-sm text-stone">{formatDateTime(order.createdAt, lang)} · {t(FULFILLMENT_LABELS[order.fulfillment])}{order.city ? ` · ${order.city}` : ''}</p>
        </div>

        <Card className="p-5 sm:p-6">
          {closed ? (
            <div className="flex items-start gap-3">
              <XCircle className="h-6 w-6 shrink-0 text-clay" />
              <div>
                <p className="font-semibold">{t(closed === 'refused' ? 'Order not accepted' : 'Order cancelled')}</p>
                {order.closedReason && <p className="text-sm text-muted">{t(REFUSAL_LABELS[order.closedReason] ?? order.closedReason)}</p>}
                {order.paymentStatus === 'paid' && <p className="mt-1 text-sm text-muted">{t('Your payment will be refunded.')}</p>}
              </div>
            </div>
          ) : (
            <OrderTimeline timeline={order.timeline} reachedAt={order.reachedAt} t={t} lang={lang} />
          )}
        </Card>

        {order.canCancel && (
          <Button variant="dangerOutline" onClick={cancel} loading={cancelling} className="self-start">{t('Cancel this order')}</Button>
        )}
        {token && (
          <button type="button" className="inline-flex min-h-11 cursor-pointer items-center gap-2 self-start text-sm font-semibold text-moss" onClick={() => { navigator.clipboard?.writeText(window.location.href.replace('&new=1', '')); toast(t('Tracking link copied')); }}>
            <Copy className="h-4 w-4" /> {t('Copy tracking link')}
          </button>
        )}
      </div>

      <Card className="h-fit p-5">
        <h2 className="mb-3 font-semibold">{t('Your order')}</h2>
        <ul className="flex flex-col gap-3">
          {order.items.map((item) => (
            <li key={item.id} className="text-sm">
              <div className="flex justify-between gap-3">
                <span className="font-semibold">{item.quantity}× {item.kind === 'custom' ? t('Custom bowl') : item.name}</span>
                <span className="tabular-nums">{formatMoney(item.lineTotalMillimes)}</span>
              </div>
              <p className="text-xs text-stone">{formatNutrient(item.nutrition.kcal, 'kcal')} kcal · {Math.round(item.nutrition.protein)} g {t('protein')}{item.kind === 'custom' ? ` · ${item.ingredients.join(', ')}` : ''}</p>
            </li>
          ))}
        </ul>
        <dl className="mt-4 flex flex-col gap-1 border-t border-sage/20 pt-3 text-sm">
          <div className="flex justify-between"><dt className="text-muted">{t('Subtotal')}</dt><dd>{formatMoney(order.subtotalMillimes)}</dd></div>
          {order.deliveryFeeMillimes > 0 && <div className="flex justify-between"><dt className="text-muted">{t('Delivery')}</dt><dd>{formatMoney(order.deliveryFeeMillimes)}</dd></div>}
          <div className="flex justify-between font-bold"><dt>{t('Total')}</dt><dd className="font-serif text-xl">{formatMoney(order.totalMillimes)}</dd></div>
        </dl>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} t={t} />
          <span className="text-xs text-stone">{t('Total energy')}: {Math.round(totalKcal)} kcal</span>
        </div>
        {order.status === 'completed' && (
          <Link to="/menu" className="mt-4 flex min-h-11 items-center justify-center gap-2 rounded-xl bg-sage text-sm font-semibold text-forest">
            <CheckCircle2 className="h-4 w-4" /> {t('Order again')}
          </Link>
        )}
      </Card>
    </div>
  );
}
