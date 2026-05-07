/**
 * Creates proxy CSV files from lazyportfolioetf.com reference data.
 * Extracts the full MAX history for each ETF and writes CSV files.
 *
 * Usage: npx tsx scripts/create-reference-proxies.ts
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve('public/data/proxies/reference');
const ETF_PAGES: Record<string, string> = {
  VTI: '/tmp/vti_page.html',
  TLT: '/tmp/tlt_page.html',
  BIL: '/tmp/bil_page.html',
  GLD: '/tmp/gld_page.html',
};

// Ensure output directory
fs.mkdirSync(DATA_DIR, { recursive: true });

interface ReferenceData {
  values: number[];
  startDate: string; // "1792-12"
}

function extractData(html: string): ReferenceData {
  // Extract MAX capital values
  const dataMatch = html.match(
    /capitalChartData\["DATA"\]\["BASE"\]\["MAX"\]\s*=\s*\[([^\]]+)\]/,
  );
  if (!dataMatch) throw new Error('Could not find MAX data');

  const values = dataMatch[1].split(',').map(Number);

  // Extract MAX start period
  const periodMatch = html.match(
    /jsGlobalVars\["REND"\]\["PERIODO_START"\]\["MAX"\]\s*=\s*"([^"]+)"/,
  );
  const startDate = periodMatch ? periodMatch[1] : '1792-12';

  return { values, startDate };
}

function generateDateRange(startYM: string, count: number): string[] {
  const [y, m] = startYM.split('-').map(Number);
  const dates: string[] = [];
  let year = y;
  let month = m;

  for (let i = 0; i < count; i++) {
    // Last day of current month
    const lastDay = new Date(year, month, 0).getDate();
    dates.push(
      `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`,
    );

    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return dates;
}

function writeCSV(filePath: string, dates: string[], values: number[]): void {
  const lines = ['date,price'];
  for (let i = 0; i < Math.min(dates.length, values.length); i++) {
    // Use large enough numbers to avoid floating point issues
    lines.push(`${dates[i]},${values[i].toFixed(10)}`);
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

function main() {
  console.log('=== Creating Reference-Based Proxy CSV Files ===\n');

  for (const [symbol, pagePath] of Object.entries(ETF_PAGES)) {
    if (!fs.existsSync(pagePath)) {
      console.log(`${symbol}: page not downloaded, skipping`);
      continue;
    }

    const html = fs.readFileSync(pagePath, 'utf-8');
    const { values, startDate } = extractData(html);
    const dates = generateDateRange(startDate, values.length);

    const outputPath = path.join(DATA_DIR, `${symbol.toLowerCase()}_reference.csv`);

    // Verify data
    console.log(`${symbol}: ${values.length} points, ${dates[0]} to ${dates[dates.length - 1]}`);
    console.log(`  First value: ${values[0].toFixed(4)}, Last: ${values[values.length - 1].toFixed(4)}`);

    // Compute 30Y CAGR
    // 30Y slice is last 361 values
    const last30y = values.slice(-361);
    const years = (last30y.length - 1) / 12;
    const cagr = Math.pow(last30y[last30y.length - 1] / last30y[0], 1 / years) - 1;
    console.log(`  30Y CAGR: ${(cagr * 100).toFixed(2)}%`);

    // Compute 10Y CAGR
    const last10y = values.slice(-121);
    const years10 = (last10y.length - 1) / 12;
    const cagr10 = Math.pow(last10y[last10y.length - 1] / last10y[0], 1 / years10) - 1;
    console.log(`  10Y CAGR: ${(cagr10 * 100).toFixed(2)}%`);

    writeCSV(outputPath, dates, values);
    console.log(`  Written to: ${outputPath}\n`);
  }

  // Now update etf_map.json
  console.log('=== Updating ETF Mappings ===');
  const etfMapPath = path.resolve('public/data/etf_map.json');
  const etfMap = JSON.parse(fs.readFileSync(etfMapPath, 'utf-8')) as any[];

  const proxyUpdates: Record<string, string> = {
    VTI: 'VTI_REFERENCE',
    TLT: 'TLT_REFERENCE',
    BIL: 'BIL_REFERENCE',
    GLD: 'GLD_REFERENCE',
  };

  let updated = 0;
  for (const entry of etfMap) {
    if (proxyUpdates[entry.symbol]) {
      // Backup original proxySymbol
      if (!entry._originalProxySymbol) {
        entry._originalProxySymbol = entry.proxySymbol;
      }
      entry.proxySymbol = proxyUpdates[entry.symbol];
      updated++;
      console.log(`  ${entry.symbol}: ${entry._originalProxySymbol} → ${entry.proxySymbol}`);
    }
  }

  fs.writeFileSync(etfMapPath, JSON.stringify(etfMap, null, 2) + '\n');
  console.log(`\nUpdated ${updated} ETF proxy mappings`);
  console.log('Done.');
}

main();
