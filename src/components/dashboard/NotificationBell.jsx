import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { Bell, CheckCheck } from 'lucide-react';
import { useApi } from '@/hooks/useApi';
import { api } from '@/lib/api';
import { cn } from '@/utils/cn';
import { elapsed } from '@/utils/format';
import { useDash } from './DashboardContext';

const SEVERITY = { critical: 'bg-clay', warning: 'bg-amber', info: 'bg-sage' };

/** Polls notifications for the signed-in user (staff alerts are delivered by permission). */
export default function NotificationBell() {
  const { t, base } = useDash();
  const navigate = useNavigate();
  const { data, reload, setData } = useApi('/api/notifications?limit=30', { poll: 15000 });
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const unread = data?.unread ?? 0;

  useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!ref.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  const markAll = async () => {
    setData((d) => d && { ...d, unread: 0, items: d.items.map((n) => ({ ...n, read: true })) });
    await api.post('/api/notifications/read', {}).catch(() => {});
    reload();
  };

  const openItem = async (n) => {
    setOpen(false);
    if (!n.read) api.post('/api/notifications/read', { ids: [n.id] }).then(reload).catch(() => {});
    // Links are stored with the staff base; admins stay in their own area.
    if (n.link) navigate(n.link.replace(/^\/(staff|admin)/, base));
  };

  return (
    <div ref={ref} className="relative">
      <motion.button whileTap={{ scale: 0.9 }} type="button" onClick={() => setOpen((o) => !o)} className="relative flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl text-olive hover:bg-moss/8" aria-label={t('Notifications')} aria-expanded={open}>
        <Bell className="h-5 w-5" />
        <AnimatePresence>
          {unread > 0 && (
            <motion.span key={unread} initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} transition={{ type: 'spring', stiffness: 500, damping: 20 }}
              className="absolute end-1 top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-clay px-1 text-[11px] font-bold text-white">
              {unread > 99 ? '99+' : unread}
            </motion.span>
          )}
        </AnimatePresence>
      </motion.button>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -8, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -8, scale: 0.97 }}
            transition={{ type: 'spring', stiffness: 400, damping: 30 }}
            className="fixed inset-x-3 top-16 z-[300] max-h-[70dvh] overflow-hidden rounded-2xl border border-sage/20 bg-cream shadow-2xl sm:absolute sm:inset-x-auto sm:end-0 sm:top-12 sm:w-96"
          >
            <div className="flex items-center justify-between border-b border-sage/20 px-4 py-2">
              <p className="font-semibold">{t('Notifications')}</p>
              <button type="button" onClick={markAll} className="flex min-h-11 cursor-pointer items-center gap-1 text-xs font-semibold text-moss"><CheckCheck className="h-4 w-4" /> {t('Mark all read')}</button>
            </div>
            <ul className="max-h-[60dvh] overflow-y-auto">
              {(data?.items ?? []).length === 0 && <li className="px-4 py-8 text-center text-sm text-stone">{t('No notifications')}</li>}
              {(data?.items ?? []).map((n) => (
                <li key={n.id}>
                  <button type="button" onClick={() => openItem(n)} className={cn('flex w-full cursor-pointer gap-3 px-4 py-3 text-start hover:bg-mint/20', !n.read && 'bg-white/70')}>
                    <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : SEVERITY[n.severity])} />
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-forest">{n.title}</span>
                      {n.body && <span className="block truncate text-xs text-muted">{n.body}</span>}
                      <span className="block text-[11px] text-stone">{elapsed(n.createdAt)}</span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
