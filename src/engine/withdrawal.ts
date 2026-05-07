/**
 * Withdrawal Strategy Analysis Engine.
 *
 * Simulates portfolio withdrawals across multiple historical starting periods
 * to compute safe withdrawal rates (SWR), success rates, and retirement outcomes.
 *
 * Pure functions — data resolution is handled by the caller (similar to backtest.ts).
 */

import { runBacktest } from './backtest';
import type {
  BacktestParameters,
  CashflowEvent,
  MonthlyReturnPoint,
  PortfolioHolding,
  RebalancingStrategy,
  DisplayCurrency,
  Region,
  WithdrawalSimulationParams,
  SinglePeriodResult,
  SWRResult,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Get list of possible retirement start years given data range and retirement duration */
function getStartDates(
  assetReturns: Map<string, MonthlyReturnPoint[]>,
  retirementYears: number,
): string[] {
  // Find the earliest date all assets have data, and the latest date with enough remaining data
  let dataStart: string | null = null;
  let dataEnd: string | null = null;

  for (const returns of Array.from(assetReturns.values())) {
    const valid = returns.filter(r => r.totalReturn !== null);
    if (valid.length === 0) continue;
    if (!dataStart || valid[0].date > dataStart) dataStart = valid[0].date;
    if (!dataEnd || valid[valid.length - 1].date < dataEnd) dataEnd = valid[valid.length - 1].date;
  }

  if (!dataStart || !dataEnd) return [];

  const startYear = parseInt(dataStart.substring(0, 4));
  const startMonth = parseInt(dataStart.substring(5, 7));
  const endYear = parseInt(dataEnd.substring(0, 4));

  // Latest start year: enough data for full retirement period
  const latestStartYear = endYear - retirementYears;

  // Use "YYYY-MM" format (buildMonthGrid appends "-01" to handle it)
  const dates: string[] = [];
  for (let y = startYear; y <= latestStartYear; y++) {
    const m = y === startYear ? startMonth : 1;
    dates.push(`${y}-${String(m).padStart(2, '0')}`);
  }

  return dates;
}

/** Add years to a "YYYY-MM" date string */
function addYears(dateStr: string, years: number): string {
  const [y, m] = dateStr.split('-').map(Number);
  return `${y + years}-${String(m).padStart(2, '0')}`;
}
/** Get CPI value at or before a given date */
function getCPI(cpiSeries: Map<string, number>, date: string): number | null {
  if (cpiSeries.has(date)) return cpiSeries.get(date)!;

  // Search backwards for nearest CPI value
  const dates = Array.from(cpiSeries.keys()).sort();
  for (let i = dates.length - 1; i >= 0; i--) {
    if (dates[i] <= date) return cpiSeries.get(dates[i])!;
  }
  return null;
}

// ---------------------------------------------------------------------------
// Cashflow generation
// ---------------------------------------------------------------------------

/**
 * Generate annual withdrawal cashflow events for a retirement period.
 *
 * Fixed Percentage strategy (4% rule):
 *   Year 1: initialCapital * rate
 *   Year N: Year 1 amount * (CPI_yearN / CPI_year1)
 */
function generateWithdrawalCashflows(
  startDate: string,
  retirementYears: number,
  initialCapital: number,
  withdrawalRate: number,
  cpiSeries: Map<string, number>,
): CashflowEvent[] {
  const events: CashflowEvent[] = [];
  const initialWithdrawal = initialCapital * withdrawalRate;

  // Get base CPI at retirement start
  const baseCPI = getCPI(cpiSeries, startDate);
  if (baseCPI === null || baseCPI <= 0) return events;

  const startYear = parseInt(startDate.substring(0, 4));

  for (let y = 0; y < retirementYears; y++) {
    const year = startYear + y;
    // Withdraw at end of December each year
    const withdrawalDate = `${year}-12-31`;

    // CPI-adjust the withdrawal
    const yearCPI = getCPI(cpiSeries, withdrawalDate);
    let amount: number;
    if (yearCPI && baseCPI > 0) {
      amount = -(initialWithdrawal * (yearCPI / baseCPI));
    } else {
      amount = -initialWithdrawal;
    }

    events.push({
      date: withdrawalDate,
      amount: Math.round(amount * 100) / 100,
      type: 'withdrawal',
    });
  }

  return events;
}

// ---------------------------------------------------------------------------
// Single period simulation
// ---------------------------------------------------------------------------

/**
 * Simulate one retirement period: withdraw from portfolio for retirementYears.
 */
function simulateSinglePeriod(
  holdings: PortfolioHolding[],
  assetReturns: Map<string, MonthlyReturnPoint[]>,
  cpiSeries: Map<string, number>,
  startDate: string,
  initialCapital: number,
  withdrawalRate: number,
  retirementYears: number,
  rebalancing: RebalancingStrategy,
  displayCurrency: DisplayCurrency,
  inflationRegion: Region,
): SinglePeriodResult {
  const endDate = addYears(startDate, retirementYears);

  // Generate withdrawal cashflows
  const cashflows = generateWithdrawalCashflows(
    startDate,
    retirementYears,
    initialCapital,
    withdrawalRate,
    cpiSeries,
  );

  // Build backtest parameters
  const params: BacktestParameters = {
    portfolio: {
      id: '_withdrawal_sim',
      name: 'Withdrawal Simulation',
      holdings,
      tags: [],
    },
    startDate,
    endDate,
    initialCapital,
    displayCurrency,
    inflationRegion,
    inflationAdjusted: false, // we handle CPI ourselves for withdrawals
    rebalancing,
    cashflows,
  };

  // Run backtest (no FX conversion needed for single-currency portfolios)
  const result = runBacktest(params, assetReturns, new Map(), cpiSeries);

  // Extract withdrawal-specific results
  const timeSeries = result.timeSeries;
  let minBalance = initialCapital;
  let maxWithdrawal = 0;
  let minWithdrawal = Infinity;
  let totalWithdrawals = 0;
  let depletionDate: string | null = null;
  let success = true;

  const annualResults: SinglePeriodResult['annualResults'] = [];

  for (const point of timeSeries) {
    if (point.portfolioValue < minBalance) minBalance = point.portfolioValue;
    if (point.portfolioValue <= 0 && !depletionDate) {
      depletionDate = point.date;
      success = false;
    }
  }

  // Compute annual results from cashflows and time series
  const startYear = parseInt(startDate.substring(0, 4));
  // Build a map of year → year-end portfolio value
  const yearEndValues = new Map<number, number>();
  for (const point of timeSeries) {
    const year = parseInt(point.date.substring(0, 4));
    yearEndValues.set(year, point.portfolioValue);
  }

  for (let y = 0; y < retirementYears; y++) {
    const year = startYear + y;
    const cf = cashflows.find(c => c.date.startsWith(String(year)));
    const withdrawalAmount = cf ? Math.abs(cf.amount) : 0;
    const portfolioValue = yearEndValues.get(year) ?? 0;

    maxWithdrawal = Math.max(maxWithdrawal, withdrawalAmount);
    if (withdrawalAmount > 0) minWithdrawal = Math.min(minWithdrawal, withdrawalAmount);
    totalWithdrawals += withdrawalAmount;

    // Annual return
    const prevValue = y === 0 ? initialCapital : (yearEndValues.get(year - 1) ?? 0);
    const portfolioReturn = prevValue > 0
      ? (portfolioValue + withdrawalAmount - prevValue) / prevValue
      : 0;

    annualResults.push({ year, withdrawalAmount, portfolioValue, portfolioReturn });
  }

  if (minWithdrawal === Infinity) minWithdrawal = 0;

  return {
    startDate,
    endDate,
    success,
    finalBalance: result.metrics.finalCapital,
    finalBalanceReal: timeSeries.length > 0
      ? timeSeries[timeSeries.length - 1].portfolioValueReal
      : 0,
    minBalance,
    maxWithdrawalAmount: maxWithdrawal,
    minWithdrawalAmount: minWithdrawal,
    totalWithdrawals,
    depletionDate,
    annualResults,
  };
}

// ---------------------------------------------------------------------------
// SWR computation
// ---------------------------------------------------------------------------

/** Default withdrawal rates to test: 2% to 10% in 0.5% steps */
const DEFAULT_RATES = [
  0.020, 0.025, 0.030, 0.035, 0.040, 0.045, 0.050,
  0.055, 0.060, 0.065, 0.070, 0.075, 0.080, 0.085,
  0.090, 0.095, 0.100,
];

/**
 * Compute safe withdrawal rates by simulating across all historical starting periods.
 *
 * Returns a complete SWRResult with per-period details and a sweep grid
 * suitable for a heatmap.
 */
export function computeSWR(
  holdings: PortfolioHolding[],
  assetReturns: Map<string, MonthlyReturnPoint[]>,
  cpiSeries: Map<string, number>,
  options: {
    retirementYears: number;
    initialCapital: number;
    rebalancing: RebalancingStrategy;
    displayCurrency?: DisplayCurrency;
    inflationRegion?: Region;
    ratesToTest?: number[];
  },
): SWRResult {
  const {
    retirementYears,
    initialCapital,
    rebalancing,
    displayCurrency = 'USD' as DisplayCurrency,
    inflationRegion = 'US' as Region,
    ratesToTest = DEFAULT_RATES,
  } = options;

  const startDates = getStartDates(assetReturns, retirementYears);

  const sweepResults: SWRResult['sweepResults'] = [];
  const allPeriodResults: SinglePeriodResult[] = [];

  // For each withdrawal rate, simulate all start dates
  for (const rate of ratesToTest) {
    for (const startDate of startDates) {
      const periodResult = simulateSinglePeriod(
        holdings,
        assetReturns,
        cpiSeries,
        startDate,
        initialCapital,
        rate,
        retirementYears,
        rebalancing,
        displayCurrency,
        inflationRegion,
      );

      if (periodResult.success) { /* tracked in sweepResults below */ }

      sweepResults.push({
        startDate,
        rate,
        success: periodResult.success,
        finalBalance: periodResult.finalBalance,
      });

      // Store detailed results for the median rate (4%) only to save memory
      if (Math.abs(rate - 0.04) < 0.001) {
        allPeriodResults.push(periodResult);
      }
    }
  }

  // Compute success rate and SWR
  const nPeriods = startDates.length;
  const rateSuccessMap = new Map<number, number>();

  for (const rate of ratesToTest) {
    const successes = sweepResults.filter(r => r.rate === rate && r.success).length;
    rateSuccessMap.set(rate, successes / nPeriods);
  }

  // Overall success rate at 4%
  const successRate = rateSuccessMap.get(0.04) ?? 0;

  // Safe withdrawal rate: highest rate with 100% success
  let safeWithdrawalRate = 0;
  const sortedRates = [...ratesToTest].sort((a, b) => b - a);
  for (const rate of sortedRates) {
    if ((rateSuccessMap.get(rate) ?? 0) >= 1.0) {
      safeWithdrawalRate = rate;
      break;
    }
  }

  // Median and worst-case final balance (at 4% rate)
  const rate4Results = sweepResults.filter(r => Math.abs(r.rate - 0.04) < 0.001);
  const finalBalances = rate4Results.map(r => r.finalBalance).sort((a, b) => a - b);
  const medianFinalBalance = finalBalances.length > 0
    ? finalBalances[Math.floor(finalBalances.length / 2)]
    : 0;
  const worstCaseFinalBalance = finalBalances.length > 0 ? finalBalances[0] : 0;

  const params: WithdrawalSimulationParams = {
    portfolio: {
      id: '',
      name: '',
      holdings,
      tags: [],
    },
    strategy: { type: 'fixed_percentage', initialRate: 0.04 },
    retirementYears,
    initialCapital,
    inflationAdjusted: true,
    rebalancing,
    displayCurrency,
    inflationRegion,
  };

  return {
    params,
    successRate,
    safeWithdrawalRate,
    medianFinalBalance,
    worstCaseFinalBalance,
    periodResults: allPeriodResults,
    sweepResults,
  };
}
