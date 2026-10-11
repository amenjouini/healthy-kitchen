import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { AlertTriangle, MapPin, MessageSquareText, Store, Clock } from 'lucide-react';
import { PaymentBadge, SourceBadge } from '@/components/domain/Badges';
import { elapsed, formatMoney, formatTime } from '@/utils/format';
import { cn } from '@/utils/cn';
import OrderActions from './OrderActions';
import { useDash } from './DashboardContext';

/** Kitchen ticket: readable at arm's length, one big next-step button. */
export default function OrderCard({ order, onChange }) {
  const { t, base } = useDash();
  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ type: 'spring', stiffness: 300, damping: 28 }}
      className={cn('rounded-2xl border bg-white/85 p-4 shadow-sm', order.late ? 'border-clay/50 ring-2 ring-clay/20' : 'border-sage/25')}
    >
      <div className="flex items-start justify-between gap-2">
        <Link to={`${base}/orders/${order.id}`} className="min-w-0">
          <p className="font-serif text-2xl font-bold leading-none text-forest">{order.number}</p>
          <p className="mt-1 truncate text-sm font-medium text-olive">{order.customerName}</p>
        </Link>
        <div className="flex flex-col items-end gap-1">
          <span className={cn('inline-flex items-center gap-1 text-sm font-bold tabular-nums', order.late ? 'text-clay' : 'text-stone')}>
            {order.late ? <AlertTriangle className="h-4 w-4" /> : <Clock className="h-4 w-4" />} {elapsed(order.statusChangedAt)}
          </span>
          <SourceBadge source={order.source} t={t} />
        </div>
      </div>

      {order.requestedFor && <p className="mt-2 rounded-lg bg-amber/10 px-2 py-1 text-xs font-semibold text-[#7a5212]">{t('Requested for')} {formatTime(order.requestedFor)}</p>}

      <ul className="mt-3 flex flex-col gap-1.5 border-y border-sage/15 py-3">
        {(order.items ?? []).map((item, i) => (
          <li key={i} className="text-[15px] leading-snug">
            <span className="me-1.5 inline-flex h-6 min-w-6 items-center justify-center rounded-md bg-forest px-1.5 text-sm font-bold text-linen">{item.quantity}</span>
            <span className="font-semibold">{item.kind === 'custom' ? t('Custom bowl') : item.name}</span>
            {item.kind === 'custom' && <span className="block ps-8 text-xs text-muted">{item.components.map((c) => c.name).join(' · ')}</span>}
            {item.notes && <span className="block ps-8 text-xs font-semibold text-clay">“{item.notes}”</span>}
          </li>
        ))}
      </ul>

      {order.notes && (
        <p className="mt-2 flex gap-1.5 rounded-lg bg-mint/40 px-2 py-1.5 text-sm text-moss"><MessageSquareText className="mt-0.5 h-4 w-4 shrink-0" />{order.notes}</p>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="inline-flex items-center gap-1 text-olive">
          {order.fulfillment === 'pickup' ? <Store className="h-4 w-4" /> : <MapPin className="h-4 w-4" />}
          {order.fulfillment === 'pickup' ? t('Pickup') : order.city ?? t('Delivery')}
        </span>
        <span className="flex items-center gap-2">
          <PaymentBadge status={order.paymentStatus} method={order.paymentMethod} t={t} />
          <span className="font-semibold tabular-nums">{formatMoney(order.totalMillimes)}</span>
        </span>
      </div>

      <div className="mt-3"><OrderActions order={order} onChange={onChange} compact /></div>
    </motion.article>
  );
}
