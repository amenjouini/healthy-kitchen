import { motion } from 'framer-motion';
import { Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { formatTime } from '@/utils/format';
import { msg } from './labels';

const STEP_LABELS = {
  received: msg('Order received'), accepted: msg('Order accepted'), preparing: msg('Preparing'), ready: msg('Ready'), completed: msg('Completed'),
};
const STEP_STATUS = { received: 'new', accepted: 'accepted', preparing: 'preparing', ready: 'ready', completed: 'completed' };

/** ✓ received  ✓ accepted  ● preparing  ○ ready  ○ completed */
export default function OrderTimeline({ timeline, reachedAt = {}, t, lang }) {
  return (
    <ol className="flex flex-col gap-0">
      {timeline.steps.map((step, i) => {
        const at = reachedAt[STEP_STATUS[step.key]];
        const last = i === timeline.steps.length - 1;
        return (
          <li key={step.key} className="flex gap-4">
            <div className="flex flex-col items-center">
              <motion.div
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 400, damping: 22, delay: i * 0.06 }}
                className={cn(
                  'relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full border-2',
                  step.state === 'done' && 'border-moss bg-moss text-linen',
                  step.state === 'current' && 'border-sage bg-sage/20',
                  step.state === 'upcoming' && 'border-stone/30 bg-white/60',
                )}
                aria-hidden
              >
                {step.state === 'done' && <Check className="h-4 w-4" />}
                {step.state === 'current' && (
                  <motion.span className="h-3 w-3 rounded-full bg-moss" animate={{ scale: [1, 1.35, 1] }} transition={{ duration: 1.4, repeat: Infinity }} />
                )}
              </motion.div>
              {!last && <div className={cn('my-1 w-0.5 flex-1 min-h-6', step.state === 'done' ? 'bg-moss' : 'bg-stone/20')} />}
            </div>
            <div className={cn('pb-6 pt-1.5', last && 'pb-0')}>
              <p className={cn('font-semibold', step.state === 'upcoming' ? 'text-stone' : 'text-forest')}>
                {t(STEP_LABELS[step.key])}
                <span className="sr-only"> — {t(step.state === 'done' ? 'done' : step.state === 'current' ? 'in progress' : 'upcoming')}</span>
              </p>
              {at && step.state !== 'upcoming' && <p className="text-xs text-stone">{formatTime(at, lang)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
