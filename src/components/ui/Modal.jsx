import { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { X } from 'lucide-react';
import { cn } from '@/utils/cn';

const spring = { type: 'spring', stiffness: 380, damping: 36 };

/**
 * Dialog: bottom sheet on phones, centred card on larger screens.
 * `side="right"` renders a full-height side panel (order details, editors) on desktop.
 */
export default function Modal({ open, onClose, title, subtitle, children, footer, size = 'md', side = 'center', dir }) {
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') onClose?.(); };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open, onClose]);

  const widths = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl', xl: 'sm:max-w-4xl' };
  const isSide = side === 'right';

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-[400]" dir={dir}>
          <motion.div
            className="absolute inset-0 bg-forest/45 backdrop-blur-[2px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <div className={cn('pointer-events-none absolute inset-0 flex items-end', isSide ? 'sm:items-stretch sm:justify-end' : 'sm:items-center sm:justify-center sm:p-6')}>
            <motion.div
              role="dialog"
              aria-modal="true"
              aria-label={typeof title === 'string' ? title : undefined}
              initial={isSide ? { x: '100%', opacity: 0.6 } : { y: 60, opacity: 0, scale: 0.98 }}
              animate={isSide ? { x: 0, opacity: 1 } : { y: 0, opacity: 1, scale: 1 }}
              exit={isSide ? { x: '100%', opacity: 0.6 } : { y: 60, opacity: 0, scale: 0.98 }}
              transition={spring}
              className={cn(
                'pointer-events-auto flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-cream shadow-2xl',
                isSide ? 'sm:h-full sm:max-h-none sm:max-w-xl sm:rounded-none sm:rounded-s-3xl' : `sm:rounded-3xl ${widths[size]}`,
              )}
            >
              <div className="flex items-start justify-between gap-4 border-b border-sage/20 px-5 pb-3 pt-4 sm:px-6">
                <div className="min-w-0">
                  <div className="mx-auto mb-2 h-1 w-10 rounded-full bg-stone/30 sm:hidden" />
                  {title && <h2 className="font-serif text-2xl font-bold leading-tight text-forest">{title}</h2>}
                  {subtitle && <p className="mt-0.5 text-sm text-stone">{subtitle}</p>}
                </div>
                <button type="button" onClick={onClose} className="-me-2 flex h-11 w-11 shrink-0 cursor-pointer items-center justify-center rounded-full text-olive hover:bg-moss/8" aria-label="Close">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-6">{children}</div>
              {footer && <div className="border-t border-sage/20 bg-linen/60 px-5 py-3 sm:px-6" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>{footer}</div>}
            </motion.div>
          </div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
