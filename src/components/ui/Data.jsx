import { motion } from 'framer-motion';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Input } from './Form';

export function Card({ className, children, as: Comp = 'div', ...props }) {
  return <Comp className={cn('rounded-2xl border border-sage/20 bg-white/75 shadow-[0_4px_20px_rgba(26,46,26,0.05)]', className)} {...props}>{children}</Comp>;
}

export function CardHeader({ title, subtitle, action, className }) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3 px-4 pt-4 sm:px-5', className)}>
      <div className="min-w-0">
        <h3 className="font-semibold text-forest">{title}</h3>
        {subtitle && <p className="mt-0.5 text-xs text-stone">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

export function PageHeader({ title, subtitle, actions, children }) {
  return (
    <div className="mb-5 flex flex-col gap-3 sm:mb-6 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        <h1 className="font-serif text-3xl font-bold leading-tight text-forest sm:text-4xl">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted">{subtitle}</p>}
        {children}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Badge({ tone = 'neutral', className, children }) {
  const tones = {
    neutral: 'bg-moss/8 text-olive',
    green: 'bg-sage/20 text-moss',
    dark: 'bg-forest text-linen',
    amber: 'bg-amber/15 text-[#7a5212]',
    red: 'bg-clay/12 text-clay',
    blue: 'bg-[#dbe7f3] text-[#2c4a6b]',
    purple: 'bg-[#e8e0f0] text-[#4f3b6b]',
  };
  return <span className={cn('inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold', tones[tone], className)}>{children}</span>;
}

/** KPI tile. */
export function Stat({ label, value, hint, tone, icon: Icon, className }) {
  return (
    <Card className={cn('p-4', className)}>
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-stone">{label}</p>
        {Icon && <Icon className="h-4 w-4 text-sage" aria-hidden />}
      </div>
      <p className={cn('mt-1.5 font-serif text-3xl font-bold leading-none', tone === 'red' ? 'text-clay' : tone === 'amber' ? 'text-[#7a5212]' : 'text-forest')}>{value}</p>
      {hint && <p className="mt-1.5 text-xs text-muted">{hint}</p>}
    </Card>
  );
}

export function SearchInput({ value, onChange, placeholder, className }) {
  return (
    <div className={cn('relative', className)}>
      <Search className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone" aria-hidden />
      <Input type="search" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className="ps-9" />
    </div>
  );
}

/**
 * Responsive data list: a real table from `md` up, stacked cards on phones.
 * columns: [{ key, header, render(row), className, mobile: false|'title'|'meta' }]
 */
export function DataTable({ columns, rows, onRowClick, rowKey = (r) => r.id, empty, className }) {
  if (!rows?.length) return empty ?? null;
  const titleCol = columns.find((c) => c.mobile === 'title') ?? columns[0];
  const mobileCols = columns.filter((c) => c !== titleCol && c.mobile !== false);
  return (
    <div className={className}>
      <div className="hidden overflow-x-auto rounded-2xl border border-sage/20 bg-white/75 md:block">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-sage/20 text-start text-xs uppercase tracking-wide text-stone">
              {columns.map((c) => <th key={c.key} className={cn('px-4 py-3 text-start font-semibold', c.className)}>{c.header}</th>)}
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn('border-b border-sage/10 last:border-0', onRowClick && 'cursor-pointer hover:bg-mint/15')}
              >
                {columns.map((c) => <td key={c.key} className={cn('px-4 py-3 align-middle', c.className)}>{c.render ? c.render(row) : row[c.key]}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <ul className="flex flex-col gap-2 md:hidden">
        {rows.map((row) => (
          <motion.li
            key={rowKey(row)}
            whileTap={onRowClick ? { scale: 0.985 } : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            className={cn('rounded-2xl border border-sage/20 bg-white/80 p-4', onRowClick && 'cursor-pointer')}
          >
            <div className="font-semibold text-forest">{titleCol.render ? titleCol.render(row) : row[titleCol.key]}</div>
            <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1.5 text-sm">
              {mobileCols.map((c) => (
                <div key={c.key} className="min-w-0">
                  <dt className="text-[11px] uppercase tracking-wide text-stone">{c.header}</dt>
                  <dd className="truncate text-forest">{c.render ? c.render(row) : row[c.key]}</dd>
                </div>
              ))}
            </dl>
          </motion.li>
        ))}
      </ul>
    </div>
  );
}

export function Pagination({ page, pageSize, total, onChange, t }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (pages <= 1) return null;
  return (
    <div className="mt-4 flex items-center justify-between gap-3 text-sm text-muted">
      <span>{t ? t('Page {page} of {pages}', { page, pages }) : `${page} / ${pages}`} · {total}</span>
      <div className="flex gap-2">
        <button type="button" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-sage/30 bg-white/70 disabled:opacity-40" disabled={page <= 1} onClick={() => onChange(page - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4 rtl:rotate-180" /></button>
        <button type="button" className="flex h-11 w-11 cursor-pointer items-center justify-center rounded-xl border border-sage/30 bg-white/70 disabled:opacity-40" disabled={page >= pages} onClick={() => onChange(page + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4 rtl:rotate-180" /></button>
      </div>
    </div>
  );
}

/** Simple horizontal bar (share of max) for in-table comparisons. */
export function Bar({ value, max, className }) {
  const w = max > 0 ? Math.max(2, (value / max) * 100) : 0;
  return (
    <div className={cn('h-2 w-full overflow-hidden rounded-full bg-sand', className)}>
      <motion.div className="h-full rounded-full bg-sage" initial={{ width: 0 }} animate={{ width: `${w}%` }} transition={{ type: 'spring', stiffness: 120, damping: 20 }} />
    </div>
  );
}
