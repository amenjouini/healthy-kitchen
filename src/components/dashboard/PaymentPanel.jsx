import { useState } from 'react';
import { Banknote, CreditCard, RotateCcw, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { TextField } from '@/components/ui/Form';
import { Card } from '@/components/ui/Data';
import { useToast } from '@/components/ui/Feedback';
import { PaymentBadge } from '@/components/domain/Badges';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { P } from '@shared/permissions';
import { formatDateTime, formatMoney } from '@/utils/format';
import { useDash } from './DashboardContext';

/**
 * Payment status for an order. Staff with payments.collect can confirm cash;
 * payments.manage holders can record online references, failures and refunds.
 */
export default function PaymentPanel({ order, onChange }) {
  const { t } = useDash();
  const { can } = useAuth();
  const toast = useToast();
  const [dialog, setDialog] = useState(null);
  const [form, setForm] = useState({ method: order.paymentMethod, reference: '', amount: '', reason: '', notes: '' });
  const [busy, setBusy] = useState(false);
  const p = order.payments.at(-1);
  if (!p) return null;
  const manage = can(P.PAYMENTS_MANAGE);
  const closed = ['refused', 'cancelled'].includes(order.status);

  const call = async (path, body, msg) => {
    setBusy(true);
    try {
      await api.post(`/api/orders/${order.id}/payment/${path}`, body);
      setDialog(null);
      toast(t(msg));
      onChange();
    } catch (err) { toast(errorMessage(err, t), 'danger'); } finally { setBusy(false); }
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-semibold">{t('Payment')}</h3>
        <PaymentBadge status={p.status} method={p.method} t={t} />
      </div>
      <dl className="mt-3 grid grid-cols-2 gap-y-1.5 text-sm">
        <dt className="text-stone">{t('Amount')}</dt><dd className="text-end font-semibold tabular-nums">{formatMoney(p.amountMillimes)}</dd>
        {p.refundedMillimes > 0 && <><dt className="text-stone">{t('Refunded')}</dt><dd className="text-end tabular-nums text-clay">{formatMoney(p.refundedMillimes)}</dd></>}
        {p.paidAt && <><dt className="text-stone">{t('Paid at')}</dt><dd className="text-end">{formatDateTime(p.paidAt)}</dd></>}
        {p.providerReference && <><dt className="text-stone">{t('Reference')}</dt><dd className="truncate text-end font-mono text-xs">{p.providerReference}</dd></>}
        {p.refundReason && <><dt className="text-stone">{t('Refund reason')}</dt><dd className="text-end">{p.refundReason}</dd></>}
        {p.recordedBy && <><dt className="text-stone">{t('Recorded by')}</dt><dd className="text-end">{p.recordedBy}</dd></>}
      </dl>
      <div className="mt-3 flex flex-wrap gap-2">
        {p.status === 'pending' && !closed && p.method === 'cash' && can(P.PAYMENTS_COLLECT) && (
          <Button onClick={() => call('paid', {}, 'Cash payment recorded')} loading={busy}><Banknote className="h-4 w-4" /> {t('Cash received')}</Button>
        )}
        {['pending', 'failed'].includes(p.status) && !closed && manage && (
          <Button variant="secondary" onClick={() => setDialog('paid')}><CreditCard className="h-4 w-4" /> {t('Record payment')}</Button>
        )}
        {p.status === 'pending' && manage && <Button variant="ghost" onClick={() => setDialog('failed')}><XCircle className="h-4 w-4" /> {t('Mark failed')}</Button>}
        {['paid', 'partially_refunded'].includes(p.status) && manage && <Button variant="dangerOutline" onClick={() => setDialog('refund')}><RotateCcw className="h-4 w-4" /> {t('Refund')}</Button>}
      </div>

      <Modal open={dialog === 'paid'} onClose={() => setDialog(null)} title={t('Record payment')} size="sm"
        footer={<Button className="w-full" loading={busy} onClick={() => call('paid', { method: form.method, ...(form.reference && { reference: form.reference }), ...(form.notes && { notes: form.notes }) }, 'Payment recorded')}>{t('Confirm payment')}</Button>}>
        <div className="flex flex-col gap-3">
          <TextField as="select" label={t('Method')} value={form.method} onChange={set('method')}>
            <option value="cash">{t('Cash')}</option>
            <option value="online">{t('Online')}</option>
          </TextField>
          <TextField label={t('Transaction reference')} hint={t('Required for online payments (gateway id, transfer reference, D17…)')} value={form.reference} onChange={set('reference')} />
          <TextField label={t('Notes')} value={form.notes} onChange={set('notes')} />
        </div>
      </Modal>
      <Modal open={dialog === 'failed'} onClose={() => setDialog(null)} title={t('Mark payment as failed')} size="sm"
        footer={<Button variant="danger" className="w-full" loading={busy} onClick={() => call('failed', form.notes ? { notes: form.notes } : {}, 'Payment marked as failed')}>{t('Mark failed')}</Button>}>
        <TextField label={t('Notes')} value={form.notes} onChange={set('notes')} />
      </Modal>
      <Modal open={dialog === 'refund'} onClose={() => setDialog(null)} title={t('Refund')} size="sm"
        footer={<Button variant="danger" className="w-full" loading={busy} disabled={!form.reason.trim()} onClick={() => call('refund', { reason: form.reason, ...(form.amount && { amount: form.amount }) }, 'Refund recorded')}>{t('Record refund')}</Button>}>
        <div className="flex flex-col gap-3">
          <TextField label={t('Amount (DT) — leave empty for full refund')} inputMode="decimal" value={form.amount} onChange={set('amount')} placeholder={formatMoney(p.amountMillimes - p.refundedMillimes, { symbol: '' })} />
          <TextField label={t('Reason')} required value={form.reason} onChange={set('reason')} />
          <p className="text-xs text-stone">{t('This records the refund. Send the money back through the original channel.')}</p>
        </div>
      </Modal>
    </Card>
  );
}
