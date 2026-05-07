/**
 * Date utility functions for the app.
 */

/**
 * Format a date string (YYYY-MM-DD) for display according to locale.
 */
export function formatDate(
  dateStr: string,
  locale = 'en',
  options?: Intl.DateTimeFormatOptions,
): string {
  const date = parseDate(dateStr);
  if (!date) return dateStr;

  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
    ...options,
  });
}

/**
 * Format a year-month string (YYYY-MM) for display.
 */
export function formatYearMonth(
  yearMonth: string,
  locale = 'en',
): string {
  const [y, m] = yearMonth.split('-').map(Number);
  if (!y || !m) return yearMonth;

  const date = new Date(y, m - 1, 1);
  return date.toLocaleDateString(locale, {
    year: 'numeric',
    month: 'short',
  });
}

/**
 * Parse a YYYY-MM-DD date string into a Date object (local time).
 */
function parseDate(dateStr: string): Date | null {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return null;
  return new Date(y, m - 1, d);
}

/**
 * Get today's date as YYYY-MM string.
 */
export function todayYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

/**
 * Get a date N years ago as YYYY-MM string.
 */
export function yearsAgo(n: number): string {
  const now = new Date();
  return `${now.getFullYear() - n}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}
