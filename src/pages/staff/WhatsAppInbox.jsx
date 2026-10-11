import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import { ArrowLeft, MessageCircle, Plus, Send } from 'lucide-react';
import { useDash } from '@/components/dashboard/DashboardContext';
import Button from '@/components/ui/Button';
import { Card, PageHeader, SearchInput } from '@/components/ui/Data';
import { Textarea } from '@/components/ui/Form';
import { Alert, EmptyState, Spinner, useToast } from '@/components/ui/Feedback';
import { OrderStatusBadge } from '@/components/domain/Badges';
import { useApi } from '@/hooks/useApi';
import { api, errorMessage, qs } from '@/lib/api';
import { elapsed, formatMoney, formatPhone, formatTime } from '@/utils/format';
import { cn } from '@/utils/cn';

function NotConnected({ t }) {
  return (
    <Alert tone="warning" title={t('WhatsApp is not connected yet')} className="mb-4">
      {t('Incoming messages and automatic order updates start once the WhatsApp Cloud API credentials are configured on the server (see README → WhatsApp). Until then you can still create WhatsApp orders manually.')}
    </Alert>
  );
}

function Thread({ id }) {
  const { t, base } = useDash();
  const toast = useToast();
  const navigate = useNavigate();
  const { data, loading, reload } = useApi(`/api/whatsapp/conversations/${id}`, { poll: 10000 });
  const [reply, setReply] = useState('');
  const [sending, setSending] = useState(false);
  const endRef = useRef(null);
  const count = data?.conversation.messages.length;
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }); }, [count]);

  if (loading) return <Spinner />;
  const c = data.conversation;
  const send = async () => {
    setSending(true);
    try {
      await api.post(`/api/whatsapp/conversations/${id}/reply`, { body: reply });
      setReply('');
      reload();
    } catch (err) { toast(errorMessage(err, t), 'danger'); } finally { setSending(false); }
  };
  const setStatus = async (status) => { await api.post(`/api/whatsapp/conversations/${id}/status`, { status }); reload(); };

  return (
    <div className="flex h-full min-h-[60dvh] flex-col">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-sage/20 pb-3">
        <div className="flex items-center gap-2">
          <Link to={`${base}/whatsapp`} className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-moss/8 lg:hidden" aria-label={t('Back')}><ArrowLeft className="h-5 w-5" /></Link>
          <div>
            <p className="font-semibold">{c.customer?.name ?? c.profileName ?? formatPhone(c.phone)}</p>
            <p className="text-xs text-stone">{formatPhone(c.phone)}{c.customer ? ` · ${t('Known customer')}` : ` · ${t('Not linked to a customer yet')}`}</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="ghost" onClick={() => setStatus(c.status === 'open' ? 'closed' : 'open')}>{t(c.status === 'open' ? 'Close' : 'Reopen')}</Button>
          <Button size="sm" onClick={() => navigate(`${base}/new-order?conversation=${c.id}`)}><Plus className="h-4 w-4" /> {t('Create order')}</Button>
        </div>
      </div>
      {c.orders.length > 0 && (
        <div className="flex gap-2 overflow-x-auto border-b border-sage/20 py-2">
          {c.orders.map((o) => (
            <Link key={o.id} to={`${base}/orders/${o.id}`} className="flex shrink-0 items-center gap-2 rounded-xl bg-white/70 px-3 py-1.5 text-xs">
              <b>{o.number}</b> <OrderStatusBadge status={o.status} t={t} /> {formatMoney(o.totalMillimes)}
            </Link>
          ))}
        </div>
      )}
      <ul className="flex flex-1 flex-col gap-2 overflow-y-auto py-3">
        {c.messages.map((m) => (
          <motion.li key={m.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
            className={cn('max-w-[85%] rounded-2xl px-3 py-2 text-sm shadow-sm', m.direction === 'in' ? 'self-start rounded-ss-sm bg-white' : 'self-end rounded-se-sm bg-mint/70')}>
            <p className="whitespace-pre-wrap break-words">{m.body}</p>
            <p className="mt-0.5 text-end text-[10px] text-stone">{m.sentBy ? `${m.sentBy} · ` : ''}{formatTime(m.createdAt)}{m.status && m.direction === 'out' ? ` · ${t(m.status)}` : ''}</p>
          </motion.li>
        ))}
        <li ref={endRef} />
      </ul>
      <div className="flex items-end gap-2 border-t border-sage/20 pt-3">
        <Textarea rows={2} value={reply} onChange={(e) => setReply(e.target.value)} placeholder={data.connected ? t('Write a reply…') : t('Replies need WhatsApp to be connected')} disabled={!data.connected} />
        <Button size="icon" aria-label={t('Send')} disabled={!data.connected || !reply.trim()} loading={sending} onClick={send}><Send className="h-4 w-4" /></Button>
      </div>
    </div>
  );
}

export default function WhatsAppInbox() {
  const { t, base } = useDash();
  const { id } = useParams();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('open');
  const { data, loading } = useApi(`/api/whatsapp/conversations${qs({ search, status })}`, { poll: 10000 });
  useEffect(() => { document.title = `WhatsApp · Healthy Kitchen`; }, []);

  const list = (
    <Card className="flex flex-col p-3">
      <SearchInput value={search} onChange={setSearch} placeholder={t('Name or phone')} />
      <div className="mt-2 flex gap-1 text-xs">
        {['open', 'closed'].map((s) => (
          <button key={s} type="button" onClick={() => setStatus(s)} className={cn('min-h-9 flex-1 cursor-pointer rounded-lg font-semibold', status === s ? 'bg-forest text-linen' : 'bg-white/70 text-olive')}>{t(s === 'open' ? 'Open' : 'Closed')}</button>
        ))}
      </div>
      {loading ? <Spinner /> : (data.items.length === 0 ? <EmptyState icon={MessageCircle} title={t('No conversations')} /> : (
        <ul className="mt-2 flex flex-col">
          {data.items.map((c) => (
            <li key={c.id}>
              <Link to={`${base}/whatsapp/${c.id}`} className={cn('flex min-h-16 items-center gap-3 rounded-xl px-2 py-2', String(c.id) === id ? 'bg-mint/40' : 'hover:bg-white/70')}>
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-sage/30 font-bold text-moss">{(c.customerName ?? c.profileName ?? '#').slice(0, 1).toUpperCase()}</span>
                <span className="min-w-0 flex-1">
                  <span className="flex justify-between gap-2"><b className="truncate text-sm">{c.customerName ?? c.profileName ?? formatPhone(c.phone)}</b><span className="shrink-0 text-[11px] text-stone">{c.lastMessageAt && elapsed(c.lastMessageAt)}</span></span>
                  <span className="flex justify-between gap-2"><span className="truncate text-xs text-muted">{c.lastMessage}</span>{c.unreadCount > 0 && <span className="rounded-full bg-moss px-1.5 text-[11px] font-bold text-linen">{c.unreadCount}</span>}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ))}
    </Card>
  );

  return (
    <div>
      <PageHeader title="WhatsApp" subtitle={t('Messages from customers, linked to their orders.')} />
      {data && !data.connected && <NotConnected t={t} />}
      <div className="grid gap-4 lg:grid-cols-[340px_1fr]">
        <div className={cn(id && 'hidden lg:block')}>{list}</div>
        <Card className={cn('p-4', !id && 'hidden lg:block')}>
          {id ? <Thread key={id} id={id} /> : <EmptyState icon={MessageCircle} title={t('Select a conversation')} />}
        </Card>
      </div>
    </div>
  );
}
