import { useNavigate } from 'react-router-dom';
import { DataTable } from '@/components/ui/Data';
import { EmptyState } from '@/components/ui/Feedback';
import { OrderStatusBadge, PaymentBadge, SourceBadge } from '@/components/domain/Badges';
import { Badge } from '@/components/ui/Data';
import { formatDateTime, formatMoney } from '@/utils/format';
import { useDash } from './DashboardContext';

export default function OrdersTable({ orders, emptyTitle }) {
  const { t, base } = useDash();
  const navigate = useNavigate();
  return (
    <DataTable
      rows={orders}
      onRowClick={(o) => navigate(`${base}/orders/${o.id}`)}
      empty={<EmptyState title={emptyTitle ?? t('No orders found')} />}
      columns={[
        { key: 'number', header: t('Order'), mobile: 'title', render: (o) => <span className="font-semibold">{o.number} {o.late && <Badge tone="red">{t('Late')}</Badge>}</span> },
        { key: 'customer', header: t('Customer'), render: (o) => <span>{o.customerName}<span className="block text-xs text-stone">{o.city ?? t('Pickup')}</span></span> },
        { key: 'status', header: t('Status'), render: (o) => <OrderStatusBadge status={o.status} t={t} /> },
        { key: 'source', header: t('Source'), render: (o) => <SourceBadge source={o.source} t={t} /> },
        { key: 'payment', header: t('Payment'), render: (o) => <PaymentBadge status={o.paymentStatus} method={o.paymentMethod} t={t} /> },
        { key: 'total', header: t('Total'), className: 'text-end tabular-nums', render: (o) => formatMoney(o.totalMillimes) },
        { key: 'date', header: t('Placed'), render: (o) => <span className="text-xs text-stone">{formatDateTime(o.createdAt)}</span> },
      ]}
    />
  );
}
