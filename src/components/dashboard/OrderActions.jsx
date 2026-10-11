import { useState } from 'react';
import { CheckCircle2, ChefHat, PackageCheck, ThumbsUp, Ban, XCircle } from 'lucide-react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import { TextField, Checkbox } from '@/components/ui/Form';
import { useToast } from '@/components/ui/Feedback';
import { useAuth } from '@/context/AuthContext';
import { api, errorMessage } from '@/lib/api';
import { allowedTransitions, REFUSAL_REASONS, CANCELLATION_REASONS } from '@shared/orderStatus';
import { P } from '@shared/permissions';
import { REFUSAL_LABELS, STATUS_ACTIONS } from '@/components/domain/labels';
import { formatMoney } from '@/utils/format';
import { useDash } from './DashboardContext';

const NEXT = { new: 'accepted', accepted: 'preparing', preparing: 'ready', ready: 'completed' };
const ICONS = { accepted: ThumbsUp, preparing: ChefHat, ready: PackageCheck, completed: CheckCircle2 };

function ReasonDialog({ open, onClose, kind, onConfirm, busy }) {
  const { t } = useDash();
  const reasons = kind === 'refused' ? REFUSAL_REASONS : CANCELLATION_REASONS;
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const needsNote = reason === 'other';
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={t(kind === 'refused' ? 'Refuse order' : 'Cancel order')}
      subtitle={t(kind === 'refused' ? 'The customer is notified. Reserved stock is released.' : 'Reserved stock is released if cooking has not started.')}
      size="sm"
      footer={(
        <div className="flex gap-2">
          <Button variant="secondary" onClick={onClose} className="flex-1">{t('Back')}</Button>
          <Button variant="danger" className="flex-1" loading={busy} disabled={!reason || (needsNote && !note.trim())} onClick={() => onConfirm(reason, note.trim() || undefined)}>
            {t(kind === 'refused' ? 'Refuse order' : 'Cancel order')}
          </Button>
        </div>
      )}
    >
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-semibold text-olive">{t('Reason')} <span className="text-clay">*</span></legend>
        {reasons.map((r) => (
          <label key={r} className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3 ${reason === r ? 'border-moss bg-moss/8' : 'border-sage/25 bg-white/70'}`}>
            <input type="radio" name="reason" value={r} checked={reason === r} onChange={() => setReason(r)} className="h-5 w-5 accent-moss" />
            <span className="text-sm font-medium">{t(REFUSAL_LABELS[r])}</span>
          </label>
        ))}
      </fieldset>
      <TextField as="textarea" className="mt-3" label={needsNote ? `${t('Details')} *` : t('Internal note (optional)')} value={note} onChange={(e) => setNote(e.target.value)} rows={2} maxLength={500} />
    </Modal>
  );
}

/**
 * Next-step buttons for an order, mirroring the server's state machine.
 * @param {{ order: object, onChange: (order) => void, compact?: boolean }} props
 */
export default function OrderActions({ order, onChange, compact = false }) {
  const { t } = useDash();
  const { can } = useAuth();
  const toast = useToast();
  const [busy, setBusy] = useState(null);
  const [dialog, setDialog] = useState(null);
  const [collectCash, setCollectCash] = useState(true);

  const allowed = allowedTransitions(order.status);
  const next = NEXT[order.status];
  const canManage = can(P.ORDERS_MANAGE);
  const canCancel = can(P.ORDERS_CANCEL) || (order.status === 'new' && canManage);
  const cashDue = order.paymentMethod === 'cash' && order.paymentStatus === 'pending';

  const run = async (to, extra = {}) => {
    setBusy(to);
    try {
      const r = await api.post(`/api/orders/${order.id}/transition`, { to, ...extra });
      onChange?.(r.order);
      setDialog(null);
      toast(`${order.number} → ${t(STATUS_ACTIONS[to] ?? to)}`);
    } catch (err) {
      toast(errorMessage(err, t), 'danger');
    } finally {
      setBusy(null);
    }
  };

  if (!allowed.length) return null;
  const NextIcon = ICONS[next];

  return (
    <div className="flex flex-col gap-2">
      {next === 'completed' && cashDue && can(P.PAYMENTS_COLLECT) && !compact && (
        <Checkbox checked={collectCash} onChange={setCollectCash} label={t('Cash collected: {amount}', { amount: formatMoney(order.totalMillimes) })} />
      )}
      <div className="flex flex-wrap gap-2">
        {next && canManage && (
          <Button size={compact ? 'md' : 'lg'} className="flex-1" loading={busy === next} onClick={() => run(next, next === 'completed' && cashDue ? { collectCash } : {})}>
            {NextIcon && <NextIcon className="h-5 w-5" />} {t(STATUS_ACTIONS[next])}
          </Button>
        )}
        {allowed.includes('refused') && canManage && (
          <Button size={compact ? 'md' : 'lg'} variant="dangerOutline" onClick={() => setDialog('refused')} aria-label={t('Refuse')}>
            <Ban className="h-5 w-5" /> {!compact && t('Refuse')}
          </Button>
        )}
        {allowed.includes('cancelled') && canCancel && !compact && (
          <Button size="lg" variant="ghost" onClick={() => setDialog('cancelled')}>
            <XCircle className="h-5 w-5" /> {t('Cancel order')}
          </Button>
        )}
      </div>
      <ReasonDialog
        key={dialog}
        open={Boolean(dialog)}
        kind={dialog}
        busy={Boolean(busy)}
        onClose={() => setDialog(null)}
        onConfirm={(reason, note) => run(dialog, { reason, note })}
      />
    </div>
  );
}
