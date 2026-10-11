/** UI formatting helpers (thin wrappers around the shared business helpers). */
export { formatMoney } from '@shared/money';
export { formatNutrient, nutrientUnit, NUTRIENTS } from '@shared/nutrition';
export { formatQuantity, costPerPricingUnit, PRICING_UNIT } from '@shared/units';
export { formatPhone } from '@shared/phone';

const LOCALES = { fr: 'fr-FR', en: 'en-GB', ar: 'ar-TN' };

export function formatDateTime(iso, lang = 'fr', opts = { dateStyle: 'medium', timeStyle: 'short' }) {
  if (!iso) return '—';
  try { return new Intl.DateTimeFormat(LOCALES[lang] ?? 'fr-FR', opts).format(new Date(iso)); } catch { return iso; }
}

export function formatDate(iso, lang = 'fr') {
  return formatDateTime(iso, lang, { dateStyle: 'medium' });
}

export function formatTime(iso, lang = 'fr') {
  return formatDateTime(iso, lang, { timeStyle: 'short' });
}

/** "3 min", "1 h 20" — elapsed since an ISO time. */
export function elapsed(iso, now = Date.now()) {
  const mins = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60000));
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 48) return `${h} h ${String(mins % 60).padStart(2, '0')}`;
  return `${Math.floor(h / 24)} j`;
}

/** YYYY-MM-DD for today (local time) shifted by `days`. */
export function isoDay(days = 0) {
  const d = new Date(Date.now() + days * 86400000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function pct(value, digits = 0) {
  return value == null || Number.isNaN(value) ? '—' : `${value.toFixed(digits)} %`;
}
