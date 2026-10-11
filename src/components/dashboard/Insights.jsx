import { Lightbulb, TrendingDown, TrendingUp, AlertTriangle } from 'lucide-react';
import { Card } from '@/components/ui/Data';
import { Segmented } from '@/components/ui/Form';
import { formatMoney } from '@/utils/format';
import { msg } from '@/components/domain/labels';
import { useDash } from './DashboardContext';

const TEMPLATES = {
  meal_sales_up: msg('{meal}: sales up {changePct}% vs last week ({lastWeek} → {thisWeek} portions)'),
  meal_sales_down: msg('{meal}: sales down {changePct}% vs last week ({lastWeek} → {thisWeek} portions)'),
  high_sales_low_margin: msg('{meal} sells well ({units} portions in 30 days) but its estimated margin is only {marginPct}%'),
  meal_often_cancelled: msg('{meal} was refused or cancelled {cancelled} times in 30 days ({ratePct}% of demand)'),
  top_city: msg('{city} generates the most orders: {orders} in 30 days ({sharePct}% of orders)'),
  peak_hours: msg('Orders peak between {from} and {to} ({sharePct}% of orders)'),
  expensive_ingredient: msg('{ingredient} accounts for {sharePct}% of ingredient cost ({cost} in 30 days)'),
  high_waste: msg('{ingredient}: {ratePct}% of usage is wasted ({cost} lost in 30 days)'),
};

export function InsightsList({ items }) {
  const { t } = useDash();
  return (
    <Card className="p-4">
      <h3 className="flex items-center gap-2 font-semibold"><Lightbulb className="h-4 w-4 text-sage" /> {t('Insights')}</h3>
      <p className="text-xs text-stone">{t('Rule-based observations from your own data. Shown only when there is enough history.')}</p>
      {!items?.length ? <p className="mt-3 text-sm text-muted">{t('Not enough data yet — insights appear as orders accumulate.')}</p> : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((ins, i) => {
            const Icon = ins.type === 'meal_sales_up' ? TrendingUp : ins.type === 'meal_sales_down' ? TrendingDown : ins.severity === 'warning' ? AlertTriangle : Lightbulb;
            const params = { ...ins.params, changePct: Math.abs(ins.params.changePct ?? 0), cost: ins.params.costMillimes != null ? formatMoney(ins.params.costMillimes) : '' };
            return (
              <li key={i} className="flex gap-2.5 rounded-xl bg-linen/70 p-3 text-sm">
                <Icon className={`mt-0.5 h-4 w-4 shrink-0 ${ins.severity === 'warning' ? 'text-[#b7791f]' : 'text-moss'}`} aria-hidden />
                <span>{t(TEMPLATES[ins.type] ?? ins.type, params)}</span>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function PeriodPicker({ days, setDays }) {
  const { t } = useDash();
  return (
    <Segmented size="sm" value={days} onChange={setDays} options={[
      { value: 7, label: t('7 days') }, { value: 30, label: t('30 days') }, { value: 90, label: t('90 days') }, { value: 365, label: t('12 months') },
    ]} />
  );
}
