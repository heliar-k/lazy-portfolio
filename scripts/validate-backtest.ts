/**
 * Cross-validation script: compares our backtest engine output against
 * reference values from lazyportfolioetf.com and other sources.
 *
 * Usage:
 *   npx tsx scripts/validate-backtest.ts              # Run all test cases
 *   npx tsx scripts/validate-backtest.ts --case=0     # Run single case by index
 *   npx tsx scripts/validate-backtest.ts --verbose    # Print monthly differences
 *
 * Reference values are stored in scripts/fixtures/reference-values.json.
 * To update references: manually extract values from the reference website,
 * edit the JSON file, and update the `retrievedAt` field.
 */

import * as fs from 'fs';
import * as path from 'path';
import { runBacktest } from '../src/engine/backtest';
import { computeMonthlyReturns } from '../src/engine/returns';
import type {
  BacktestParameters,
  MonthlyReturnPoint,
  MonthlyPricePoint,
  PortfolioHolding,
  AssetIdentifier,
} from '../src/engine/types';

const DATA_DIR = path.resolve('public/data');
const FIXTURES_PATH = path.resolve('scripts/fixtures/reference-values.json');

// ---------------------------------------------------------------------------
// Tolerances (from plan)
// ---------------------------------------------------------------------------

const TOL: Record<string, number> = {
  cagr: 0.003,
  stdDevAnnualized: 0.007,
  maxDrawdown: 0.02,
  finalCapital: 0.05,
  totalReturn: 0.05,
  annualReturn: 0.02,
};

// ---------------------------------------------------------------------------
// Reference fixture types
// ---------------------------------------------------------------------------

interface ReferenceCase {
  site: string;
  url: string;
  retrievedAt: string;
  parameters: {
    startDate: string;
    endDate: string;
    initialCapital: number;
    rebalancing: { type: 'calendar'; frequency: 'monthly' | 'quarterly' | 'annual' };
    inflationAdjusted: boolean;
    displayCurrency: string;
  };
  holdings: { symbol: string; targetWeight: number }[];
  metrics: {
    finalCapital?: number;
    totalReturn?: number;
    cagr: number;
    stdDevAnnualized?: number;
    maxDrawdown?: number;
  };
  annualReturns?: Record<string, number>;
}

// ---------------------------------------------------------------------------
// Data loading (disk-based, no browser fetch)
// ---------------------------------------------------------------------------

interface EtfMapEntry {
  symbol: string;
  proxySymbol: string;
  name: string;
  assetClass: string;
  region: string;
  currency: string;
  provider: string;
  expenseRatio: number;
  inceptionDate: string;
}

function loadEtfMap(): EtfMapEntry[] {
  return JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'etf_map.json'), 'utf-8'));
}

function findProxyFile(proxySymbol: string): string | null {
  const key = proxySymbol.toLowerCase();
  const dirs = ['equity', 'bond', 'real_estate', 'commodity'];
  for (const dir of dirs) {
    const p = path.join(DATA_DIR, 'proxies', dir, `${key}.csv`);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

function loadPriceSeries(proxySymbol: string): MonthlyPricePoint[] {
  const filePath = findProxyFile(proxySymbol);
  if (!filePath) throw new Error(`Proxy data not found for: ${proxySymbol}`);
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.trim().split('\n');
  const points: MonthlyPricePoint[] = [];
  for (let i = 1; i < lines.length; i++) {
    const [date, priceStr] = lines[i].split(',');
    const price = parseFloat(priceStr);
    if (date && !isNaN(price)) points.push({ date, price });
  }
  return points;
}

function loadCpiSeries(): Map<string, number> {
  const filePath = path.join(DATA_DIR, 'inflation/us_cpi.csv');
  if (!fs.existsSync(filePath)) return new Map();
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.trim().split('\n');
  const map = new Map<string, number>();
  for (let i = 1; i < lines.length; i++) {
    const [date, valueStr] = lines[i].split(',');
    const value = parseFloat(valueStr);
    if (date && !isNaN(value)) map.set(date, value);
  }
  return map;
}

// ---------------------------------------------------------------------------
// Test runner
// ---------------------------------------------------------------------------

interface MetricCheck {
  name: string;
  ours: number;
  ref: number;
  tolerance: number;
  passed: boolean;
}

function inTolerance(ours: number, ref: number, tol: number): boolean {
  return Math.abs(ours - ref) <= tol;
}

function runSingleCase(refCase: ReferenceCase, etfMap: EtfMapEntry[], cpiSeries: Map<string, number>): {
  passed: boolean;
  checks: MetricCheck[];
  error?: string;
} {
  const etfBySymbol = new Map(etfMap.map(e => [e.symbol, e]));

  // Build holdings
  const holdings: PortfolioHolding[] = [];
  for (const h of refCase.holdings) {
    const entry = etfBySymbol.get(h.symbol);
    if (!entry) {
      return { passed: false, checks: [], error: `ETF "${h.symbol}" not in etf_map.json` };
    }
    holdings.push({
      asset: {
        symbol: entry.symbol,
        name: entry.name,
        assetClass: entry.assetClass as AssetIdentifier['assetClass'],
        region: entry.region as AssetIdentifier['region'],
        currency: entry.currency,
        provider: entry.provider,
        expenseRatio: entry.expenseRatio,
        inceptionDate: entry.inceptionDate,
      },
      targetWeight: h.targetWeight,
    });
  }

  // Load return series for each holding
  const assetReturnSeries = new Map<string, MonthlyReturnPoint[]>();
  for (const h of holdings) {
    const entry = etfBySymbol.get(h.asset.symbol)!;
    if (!entry.proxySymbol) {
      return { passed: false, checks: [], error: `ETF "${h.asset.symbol}" has no proxy` };
    }
    const prices = loadPriceSeries(entry.proxySymbol);
    const returns = computeMonthlyReturns(prices);
    assetReturnSeries.set(h.asset.symbol, returns);
  }

  // Build parameters
  const params: BacktestParameters = {
    portfolio: { id: '', name: refCase.site, holdings, tags: [] },
    startDate: refCase.parameters.startDate,
    endDate: refCase.parameters.endDate,
    initialCapital: refCase.parameters.initialCapital,
    displayCurrency: refCase.parameters.displayCurrency as BacktestParameters['displayCurrency'],
    inflationRegion: 'US',
    inflationAdjusted: refCase.parameters.inflationAdjusted,
    rebalancing: refCase.parameters.rebalancing,
    cashflows: [],
  };

  // Run backtest
  const result = runBacktest(params, assetReturnSeries, new Map(), cpiSeries);

  // Compare metrics
  const checks: MetricCheck[] = [];
  const ref = refCase.metrics;

  checks.push({
    name: 'CAGR',
    ours: result.metrics.cagr,
    ref: ref.cagr,
    tolerance: TOL.cagr,
    passed: inTolerance(result.metrics.cagr, ref.cagr, TOL.cagr),
  });

  if (ref.stdDevAnnualized !== undefined) {
    checks.push({
      name: 'StdDev',
      ours: result.metrics.stdDevAnnualized,
      ref: ref.stdDevAnnualized,
      tolerance: TOL.stdDevAnnualized,
      passed: inTolerance(result.metrics.stdDevAnnualized, ref.stdDevAnnualized, TOL.stdDevAnnualized),
    });
  }

  if (ref.maxDrawdown !== undefined) {
    checks.push({
      name: 'MaxDD',
      ours: result.metrics.maxDrawdown,
      ref: ref.maxDrawdown,
      tolerance: TOL.maxDrawdown,
      passed: inTolerance(result.metrics.maxDrawdown, ref.maxDrawdown, TOL.maxDrawdown),
    });
  }

  if (ref.finalCapital !== undefined) {
    const oursFinal = result.timeSeries[result.timeSeries.length - 1]?.portfolioValue ?? 0;
    const ratio = oursFinal / ref.finalCapital;
    checks.push({
      name: 'FinalCapital',
      ours: oursFinal,
      ref: ref.finalCapital,
      tolerance: TOL.finalCapital,
      passed: Math.abs(ratio - 1) <= TOL.finalCapital,
    });
  }

  if (ref.totalReturn !== undefined) {
    checks.push({
      name: 'TotalReturn',
      ours: result.metrics.totalReturn,
      ref: ref.totalReturn,
      tolerance: TOL.totalReturn,
      passed: inTolerance(result.metrics.totalReturn, ref.totalReturn, TOL.totalReturn),
    });
  }

  // Annual return spot checks
  if (refCase.annualReturns) {
    const annualMap = new Map<string, number>();
    for (const ap of result.annualReturns) {
      annualMap.set(String(ap.year), ap.return_);
    }
    for (const [year, refReturn] of Object.entries(refCase.annualReturns)) {
      const oursReturn = annualMap.get(year);
      if (oursReturn !== undefined) {
        checks.push({
          name: `Annual ${year}`,
          ours: oursReturn,
          ref: refReturn,
          tolerance: TOL.annualReturn,
          passed: inTolerance(oursReturn, refReturn, TOL.annualReturn),
        });
      }
    }
  }

  const passed = checks.every(c => c.passed);
  return { passed, checks };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function fmtPct(v: number): string {
  return `${(v * 100).toFixed(2)}%`;
}

function fmtMoney(v: number): string {
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

function printCheck(check: MetricCheck): string {
  const status = check.passed ? '✅' : '❌';
  let oursStr: string;
  let refStr: string;
  if (check.name === 'FinalCapital') {
    oursStr = fmtMoney(check.ours);
    refStr = fmtMoney(check.ref);
  } else {
    oursStr = fmtPct(check.ours);
    refStr = fmtPct(check.ref);
  }
  const delta = check.name === 'FinalCapital'
    ? `${((check.ours / check.ref - 1) * 100).toFixed(1)}%`
    : `${((check.ours - check.ref) * 100).toFixed(2)}pp`;
  return `  ${check.name.padEnd(14)} ${oursStr.padStart(8)}  (ref: ${refStr.padStart(8)}, Δ=${delta.padStart(8)})  ${status}`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function main() {
  const args = process.argv.slice(2);
  const verbose = args.includes('--verbose');
  const caseArg = args.find(a => a.startsWith('--case='));
  const singleIndex = caseArg ? parseInt(caseArg.split('=')[1], 10) : undefined;

  if (!fs.existsSync(FIXTURES_PATH)) {
    console.error(`Reference fixtures not found: ${FIXTURES_PATH}`);
    console.log('Create the file with reference values from lazyportfolioetf.com to enable validation.');
    process.exit(1);
  }

  console.log('=== Cross-Validation ===\n');

  // Load data
  console.log('Loading data...');
  const etfMap = loadEtfMap();
  console.log(`  ETF map: ${etfMap.length} entries`);
  const cpiSeries = loadCpiSeries();
  console.log(`  CPI: ${cpiSeries.size} data points\n`);

  // Load test cases
  const cases: ReferenceCase[] = JSON.parse(fs.readFileSync(FIXTURES_PATH, 'utf-8'));

  const indices = singleIndex !== undefined
    ? [singleIndex]
    : cases.map((_, i) => i);

  let totalPassed = 0;
  let totalFailed = 0;

  for (const idx of indices) {
    if (idx < 0 || idx >= cases.length) {
      console.error(`Invalid case index: ${idx} (0-${cases.length - 1})`);
      continue;
    }

    const refCase = cases[idx];
    console.log(`Case ${idx}: ${refCase.site} — ${refCase.parameters.startDate} to ${refCase.parameters.endDate}`);
    console.log(`  Holdings: ${refCase.holdings.map(h => `${h.symbol} ${(h.targetWeight * 100).toFixed(0)}%`).join(', ')}`);
    console.log(`  Inflation adjusted: ${refCase.parameters.inflationAdjusted}`);
    console.log(`  Reference retrieved: ${refCase.retrievedAt}`);

    const { passed, checks, error } = runSingleCase(refCase, etfMap, cpiSeries);

    if (error) {
      console.log(`  ❌ Error: ${error}\n`);
      totalFailed++;
      continue;
    }

    for (const check of checks) {
      console.log(printCheck(check));
    }

    if (passed) {
      console.log(`  ✅ PASSED (${checks.filter(c => c.passed).length}/${checks.length})`);
      totalPassed++;
    } else {
      console.log(`  ❌ FAILED (${checks.filter(c => c.passed).length}/${checks.length})`);
      if (verbose) {
        for (const check of checks.filter(c => !c.passed)) {
          console.log(`     → ${check.name}: expected ~${fmtPct(check.ref)}, got ${fmtPct(check.ours)}`);
        }
      }
      totalFailed++;
    }

    console.log();
  }

  // Summary
  console.log('═══════════════════════════════════════');
  console.log(`Cases:  ${totalPassed + totalFailed} total, ${totalPassed} passed, ${totalFailed} failed`);
  if (totalFailed > 0) {
    console.log('\nReview failed checks above. Common causes:');
    console.log('  - Stale proxy data: run `npm run update-data`');
    console.log('  - Proxy unavailable: Yahoo Finance data not fetched');
    console.log('  - Reference values outdated: update fixtures/reference-values.json');
    process.exit(1);
  } else {
    console.log('All validations passed.');
  }
}

main();
