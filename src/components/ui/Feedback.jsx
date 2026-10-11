/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { AlertTriangle, CheckCircle2, Info, Loader2, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import Button from './Button';

export function Spinner({ className, label }) {
  return (
    <div className={cn('flex items-center justify-center gap-2 py-10 text-stone', className)} role="status">
      <Loader2 className="h-5 w-5 animate-spin" aria-hidden />
      {label && <span className="text-sm">{label}</span>}
    </div>
  );
}

export function Skeleton({ className }) {
  return (
    <motion.div
      className={cn('rounded-xl bg-sand', className)}
      animate={{ opacity: [0.55, 1, 0.55] }}
      transition={{ duration: 1.4, repeat: Infinity, ease: 'easeInOut' }}
    />
  );
}

export function EmptyState({ icon: Icon = Info, title, children, action }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-dashed border-sage/40 px-6 py-12 text-center">
      <Icon className="h-8 w-8 text-sage" aria-hidden />
      <p className="font-semibold text-forest">{title}</p>
      {children && <div className="max-w-md text-sm text-muted">{children}</div>}
      {action}
    </div>
  );
}

export function ErrorState({ error, onRetry, t }) {
  return (
    <div className="flex flex-col items-center gap-3 rounded-2xl border border-clay/25 bg-clay/5 px-6 py-8 text-center" role="alert">
      <AlertTriangle className="h-7 w-7 text-clay" aria-hidden />
      <p className="text-sm text-clay">{error?.message ?? String(error)}</p>
      {onRetry && <Button variant="secondary" size="sm" onClick={onRetry}>{t ? t('Try again') : 'Try again'}</Button>}
    </div>
  );
}

export function Alert({ tone = 'info', title, children, className }) {
  const tones = {
    info: 'border-sage/40 bg-mint/25 text-moss',
    warning: 'border-amber/40 bg-amber/10 text-[#7a5212]',
    danger: 'border-clay/40 bg-clay/8 text-clay',
    success: 'border-sage/50 bg-sage/15 text-moss',
  };
  const Icon = tone === 'success' ? CheckCircle2 : tone === 'info' ? Info : AlertTriangle;
  return (
    <div className={cn('flex gap-3 rounded-xl border px-4 py-3 text-sm', tones[tone], className)} role={tone === 'danger' ? 'alert' : 'status'}>
      <Icon className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
      <div>
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cn(title && 'mt-0.5', 'opacity-90')}>{children}</div>}
      </div>
    </div>
  );
}

// ─── Toasts ─────────────────────────────────────────────────────────────────

const ToastCtx = createContext(() => {});

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const dismiss = useCallback((id) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback((message, tone = 'success') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t.slice(-3), { id, message, tone }]);
    setTimeout(() => dismiss(id), tone === 'danger' ? 7000 : 3500);
  }, [dismiss]);
  const value = useMemo(() => push, [push]);
  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-4 z-[500] flex flex-col items-center gap-2 px-4" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
        <AnimatePresence>
          {toasts.map((toast) => (
            <motion.div
              key={toast.id}
              layout
              initial={{ opacity: 0, y: 24, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 12, scale: 0.95 }}
              transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              className={cn(
                'pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-2xl px-4 py-3 text-sm font-medium shadow-xl',
                toast.tone === 'danger' ? 'bg-clay text-white' : 'bg-forest text-linen',
              )}
              role="status"
            >
              {toast.tone === 'danger' ? <AlertTriangle className="h-4 w-4 shrink-0" /> : <CheckCircle2 className="h-4 w-4 shrink-0 text-sage" />}
              <span className="flex-1">{toast.message}</span>
              <button type="button" onClick={() => dismiss(toast.id)} className="cursor-pointer p-1 opacity-70 hover:opacity-100" aria-label="Close"><X className="h-4 w-4" /></button>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    </ToastCtx.Provider>
  );
}

export const useToast = () => useContext(ToastCtx);
