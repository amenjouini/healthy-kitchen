/**
 * Phone normalisation so the same person is matched across web checkout,
 * WhatsApp (which sends numbers as digits with country code, e.g. "21698123456")
 * and staff-entered orders.
 */

export const DEFAULT_COUNTRY_CODE = '216'; // Tunisia

/**
 * Normalise to E.164 without the "+" (digits only), e.g. "98 123 456" → "21698123456".
 * @returns {string|null} null when the input cannot be a phone number.
 */
export function normalizePhone(input, defaultCountryCode = DEFAULT_COUNTRY_CODE) {
  if (input == null) return null;
  let digits = String(input).replace(/[^\d+]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  else if (digits.startsWith('00')) digits = digits.slice(2);
  else if (digits.length === 8 && defaultCountryCode === '216') digits = defaultCountryCode + digits;
  digits = digits.replace(/\D/g, '');
  if (digits.length < 8 || digits.length > 15) return null;
  return digits;
}

export function formatPhone(normalized) {
  if (!normalized) return '';
  if (normalized.startsWith('216') && normalized.length === 11) {
    const n = normalized.slice(3);
    return `+216 ${n.slice(0, 2)} ${n.slice(2, 5)} ${n.slice(5)}`;
  }
  return `+${normalized}`;
}
