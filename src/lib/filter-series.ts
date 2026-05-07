/**
 * Filter a time series array to a date range.
 */
export function filterByDateRange<T extends { date: string }>(
  series: T[],
  startDate: string | null,
  endDate: string | null,
): T[] {
  if (!startDate && !endDate) return series;
  return series.filter((p) => {
    if (startDate && p.date < startDate) return false;
    if (endDate && p.date > endDate) return false;
    return true;
  });
}
