/**
 * Money helpers. All amounts are stored and computed as INTEGER millimes
 * (Tunisian dinar has 3 decimals: 1 DT = 1000 millimes) to avoid float errors.
 */

export const CURRENCY = 'TND';
export const MILLIMES_PER_DINAR = 1000;

/** "18.5" | 18.5 → 18500. Rejects negatives, NaN and more than 3 decimals. */
export function parseMoney(input) {
  const str = typeof input === 'number' ? String(input) : String(input ?? '').trim().replace(',', '.');
  if (!/^\d+(\.\d{1,3})?$/.test(str)) throw new RangeError(`Invalid amount "${input}"`);
  const [whole, frac = ''] = str.split('.');
  return Number(whole) * MILLIMES_PER_DINAR + Number(frac.padEnd(3, '0'));
}

/** 18500 → 18.5 (number of dinars). */
export function toDinars(millimes) {
  return Math.round(millimes) / MILLIMES_PER_DINAR;
}

/**
 * Format millimes for display.
 * @param {number} millimes
 * @param {{ fixed?: boolean, symbol?: string }} [opts] fixed=true always shows 3 decimals (accounting views).
 */
export function formatMoney(millimes, { fixed = false, symbol = 'DT' } = {}) {
  const value = Math.round(millimes ?? 0);
  const negative = value < 0;
  const abs = Math.abs(value);
  const whole = Math.floor(abs / MILLIMES_PER_DINAR);
  const frac = String(abs % MILLIMES_PER_DINAR).padStart(3, '0');
  const fracShown = fixed ? frac : frac.replace(/0+$/, '');
  const wholeStr = whole.toLocaleString('en-US').replace(/,/g, ' ');
  const body = fracShown ? `${wholeStr}.${fracShown}` : wholeStr;
  return `${negative ? '−' : ''}${body}${symbol ? ` ${symbol}` : ''}`;
}
