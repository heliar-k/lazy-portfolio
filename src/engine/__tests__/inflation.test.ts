import { describe, it, expect } from 'vitest';
import { adjustForInflation } from '../inflation';
import type { MonthlyTimeSeriesPoint } from '../types';

function makePoint(date: string, value: number, ret: number): MonthlyTimeSeriesPoint {
  return {
    date,
    portfolioValue: value,
    portfolioValueReal: value,
    monthlyReturn: ret,
    monthlyReturnReal: ret,
    drawdown: 0,
    cumulativeReturn: 0,
    cashflowImpact: 0,
    cashflowRequested: 0,
  };
}

describe('adjustForInflation', () => {
  it('deflates nominal values using CPI ratio', () => {
    const series: MonthlyTimeSeriesPoint[] = [
      makePoint('2020-01-31', 10000, 0),
      makePoint('2020-02-29', 10100, 0.01),
    ];

    // CPI: Jan = 250, Feb = 255 (2% inflation)
    const cpi = new Map<string, number>();
    cpi.set('2020-01-31', 250);
    cpi.set('2020-02-29', 255);

    const result = adjustForInflation(series, cpi);

    // Jan: base period, real = nominal = 10000
    expect(result[0].portfolioValueReal).toBeCloseTo(10000);

    // Feb: real = 10100 * (250/255) ≈ 9901.96
    expect(result[1].portfolioValueReal).toBeCloseTo(9901.96, 0);
    // Real return = (1 + 0.01) * (250/255) - 1 ≈ -0.0098
    expect(result[1].monthlyReturnReal).toBeCloseTo(-0.0098, 3);
  });

  it('returns nominal values when no CPI data available', () => {
    const series: MonthlyTimeSeriesPoint[] = [
      makePoint('2020-01-31', 10000, 0),
    ];

    const result = adjustForInflation(series, new Map());

    expect(result[0].portfolioValueReal).toBe(10000);
    expect(result[0].monthlyReturnReal).toBe(0);
  });

  it('handles missing CPI for individual dates (falls back to nominal)', () => {
    const series: MonthlyTimeSeriesPoint[] = [
      makePoint('2020-01-31', 10000, 0),
      makePoint('2020-02-29', 10100, 0.01),
    ];

    const cpi = new Map<string, number>();
    cpi.set('2020-01-31', 250);
    // No CPI for Feb

    const result = adjustForInflation(series, cpi);

    expect(result[0].portfolioValueReal).toBe(10000);
    // Feb uses nominal as fallback
    expect(result[1].portfolioValueReal).toBe(10100);
  });

  it('returns empty array for empty input', () => {
    expect(adjustForInflation([], new Map())).toEqual([]);
  });

  it('deflates consistently over multiple periods', () => {
    const series: MonthlyTimeSeriesPoint[] = [
      makePoint('2020-01-31', 10000, 0),
      makePoint('2020-02-29', 10200, 0.02),
      makePoint('2020-03-31', 10302, 0.01),
    ];

    const cpi = new Map<string, number>();
    cpi.set('2020-01-31', 100);
    cpi.set('2020-02-29', 101);
    cpi.set('2020-03-31', 103);

    const result = adjustForInflation(series, cpi);

    // Mar real = 10302 * (100/103) ≈ 10001.94
    expect(result[2].portfolioValueReal).toBeCloseTo(10001.94, 0);
  });
});
