import type { MonthlyPricePoint, MonthlyReturnPoint } from './types';

/**
 * Compute monthly total returns from end-of-month price series.
 * return_t = (price_t - price_{t-1}) / price_{t-1}
 */
export function computeMonthlyReturns(
  pricePoints: MonthlyPricePoint[],
): MonthlyReturnPoint[] {
  if (pricePoints.length < 2) {
    return [];
  }

  const sorted = [...pricePoints].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  const results: MonthlyReturnPoint[] = [];
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1];
    const curr = sorted[i];
    const totalReturn = (curr.price - prev.price) / prev.price;
    results.push({
      date: curr.date,
      totalReturn,
    });
  }

  return results;
}

/**
 * Align return series to a common monthly grid, filling gaps.
 * Forward-fill up to 3 months; longer gaps produce NaN.
 */
export function alignReturnsToGrid(
  returns: MonthlyReturnPoint[],
  months: string[],
): (number | null)[] {
  if (returns.length === 0) {
    return months.map(() => null);
  }

  const sorted = [...returns].sort(
    (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
  );

  // Build a lookup from date string to index
  const retByDate = new Map<string, MonthlyReturnPoint>();
  for (const r of sorted) {
    retByDate.set(r.date, r);
  }

  const result: (number | null)[] = [];
  let lastKnownIdx = -1;
  let lastKnownReturn = 0;

  for (let i = 0; i < months.length; i++) {
    const m = months[i];
    const point = retByDate.get(m);

    if (point) {
      result.push(point.totalReturn);
      lastKnownIdx = i;
      lastKnownReturn = point.totalReturn;
    } else if (i === 0) {
      // No data yet — leave as null
      result.push(null);
    } else if (lastKnownIdx >= 0 && i - lastKnownIdx <= 3) {
      // Within fill window: forward-fill
      result.push(lastKnownReturn);
    } else {
      // Gap too long or no prior data
      result.push(null);
    }
  }

  return result;
}
