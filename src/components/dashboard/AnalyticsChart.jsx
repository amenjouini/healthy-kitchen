/**
 * Chart primitives (Recharts). Rules: one y-axis only; one colour for single-series
 * charts; legend only for ≥ 2 series; hover tooltips; a table view for every chart.
 * Palette validated with the dataviz validator (light surface): slot 1 #2f8a4f, slot 2 #4a3aa7.
 */
import { useState } from 'react';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Table2, BarChart3 } from 'lucide-react';
import { Card } from '@/components/ui/Data';
import { useDash } from './DashboardContext';

const SERIES = ['#2f8a4f', '#4a3aa7'];
const AXIS = { fontSize: 11, fill: '#8a9080' };
const GRID = '#e3e0d6';

function ChartTooltip({ active, payload, label, format, labelFormat }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-xl border border-sage/25 bg-white px-3 py-2 text-xs shadow-lg">
      <p className="mb-1 font-semibold text-forest">{labelFormat ? labelFormat(label) : label}</p>
      {payload.map((p) => (
        <p key={p.dataKey} className="flex items-center gap-2 text-olive">
          <span className="h-2 w-2 rounded-full" style={{ background: p.color }} aria-hidden />
          {p.name}: <b className="text-forest tabular-nums">{format ? format(p.value) : p.value}</b>
        </p>
      ))}
    </div>
  );
}

/** Card wrapper with title, optional legend and a chart ↔ table toggle. */
export function ChartCard({ title, subtitle, series, rows, columns, children, className }) {
  const { t } = useDash();
  const [table, setTable] = useState(false);
  return (
    <Card className={`p-4 ${className ?? ''}`}>
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{title}</h3>
          {subtitle && <p className="text-xs text-stone">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3">
          {series?.length > 1 && (
            <ul className="flex gap-3 text-xs text-olive">
              {series.map((s, i) => <li key={s.key} className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color ?? SERIES[i] }} />{s.label}</li>)}
            </ul>
          )}
          {rows && (
            <button type="button" onClick={() => setTable((v) => !v)} className="flex h-9 w-9 cursor-pointer items-center justify-center rounded-lg text-stone hover:bg-moss/8" aria-label={t(table ? 'Show chart' : 'Show table')}>
              {table ? <BarChart3 className="h-4 w-4" /> : <Table2 className="h-4 w-4" />}
            </button>
          )}
        </div>
      </div>
      {table ? (
        <div className="max-h-72 overflow-auto">
          <table className="w-full text-sm">
            <thead><tr className="text-xs uppercase text-stone">{columns.map((c) => <th key={c.key} className="py-1 text-start font-semibold">{c.header}</th>)}</tr></thead>
            <tbody>{rows.map((r, i) => <tr key={i} className="border-t border-sage/10">{columns.map((c) => <td key={c.key} className="py-1 tabular-nums">{c.render ? c.render(r) : r[c.key]}</td>)}</tr>)}</tbody>
          </table>
        </div>
      ) : children}
    </Card>
  );
}

/** Time series (1–2 series sharing ONE axis — same unit only). */
export function TimeSeriesChart({ data, xKey, series, format, labelFormat, height = 240 }) {
  return (
    <ResponsiveContainer width="100%" height={height}>
      <AreaChart data={data} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
        <CartesianGrid stroke={GRID} vertical={false} />
        <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} minTickGap={24} tickFormatter={labelFormat} />
        <YAxis tick={AXIS} tickLine={false} axisLine={false} width={48} tickFormatter={format} />
        <Tooltip content={<ChartTooltip format={format} labelFormat={labelFormat} />} cursor={{ stroke: '#8a9080', strokeDasharray: '3 3' }} />
        {series.map((s, i) => (
          <Area key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color ?? SERIES[i]} strokeWidth={2}
            fill={s.color ?? SERIES[i]} fillOpacity={series.length > 1 ? 0.06 : 0.12} dot={false} activeDot={{ r: 4, strokeWidth: 2, stroke: '#fff' }} />
        ))}
      </AreaChart>
    </ResponsiveContainer>
  );
}

/** Single-series bars, one colour (bar length already encodes magnitude). */
export function BarsChart({ data, xKey, valueKey, label, format, labelFormat, height = 220, layout = 'vertical-bars' }) {
  const horizontal = layout === 'horizontal';
  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={data} layout={horizontal ? 'vertical' : 'horizontal'} margin={{ top: 6, right: 8, bottom: 0, left: horizontal ? 8 : 0 }} barCategoryGap={2}>
        <CartesianGrid stroke={GRID} vertical={horizontal} horizontal={!horizontal} />
        {horizontal ? (
          <>
            <XAxis type="number" tick={AXIS} tickLine={false} axisLine={false} tickFormatter={format} />
            <YAxis type="category" dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} width={96} tickFormatter={labelFormat} />
          </>
        ) : (
          <>
            <XAxis dataKey={xKey} tick={AXIS} tickLine={false} axisLine={false} tickFormatter={labelFormat} interval="preserveStartEnd" />
            <YAxis tick={AXIS} tickLine={false} axisLine={false} width={40} tickFormatter={format} allowDecimals={false} />
          </>
        )}
        <Tooltip content={<ChartTooltip format={format} labelFormat={labelFormat} />} cursor={{ fill: 'rgba(140,184,140,0.15)' }} />
        <Bar dataKey={valueKey} name={label} fill={SERIES[0]} radius={horizontal ? [0, 4, 4, 0] : [4, 4, 0, 0]} maxBarSize={36} />
      </BarChart>
    </ResponsiveContainer>
  );
}
