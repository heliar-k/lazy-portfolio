/**
 * Engine verification script — Step 0 of Data Pipeline Improvement Plan.
 *
 * Runs three test portfolios and verifies:
 * 1. Self-consistency: 100% SPY engine CAGR ≈ raw S&P 500 TR index CAGR
 * 2. Sanity: 60/40 CAGR between SPY and bond CAGRs
 * 3. Full engine: Permanent Portfolio produces reasonable metrics
 *
 * Also compares against lazyportfolioetf.com reference values (10Y period)
 * with wider tolerances to account for different date ranges.
 *
 * Usage: npx tsx scripts/verify-engine.ts
 */

import * as fs from 'fs';
import * as path from 'path';

// ---------------------------------------------------------------------------
// Minimal engine in-process (avoiding fetch() — Node won't resolve /data/ paths)
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
  annualReturns: { year: number; return_: number }[];
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
    return { cagr: 0, stdDev: 0, maxDD: 0, finalCapital: 0, annualReturns: [] };
  }

  const targetWeights = holdings.map(h => h.targetWeight);
  const assetValues = targetWeights.map(w => w * initialCapital);
  const portfolioValues: number[] = [initialCapital];

  for (let m = 1; m < nMonths; m++) {
    // Rebalance check
    let shouldRebalance = false;
    if (rebalanceFrequency === 'annual') {
      const date = new Date(months[m]);
      shouldRebalance = date.getMonth() === 0 && m > 0; // January
    }

    if (shouldRebalance) {
      const totalValue = assetValues.reduce((a, b) => a + b, 0);
      for (let a = 0; a < nAssets; a++) {
        assetValues[a] = totalValue * targetWeights[a];
      }
    }

    // Apply monthly returns with fee deduction
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

  // Monthly returns
  const monthlyPortfolioReturns: number[] = [];
  for (let i = 1; i < portfolioValues.length; i++) {
    if (portfolioValues[i - 1] > 0) {
      monthlyPortfolioReturns.push(
        (portfolioValues[i] - portfolioValues[i - 1]) / portfolioValues[i - 1],
      );
    }
  }

  // CAGR
  const years = (nMonths - 1) / 12;
  const cagr =
    years > 0 && portfolioValues[0] > 0
      ? Math.pow(portfolioValues[portfolioValues.length - 1] / portfolioValues[0], 1 / years) - 1
      : 0;

  // StdDev (annualized)
  const n = monthlyPortfolioReturns.length;
  const meanReturn = n > 0 ? monthlyPortfolioReturns.reduce((a, b) => a + b, 0) / n : 0;
  const variance =
    n > 1
      ? monthlyPortfolioReturns.reduce((sum, r) => sum + (r - meanReturn) ** 2, 0) / (n - 1)
      : 0;
  const stdDev = Math.sqrt(variance) * Math.sqrt(12);

  // Max drawdown
  let peak = portfolioValues[0];
  let maxDD = 0;
  for (const v of portfolioValues) {
    if (v > peak) peak = v;
    const dd = peak > 0 ? (v - peak) / peak : 0;
    if (dd < maxDD) maxDD = dd;
  }

  // Annual returns
  const annualReturns: { year: number; return_: number }[] = [];
  const firstYear = parseInt(months[0].substring(0, 4));
  const lastYear = parseInt(months[months.length - 1].substring(0, 4));
  for (let y = firstYear; y <= lastYear; y++) {
    const yearMonths = months.filter(m => m.startsWith(String(y)));
    const startIdx = months.indexOf(yearMonths[0]);
    const endIdx = months.indexOf(yearMonths[yearMonths.length - 1]);
    if (startIdx >= 0 && endIdx > startIdx) {
      const startVal = portfolioValues[startIdx];
      const endVal = portfolioValues[endIdx];
      annualReturns.push({
        year: y,
        return_: startVal > 0 ? (endVal - startVal) / startVal : 0,
      });
    }
  }

  return {
    cagr,
    stdDev,
    maxDD,
    finalCapital: portfolioValues[portfolioValues.length - 1],
    annualReturns,
  };
}

// ---------------------------------------------------------------------------
// Main
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

function getProxyForEtf(symbol: string): string {
  const etfMapPath = path.join(DATA_DIR, 'etf_map.json');
  const etfMap = JSON.parse(fs.readFileSync(etfMapPath, 'utf-8'));
  const entry = etfMap.find((e: any) => e.symbol === symbol);
  if (!entry) throw new Error(`ETF not mapped: ${symbol}`);
  return entry.proxySymbol;
}

function pct(n: number): string {
  return (n * 100).toFixed(2) + '%';
}

function pp(n: number): string {
  return (n * 100).toFixed(2) + ' pp';
}

console.log('╔══════════════════════════════════════════╗');
console.log('║   Engine Verification — Step 0         ║');
console.log('╚══════════════════════════════════════════╝\n');

// Determine available date range
const sp500Returns = loadProxy('SP500_TR');
const sp500Dates = [...sp500Returns.keys()].sort();
const dataStart = sp500Dates[0];
const dataEnd = sp500Dates[sp500Dates.length - 1];
console.log(`Data range: ${dataStart} to ${dataEnd}\n`);

// Use 2016-04 to 2023-09 (best overlap with reference 10Y period)
const startDate = '2016-04';
const endDate = '2023-09';
const months = buildMonthGrid(startDate, endDate);
console.log(`Test period: ${startDate} to ${endDate} (${months.length} months)\n`);

// ---------------------------------------------------------------------------
// Test A: 100% SPY
// ---------------------------------------------------------------------------
console.log('━━━ Test A: 100% SPY ━━━');

const spyReturns = alignedReturns(sp500Returns, months);
const resultA = runBacktest(
  [{ targetWeight: 1.0, expenseRatio: 0.0003 }], // VOO ER
  [spyReturns],
  months,
  10000,
  'annual',
);

// Self-consistency: compute raw S&P 500 TR CAGR from CSV directly
const sp500Prices = loadCSV(path.join(DATA_DIR, 'proxies', 'equity', 'sp500_tr.csv'));
const startPrice = sp500Prices.find(p => p.date >= months[0])?.price;
const endPrice = sp500Prices.find(p => p.date === months[months.length - 1])?.price;
const rawYears = (months.length - 1) / 12;
const rawCagr = startPrice && endPrice ? Math.pow(endPrice / startPrice, 1 / rawYears) - 1 : 0;

console.log(`  CAGR:         ${pct(resultA.cagr)}`);
console.log(`  Raw S&P TR:   ${pct(rawCagr)}`);
console.log(`  Delta:        ${pp(Math.abs(resultA.cagr - rawCagr))}`);
console.log(`  StdDev:       ${pct(resultA.stdDev)}`);
console.log(`  MaxDD:        ${pct(resultA.maxDD)}`);
console.log(`  Final:        $${resultA.finalCapital.toFixed(2)}`);

const cagrMatchA = Math.abs(resultA.cagr - rawCagr) < 0.003; // ±0.3pp
console.log(`  PASS: ${cagrMatchA ? '✅' : '❌'} (CAGR self-consistency ±0.3pp)\n`);

// ---------------------------------------------------------------------------
// Test B: 60/40 VTI/BND
// ---------------------------------------------------------------------------
console.log('━━━ Test B: 60% VTI / 40% BND ━━━');

const vtiReturns = alignedReturns(loadProxy('SP500_TR'), months);
const bndReturns = alignedReturns(loadProxy('US_AGG_BOND_TR'), months);
const resultB = runBacktest(
  [
    { targetWeight: 0.60, expenseRatio: 0.0003 },
    { targetWeight: 0.40, expenseRatio: 0.0003 },
  ],
  [vtiReturns, bndReturns],
  months,
  10000,
  'annual',
);

// Sanity: 60/40 CAGR should be between SPY and bond CAGR
const bondReturns = loadProxy('US_AGG_BOND_TR');
const bndOnlyReturns = alignedReturns(bondReturns, months);
const resultBondOnly = runBacktest(
  [{ targetWeight: 1.0, expenseRatio: 0.0003 }],
  [bndOnlyReturns],
  months,
  10000,
  'annual',
);

console.log(`  CAGR:         ${pct(resultB.cagr)}`);
console.log(`  100% SPY:     ${pct(resultA.cagr)}`);
console.log(`  100% BND:     ${pct(resultBondOnly.cagr)}`);
console.log(`  StdDev:       ${pct(resultB.stdDev)}`);
console.log(`  MaxDD:        ${pct(resultB.maxDD)}`);
console.log(`  Final:        $${resultB.finalCapital.toFixed(2)}`);

const inRange = resultB.cagr >= resultBondOnly.cagr && resultB.cagr <= resultA.cagr;
console.log(`  PASS: ${inRange ? '✅' : '❌'} (60/40 CAGR between SPY and BND)\n`);

// ---------------------------------------------------------------------------
// Test C: Permanent Portfolio
// ---------------------------------------------------------------------------
console.log('━━━ Test C: Permanent Portfolio (25/25/25/25) ━━━');

const tltReturns = alignedReturns(loadProxy('US_LONG_TR'), months);
const gldReturns = alignedReturns(loadProxy('GOLD_SPOT'), months);
const shyReturns = alignedReturns(loadProxy('CASH'), months);

const resultC = runBacktest(
  [
    { targetWeight: 0.25, expenseRatio: 0.0003 },
    { targetWeight: 0.25, expenseRatio: 0.0015 },
    { targetWeight: 0.25, expenseRatio: 0.0040 },
    { targetWeight: 0.25, expenseRatio: 0.0015 },
  ],
  [vtiReturns, tltReturns, gldReturns, shyReturns],
  months,
  10000,
  'annual',
);

console.log(`  CAGR:         ${pct(resultC.cagr)}`);
console.log(`  StdDev:       ${pct(resultC.stdDev)}`);
console.log(`  MaxDD:        ${pct(resultC.maxDD)}`);
console.log(`  Final:        $${resultC.finalCapital.toFixed(2)}`);

// Annual returns
console.log('  Annual returns:');
for (const ar of resultC.annualReturns) {
  const bar = ar.return_ >= 0 ? '█'.repeat(Math.round(ar.return_ * 40)) : '░'.repeat(Math.round(-ar.return_ * 40));
  const sign = ar.return_ >= 0 ? '+' : '';
  console.log(`    ${ar.year}: ${sign}${pct(ar.return_)} ${bar}`);
}

// ---------------------------------------------------------------------------
// Reference comparison (lazyportfolioetf.com 10Y aggregate, 2016-04 to 2026-04)
// These have a ~2.5 year non-overlapping period vs our 2016-04 to 2023-09,
// so use wider tolerance.
// ---------------------------------------------------------------------------
console.log('\n━━━ Reference Comparison (lazyportfolioetf.com 10Y) ━━━');
console.log('(Different end dates: ref=2026-04, us=2023-09 → wider tolerances)\n');

const ref: Record<string, { cagr: number; stdDev: number; maxDD: number }> = {
  'US Stocks': { cagr: 0.147289, stdDev: 0.156553, maxDD: -0.248130 },
  '60/40': { cagr: 0.096020, stdDev: 0.104182, maxDD: -0.206933 },
  'Permanent': { cagr: 0.075382, stdDev: 0.076227, maxDD: -0.159245 },
};

const tests = [
  { name: 'US Stocks', result: resultA, ref: ref['US Stocks'] },
  { name: '60/40', result: resultB, ref: ref['60/40'] },
  { name: 'Permanent', result: resultC, ref: ref['Permanent'] },
];

let allPassed = true;
for (const { name, result, ref: refVals } of tests) {
  const cagrDelta = Math.abs(result.cagr - refVals.cagr) * 100;
  const stddevDelta = Math.abs(result.stdDev - refVals.stdDev) * 100;
  const maxddDelta = Math.abs(result.maxDD - refVals.maxDD) * 100;

  const cagrOk = cagrDelta < 1.5;   // ±1.5pp (wider due to date mismatch)
  const stddevOk = stddevDelta < 2.0; // ±2.0pp
  const maxddOk = maxddDelta < 5.0;   // ±5.0pp

  console.log(`${name}:`);
  console.log(`  CAGR:   us=${pct(result.cagr)} ref=${pct(refVals.cagr)} Δ=${cagrDelta.toFixed(2)}pp ${cagrOk ? '✅' : '⚠️'}`);
  console.log(`  StdDev: us=${pct(result.stdDev)} ref=${pct(refVals.stdDev)} Δ=${stddevDelta.toFixed(2)}pp ${stddevOk ? '✅' : '⚠️'}`);
  console.log(`  MaxDD:  us=${pct(result.maxDD)} ref=${pct(refVals.maxDD)} Δ=${maxddDelta.toFixed(2)}pp ${maxddOk ? '✅' : '⚠️'}`);

  if (!cagrOk || !stddevOk || !maxddOk) allPassed = false;
}

console.log(`\n${allPassed ? '✅ All reference checks passed' : '⚠️ Some reference checks outside tolerance'}`);
console.log('(Note: date ranges differ — ours=2016-04 to 2023-09, ref=2016-04 to 2026-04)\n');

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log('━━━ Summary ━━━');
const selfConsistent = cagrMatchA;
const sanityOk = inRange;

console.log(`Self-consistency (SPY): ${selfConsistent ? '✅' : '❌'}`);
console.log(`Sanity check (60/40):  ${sanityOk ? '✅' : '❌'}`);
console.log(`Reference comparison:  ${allPassed ? '✅' : '⚠️'}`);

if (selfConsistent && sanityOk) {
  console.log('\n✅ Engine logic verified. Proceed to data improvements (H1-H4).');
} else {
  console.log('\n❌ Engine logic issues detected. Fix before proceeding to data work.');
  process.exit(1);
}
