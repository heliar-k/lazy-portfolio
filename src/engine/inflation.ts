import type { MonthlyTimeSeriesPoint } from './types';

/**
 * Deflate nominal portfolio values to real values using CPI data.
 * CPI is expected as a Map<date, cpiValue>.
 * realValue_t = nominalValue_t × (cpi_base / cpi_t)
 * where cpi_base is the CPI at the start date.
 *
 * Missing CPI entries (e.g. months not yet published) are forward-filled
 * using the last known CPI value so that the final month always gets a
 * meaningful inflation adjustment instead of silently falling back to
 * nominal values (which would make inflation-adjusted CAGR = nominal CAGR).
 *
 * Real monthly returns are computed as adjacent real-value ratios, i.e.
 *   realReturn[t] = realValue[t] / realValue[t-1] - 1
 * rather than (1 + nominalReturn) × (baseCpi/cpi_t) - 1 which is incorrect.
 */
export function adjustForInflation(
  timeSeries: MonthlyTimeSeriesPoint[],
  cpiSeries: Map<string, number>,
): MonthlyTimeSeriesPoint[] {
  if (timeSeries.length === 0) {
    return [];
  }

  const baseCpi = cpiSeries.get(timeSeries[0].date);
  if (!baseCpi || baseCpi <= 0) {
    // No CPI data at the start date — return with real = nominal.
    return timeSeries.map((p) => ({
      ...p,
      portfolioValueReal: p.portfolioValue,
      monthlyReturnReal: p.monthlyReturn,
    }));
  }

  // First pass: compute real portfolio values.
  // Forward-fill the last known CPI for months not yet in the dataset.
  let lastKnownCpi = baseCpi;
  const realValues: number[] = timeSeries.map((p) => {
    const cpi = cpiSeries.get(p.date);
    if (cpi && cpi > 0) lastKnownCpi = cpi;
    return p.portfolioValue * (baseCpi / lastKnownCpi);
  });

  // Second pass: compute real monthly returns from adjacent real values.
  return timeSeries.map((p, i) => ({
    ...p,
    portfolioValueReal: realValues[i],
    // Month 0: real value = nominal value (ratio = 1), so real return = nominal return.
    monthlyReturnReal: i === 0 ? p.monthlyReturn : realValues[i] / realValues[i - 1] - 1,
  }));
}
