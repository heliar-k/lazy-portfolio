/**
 * Generate China Equity proxy data.
 *
 * Post-2004: FXI (iShares China Large-Cap ETF) prices, normalized to 100.
 * Pre-2004:  MSCI Emerging Markets TR monthly returns used to extend backwards
 *            from FXI's starting value. This preserves MSCI EM's growth rate
 *            pre-2004 while anchoring to FXI's actual level.
 *
 * Usage: npx tsx scripts/generate-china-proxy.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve('public/data/proxies');

interface PricePoint {
  date: string;
  price: number;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

function loadCSV(filePath: string): PricePoint[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.trim().split('\n');
  return lines.slice(1).map(line => {
    const [date, price] = line.split(',');
    return { date, price: parseFloat(price) };
  });
}

function normalizeSeries(data: PricePoint[], baseValue = 100): PricePoint[] {
  if (data.length === 0) return [];
  const factor = baseValue / data[0].price;
  return data.map(p => ({
    date: p.date,
    price: Math.round(p.price * factor * 10000) / 10000,
  }));
}

function writeCSV(filePath: string, data: PricePoint[]): void {
  const lines = ['date,price'];
  for (const p of data) {
    lines.push(`${p.date},${p.price}`);
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

/**
 * Compute monthly total returns from a price series.
 * return[t] = (price[t] - price[t-1]) / price[t-1]
 * Returns are aligned with the END date (return[t] is for the month ending at date[t]).
 */
function computeMonthlyReturns(data: PricePoint[]): Map<string, number> {
  const returns = new Map<string, number>();
  for (let i = 1; i < data.length; i++) {
    const ret = (data[i].price - data[i - 1].price) / data[i - 1].price;
    returns.set(data[i].date, ret);
  }
  return returns;
}

async function main() {
  console.log('Generating China Equity proxy data...\n');

  // 1. Load MSCI EM TR (pre-2004 backfill proxy)
  const msciEmergingPath = path.join(DATA_DIR, 'equity/msci_em_tr.csv');
  if (!fs.existsSync(msciEmergingPath)) {
    console.error('ERROR: MSCI EM TR data not found. Run generate-intl-proxies.ts first.');
    process.exit(1);
  }
  const msciEm = loadCSV(msciEmergingPath);
  console.log(`MSCI EM TR: ${msciEm.length} points (${msciEm[0].date} to ${msciEm[msciEm.length - 1].date})`);

  // Compute MSCI EM monthly returns (keyed by end-of-month date)
  const emReturns = computeMonthlyReturns(msciEm);

  // 2. Load existing FXI price data (stored in csi300_tr.csv)
  const csi300Path = path.join(DATA_DIR, 'equity/csi300_tr.csv');
  if (!fs.existsSync(csi300Path)) {
    console.log('No existing CSI300 CSV found. Cannot proceed without FXI data.');
    console.log('Download FXI price history from Yahoo Finance and save as csi300_tr.csv first.');
    process.exit(1);
  }

  const allData = loadCSV(csi300Path);
  console.log(`Existing CSI300 CSV: ${allData.length} points (${allData[0].date} to ${allData[allData.length - 1].date})`);

  // The existing CSV may already be combined (pre-2004 backfill + FXI).
  // We need to extract just the FXI portion (2004-11-30 onwards).
  // FXI inception: 2004-10-05, first month-end in our data: 2004-11-30.
  const FXI_START = '2004-11-30';

  let fxiData = allData.filter(p => p.date >= FXI_START);

  if (fxiData.length === 0) {
    console.error(`ERROR: No FXI data found from ${FXI_START} onwards in csi300_tr.csv`);
    process.exit(1);
  }

  console.log(`FXI data: ${fxiData.length} points (${fxiData[0].date} to ${fxiData[fxiData.length - 1].date})`);

  // Normalize FXI to 100 at its start
  if (fxiData[0].price < 50) {
    console.log('  Detected raw FXI prices, normalizing to 100...');
    fxiData = normalizeSeries(fxiData, 100);
  } else if (Math.abs(fxiData[0].price - 100) > 0.01) {
    console.log(`  FXI starts at ${fxiData[0].price}, normalizing to 100...`);
    fxiData = normalizeSeries(fxiData, 100);
  } else {
    console.log('  FXI already starts at 100.');
  }

  console.log(`FXI normalized: ${fxiData[0].date} (${fxiData[0].price}) → ${fxiData[fxiData.length - 1].date} (${fxiData[fxiData.length - 1].price})`);

  // 3. Walk backwards from FXI's first value using MSCI EM monthly returns
  //    pre[t-1] = pre[t] / (1 + emReturn[t])
  //    This preserves MSCI EM's growth rate pre-2004.
  const spliceDate = FXI_START;
  const emDatesBeforeSplice = msciEm
    .filter(p => p.date < spliceDate)
    .map(p => p.date);

  if (emDatesBeforeSplice.length === 0) {
    console.log('  MSCI EM has no data before FXI inception. No backfill needed.');
    writeCSV(csi300Path, fxiData);
    console.log(`\nSaved: ${csi300Path} (${fxiData.length} points)`);
    return;
  }

  // Build pre-2004 series by walking backwards
  const preFxi: PricePoint[] = [];
  let currentPrice = fxiData[0].price; // 100 at 2004-11-30

  // Process in reverse chronological order (from splice date backwards)
  const reversedDates = [...emDatesBeforeSplice].reverse();

  for (const date of reversedDates) {
    // emReturns[date] is the return for the month ending at `date`
    const ret = emReturns.get(date);
    if (ret === undefined) {
      // No return data for this date, skip
      continue;
    }
    // Walk backwards: price[t-1] = price[t] / (1 + ret[t])
    currentPrice = currentPrice / (1 + ret);
    preFxi.push({
      date,
      price: Math.round(currentPrice * 10000) / 10000,
    });
  }

  // Reverse to chronological order
  preFxi.reverse();

  console.log(`  Backward extension: ${preFxi.length} months`);
  console.log(`  Pre-2004 range: ${preFxi[0].date} (${preFxi[0].price}) → ${preFxi[preFxi.length - 1].date} (${preFxi[preFxi.length - 1].price})`);

  // Verify splice continuity
  const lastPre = preFxi[preFxi.length - 1];
  const firstFxi = fxiData[0];
  const spliceReturn = (firstFxi.price - lastPre.price) / lastPre.price;
  console.log(`  Splice check: pre=${lastPre.price} → fxi=${firstFxi.price} (return=${(spliceReturn * 100).toFixed(4)}%)`);

  // 4. Combine: pre-2004 (MSCI EM returns) + FXI (2004+)
  const combined = [...preFxi, ...fxiData];

  // 5. Normalize entire series to start at 100
  const normalized = normalizeSeries(combined, 100);

  // 6. Compute CAGR for verification
  const firstDate = new Date(normalized[0].date);
  const lastDate = new Date(normalized[normalized.length - 1].date);
  const years = (lastDate.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
  const cagr = Math.pow(normalized[normalized.length - 1].price / normalized[0].price, 1 / years) - 1;
  console.log(`  Combined (normalized): ${normalized[0].date} (${normalized[0].price}) → ${normalized[normalized.length - 1].date} (${normalized[normalized.length - 1].price})`);
  console.log(`  CAGR: ${(cagr * 100).toFixed(2)}% (${years.toFixed(1)} years)`);

  // 7. Write output
  writeCSV(csi300Path, normalized);
  console.log(`\nSaved: ${csi300Path} (${normalized.length} points)`);
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
