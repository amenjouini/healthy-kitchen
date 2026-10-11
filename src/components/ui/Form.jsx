import { forwardRef, useId } from 'react';
import { cn } from '@/utils/cn';

const control = 'w-full min-h-11 rounded-xl border border-sage/35 bg-white/80 px-3.5 text-[15px] text-forest placeholder:text-stone/70 focus:border-moss focus:outline-none focus:ring-2 focus:ring-sage/30 disabled:bg-sand/60 disabled:text-stone';

export function Field({ label, hint, error, children, className, required }) {
  const id = useId();
  return (
    <div className={cn('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[13px] font-semibold text-olive">
          {label}{required && <span className="text-clay"> *</span>}
        </label>
      )}
      {typeof children === 'function' ? children(id) : children}
      {error ? <p className="text-xs font-medium text-clay">{error}</p> : hint ? <p className="text-xs text-stone">{hint}</p> : null}
    </div>
  );
}

export const Input = forwardRef(function Input({ className, ...props }, ref) {
  return <input ref={ref} className={cn(control, className)} {...props} />;
});

export const Select = forwardRef(function Select({ className, children, ...props }, ref) {
  return (
    <select ref={ref} className={cn(control, 'cursor-pointer pr-8', className)} {...props}>
      {children}
    </select>
  );
});

export const Textarea = forwardRef(function Textarea({ className, rows = 3, ...props }, ref) {
  return <textarea ref={ref} rows={rows} className={cn(control, 'py-2.5 leading-relaxed', className)} {...props} />;
});

/** Labelled input in one line: <TextField label="Name" value=… onChange=… /> */
export function TextField({ label, hint, error, required, className, as = 'input', children, ...props }) {
  const Comp = as === 'select' ? Select : as === 'textarea' ? Textarea : Input;
  return (
    <Field label={label} hint={hint} error={error} required={required} className={className}>
      {(id) => <Comp id={id} required={required} aria-invalid={Boolean(error)} {...props}>{children}</Comp>}
    </Field>
  );
}

export function Checkbox({ label, checked, onChange, description, disabled }) {
  return (
    <label className={cn('flex min-h-11 cursor-pointer items-start gap-3 rounded-xl py-2', disabled && 'cursor-not-allowed opacity-60')}>
      <input type="checkbox" className="mt-0.5 h-5 w-5 shrink-0 cursor-pointer accent-moss" checked={checked} onChange={(e) => onChange(e.target.checked)} disabled={disabled} />
      <span>
        <span className="text-sm font-semibold text-forest">{label}</span>
        {description && <span className="block text-xs text-stone">{description}</span>}
      </span>
    </label>
  );
}

/** Segmented control for 2–5 options. */
export function Segmented({ value, onChange, options, className, size = 'md' }) {
  return (
    <div className={cn('inline-flex flex-wrap gap-1 rounded-xl bg-moss/8 p-1', className)} role="tablist">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="tab"
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cn(
            'rounded-lg px-3 font-semibold cursor-pointer',
            size === 'sm' ? 'min-h-8 text-xs' : 'min-h-10 text-sm',
            value === o.value ? 'bg-forest text-linen shadow-sm' : 'text-olive hover:bg-white/60',
          )}
        >
          {o.label}
          {o.count != null && <span className={cn('ms-1.5 rounded-full px-1.5 text-[11px]', value === o.value ? 'bg-white/20' : 'bg-moss/10')}>{o.count}</span>}
        </button>
      ))}
    </div>
  );
}
