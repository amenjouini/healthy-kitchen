import { forwardRef } from 'react';
import { motion } from 'framer-motion';
import { Loader2 } from 'lucide-react';
import { cn } from '@/utils/cn';

const VARIANTS = {
  primary: 'bg-forest text-linen hover:bg-moss',
  accent: 'bg-sage text-forest hover:bg-mint',
  secondary: 'bg-white/70 text-moss border border-moss/25 hover:bg-white',
  ghost: 'text-moss hover:bg-moss/8',
  danger: 'bg-clay text-white hover:bg-[#8a4334]',
  dangerOutline: 'border border-clay/40 text-clay hover:bg-clay/8',
};
const SIZES = {
  sm: 'min-h-9 px-3 text-sm gap-1.5',
  md: 'min-h-11 px-4 text-sm gap-2',
  lg: 'min-h-13 px-6 text-base gap-2',
  icon: 'h-11 w-11 justify-center',
};

const spring = { type: 'spring', stiffness: 500, damping: 30 };

/** Touch-friendly button (min 44 px tall) with spring press feedback. */
const Button = forwardRef(function Button({ variant = 'primary', size = 'md', loading = false, disabled, className, children, type = 'button', ...props }, ref) {
  return (
    <motion.button
      ref={ref}
      type={type}
      whileTap={disabled || loading ? undefined : { scale: 0.96 }}
      transition={spring}
      disabled={disabled || loading}
      className={cn(
        'inline-flex items-center justify-center rounded-xl font-semibold select-none cursor-pointer',
        'disabled:opacity-50 disabled:cursor-not-allowed',
        VARIANTS[variant], SIZES[size], className,
      )}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
      {children}
    </motion.button>
  );
});

export default Button;
