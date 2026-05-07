/**
 * Number formatting using Intl.NumberFormat for locale-aware display.
 */

/**
 * Format a number as a percentage (e.g., 0.0744 → "7.44%").
 */
export function formatPct(
  value: number,
  locale = 'en',
  decimals = 2,
): string {
  return new Intl.NumberFormat(locale, {
    style: 'percent',
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a number as currency (e.g., 12345.67 → "$12,345.67").
 */
export function formatCurrency(
  value: number,
  currency = 'USD',
  locale = 'en',
): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Format a raw number with commas (e.g., 1234567 → "1,234,567").
 */
export function formatNumber(
  value: number,
  locale = 'en',
  decimals = 2,
): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value);
}

/**
 * Format a ratio as a signed percentage string with +/− prefix.
 */
export function formatSignedPct(
  value: number,
  locale = 'en',
  decimals = 2,
): string {
  const sign = value > 0 ? '+' : '';
  return sign + formatPct(value, locale, decimals);
}
