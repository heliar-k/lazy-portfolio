import type { BacktestMetrics, MonthlyTimeSeriesPoint } from './types';

/**
 * Compute all backtest metrics from the monthly time series.
 */
export function computeMetrics(
  timeSeries: MonthlyTimeSeriesPoint[],
  firstMonthReal: number,
): BacktestMetrics {
  const n = timeSeries.length;

  if (n === 0) {
    return emptyMetrics();
  }

  const values = timeSeries.map((p) => p.portfolioValue);
  const returns = timeSeries.map((p) => p.monthlyReturn);

  // Skip month 0 (no return for first month)
  const effectiveReturns = returns.slice(1).filter((r) => !isNaN(r));

  const finalCapital = values[n - 1];
  const totalReturn = firstMonthReal > 0
    ? (finalCapital / firstMonthReal) - 1
    : 0;

  // CAGR — month 0 is the starting point, so we have (n-1) months of growth
  const years = (n - 1) / 12;
  let cagr = 0;
  if (years > 0) {
    const startVal = values[0] > 0 ? values[0] : 1;
    const endVal = values[n - 1];
    if (endVal > 0 && startVal > 0) {
      cagr = Math.pow(endVal / startVal, 1 / years) - 1;
    }
  }

  // Annualized std dev
  const stdDevAnnualized = computeAnnualizedStdDev(effectiveReturns);

  // Best / worst year
  const annualReturns = computeAnnualReturns(timeSeries);
  let bestYear = { year: 0, return: -Infinity };
  let worstYear = { year: 0, return: Infinity };
  for (const yr of annualReturns) {
    if (yr.return > bestYear.return) bestYear = yr;
    if (yr.return < worstYear.return) worstYear = yr;
  }
  if (!isFinite(bestYear.return)) bestYear = { year: 0, return: 0 };
  if (!isFinite(worstYear.return)) worstYear = { year: 0, return: 0 };

  // Max drawdown
  const dd = computeMaxDrawdown(values, timeSeries);

  // Sharpe ratio (assume risk-free rate = 0 for simplicity, or use T-bill)
  const avgMonthlyReturn =
    effectiveReturns.length > 0
      ? effectiveReturns.reduce((a, b) => a + b, 0) / effectiveReturns.length
      : 0;
  const monthlyStdDev = computeMonthlyStdDev(effectiveReturns);
  const sharpeRatio =
    monthlyStdDev > 0 ? (avgMonthlyReturn / monthlyStdDev) * Math.sqrt(12) : 0;

  // Sortino ratio (only downside deviation)
  const downsideReturns = effectiveReturns.filter((r) => r < 0);
  const downsideStdDev =
    downsideReturns.length > 1
      ? Math.sqrt(
          downsideReturns.reduce((sum, r) => sum + r * r, 0) /
            (downsideReturns.length - 1),
        )
      : 0;
  const sortinoRatio =
    downsideStdDev > 0
      ? (avgMonthlyReturn / downsideStdDev) * Math.sqrt(12)
      : 0;

  // Positive / negative months
  const positiveMonths = effectiveReturns.filter((r) => r > 0).length;
  const totalMonths = effectiveReturns.length;
  const positiveMonthsPct = totalMonths > 0 ? positiveMonths / totalMonths : 0;
  const negativeMonthsPct = totalMonths > 0 ? (totalMonths - positiveMonths) / totalMonths : 0;

  // Skewness / Kurtosis
  const { skewness, kurtosis } = computeDistributionStats(effectiveReturns);

  // Rolling returns
  const rolling = computeRollingReturns(timeSeries);

  // Cashflow totals
  const totalContributions = timeSeries
    .filter((p) => p.cashflowImpact > 0)
    .reduce((sum, p) => sum + p.cashflowImpact, 0);
  const totalWithdrawals = timeSeries
    .filter((p) => p.cashflowImpact < 0)
    .reduce((sum, p) => sum + Math.abs(p.cashflowImpact), 0);

  return {
    finalCapital,
    totalReturn,
    cagr,
    stdDevAnnualized,
    bestYear,
    worstYear,
    maxDrawdown: dd.maxDrawdown,
    maxDrawdownStart: dd.peakDate,
    maxDrawdownEnd: dd.troughDate,
    maxDrawdownRecovery: dd.recoveryDate,
    maxDrawdownDurationMonths: dd.durationMonths,
    maxDrawdownPeakToTroughMonths: dd.peakToTroughMonths,
    sharpeRatio,
    sortinoRatio,
    positiveMonthsPct,
    negativeMonthsPct,
    skewness,
    kurtosis,
    rolling3YrBest: rolling.three.best,
    rolling3YrWorst: rolling.three.worst,
    rolling5YrBest: rolling.five.best,
    rolling5YrWorst: rolling.five.worst,
    rolling10YrBest: rolling.ten.best,
    rolling10YrWorst: rolling.ten.worst,
    totalContributions,
    totalWithdrawals,
  };
}

function computeAnnualizedStdDev(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const mean =
    monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (monthlyReturns.length - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

function computeMonthlyStdDev(monthlyReturns: number[]): number {
  if (monthlyReturns.length < 2) return 0;
  const mean =
    monthlyReturns.reduce((a, b) => a + b, 0) / monthlyReturns.length;
  const variance =
    monthlyReturns.reduce((sum, r) => sum + (r - mean) ** 2, 0) /
    (monthlyReturns.length - 1);
  // Guard against floating-point noise producing near-zero non-zero variance
  const stdDev = Math.sqrt(variance);
  return stdDev < 1e-10 ? 0 : stdDev;
}

function computeMaxDrawdown(
  values: number[],
  timeSeries: MonthlyTimeSeriesPoint[],
): {
  maxDrawdown: number;
  peakValue: number;
  peakDate: string;
  troughDate: string;
  recoveryDate: string | null;
  durationMonths: number;
  peakToTroughMonths: number;
} {
  if (values.length === 0) {
    return {
      maxDrawdown: 0,
      peakValue: 0,
      peakDate: '',
      troughDate: '',
      recoveryDate: null,
      durationMonths: 0,
      peakToTroughMonths: 0,
    };
  }

  let peak = values[0];
  let peakIdx = 0;
  let maxDD = 0;
  let troughIdx = 0;
  let maxDDPeakIdx = 0;

  for (let i = 0; i < values.length; i++) {
    if (values[i] > peak) {
      peak = values[i];
      peakIdx = i;
    }
    const drawdown = (values[i] - peak) / peak;
    if (drawdown < maxDD) {
      maxDD = drawdown;
      troughIdx = i;
      maxDDPeakIdx = peakIdx;
    }
  }

  // Find recovery: first date after trough where value >= peak (at the drawdown peak)
  let recoveryIdx = -1;
  const peakAtDD = values[maxDDPeakIdx];
  for (let i = troughIdx + 1; i < values.length; i++) {
    if (values[i] >= peakAtDD) {
      recoveryIdx = i;
      break;
    }
  }

  return {
    maxDrawdown: maxDD,
    peakValue: values[maxDDPeakIdx],
    peakDate: timeSeries[maxDDPeakIdx]?.date ?? '',
    troughDate: timeSeries[troughIdx]?.date ?? '',
    recoveryDate: recoveryIdx >= 0 ? (timeSeries[recoveryIdx]?.date ?? null) : null,
    durationMonths: recoveryIdx >= 0 ? recoveryIdx - maxDDPeakIdx : Infinity as unknown as number,
    peakToTroughMonths: troughIdx - maxDDPeakIdx,
  };
}

export function computeAnnualReturns(
  timeSeries: MonthlyTimeSeriesPoint[],
): { year: number; return: number }[] {
  const yearMap = new Map<number, number[]>(); // year → monthly returns

  for (let i = 1; i < timeSeries.length; i++) {
    const date = new Date(timeSeries[i].date);
    const year = date.getFullYear();
    const ret = timeSeries[i].monthlyReturn;

    if (!yearMap.has(year)) {
      yearMap.set(year, []);
    }
    yearMap.get(year)!.push(ret);
  }

  const result: { year: number; return: number }[] = [];
  for (const [year, returns] of yearMap) {
    // Annual return = product of (1 + monthly) - 1
    // But for display purposes, sum of monthly is a reasonable approximation
    const annualReturn =
      returns.reduce((prod, r) => prod * (1 + r), 1) - 1;
    result.push({ year, return: annualReturn });
  }

  return result.sort((a, b) => a.year - b.year);
}

function computeRollingReturns(
  timeSeries: MonthlyTimeSeriesPoint[],
): {
  three: { best: number; worst: number };
  five: { best: number; worst: number };
  ten: { best: number; worst: number };
} {
  const empty = { best: 0, worst: 0 };
  if (timeSeries.length < 36 + 1) {
    return { three: empty, five: empty, ten: empty };
  }

  const values = timeSeries.map((p) => p.portfolioValue);

  const three = rollingWindow(values, 36);
  const five = rollingWindow(values, 60);
  const ten = rollingWindow(values, 120);

  return { three, five, ten };
}

function rollingWindow(
  values: number[],
  months: number,
): { best: number; worst: number } {
  if (values.length < months + 1) return { best: 0, worst: 0 };

  let best = -Infinity;
  let worst = Infinity;

  for (let i = months; i < values.length; i++) {
    const startVal = values[i - months];
    if (startVal <= 0) continue;
    const cagr =
      Math.pow(values[i] / startVal, 12 / months) - 1;
    if (cagr > best) best = cagr;
    if (cagr < worst) worst = cagr;
  }

  return {
    best: isFinite(best) ? best : 0,
    worst: isFinite(worst) ? worst : 0,
  };
}

function computeDistributionStats(returns: number[]): {
  skewness: number;
  kurtosis: number;
} {
  if (returns.length < 4) return { skewness: 0, kurtosis: 0 };

  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance =
    returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  const std = Math.sqrt(variance);

  if (std === 0) return { skewness: 0, kurtosis: 0 };

  const m3 =
    returns.reduce((sum, r) => sum + ((r - mean) / std) ** 3, 0) / n;
  const m4 =
    returns.reduce((sum, r) => sum + ((r - mean) / std) ** 4, 0) / n;

  return {
    skewness: m3,
    kurtosis: m4 - 3, // excess kurtosis
  };
}

function emptyMetrics(): BacktestMetrics {
  return {
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
  };
}
