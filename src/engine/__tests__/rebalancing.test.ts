import { describe, it, expect } from 'vitest';
import { computeEffectiveWeights } from '../rebalancing';
import type { PortfolioHolding } from '../types';

function makeHolding(
  symbol: string,
  targetWeight: number,
  currency = 'USD',
): PortfolioHolding {
  return {
    asset: {
      symbol,
      name: symbol,
      assetClass: 'us_large_cap',
      region: 'US',
      currency,
      provider: 'Test',
      expenseRatio: 0.0003,
      inceptionDate: '2000-01-01',
    },
    targetWeight,
  };
}

function makeMonths(n: number): string[] {
  const months: string[] = [];
  for (let i = 0; i < n; i++) {
    const d = new Date(2020, i, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    months.push(lastDay.toISOString().slice(0, 10));
  }
  return months;
}

describe('computeEffectiveWeights — calendar rebalancing', () => {
  it('rebalances monthly (every month after month 0)', () => {
    const holdings = [makeHolding('A', 0.6), makeHolding('B', 0.4)];
    const months = makeMonths(4);
    // Asset A returns +5% every month, Asset B returns 0%
    const returns = [
      [null, 0.05, 0.05, 0.05],
      [null, 0.00, 0.00, 0.00],
    ];

    const weights = computeEffectiveWeights(holdings, returns, { type: 'calendar', frequency: 'monthly' }, months);

    // Month 0: target weights
    expect(weights[0]).toEqual([0.6, 0.4]);
    // Every subsequent month: reset to target
    expect(weights[1]).toEqual([0.6, 0.4]);
    expect(weights[2]).toEqual([0.6, 0.4]);
  });

  it('rebalances quarterly (Mar, Jun, Sep, Dec)', () => {
    const holdings = [makeHolding('A', 0.5), makeHolding('B', 0.5)];
    // Jan 2020 - Jun 2020
    const months = makeMonths(6);
    // A grows 10% every month, B flat
    const returns: (number | null)[][] = [
      months.map(() => null),
      months.map(() => null),
    ];
    for (let m = 1; m < 6; m++) {
      returns[0][m] = 0.10;
      returns[1][m] = 0.00;
    }

    const weights = computeEffectiveWeights(holdings, returns, { type: 'calendar', frequency: 'quarterly' }, months);

    // Month 0 (Jan): target
    expect(weights[0]).toEqual([0.5, 0.5]);
    // Month 1 (Feb): drifted (no rebalance in Feb)
    expect(weights[1][0]).toBeGreaterThan(0.5);
    expect(weights[1][1]).toBeLessThan(0.5);
    // Month 2 (Mar = Q1 end): rebalanced
    expect(weights[2][0]).toBeCloseTo(0.5);
    expect(weights[2][1]).toBeCloseTo(0.5);
    // Month 3-4: drifted
    expect(weights[3][0]).toBeGreaterThan(0.5);
    // Month 5 (Jun = Q2 end): rebalanced
    expect(weights[5][0]).toBeCloseTo(0.5);
  });

  it('rebalances annually (December)', () => {
    const holdings = [makeHolding('A', 0.6), makeHolding('B', 0.4)];
    const months = makeMonths(13);

    const returns: (number | null)[][] = [
      months.map(() => null),
      months.map(() => null),
    ];
    for (let m = 1; m < 13; m++) {
      returns[0][m] = 0.05;
      returns[1][m] = 0.00;
    }

    const weights = computeEffectiveWeights(holdings, returns, { type: 'calendar', frequency: 'annual' }, months);

    // Month 0 (Jan): target
    expect(weights[0]).toEqual([0.6, 0.4]);
    // Month 11 (Dec): rebalanced
    expect(weights[11][0]).toBeCloseTo(0.6);
    expect(weights[11][1]).toBeCloseTo(0.4);
    // Month 12 (Jan 2021): drifted (no rebalance in Jan)
    expect(weights[12][0]).toBeGreaterThan(0.6);
  });
});

describe('computeEffectiveWeights — tolerance-band rebalancing', () => {
  it('rebalances when any asset exceeds threshold', () => {
    const holdings = [makeHolding('A', 0.6), makeHolding('B', 0.4)];
    const months = makeMonths(4);

    // A returns 30% in month 1 (deviation = |0.661 - 0.6| = 6.1% > 5% band)
    const returns: (number | null)[][] = [
      [null, 0.30, 0.01, 0.01],
      [null, 0.00, 0.00, 0.00],
    ];

    const weights = computeEffectiveWeights(
      holdings,
      returns,
      { type: 'tolerance_band', threshold: 0.05 },
      months,
    );

    // Month 0: target
    expect(weights[0]).toEqual([0.6, 0.4]);
    // Month 1: returns applied, weights drifted (check happens before month's returns)
    expect(weights[1][0]).toBeGreaterThan(0.6);
    // Month 2: threshold triggered at start of month → rebalanced
    expect(weights[2][0]).toBeCloseTo(0.6);
    // Month 3: minor drift, within band → not rebalanced
    expect(weights[3][0]).toBeGreaterThan(0.6);
  });

  it('does not rebalance when within band', () => {
    const holdings = [makeHolding('A', 0.6), makeHolding('B', 0.4)];
    const months = makeMonths(3);

    // A returns 1% per month (small drift)
    const returns: (number | null)[][] = [
      [null, 0.01, 0.01],
      [null, 0.00, 0.00],
    ];

    const weights = computeEffectiveWeights(
      holdings,
      returns,
      { type: 'tolerance_band', threshold: 0.05 },
      months,
    );

    // Month 1 & 2: drift is small, within 5% band — weights drift, not reset
    expect(weights[1][0]).toBeGreaterThan(0.6);
    expect(weights[2][0]).toBeGreaterThan(weights[1][0]);
  });
});
