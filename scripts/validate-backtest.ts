/**
 * Backtest Cross-Validation Suite — M3 of Data Pipeline Improvement Plan.
 *
 * Runs known-good backtests and compares against baseline values to catch
 * regressions when engine logic or proxy data changes.
 *
 * Usage: npx tsx scripts/validate-backtest.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Minimal engine (same as verify-engine.ts)
// ---------------------------------------------------------------------------

interface PricePoint {
  date: string;
  price: number;
}

function loadCSV(filePath: string): PricePoint[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.trim().split('\n');
  return lines.slice(1).map(line => {
    const [date, price] = line.split(',');
    return { date, price: parseFloat(price) };
  });
}

function computeMonthlyReturns(prices: PricePoint[]): Map<string, number | null> {
  const map = new Map<string, number | null>();
  for (let i = 0; i < prices.length; i++) {
    if (i === 0) {
      map.set(prices[i].date, null);
    } else {
      const prev = prices[i - 1].price;
      const curr = prices[i].price;
      map.set(prices[i].date, prev > 0 ? (curr - prev) / prev : null);
    }
  }
  return map;
}

function buildMonthGrid(startDate: string, endDate: string): string[] {
  const start = new Date(startDate + '-01');
  const end = new Date(endDate + '-01');
  const months: string[] = [];
  const current = new Date(start);
  while (current <= end) {
    const y = current.getFullYear();
    const m = String(current.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, current.getMonth() + 1, 0).getDate();
    months.push(`${y}-${m}-${String(lastDay).padStart(2, '0')}`);
    current.setMonth(current.getMonth() + 1);
  }
  return months;
}

function alignedReturns(
  monthlyReturns: Map<string, number | null>,
  monthGrid: string[],
): (number | null)[] {
  return monthGrid.map(date => {
    const r = monthlyReturns.get(date);
    return r !== undefined ? r : null;
  });
}

interface Holding {
  targetWeight: number;
  expenseRatio: number;
}

interface BacktestResult {
  cagr: number;
  stdDev: number;
  maxDD: number;
  finalCapital: number;
}

function runBacktest(
  holdings: Holding[],
  monthlyReturnsList: (number | null)[][],
  months: string[],
  initialCapital: number,
  rebalanceFrequency: 'monthly' | 'annual',
): BacktestResult {
  const nAssets = holdings.length;
  const nMonths = months.length;

  if (nAssets === 0 || nMonths === 0) {
    return { cagr: 0, stdDev: 0, maxDD: 0, finalCapital: 0 };
  }

  const targetWeights = holdings.map(h => h.targetWeight);
  const assetValues = targetWeights.map(w => w * initialCapital);
  const portfolioValues: number[] = [initialCapital];

  for (let m = 1; m < nMonths; m++) {
    let shouldRebalance = false;
    if (rebalanceFrequency === 'annual') {
      const date = new Date(months[m]);
      shouldRebalance = date.getMonth() === 0 && m > 0;
    }

    if (shouldRebalance) {
      const totalValue = assetValues.reduce((a, b) => a + b, 0);
      for (let a = 0; a < nAssets; a++) {
        assetValues[a] = totalValue * targetWeights[a];
      }
    }

    let totalValue = 0;
    const newValues: number[] = [];
    for (let a = 0; a < nAssets; a++) {
      const ret = monthlyReturnsList[a]?.[m] ?? 0;
      const fee = (holdings[a].expenseRatio / 12) * assetValues[a];
      const newVal = assetValues[a] * (1 + ret) - fee;
      newValues.push(Math.max(0, newVal));
      totalValue += Math.max(0, newVal);
    }

    for (let a = 0; a < nAssets; a++) {
      assetValues[a] = newValues[a];
    }

    portfolioValues.push(totalValue);
  }

  const monthlyPortfolioReturns: number[] = [];
  for (let i = 1; i < portfolioValues.length; i++) {
    if (portfolioValues[i - 1] > 0) {
      monthlyPortfolioReturns.push(
        (portfolioValues[i] - portfolioValues[i - 1]) / portfolioValues[i - 1],
      );
    }
  }

  const years = (nMonths - 1) / 12;
  const cagr =
    years > 0 && portfolioValues[0] > 0
      ? Math.pow(portfolioValues[portfolioValues.length - 1] / portfolioValues[0], 1 / years) - 1
      : 0;

  const n = monthlyPortfolioReturns.length;
  const meanReturn = n > 0 ? monthlyPortfolioReturns.reduce((a, b) => a + b, 0) / n : 0;
  const variance =
    n > 1
      ? monthlyPortfolioReturns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance) * Math.sqrt(12);

  let peak = portfolioValues[0];
  let maxDD = 0;
  for (const v of portfolioValues) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }

  return {
    cagr,
    stdDev,
    maxDD,
    finalCapital: portfolioValues[portfolioValues.length - 1],
  };
}

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

const DATA_DIR = path.resolve('public/data');

function loadProxy(proxySymbol: string): Map<string, number | null> {
  const dirs = ['equity', 'bond', 'real_estate', 'commodity'];
  for (const dir of dirs) {
    const filePath = path.join(DATA_DIR, 'proxies', dir, `${proxySymbol.toLowerCase()}.csv`);
    if (fs.existsSync(filePath)) {
      const prices = loadCSV(filePath);
      return computeMonthlyReturns(prices);
    }
  }
  throw new Error(`Proxy not found: ${proxySymbol}`);
}

// ---------------------------------------------------------------------------
// Baseline values (recorded from current correct engine output)
// These are used as regression targets — if the engine changes, these break.
// ---------------------------------------------------------------------------

interface Baseline {
  cagr: number;
  stdDev: number;
  maxDD: number;
}

const BASELINES: Record<string, { range: string; values: Baseline }> = {
  '100% SPY (2016-04 to 2023-09)': {
    range: '2016-04_to_2023-09',
    values: { cagr: 0.1294, stdDev: 0.1238, maxDD: -0.1928 },
  },
  '60/40 VTI/BND (2016-04 to 2023-09)': {
    range: '2016-04_to_2023-09',
    values: { cagr: 0.0768, stdDev: 0.0759, maxDD: -0.1813 },
  },
  'Permanent Port. (2016-04 to 2023-09)': {
    range: '2016-04_to_2023-09',
    values: { cagr: 0.0406, stdDev: 0.0590, maxDD: -0.1559 },
  },
};

// ---------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------

interface CheckResult {
  name: string;
  metric: string;
  actual: number;
  expected: number;
  delta: number;
  passed: boolean;
}

const TOLERANCES = {
  cagr: 0.001,    // ±0.1pp — tight, compounding errors are serious
  stdDev: 0.002,   // ±0.2pp
  maxDD: 0.005,    // ±0.5pp
};

function pct(n: number): string {
  return (n * 100).toFixed(2) + '%';
}

function pp(n: number): string {
  return (n * 100).toFixed(3) + ' pp';
}

function checkBaseline(
  name: string,
  expected: Baseline,
  actual: BacktestResult,
): CheckResult[] {
  return [
    {
      name,
      metric: 'CAGR',
      actual: actual.cagr,
      expected: expected.cagr,
      delta: Math.abs(actual.cagr - expected.cagr),
      passed: Math.abs(actual.cagr - expected.cagr) <= TOLERANCES.cagr,
    },
    {
      name,
      metric: 'StdDev',
      actual: actual.stdDev,
      expected: expected.stdDev,
      delta: Math.abs(actual.stdDev - expected.stdDev),
      passed: Math.abs(actual.stdDev - expected.stdDev) <= TOLERANCES.stdDev,
    },
    {
      name,
      metric: 'MaxDD',
      actual: actual.maxDD,
      expected: expected.maxDD,
      delta: Math.abs(actual.maxDD - expected.maxDD),
      passed: Math.abs(actual.maxDD - expected.maxDD) <= TOLERANCES.maxDD,
    },
  ];
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

console.log('╔══════════════════════════════════════════╗');
console.log('║   Backtest Cross-Validation — M3       ║');
console.log('╚══════════════════════════════════════════╝\n');

// Test range
const startDate = '2016-04';
const endDate = '2023-09';
const months = buildMonthGrid(startDate, endDate);
console.log(`Test period: ${startDate} to ${endDate} (${months.length} months)\n`);

// Load proxy returns
const sp500Returns = loadProxy('SP500_TR');
const bondReturns = loadProxy('US_AGG_BOND_TR');
const tltReturns = loadProxy('US_LONG_TR');
const gldReturns = loadProxy('GOLD_SPOT');
const shyReturns = loadProxy('CASH');

const spyAligned = alignedReturns(sp500Returns, months);
const bndAligned = alignedReturns(bondReturns, months);
const tltAligned = alignedReturns(tltReturns, months);
const gldAligned = alignedReturns(gldReturns, months);
const shyAligned = alignedReturns(shyReturns, months);

// Test A: 100% SPY
const resultA = runBacktest(
  [{ targetWeight: 1.0, expenseRatio: 0.0003 }],
  [spyAligned],
  months, 10000, 'annual',
);

// Test B: 60/40 VTI/BND
const resultB = runBacktest(
  [
    { targetWeight: 0.60, expenseRatio: 0.0003 },
    { targetWeight: 0.40, expenseRatio: 0.0003 },
  ],
  [spyAligned, bndAligned],
  months, 10000, 'annual',
);

// Test C: Permanent Portfolio
const resultC = runBacktest(
  [
    { targetWeight: 0.25, expenseRatio: 0.0003 },
    { targetWeight: 0.25, expenseRatio: 0.0015 },
    { targetWeight: 0.25, expenseRatio: 0.0040 },
    { targetWeight: 0.25, expenseRatio: 0.0015 },
  ],
  [spyAligned, tltAligned, gldAligned, shyAligned],
  months, 10000, 'annual',
);

const actuals: Record<string, BacktestResult> = {
  '100% SPY (2016-04 to 2023-09)': resultA,
  '60/40 VTI/BND (2016-04 to 2023-09)': resultB,
  'Permanent Port. (2016-04 to 2023-09)': resultC,
};

// Run checks
const allChecks: CheckResult[] = [];
for (const [name, baseline] of Object.entries(BASELINES)) {
  const actual = actuals[name];
  const checks = checkBaseline(name, baseline.values, actual);

  console.log(`${name}:`);
  for (const c of checks) {
    const status = c.passed ? '✅' : '❌';
    console.log(`  ${c.metric}: actual=${pct(c.actual)} expected=${pct(c.expected)} Δ=${pp(c.delta)} ${status}`);
    allChecks.push(c);
  }
  console.log();
}

// Summary
const failures = allChecks.filter(c => !c.passed);
if (failures.length === 0) {
  console.log('✅ All checks passed. Engine and data are consistent with baseline.');
} else {
  console.log(`❌ ${failures.length} check(s) failed:`);
  for (const f of failures) {
    console.log(`   ${f.name} / ${f.metric}: actual=${pct(f.actual)} expected=${pct(f.expected)} Δ=${pp(f.delta)}`);
  }
  console.log('\n⚠️  Engine or data regression detected. Review recent changes.');
  process.exit(1);
}
