import { describe, it, expect } from 'vitest';
import { computeMetrics, computeAnnualReturns } from '../metrics';
import type { MonthlyTimeSeriesPoint } from '../types';

function makeSeries(
  values: number[],
  returns: number[],
  initialCapital: number,
  startYear = 2020,
  startMonth = 0, // 0 = January
): MonthlyTimeSeriesPoint[] {
  const series: MonthlyTimeSeriesPoint[] = [];
  let peak = -Infinity;

  for (let i = 0; i < values.length; i++) {
    const val = values[i];
    if (val > peak) peak = val;
    const dd = peak > 0 ? (val - peak) / peak : 0;

    const d = new Date(startYear, startMonth + i + 1, 0); // last day of month

    series.push({
      date: d.toISOString().slice(0, 10),
      portfolioValue: val,
      portfolioValueReal: val,
      monthlyReturn: returns[i] ?? 0,
      monthlyReturnReal: returns[i] ?? 0,
      drawdown: dd,
      cumulativeReturn: initialCapital > 0 ? (val / initialCapital) - 1 : 0,
      cashflowImpact: 0,
    });
  }

  return series;
}

describe('computeMetrics — CAGR', () => {
  it('computes CAGR for 10% annual growth over 5 years', () => {
    // $10,000 growing at 10%/year for 5 years = $16,105.10
    // Monthly: (1.10)^(1/12) - 1 ≈ 0.007974
    const monthlyRet = Math.pow(1.10, 1 / 12) - 1;
    const values: number[] = [];
    const returns: number[] = [];
    let val = 10000;

    for (let i = 1; i <= 60; i++) {
      val = val * (1 + monthlyRet);
      values.push(val);
      returns.push(monthlyRet);
    }

    const series = makeSeries(values, returns, 10000);
    const metrics = computeMetrics(series, 10000);

    expect(metrics.cagr).toBeCloseTo(0.10, 3);
    expect(metrics.totalReturn).toBeCloseTo(Math.pow(1.10, 5) - 1, 3);
  });

  it('returns 0 for flat portfolio', () => {
    const values = [10000, 10000, 10000];
    const returns = [0, 0, 0];
    const series = makeSeries(values, returns, 10000);

    const metrics = computeMetrics(series, 10000);

    expect(metrics.cagr).toBe(0);
    expect(metrics.totalReturn).toBe(0);
  });
});

describe('computeMetrics — max drawdown', () => {
  it('finds classic peak-to-trough drawdown', () => {
    // Peak at $120, then drops to $90, recovers to $110
    const values = [100, 110, 120, 105, 90, 95, 110];
    const returns = [0, 0.10, 0.0909, -0.125, -0.1429, 0.0556, 0.1579];
    const series = makeSeries(values, returns, 100);

    const metrics = computeMetrics(series, 100);

    // Max DD = (90 - 120) / 120 = -0.25
    expect(metrics.maxDrawdown).toBeCloseTo(-0.25, 3);
  });

  it('returns 0 for monotonically increasing portfolio', () => {
    const values = [101, 102, 103, 104];
    const returns = [0.01, 0.0099, 0.0098, 0.0097];
    const series = makeSeries(values, returns, 100);

    const metrics = computeMetrics(series, 100);

    expect(metrics.maxDrawdown).toBe(0);
  });
});

describe('computeMetrics — Sharpe ratio', () => {
  it('computes positive Sharpe for positive excess returns', () => {
    // 12 months of 1% return with no volatility
    const values: number[] = [];
    const returns: number[] = [];
    let val = 10000;
    for (let i = 1; i <= 12; i++) {
      val = val * 1.01;
      values.push(val);
      returns.push(0.01);
    }

    const series = makeSeries(values, returns, 10000);
    const metrics = computeMetrics(series, 10000);
    expect(metrics.sharpeRatio).toBeCloseTo(0);
  });

  it('returns 0 Sharpe when all returns are identical', () => {
    const values = [101, 102.01];
    const returns = [0.01, 0.01];
    const series = makeSeries(values, returns, 100);

    const metrics = computeMetrics(series, 100);
    expect(metrics.sharpeRatio).toBe(0);
  });
});

describe('computeMetrics — monthly stats', () => {
  it('counts positive and negative months correctly', () => {
    // 3 positive, 1 negative, 1 zero (zero counts as not positive)
    const values = [102, 104.04, 98.84, 100, 100];
    const returns = [0.02, 0.02, -0.05, 0.0117, 0];
    const series = makeSeries(values, returns, 100);

    const metrics = computeMetrics(series, 100);

    // Effective returns: [0.02, 0.02, -0.05, 0.0117, 0] → 3 positive out of 5
    expect(metrics.positiveMonthsPct).toBeCloseTo(3 / 5);
    expect(metrics.negativeMonthsPct).toBeCloseTo(1 / 5);
  });
});

describe('computeAnnualReturns', () => {
  it('computes annual returns from monthly data', () => {
    // 12 months: Jan-Dec 2020
    // Returns 1-3 (Jan-Mar 2020): 1%, returns 4-12 (Apr-Dec 2020): 0.5%
    const values: number[] = [];
    const returns: number[] = [];
    let val = 100;

    for (let m = 1; m <= 12; m++) {
      const r = m <= 3 ? 0.01 : 0.005;
      val = val * (1 + r);
      values.push(val);
      returns.push(r);
    }

    const series = makeSeries(values, returns, 100, 2020, 0);
    const annual = computeAnnualReturns(series);

    // 2020 has 12 returns (Jan-Dec)
    expect(annual).toHaveLength(1);
    expect(annual[0].year).toBe(2020);
    // 2020: Jan-Mar at 1% (3 months), Apr-Dec at 0.5% (9 months)
    // = (1.01)^3 * (1.005)^9 - 1
    const expected2020 = Math.pow(1.01, 3) * Math.pow(1.005, 9) - 1;
    expect(annual[0].return).toBeCloseTo(expected2020, 3);
  });

  it('handles multi-year series', () => {
    const values: number[] = [];
    const returns: number[] = [];
    let val = 100;

    // 24 months: Jan 2020 through Dec 2021
    // m=1-12: 1%/mo (Jan-Dec 2020), m=13-24: 2%/mo (Jan-Dec 2021)
    for (let m = 1; m <= 24; m++) {
      const r = m <= 12 ? 0.01 : 0.02;
      val = val * (1 + r);
      values.push(val);
      returns.push(r);
    }

    const series = makeSeries(values, returns, 100, 2020, 0);
    const annual = computeAnnualReturns(series);

    expect(annual).toHaveLength(2); // 2020, 2021
    expect(annual[0].year).toBe(2020);
    // 2020: Jan-Dec = 12 months at 1%
    expect(annual[0].return).toBeCloseTo(Math.pow(1.01, 12) - 1, 3);
    expect(annual[1].year).toBe(2021);
    // 2021: Jan-Dec = 12 months at 2%
    expect(annual[1].return).toBeCloseTo(Math.pow(1.02, 12) - 1, 3);
  });
});
