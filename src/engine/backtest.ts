import { compoundPortfolio, expandCashflows } from './compounding';
import { alignFxRatesToGrid, convertReturnSeries } from './currency';
import { adjustForInflation } from './inflation';
import { computeAnnualReturns, computeMetrics } from './metrics';
import { alignReturnsToGrid } from './returns';
import type {
  BacktestParameters,
  BacktestResult,
  MonthlyFxRatePoint,
  MonthlyReturnPoint,
  MonthlyTimeSeriesPoint,
  PortfolioHolding,
} from './types';

/**
 * Run the full backtest pipeline:
 *   align → currency → rebalance → compound → inflation → metrics
 *
 * @param assetReturnSeries  symbol → native-currency monthly returns
 * @param fxRates            pairKey (e.g. "CNYUSD") → monthly FX rate series
 * @param cpiSeries          date → CPI value for inflation adjustment
 */
export function runBacktest(
  params: BacktestParameters,
  assetReturnSeries: Map<string, MonthlyReturnPoint[]>,
  fxRates: Map<string, MonthlyFxRatePoint[]>,
  cpiSeries: Map<string, number>,
): BacktestResult {
  const {
    portfolio,
    startDate,
    endDate,
    initialCapital,
    displayCurrency,
    rebalancing,
    cashflows,
  } = params;
  const holdings = portfolio.holdings;

  // 1. Build month grid
  let monthGrid = buildMonthGrid(startDate, endDate);
  const nMonths = monthGrid.length;

  if (nMonths === 0 || holdings.length === 0) {
    return emptyResult(params);
  }

  // 2. Align each holding's native returns to the grid, convert currency
  let alignedReturns: (number | null)[][] = [];
  for (const holding of holdings) {
    const native = assetReturnSeries.get(holding.asset.symbol) ?? [];
    let aligned = alignReturnsToGrid(native, monthGrid);

    if (holding.asset.currency !== displayCurrency) {
      const pair = `${holding.asset.currency}${displayCurrency}`;
      const fx = fxRates.get(pair);
      if (fx) {
        const alignedFx = alignFxRatesToGrid(fx, monthGrid);
        aligned = convertReturnSeries(aligned, alignedFx);
      }
    }

    alignedReturns.push(aligned);
  }

  const effectiveStartIdx = findEffectiveStartIndex(alignedReturns);
  if (effectiveStartIdx < 0) {
    throw new Error('No overlapping return data for all holdings in the requested date range');
  }

  if (effectiveStartIdx > 0) {
    monthGrid = monthGrid.slice(effectiveStartIdx);
    alignedReturns = alignedReturns.map((series) => series.slice(effectiveStartIdx));
  }

  assertNoMissingReturnsAfterStart(alignedReturns, monthGrid, holdings);

  // 3. Expand recurring cashflows
  const cashflowSchedule = expandCashflows(cashflows);

  // 4. Compound portfolio with per-asset tracking.
  //    Rebalancing is applied according to the strategy.
  //    Cashflows are invested at target weights so new money is split
  //    proportionally rather than following the drifted allocation.
  const targetWeights = holdings.map((h) => h.targetWeight);
  const { values, cashflowImpacts, cashflowRequests, effectiveWeights } = compoundPortfolio(
    targetWeights,
    alignedReturns,
    initialCapital,
    cashflowSchedule,
    monthGrid,
    rebalancing,
    params.cashflowTriggersRebalance,
  );

  // 5. Build monthly time series (nominal, with drawdown tracking)
  let timeSeries = buildTimeSeries(
    monthGrid,
    values,
    cashflowImpacts,
    cashflowRequests,
    alignedReturns,
    effectiveWeights,
    holdings,
    initialCapital,
  );

  // 7. Inflation adjustment
  if (params.inflationAdjusted) {
    timeSeries = adjustForInflation(timeSeries, cpiSeries);
    // Swap nominal ↔ real so metrics/charts use inflation-adjusted values.
    // Nominal values are preserved in the *Real fields for reference.
    for (const point of timeSeries) {
      [point.portfolioValue, point.portfolioValueReal] = [point.portfolioValueReal, point.portfolioValue];
      [point.monthlyReturn, point.monthlyReturnReal] = [point.monthlyReturnReal, point.monthlyReturn];
    }
    timeSeries = recomputePathDerivedFields(timeSeries, initialCapital);
  }

  // 8. Compute summary metrics
  const metrics = computeMetrics(timeSeries, initialCapital);

  // 9. Annual returns
  const annualReturns = computeAnnualReturns(timeSeries);

  // 10. Monthly return distribution
  const monthlyReturnsDistribution = computeReturnDistribution(timeSeries);

  return {
    parameters: params,
    metrics,
    timeSeries,
    annualReturns,
    monthlyReturnsDistribution,
  };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Generate end-of-month date strings between start (inclusive) and end (inclusive). */
export function buildMonthGrid(startDate: string, endDate: string): string[] {
  const start = new Date(startDate + '-01'); // handle "YYYY-MM" format
  const end = new Date(endDate + '-01');

  if (isNaN(start.getTime()) || isNaN(end.getTime()) || start > end) {
    return [];
  }

  const months: string[] = [];
  const cursor = new Date(start.getFullYear(), start.getMonth(), 1);

  while (cursor <= end) {
    // Last day of current month
    const lastDay = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 0);
    months.push(formatDate(lastDay));
    cursor.setMonth(cursor.getMonth() + 1);
  }

  return months;
}

function buildTimeSeries(
  monthGrid: string[],
  values: number[],
  cashflowImpacts: number[],
  cashflowRequests: number[],
  alignedReturns: (number | null)[][],
  effectiveWeights: number[][],
  holdings: PortfolioHolding[],
  initialCapital: number,
): MonthlyTimeSeriesPoint[] {
  const n = monthGrid.length;
  const series: MonthlyTimeSeriesPoint[] = [];

  let peak = -Infinity;

  for (let m = 0; m < n; m++) {
    const portfolioValue = values[m] ?? 0;
    const cashflowImpact = cashflowImpacts[m] ?? 0;
    const cashflowRequested = cashflowRequests[m] ?? cashflowImpact;

    // Monthly portfolio return: weighted average of asset returns (TWR).
    // Using asset-level returns rather than portfolio value changes ensures
    // cashflow deposits and withdrawals do not affect the return figure in any month.
    let totalWeight = 0;
    let weightedReturn = 0;
    for (let a = 0; a < holdings.length; a++) {
      const w = effectiveWeights[m]?.[a] ?? 0;
      const r = alignedReturns[a]?.[m] ?? 0;
      weightedReturn += w * r;
      totalWeight += w;
    }
    const monthlyReturn = totalWeight > 0 ? weightedReturn / totalWeight : 0;

    // Drawdown
    if (portfolioValue > peak) {
      peak = portfolioValue;
    }
    const drawdown = peak > 0 ? (portfolioValue - peak) / peak : 0;

    // Cumulative return relative to initial capital
    const cumulativeReturn =
      initialCapital > 0 ? (portfolioValue / initialCapital) - 1 : 0;

    series.push({
      date: monthGrid[m],
      portfolioValue,
      portfolioValueReal: portfolioValue, // will be overwritten by inflation step
      monthlyReturn,
      monthlyReturnReal: monthlyReturn, // will be overwritten
      drawdown,
      cumulativeReturn,
      cashflowImpact,
      cashflowRequested,
    });
  }

  return series;
}

function findEffectiveStartIndex(
  alignedReturns: (number | null)[][],
): number {
  const nMonths = alignedReturns[0]?.length ?? 0;

  for (let m = 0; m < nMonths; m++) {
    if (alignedReturns.every((series) => series[m] !== null)) {
      return m;
    }
  }

  return -1;
}

function assertNoMissingReturnsAfterStart(
  alignedReturns: (number | null)[][],
  monthGrid: string[],
  holdings: PortfolioHolding[],
): void {
  for (let a = 0; a < alignedReturns.length; a++) {
    for (let m = 0; m < monthGrid.length; m++) {
      if (alignedReturns[a][m] === null) {
        const symbol = holdings[a]?.asset.symbol ?? `asset ${a + 1}`;
        throw new Error(
          `Missing return data for ${symbol} at ${monthGrid[m]} after backtest start`,
        );
      }
    }
  }
}

function recomputePathDerivedFields(
  timeSeries: MonthlyTimeSeriesPoint[],
  initialCapital: number,
): MonthlyTimeSeriesPoint[] {
  let peak = initialCapital;

  return timeSeries.map((point) => {
    const portfolioValue = point.portfolioValue;
    if (portfolioValue > peak) peak = portfolioValue;

    const drawdown = peak > 0 ? (portfolioValue - peak) / peak : 0;
    const cumulativeReturn = initialCapital > 0
      ? (portfolioValue / initialCapital) - 1
      : 0;

    return {
      ...point,
      drawdown,
      cumulativeReturn,
    };
  });
}

function computeReturnDistribution(
  timeSeries: MonthlyTimeSeriesPoint[],
): { bucket: string; count: number }[] {
  const buckets: { bucket: string; count: number }[] = [
    { bucket: '<-5%', count: 0 },
    { bucket: '-5% to -3%', count: 0 },
    { bucket: '-3% to -1%', count: 0 },
    { bucket: '-1% to 1%', count: 0 },
    { bucket: '1% to 3%', count: 0 },
    { bucket: '3% to 5%', count: 0 },
    { bucket: '>5%', count: 0 },
  ];

  for (let i = 0; i < timeSeries.length; i++) {
    const r = timeSeries[i].monthlyReturn;
    if (isNaN(r)) continue;

    if (r < -0.05) buckets[0].count++;
    else if (r < -0.03) buckets[1].count++;
    else if (r < -0.01) buckets[2].count++;
    else if (r < 0.01) buckets[3].count++;
    else if (r < 0.03) buckets[4].count++;
    else if (r < 0.05) buckets[5].count++;
    else buckets[6].count++;
  }

  return buckets;
}

function emptyResult(params: BacktestParameters): BacktestResult {
  return {
    parameters: params,
    metrics: {
      finalCapital: 0,
      totalReturn: 0,
      cagr: 0,
      stdDevAnnualized: 0,
      bestYear: { year: 0, return: 0 },
      worstYear: { year: 0, return: 0 },
      maxDrawdown: 0,
      maxDrawdownStart: '',
      maxDrawdownEnd: '',
      maxDrawdownRecovery: null,
      maxDrawdownDurationMonths: 0,
      maxDrawdownPeakToTroughMonths: 0,
      sharpeRatio: 0,
      sortinoRatio: 0,
      positiveMonthsPct: 0,
      negativeMonthsPct: 0,
      skewness: 0,
      kurtosis: 0,
      rolling3YrBest: 0,
      rolling3YrWorst: 0,
      rolling5YrBest: 0,
      rolling5YrWorst: 0,
      rolling10YrBest: 0,
      rolling10YrWorst: 0,
      totalContributions: 0,
      totalWithdrawals: 0,
    },
    timeSeries: [],
    annualReturns: [],
    monthlyReturnsDistribution: [],
  };
}

function formatDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}
