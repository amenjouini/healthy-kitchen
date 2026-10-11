import { Badge } from '@/components/ui/Data';
import { STATUS_LABELS, PAYMENT_STATUS_LABELS, AVAILABILITY_LABELS, SOURCE_LABELS, PAYMENT_METHOD_LABELS } from './labels';

const STATUS_TONES = { new: 'blue', accepted: 'purple', preparing: 'amber', ready: 'green', completed: 'dark', refused: 'red', cancelled: 'neutral' };

export function OrderStatusBadge({ status, t }) {
  return <Badge tone={STATUS_TONES[status]}>{t(STATUS_LABELS[status] ?? status)}</Badge>;
}

export function PaymentBadge({ status, method, t }) {
  const tone = status === 'paid' ? 'green' : status === 'failed' ? 'red' : status === 'pending' ? 'amber' : 'neutral';
  return (
    <Badge tone={tone}>
      {method && `${t(PAYMENT_METHOD_LABELS[method])} · `}{t(PAYMENT_STATUS_LABELS[status] ?? status)}
    </Badge>
  );
}

export function AvailabilityBadge({ state, t }) {
  const tone = { available: 'green', low_stock: 'amber', out_of_stock: 'red', unavailable: 'neutral' }[state];
  return <Badge tone={tone}>{t(AVAILABILITY_LABELS[state] ?? state)}</Badge>;
}

export function SourceBadge({ source, t }) {
  return <Badge tone={source === 'whatsapp' ? 'green' : 'neutral'}>{t(SOURCE_LABELS[source] ?? source)}</Badge>;
}

export function StockBadge({ state, t }) {
  if (state === 'ok') return <Badge tone="green">{t('OK')}</Badge>;
  return <Badge tone={state === 'out' ? 'red' : 'amber'}>{t(state === 'out' ? 'Out of stock' : 'Low stock')}</Badge>;
}
