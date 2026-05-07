import type { MonthlyTimeSeriesPoint } from './types';

/**
 * Deflate nominal portfolio values to real values using CPI data.
 * CPI is expected as a Map<date, cpiValue>.
 * realValue_t = nominalValue_t × (cpi_base / cpi_t)
 * where cpi_base is the CPI at the start date.
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
    // No CPI data available — return with real = nominal
    return timeSeries.map((p) => ({
      ...p,
      portfolioValueReal: p.portfolioValue,
      monthlyReturnReal: p.monthlyReturn,
    }));
  }

  return timeSeries.map((p) => {
    const cpi = cpiSeries.get(p.date);
    if (!cpi || cpi <= 0) {
      return {
        ...p,
        portfolioValueReal: p.portfolioValue,
        monthlyReturnReal: p.monthlyReturn,
      };
    }

    const ratio = baseCpi / cpi;
    return {
      ...p,
      portfolioValueReal: p.portfolioValue * ratio,
      monthlyReturnReal: (1 + p.monthlyReturn) * ratio - 1,
    };
  });
}
