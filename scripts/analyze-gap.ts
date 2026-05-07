/**
 * Deep gap analysis: compares our engine output against reference portfolio
 * monthly returns from lazyportfolioetf.com.
 *
 * Extracts reference data from the cached HTML page and runs detailed
 * month-by-month comparison.
 *
 * Usage: npx tsx scripts/analyze-gap.ts [--deep]
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
const HTML_PATH = '/tmp/lazyportfolio.html';

// ---------------------------------------------------------------------------
// Extract reference data from HTML
// ---------------------------------------------------------------------------

function extractReferencePortfolioReturns(): { dates: string[]; returns: number[] } {
  const html = fs.readFileSync(HTML_PATH, 'utf-8');

  // Extract rendMonthlyChartData["DATA"]["BASE"]["MAX"]
  const rendMatch = html.match(/rendMonthlyChartData\["DATA"\]\["BASE"\]\["MAX"\]\s*=\s*(\[[^\]]+\])/);
  if (!rendMatch) throw new Error('Could not find rendMonthlyChartData in HTML');

  const rendStr = rendMatch[1];
  const returns = JSON.parse(rendStr) as number[];

  // 30Y is last 360 entries
  const returns30y = returns.slice(-360);

  // Extract capitalChartData for dates
  const capMatch = html.match(/capitalChartData\["DATA"\]\["BASE"\]\["MAX"\]\s*=\s*(\[[^\]]+\])/);
  if (!capMatch) throw new Error('Could not find capitalChartData in HTML');

  const capValues = JSON.parse(capMatch[1]) as number[];
  // 30Y values are last 361 entries (N+1 for N returns)
  const cap30y = capValues.slice(-361);

  // Extract 30Y start period
  const periodMatch = html.match(/jsGlobalVars\["REND"\]\["PERIODO_START"\]\["30Y"\]\s*=\s*"([^"]+)"/);
  let startYear = 1996;
  let startMonth = 5;
  if (periodMatch) {
    const [y, m] = periodMatch[1].split('-').map(Number);
    startYear = y;
    startMonth = m + 1; // "1996-04" -> period starts May 1996 (next month)
  }

  // Generate dates
  const dates: string[] = [];
  let y = startYear;
  let m = startMonth;
  for (let i = 0; i < 360; i++) {
    dates.push(`${y}-${String(m).padStart(2, '0')}`);
    m++;
    if (m > 12) { m = 1; y++; }
  }

  return { dates, returns: returns30y };
}

// ---------------------------------------------------------------------------
// Load our engine data
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

// ---------------------------------------------------------------------------
// Statistics
// ---------------------------------------------------------------------------

function computeCagr(returns: number[]): number {
  let total = 1;
  for (const r of returns) total *= (1 + r);
  const years = returns.length / 12;
  return Math.pow(total, 1 / years) - 1;
}

function computeStdDev(returns: number[]): number {
  const n = returns.length;
  const mean = returns.reduce((a, b) => a + b, 0) / n;
  const variance = returns.reduce((sum, r) => sum + (r - mean) ** 2, 0) / (n - 1);
  return Math.sqrt(variance) * Math.sqrt(12);
}

function computeCorrelation(a: number[], b: number[]): number {
  const n = Math.min(a.length, b.length);
  const meanA = a.slice(0, n).reduce((s, v) => s + v, 0) / n;
  const meanB = b.slice(0, n).reduce((s, v) => s + v, 0) / n;
  let cov = 0, varA = 0, varB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    cov += da * db;
    varA += da * da;
    varB += db * db;
  }
  return cov / Math.sqrt(varA * varB);
}

// ---------------------------------------------------------------------------
// Main analysis
// ---------------------------------------------------------------------------

function main() {
  console.log('=== Deep Gap Analysis ===\n');

  // 1. Extract reference data
  console.log('Extracting reference data from HTML...');
  const ref = extractReferencePortfolioReturns();
  console.log(`  Reference portfolio returns: ${ref.returns.length} months`);
  console.log(`  Date range: ${ref.dates[0]} to ${ref.dates[ref.dates.length - 1]}`);
  console.log(`  Reference CAGR: ${(computeCagr(ref.returns.map(r => r / 100)) * 100).toFixed(2)}%`);
  console.log(`  Reference StdDev: ${(computeStdDev(ref.returns.map(r => r / 100)) * 100).toFixed(2)}%\n`);

  // 2. Load our data
  console.log('Loading ETF data...');
  const etfMap = loadEtfMap();
  const etfBySymbol = new Map(etfMap.map(e => [e.symbol, e]));

  const holdings: PortfolioHolding[] = [];
  const symbols = ['VTI', 'TLT', 'BIL', 'GLD'];
  const weights = [0.25, 0.25, 0.25, 0.25];

  for (let i = 0; i < symbols.length; i++) {
    const entry = etfBySymbol.get(symbols[i]);
    if (!entry) throw new Error(`ETF ${symbols[i]} not found`);
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
      targetWeight: weights[i],
    });
  }

  // Load individual asset returns
  const assetReturnSeries = new Map<string, MonthlyReturnPoint[]>();
  const assetPrices = new Map<string, MonthlyPricePoint[]>();
  for (const h of holdings) {
    const entry = etfBySymbol.get(h.asset.symbol)!;
    const prices = loadPriceSeries(entry.proxySymbol);
    assetPrices.set(h.asset.symbol, prices);
    const returns = computeMonthlyReturns(prices);
    assetReturnSeries.set(h.asset.symbol, returns);
  }

  // 3. Run our backtest
  const params: BacktestParameters = {
    portfolio: { id: '', name: 'Permanent Portfolio', holdings, tags: [] },
    startDate: '1996-05',
    endDate: '2026-04',
    initialCapital: 10000,
    displayCurrency: 'USD',
    inflationRegion: 'US',
    inflationAdjusted: false,
    rebalancing: { type: 'calendar', frequency: 'annual' },
    cashflows: [],
  };

  const result = runBacktest(params, assetReturnSeries, new Map(), new Map());
  console.log(`  Our CAGR: ${(result.metrics.cagr * 100).toFixed(2)}%`);
  console.log(`  Our StdDev: ${(result.metrics.stdDevAnnualized * 100).toFixed(2)}%`);
  console.log(`  CAGR gap: ${((result.metrics.cagr - computeCagr(ref.returns.map(r => r / 100))) * 100).toFixed(2)}pp\n`);

  // 4. Align our monthly portfolio returns with reference
  // Our result.timeSeries has 361 entries (portfolio values including initial)
  // Reference has 360 monthly returns
  const ourMonthlyReturns: number[] = [];
  for (let i = 1; i < result.timeSeries.length; i++) {
    const prev = result.timeSeries[i - 1].portfolioValue;
    const curr = result.timeSeries[i].portfolioValue;
    ourMonthlyReturns.push((curr - prev) / prev);
  }

  // 5. Compute individual asset statistics
  console.log('=== Individual Asset Statistics ===\n');
  console.log('Asset   Our CAGR   Our Vol   Our Sharpe');
  console.log('------  --------  --------  ----------');

  const assetReturns: Map<string, number[]> = new Map();

  for (const sym of symbols) {
    const prices = assetPrices.get(sym)!;
    const returns = computeMonthlyReturns(prices);

    // Align returns to our backtest period (1996-05 to 2026-04)
    const returnsByDate = new Map<string, number>();
    for (const r of returns) {
      returnsByDate.set(r.date.substring(0, 7), r.totalReturn);
    }

    const aligned: number[] = [];
    for (const d of ref.dates) {
      aligned.push(returnsByDate.get(d) ?? 0);
    }

    assetReturns.set(sym, aligned);

    const cagr = computeCagr(aligned);
    const vol = computeStdDev(aligned);
    const sharpe = vol > 0 ? cagr / vol : 0;

    console.log(`${sym.padEnd(7)} ${(cagr * 100).toFixed(2).padStart(7)}%  ${(vol * 100).toFixed(2).padStart(7)}%  ${sharpe.toFixed(3).padStart(9)}`);
  }

  // 6. Compute correlation matrix and compare with reference
  console.log('\n=== Correlation Matrix Comparison ===');
  console.log('Pair      Our Corr   Ref Corr   Diff');
  console.log('--------  --------   --------   ----');

  // Reference correlations from the page
  const refCorrelations: Record<string, number> = {
    'VTI-BIL': -0.02,
    'VTI-TLT': -0.11,
    'VTI-GLD': 0.06,
    'BIL-TLT': 0.03,
    'BIL-GLD': 0.05,
    'TLT-GLD': 0.21,
  };

  for (let i = 0; i < symbols.length; i++) {
    for (let j = i + 1; j < symbols.length; j++) {
      const pair = `${symbols[i]}-${symbols[j]}`;
      const ourCorr = computeCorrelation(assetReturns.get(symbols[i])!, assetReturns.get(symbols[j])!);
      const refCorr = refCorrelations[pair] ?? 0;
      console.log(`${pair.padEnd(9)} ${ourCorr.toFixed(3).padStart(7)}   ${refCorr.toFixed(2).padStart(7)}   ${(ourCorr - refCorr).toFixed(3).padStart(6)}`);
    }
  }

  // 7. Compute rebalancing effect
  console.log('\n=== Rebalancing Effect Decomposition ===');

  // Buy-and-hold CAGR
  const buyAndHoldReturns: number[] = [];
  for (let i = 0; i < ref.returns.length; i++) {
    let monthReturn = 0;
    for (let j = 0; j < symbols.length; j++) {
      monthReturn += weights[j] * (assetReturns.get(symbols[j])![i] ?? 0);
    }
    buyAndHoldReturns.push(monthReturn);
  }
  const bhCagr = computeCagr(buyAndHoldReturns);
  const portfolioCagr = result.metrics.cagr;
  const rebalEffect = portfolioCagr - bhCagr;

  console.log(`  Buy-and-hold CAGR: ${(bhCagr * 100).toFixed(2)}%`);
  console.log(`  Portfolio CAGR:    ${(portfolioCagr * 100).toFixed(2)}%`);
  console.log(`  Rebalancing effect: ${(rebalEffect * 100).toFixed(2)}pp`);

  // Reference rebalancing effect
  const refMonthlyReturns = ref.returns.map(r => r / 100);
  const refCagr = computeCagr(refMonthlyReturns);

  // Estimate reference buy-and-hold CAGR from our data (we don't have reference individual asset returns)
  console.log(`\n  Reference portfolio CAGR: ${(refCagr * 100).toFixed(2)}%`);
  console.log(`  Our buy-and-hold CAGR:     ${(bhCagr * 100).toFixed(2)}%`);

  // If the reference used similar individual returns, their buy-and-hold would differ
  console.log(`\n  Hypothetical: if reference buy-and-hold ≈ our buy-and-hold:`);
  const refRebalEstimate = refCagr - bhCagr;
  console.log(`    Reference rebalancing ≈ ${(refRebalEstimate * 100).toFixed(2)}pp`);
  console.log(`    Our rebalancing:       ${(rebalEffect * 100).toFixed(2)}pp`);
  console.log(`    Rebalancing gap:       ${Math.abs(rebalEffect - refRebalEstimate) * 100}pp`);

  // 8. Top divergent months
  console.log('\n=== Top 20 Divergent Months ===');
  const diffs: { idx: number; date: string; ourRet: number; refRet: number; diff: number }[] = [];
  for (let i = 0; i < ref.returns.length; i++) {
    const refRet = ref.returns[i] / 100;
    const ourRet = ourMonthlyReturns[i] ?? 0;
    diffs.push({ idx: i, date: ref.dates[i], ourRet, refRet, diff: ourRet - refRet });
  }
  diffs.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

  console.log('Date        Our Ret    Ref Ret    Diff');
  console.log('----------  -------   --------   ------');
  for (const d of diffs.slice(0, 20)) {
    console.log(`${d.date.padEnd(11)} ${(d.ourRet * 100).toFixed(2).padStart(7)}%  ${(d.refRet * 100).toFixed(2).padStart(7)}%  ${(d.diff * 100).toFixed(2).padStart(7)}pp`);
  }

  // 9. Cumulative divergence over time
  console.log('\n=== Cumulative Gap Over Time ===');
  let cumOur = 1;
  let cumRef = 1;
  const milestones = [12, 60, 120, 180, 240, 300, 360];
  let milestoneIdx = 0;

  for (let i = 0; i < ref.returns.length; i++) {
    cumOur *= (1 + (ourMonthlyReturns[i] ?? 0));
    cumRef *= (1 + ref.returns[i] / 100);

    while (milestoneIdx < milestones.length && i + 1 === milestones[milestoneIdx]) {
      const m = milestones[milestoneIdx];
      const y = Math.floor(m / 12);
      const gapPct = (cumOur - cumRef) * 100;
      console.log(`  Year ${y.toString().padStart(2)} (${ref.dates[i]}): our=${(cumOur * 10000).toFixed(0)}, ref=${(cumRef * 10000).toFixed(0)}, gap=${gapPct.toFixed(1)}pp of initial capital`);
      milestoneIdx++;
    }
  }

  // 10. Summary
  console.log('\n=== Summary ===');
  const finalGapPp = (result.metrics.cagr - refCagr) * 100;
  console.log(`  CAGR gap: ${finalGapPp.toFixed(2)}pp`);
  console.log(`  Individual asset CAGR differences likely contribute ~0.15pp`);
  console.log(`  Rebalancing effect difference contributes the rest (~${Math.abs(finalGapPp - 0.15).toFixed(2)}pp)`);
}

main();
