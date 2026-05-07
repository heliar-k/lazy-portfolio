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
      inflationAdjusted: true,
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
    // First month return is 0 to keep initial capital at $10,000 for month 0
    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', makeReturnSeries([0, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01]));
    assetReturns.set('BOND', makeReturnSeries([0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]));

    const result = runBacktest(params, assetReturns, new Map(), new Map());

    // Verify time series — 13 months: Jan 2020 through Jan 2021
    expect(result.timeSeries).toHaveLength(13);

    // Month 0 (Jan 2020): $10,000 (first month return is 0 since both assets have 0 return)
    expect(result.timeSeries[0].portfolioValue).toBeCloseTo(10000, 0);

    // Monthly portfolio return = 0.6*0.01 + 0.4*0 = 0.006
    // After 12 months of growth: 10000 * (1.006)^12
    expect(result.metrics.finalCapital).toBeCloseTo(10744.24, 0);

    // CAGR over 13 months (Jan 2020 – Jan 2021)
    const expectedCagr = Math.pow(10744.24 / 10000, 12 / 13) - 1;
    expect(result.metrics.cagr).toBeCloseTo(expectedCagr, 3);

    // Total return (from initial capital)
    expect(result.metrics.totalReturn).toBeCloseTo(10744.24 / 10000 - 1, 3);

    // No drawdown since portfolio only goes up
    expect(result.metrics.maxDrawdown).toBe(0);

    // 12 of 13 months positive (first month is zero which is not positive)
    expect(result.metrics.positiveMonthsPct).toBeCloseTo(12 / 13);
    expect(result.metrics.negativeMonthsPct).toBe(0);

    // Annual returns: 12 returns in 2020 (incl. zero Jan), 1 return in Jan 2021
    expect(result.annualReturns).toHaveLength(2);
    expect(result.annualReturns[0].year).toBe(2020);
    expect(result.annualReturns[0].return).toBeCloseTo(Math.pow(1.006, 11) - 1, 3);
    expect(result.annualReturns[1].year).toBe(2021);
    expect(result.annualReturns[1].return).toBeCloseTo(0.006, 3);

    // Monthly distribution — all 13 months
    const totalCount = result.monthlyReturnsDistribution.reduce((s, b) => s + b.count, 0);
    expect(totalCount).toBe(13);
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

  it('recomputes cumulative return from real values when inflation adjusted', () => {
    const params = makeParams({
      startDate: '2020-01',
      endDate: '2020-02',
      initialCapital: 1000,
      inflationAdjusted: true,
      portfolio: {
        id: 'real-cumulative',
        name: 'Real Cumulative',
        holdings: [{ asset: makeAsset('CASH'), targetWeight: 1 }],
        tags: [],
      },
    });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('CASH', [
      { date: '2020-01-31', totalReturn: 0 },
      { date: '2020-02-29', totalReturn: 0 },
    ]);

    const cpi = new Map<string, number>();
    cpi.set('2020-01-31', 100);
    cpi.set('2020-02-29', 110);

    const result = runBacktest(params, assetReturns, new Map(), cpi);

    expect(result.timeSeries[1].portfolioValue).toBeCloseTo(909.09, 2);
    expect(result.timeSeries[1].cumulativeReturn).toBeCloseTo(-0.0909, 4);
  });

  it('recomputes drawdown from real values when inflation adjusted', () => {
    const params = makeParams({
      startDate: '2020-01',
      endDate: '2020-02',
      initialCapital: 1000,
      inflationAdjusted: true,
      portfolio: {
        id: 'real-drawdown',
        name: 'Real Drawdown',
        holdings: [{ asset: makeAsset('CASH'), targetWeight: 1 }],
        tags: [],
      },
    });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('CASH', [
      { date: '2020-01-31', totalReturn: 0 },
      { date: '2020-02-29', totalReturn: 0 },
    ]);

    const cpi = new Map<string, number>();
    cpi.set('2020-01-31', 100);
    cpi.set('2020-02-29', 110);

    const result = runBacktest(params, assetReturns, new Map(), cpi);

    expect(result.timeSeries[1].drawdown).toBeCloseTo(-0.0909, 4);
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

  it('reports actual withdrawals in metrics and requested cashflows in time series', () => {
    const params = makeParams({
      startDate: '2020-01',
      endDate: '2020-02',
      initialCapital: 1000,
      inflationAdjusted: false,
      portfolio: {
        id: 'withdrawal-overrun',
        name: 'Withdrawal Overrun',
        holdings: [{ asset: makeAsset('CASH'), targetWeight: 1 }],
        tags: [],
      },
      cashflows: [{ date: '2020-02-29', amount: -1500, type: 'withdrawal' }],
    });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('CASH', [
      { date: '2020-01-31', totalReturn: 0 },
      { date: '2020-02-29', totalReturn: 0 },
    ]);

    const result = runBacktest(params, assetReturns, new Map(), new Map());

    expect(result.timeSeries[1].portfolioValue).toBe(0);
    expect(result.timeSeries[1].cashflowRequested).toBe(-1500);
    expect(result.timeSeries[1].cashflowImpact).toBe(-1000);
    expect(result.metrics.totalWithdrawals).toBe(1000);
  });

  it('CAGR (TWR) is not distorted by large cashflows', () => {
    // With monthly rebalancing, effectiveWeights are always reset to [0.6, 0.4]
    // each month before returns are applied — so the monthly return is always
    // 0.6*0.01 + 0.4*0 = 0.006 regardless of how much cash was deposited.
    // CAGR must therefore be identical with and without the deposit.
    const baseReturns = [0, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01, 0.01];

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', makeReturnSeries(baseReturns));
    assetReturns.set('BOND', makeReturnSeries(baseReturns.map(() => 0)));

    const paramsNoCashflow = makeParams({
      rebalancing: { type: 'calendar', frequency: 'monthly' },
      inflationAdjusted: false,
      cashflows: [],
    });
    const paramsLargeDeposit = makeParams({
      rebalancing: { type: 'calendar', frequency: 'monthly' },
      inflationAdjusted: false,
      cashflows: [{ date: '2020-06-30', amount: 50000, type: 'deposit' }],
    });

    const r1 = runBacktest(paramsNoCashflow, assetReturns, new Map(), new Map());
    const r2 = runBacktest(paramsLargeDeposit, assetReturns, new Map(), new Map());

    // CAGR must be the same: the deposit doesn't change monthly returns
    expect(r2.metrics.cagr).toBeCloseTo(r1.metrics.cagr, 5);

    // But final capital should be much larger due to the compounding deposit
    expect(r2.metrics.finalCapital).toBeGreaterThan(r1.metrics.finalCapital + 40000);
  });

  it('advances the effective start date until all holdings have return data', () => {
    const params = makeParams({ startDate: '2020-01', endDate: '2020-03', inflationAdjusted: false });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', [
      { date: '2020-01-31', totalReturn: 0.01 },
      { date: '2020-02-29', totalReturn: 0.01 },
      { date: '2020-03-31', totalReturn: 0.01 },
    ]);
    assetReturns.set('BOND', [
      { date: '2020-03-31', totalReturn: 0.00 },
    ]);

    const result = runBacktest(params, assetReturns, new Map(), new Map());

    expect(result.timeSeries[0].date).toBe('2020-03-31');
    expect(result.timeSeries).toHaveLength(1);
  });

  it('throws when a holding has a missing return after the effective start date', () => {
    const params = makeParams({ startDate: '2020-01', endDate: '2020-07', inflationAdjusted: false });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', [
      { date: '2020-01-31', totalReturn: 0.00 },
      { date: '2020-02-29', totalReturn: 0.01 },
    ]);
    assetReturns.set('BOND', makeReturnSeries([0, 0, 0, 0, 0, 0, 0]));

    expect(() => runBacktest(params, assetReturns, new Map(), new Map()))
      .toThrow('Missing return data for STOCK at 2020-06-30 after backtest start');
  });

  it('throws when holdings have no overlapping return data', () => {
    const params = makeParams({ startDate: '2020-01', endDate: '2020-03', inflationAdjusted: false });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('STOCK', [
      { date: '2020-01-31', totalReturn: 0.01 },
    ]);
    assetReturns.set('BOND', []);

    expect(() => runBacktest(params, assetReturns, new Map(), new Map()))
      .toThrow('No overlapping return data for all holdings in the requested date range');
  });

  it('converts FX using dates aligned to the backtest month grid', () => {
    const params = makeParams({
      startDate: '2020-02',
      endDate: '2020-03',
      inflationAdjusted: false,
      portfolio: {
        id: 'fx-test',
        name: 'FX Test',
        holdings: [{ asset: makeAsset('INTL', 'EUR'), targetWeight: 1 }],
        tags: [],
      },
      displayCurrency: 'USD',
    });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('INTL', [
      { date: '2020-02-29', totalReturn: 0.00 },
      { date: '2020-03-31', totalReturn: 0.00 },
    ]);

    const fxRates = new Map();
    fxRates.set('EURUSD', [
      { date: '2020-01-31', rate: 1.00 },
      { date: '2020-02-29', rate: 1.10 },
      { date: '2020-03-31', rate: 1.21 },
    ]);

    const result = runBacktest(params, assetReturns, fxRates, new Map());

    expect(result.timeSeries[0].date).toBe('2020-02-29');
    expect(result.timeSeries[0].monthlyReturn).toBe(0);
    expect(result.timeSeries[1].monthlyReturn).toBeCloseTo(0.10);
  });

  it('throws when FX data has a long gap after the effective start date', () => {
    const params = makeParams({
      startDate: '2020-01',
      endDate: '2020-06',
      inflationAdjusted: false,
      portfolio: {
        id: 'fx-gap-test',
        name: 'FX Gap Test',
        holdings: [{ asset: makeAsset('INTL', 'EUR'), targetWeight: 1 }],
        tags: [],
      },
      displayCurrency: 'USD',
    });

    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('INTL', [
      { date: '2020-01-31', totalReturn: 0.00 },
      { date: '2020-02-29', totalReturn: 0.00 },
      { date: '2020-03-31', totalReturn: 0.00 },
      { date: '2020-04-30', totalReturn: 0.00 },
      { date: '2020-05-31', totalReturn: 0.00 },
      { date: '2020-06-30', totalReturn: 0.00 },
    ]);

    const fxRates = new Map();
    fxRates.set('EURUSD', [{ date: '2020-01-31', rate: 1.10 }]);

    expect(() => runBacktest(params, assetReturns, fxRates, new Map()))
      .toThrow('Missing return data for INTL at 2020-05-31 after backtest start');
  });
});
