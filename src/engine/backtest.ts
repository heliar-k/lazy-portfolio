import type {
  BacktestParameters,
  BacktestResult,
  MonthlyReturnPoint,
  MonthlyTimeSeriesPoint,
  PortfolioHolding,
} from './types';
import { alignReturnsToGrid } from './returns';
import { convertReturnSeries } from './currency';
import { computeEffectiveWeights } from './rebalancing';
import { compoundPortfolio, expandCashflows } from './compounding';
import { adjustForInflation } from './inflation';
import { computeMetrics, computeAnnualReturns } from './metrics';

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
  fxRates: Map<string, (number | null)[]>,
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
  const monthGrid = buildMonthGrid(startDate, endDate);
  const nMonths = monthGrid.length;

  if (nMonths === 0 || holdings.length === 0) {
    return emptyResult(params);
  }

  // 2. Align each holding's native returns to the grid, convert currency
  const alignedReturns: (number | null)[][] = [];
  for (const holding of holdings) {
    const native = assetReturnSeries.get(holding.asset.symbol) ?? [];
    let aligned = alignReturnsToGrid(native, monthGrid);

    if (holding.asset.currency !== displayCurrency) {
      const pair = `${holding.asset.currency}${displayCurrency}`;
      const fx = fxRates.get(pair);
      if (fx) {
        aligned = convertReturnSeries(aligned, fx);
      }
    }

    alignedReturns.push(aligned);
  }

  // 3. Compute effective weights with rebalancing
  const effectiveWeights = computeEffectiveWeights(
    holdings,
    alignedReturns,
    rebalancing,
    monthGrid,
  );

  // 4. Expand recurring cashflows
  const cashflowSchedule = expandCashflows(cashflows);

  // 5. Compound portfolio
  const { values, cashflowImpacts } = compoundPortfolio(
    effectiveWeights,
    alignedReturns,
    initialCapital,
    cashflowSchedule,
    monthGrid,
  );

  // 6. Build monthly time series (nominal, with drawdown tracking)
  let timeSeries = buildTimeSeries(
    monthGrid,
    values,
    cashflowImpacts,
    alignedReturns,
    effectiveWeights,
    holdings,
  );

  // 7. Inflation adjustment (mutates portfolioValueReal / monthlyReturnReal)
  timeSeries = adjustForInflation(timeSeries, cpiSeries);

  // 8. Compute summary metrics
  const firstMonthReal = timeSeries[0]?.portfolioValueReal ?? 0;
  const metrics = computeMetrics(timeSeries, firstMonthReal);

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
  alignedReturns: (number | null)[][],
  effectiveWeights: number[][],
  holdings: PortfolioHolding[],
): MonthlyTimeSeriesPoint[] {
  const n = monthGrid.length;
  const series: MonthlyTimeSeriesPoint[] = [];

  let peak = -Infinity;

  for (let m = 0; m < n; m++) {
    const portfolioValue = values[m] ?? 0;
    const cashflowImpact = cashflowImpacts[m] ?? 0;

    // Monthly portfolio return (weighted sum of asset returns)
    let monthlyReturn = 0;
    if (m > 0) {
      let totalWeight = 0;
      let weightedReturn = 0;
      for (let a = 0; a < holdings.length; a++) {
        const w = effectiveWeights[m]?.[a] ?? 0;
        const r = alignedReturns[a]?.[m] ?? 0;
        weightedReturn += w * r;
        totalWeight += w;
      }
      monthlyReturn = totalWeight > 0 ? weightedReturn / totalWeight : 0;
    }

    // Drawdown
    if (portfolioValue > peak) {
      peak = portfolioValue;
    }
    const drawdown = peak > 0 ? (portfolioValue - peak) / peak : 0;

    // Cumulative return relative to month 0
    const startValue = values[0];
    const cumulativeReturn =
      startValue > 0 ? (portfolioValue / startValue) - 1 : 0;

    series.push({
      date: monthGrid[m],
      portfolioValue,
      portfolioValueReal: portfolioValue, // will be overwritten by inflation step
      monthlyReturn,
      monthlyReturnReal: monthlyReturn, // will be overwritten
      drawdown,
      cumulativeReturn,
      cashflowImpact,
    });
  }

  return series;
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

  for (let i = 1; i < timeSeries.length; i++) {
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
