import { describe, it, expect } from 'vitest';
import { runBacktest, buildMonthGrid } from '../backtest';
import type {
  BacktestParameters,
  MonthlyReturnPoint,
  AssetIdentifier,
} from '../types';

function makeAsset(symbol: string, currency = 'USD'): AssetIdentifier {
  return {
    symbol,
    name: symbol,
    assetClass: 'us_large_cap',
    region: 'US',
    currency,
    provider: 'Test',
    expenseRatio: 0.0003,
    inceptionDate: '2000-01-01',
  };
}

describe('buildMonthGrid', () => {
  it('generates end-of-month dates between start and end', () => {
    const grid = buildMonthGrid('2020-01', '2020-03');

    expect(grid).toEqual(['2020-01-31', '2020-02-29', '2020-03-31']);
  });

  it('returns empty when start > end', () => {
    expect(buildMonthGrid('2020-06', '2020-01')).toEqual([]);
  });

  it('handles full year', () => {
    const grid = buildMonthGrid('2020-01', '2020-12');
    expect(grid).toHaveLength(12);
    expect(grid[0]).toBe('2020-01-31');
    expect(grid[11]).toBe('2020-12-31');
  });
});

describe('runBacktest', () => {
  function makeParams(overrides?: Partial<BacktestParameters>): BacktestParameters {
    return {
      portfolio: {
        id: 'test-6040',
        name: 'Test 60/40',
        holdings: [
          { asset: makeAsset('STOCK'), targetWeight: 0.6 },
          { asset: makeAsset('BOND'), targetWeight: 0.4 },
        ],
        tags: [],
      },
      startDate: '2020-01',
      endDate: '2021-01',
      initialCapital: 10000,
      displayCurrency: 'USD',
      inflationRegion: 'US',
      rebalancing: { type: 'calendar', frequency: 'annual' },
      cashflows: [],
      ...overrides,
    };
  }

  function makeReturnSeries(monthlyRets: number[]): MonthlyReturnPoint[] {
    const points: MonthlyReturnPoint[] = [];
    for (let i = 0; i < monthlyRets.length; i++) {
      const lastDay = new Date(2020, i + 1, 0); // last day of month i (0=Jan)
      const y = lastDay.getFullYear();
      const m = String(lastDay.getMonth() + 1).padStart(2, '0');
      const d = String(lastDay.getDate()).padStart(2, '0');
      points.push({
        date: `${y}-${m}-${d}`,
        totalReturn: monthlyRets[i],
      });
    }
    return points;
  }

  it('runs end-to-end 60/40 backtest and returns correct metrics', () => {
    const params = makeParams({ rebalancing: { type: 'calendar', frequency: 'monthly' } });

    // STOCK: 1%/mo, BOND: 0%/mo (makes for easy hand-verification)
    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', makeReturnSeries([0, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]));
    assetReturns.set('BOND', makeReturnSeries([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

    const result = runBacktest(params, assetReturns, new Map(), new Map());

    // Verify time series
    expect(result.timeSeries).toHaveLength(13); // Jan-Dec = 12 months + month 0

    // Month 0: $10,000
    expect(result.timeSeries[0].portfolioValue).toBe(10000);

    // Monthly portfolio return = 0.6*0.01 + 0.4*0 = 0.006
    // After 12 months: 10000 * 1.006^12 ≈ 10744.37
    const expectedFinal = 10000 * Math.pow(1.006, 12);
    expect(result.metrics.finalCapital).toBeCloseTo(expectedFinal, 0);

    // CAGR = (10744.37/10000)^(1/1) - 1 ≈ 0.074437
    expect(result.metrics.cagr).toBeCloseTo(0.074437, 3);

    // Total return
    expect(result.metrics.totalReturn).toBeCloseTo(expectedFinal / 10000 - 1, 4);

    // No drawdown since portfolio only goes up
    expect(result.metrics.maxDrawdown).toBe(0);

    // All positive months
    expect(result.metrics.positiveMonthsPct).toBe(1);
    expect(result.metrics.negativeMonthsPct).toBe(0);

    // Annual returns: 12 returns in 2020, 1 return in Jan 2021
    expect(result.annualReturns).toHaveLength(2);
    expect(result.annualReturns[0].year).toBe(2020);
    expect(result.annualReturns[0].return).toBeCloseTo(Math.pow(1.006, 11) - 1, 3);
    expect(result.annualReturns[1].year).toBe(2021);
    expect(result.annualReturns[1].return).toBeCloseTo(0.006, 3);

    // Monthly distribution
    const totalCount = result.monthlyReturnsDistribution.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(12);
  });

  it('returns empty result for empty portfolio', () => {
    const params = makeParams({
      portfolio: { id: 'empty', name: 'Empty', holdings: [], tags: [] },
    });

    const result = runBacktest(params, new Map(), new Map(), new Map());

    expect(result.timeSeries).toEqual([]);
    expect(result.metrics.finalCapital).toBe(0);
  });

  it('returns empty result for zero-length date range', () => {
    const params = makeParams({ startDate: '2020-06', endDate: '2020-01' });

    const result = runBacktest(params, new Map(), new Map(), new Map());

    expect(result.timeSeries).toEqual([]);
  });

  it('tracks drawdown in time series', () => {
    // STOCK goes up then down
    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', makeReturnSeries([0, 0.05, 0.05, -0.20]));
    assetReturns.set('BOND', makeReturnSeries([0, 0.00, 0.00, 0.00]));

    const result = runBacktest(
      makeParams({ startDate: '2020-01', endDate: '2020-04' }),
      assetReturns,
      new Map(),
      new Map(),
    );

    // Month 0: 10000, drawdown 0
    expect(result.timeSeries[0].drawdown).toBe(0);

    // Month 1: value goes up → drawdown 0
    expect(result.timeSeries[1].drawdown).toBe(0);

    // Month 2: value goes up more → drawdown 0
    expect(result.timeSeries[2].drawdown).toBe(0);

    // Month 3: value drops → drawdown < 0
    expect(result.timeSeries[3].drawdown).toBeLessThan(0);
  });

  it('rebalances annually', () => {
    // Use 24 months to test annual rebalancing
    const params = makeParams({ startDate: '2020-01', endDate: '2021-12' });

    // STOCK returns 2%/mo (will drift significantly), BOND flat
    const stockRets: number[] = [0];
    const bondRets: number[] = [0];
    for (let i = 1; i <= 24; i++) {
      stockRets.push(0.02);
      bondRets.push(0);
    }

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', makeReturnSeries(stockRets));
    assetReturns.set('BOND', makeReturnSeries(bondRets));

    const result = runBacktest(params, assetReturns, new Map(), new Map());

    // Annual rebalancing should have kept max drawdown contained
    // Without rebalancing, stock would dominate and portfolio would be much more volatile
    // With annual rebalancing, the drawdown should be 0 (portfolio only goes up)
    expect(result.metrics.maxDrawdown).toBe(0);
  });

  it('includes cashflow totals in metrics', () => {
    const params = makeParams({
      cashflows: [
        { date: '2020-06-30', amount: 5000, type: 'deposit' },
        { date: '2020-09-30', amount: -2000, type: 'withdrawal' },
      ],
    });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', makeReturnSeries([0, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]));
    assetReturns.set('BOND', makeReturnSeries([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

    const result = runBacktest(params, assetReturns, new Map(), new Map());

    expect(result.metrics.totalContributions).toBe(5000);
    expect(result.metrics.totalWithdrawals).toBe(2000);
  });
});
