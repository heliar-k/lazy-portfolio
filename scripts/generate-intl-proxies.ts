/**
 * Generate international equity proxy data using Ken French Data Library.
 *
 * Ken French provides free academic factor data with monthly returns for
 * Developed ex-US (1990+) and Emerging Markets (1989+).
 *
 * Total return formula: (Mkt-RF + RF) / 100  (both in percent, USD terms)
 *
 * Usage: npx tsx scripts/generate-intl-proxies.ts [--local <dir>]
 *   --local <dir>: Use already-downloaded CSV files from local directory
 *   (default): Download from Ken French Data Library
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const DATA_DIR = path.resolve('public/data/proxies');
const VERSION_FILE = path.resolve('public/data/data_version.json');

// ---------------------------------------------------------------------------
// Ken French data sources
// ---------------------------------------------------------------------------

interface KenFrenchSource {
  name: string;
  zipUrl: string;
  csvFilename: string;    // filename inside the ZIP
  outputFilename: string;  // output CSV filename
  rfColumn?: number;        // 0-based column index for RF (factor sources)
  mktRfColumn?: number;     // 0-based column index for Mkt-RF (factor sources)
  returnColumn?: number;    // 0-based column index for direct portfolio return (portfolio sources)
  startBase: number;       // base index value
}

const SOURCES: KenFrenchSource[] = [
  {
    name: 'Developed ex-US',
    zipUrl: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/Developed_ex_US_3_Factors_CSV.zip',
    csvFilename: 'Developed_ex_US_3_Factors.csv',
    outputFilename: 'msci_eafe_tr.csv',
    rfColumn: 4,
    mktRfColumn: 1,
    startBase: 100,
  },
  {
    name: 'Emerging Markets',
    zipUrl: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/Emerging_5_Factors_CSV.zip',
    csvFilename: 'Emerging_5_Factors.csv',
    outputFilename: 'msci_em_tr.csv',
    rfColumn: 6,
    mktRfColumn: 1,
    startBase: 100,
  },
  {
    name: 'US Small Cap Value',
    zipUrl: 'https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/6_Portfolios_2x3_CSV.zip',
    csvFilename: '6_Portfolios_2x3.csv',
    outputFilename: 'smallcap_value_tr.csv',
    returnColumn: 3,  // Small Value (Small HiBM)
    startBase: 100,
  },
];

// ---------------------------------------------------------------------------
// CSV parsing
// ---------------------------------------------------------------------------

interface MonthlyData {
  date: string;  // YYYY-MM-DD (last day of month)
  totalReturn: number | null;
}

function parseKenFrenchCSV(text: string, rfCol: number, mktRfCol: number): MonthlyData[] {
  const lines = text.split(/\r?\n/);
  const results: MonthlyData[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Header line
    if (trimmed.startsWith(',')) continue;

    // Stop at annual summary section (only after we've found data rows)
    if (/^Annual/i.test(trimmed) && results.length > 0) break;

    // Stop when we hit a new section header (e.g. equal-weighted section)
    if (results.length > 0 && /Returns -- Monthly/i.test(trimmed)) break;

    // First column should be a 6-digit YYYYMM
    const firstCol = trimmed.split(/[\t,]+/)[0].trim();
    if (!/^\d{6}$/.test(firstCol)) continue;

    // Parse tab-separated values (also handle comma-separated)
    const cols = trimmed.split(/[\t,]+/).map(c => c.trim());

    const dateStr = firstCol; // YYYYMM
    const mktRf = parseFloat(cols[mktRfCol]);
    const rf = parseFloat(cols[rfCol]);

    // Sentinel -99.99 or -999 means missing
    if (mktRf === -99.99 || mktRf === -999 || isNaN(mktRf)) continue;
    if (rf === -99.99 || rf === -999 || isNaN(rf)) continue;

    // Total return = (Mkt-RF + RF) / 100 (percent → decimal)
    const totalReturn = (mktRf + rf) / 100;

    // Convert YYYYMM to YYYY-MM-DD (last day of month)
    const year = parseInt(dateStr.substring(0, 4));
    const month = parseInt(dateStr.substring(4, 6));
    const lastDay = new Date(year, month, 0).getDate();
    const date = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    results.push({ date, totalReturn });
  }

  return results;
}

/**
 * Parse Ken French portfolio return CSV (returns are directly in percent).
 * Used for datasets like 6 Portfolios Formed on Size and Book-to-Market.
 */
function parseKenFrenchPortfolioCSV(text: string, returnCol: number): MonthlyData[] {
  const lines = text.split(/\r?\n/);
  const results: MonthlyData[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Header line
    if (trimmed.startsWith(',')) continue;

    // Stop at annual summary section (only after we've found data rows)
    if (/^Annual/i.test(trimmed) && results.length > 0) break;

    // Stop when we hit a new section header (e.g. equal-weighted section)
    if (results.length > 0 && /Returns -- Monthly/i.test(trimmed)) break;

    // First column should be a 6-digit YYYYMM
    const firstCol = trimmed.split(/[\t,]+/)[0].trim();
    if (!/^\d{6}$/.test(firstCol)) continue;

    // Parse tab-separated values
    const cols = trimmed.split(/[\t,]+/).map(c => c.trim());
    if (cols.length <= returnCol) continue;

    const ret = parseFloat(cols[returnCol]);

    // Sentinel -99.99 or -999 means missing
    if (ret === -99.99 || ret === -999 || isNaN(ret)) continue;

    // Return is in percent → decimal
    const totalReturn = ret / 100;

    // Convert YYYYMM to YYYY-MM-DD (last day of month)
    const year = parseInt(firstCol.substring(0, 4));
    const month = parseInt(firstCol.substring(4, 6));
    const lastDay = new Date(year, month, 0).getDate();
    const date = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    results.push({ date, totalReturn });
  }

  return results;
}

function forwardFill(data: MonthlyData[], maxGap = 3): MonthlyData[] {
  let lastValidReturn: number | null = null;
  let gapCount = 0;

  for (const row of data) {
    if (row.totalReturn === null) {
      gapCount++;
      if (lastValidReturn !== null && gapCount <= maxGap) {
        row.totalReturn = lastValidReturn;
      }
    } else {
      lastValidReturn = row.totalReturn;
      gapCount = 0;
    }
  }

  return data.filter(r => r.totalReturn !== null);
}

function buildCumulativeIndex(data: MonthlyData[], baseValue: number): { date: string; price: number }[] {
  const index: { date: string; price: number }[] = [];
  let value = baseValue;

  // First row: set starting price
  value = baseValue;
  index.push({ date: data[0].date, price: value });

  for (let i = 1; i < data.length; i++) {
    value *= (1 + data[i].totalReturn!);
    index.push({ date: data[i].date, price: Math.round(value * 10000) / 10000 });
  }

  return index;
}

// ---------------------------------------------------------------------------
// Download & extract
// ---------------------------------------------------------------------------

async function downloadFile(url: string, destPath: string): Promise<void> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Failed to download ${url}: ${res.status} ${res.statusText}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
}

function extractZip(zipPath: string, targetFile: string, destDir: string): string {
  // Use macOS built-in unzip
  execSync(`unzip -o "${zipPath}" "${targetFile}" -d "${destDir}"`, { stdio: 'pipe' });
  const extracted = path.join(destDir, targetFile);
  if (!fs.existsSync(extracted)) {
    throw new Error(`Failed to extract ${targetFile} from ${zipPath}`);
  }
  return extracted;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = process.argv.slice(2);
  const localDirIdx = args.indexOf('--local');
  const useLocal = localDirIdx >= 0;
  const localDir = useLocal ? args[localDirIdx + 1] : null;

  const tmpDir = fs.mkdtempSync(path.join('/tmp', 'kf-intl-'));
  console.log(`Temp dir: ${tmpDir}\n`);

  const equityDir = path.join(DATA_DIR, 'equity');
  if (!fs.existsSync(equityDir)) {
    fs.mkdirSync(equityDir, { recursive: true });
  }

  for (const source of SOURCES) {
    console.log(`=== ${source.name} ===`);

    let csvText: string;

    if (useLocal && localDir) {
      // Use local CSV file
      const localPath = path.join(localDir, source.csvFilename);
      console.log(`  Reading local: ${localPath}`);
      csvText = fs.readFileSync(localPath, 'utf-8');
    } else {
      // Download from Ken French
      const zipPath = path.join(tmpDir, `${source.name.replace(/\s+/g, '_')}.zip`);
      console.log(`  Downloading: ${source.zipUrl}`);
      await downloadFile(source.zipUrl, zipPath);

      console.log(`  Extracting: ${source.csvFilename}`);
      const csvPath = extractZip(zipPath, source.csvFilename, tmpDir);
      csvText = fs.readFileSync(csvPath, 'utf-8');
    }

    // Parse
    const monthlyData = source.returnColumn !== undefined
      ? parseKenFrenchPortfolioCSV(csvText, source.returnColumn)
      : parseKenFrenchCSV(csvText, source.rfColumn!, source.mktRfColumn!);
    console.log(`  Parsed ${monthlyData.length} monthly data points`);

    if (monthlyData.length === 0) {
      console.log(`  ERROR: No data parsed!`);
      continue;
    }

    // Forward-fill gaps
    const filled = forwardFill(monthlyData);
    console.log(`  After forward-fill: ${filled.length} points`);

    // Build cumulative TR index
    const index = buildCumulativeIndex(filled, source.startBase);
    console.log(`  Index: ${index[0].date} (${index[0].price}) → ${index[index.length - 1].date} (${index[index.length - 1].price})`);

    // Compute CAGR for verification
    const firstDate = new Date(index[0].date);
    const lastDate = new Date(index[index.length - 1].date);
    const years = (lastDate.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const cagr = Math.pow(index[index.length - 1].price / index[0].price, 1 / years) - 1;
    console.log(`  CAGR: ${(cagr * 100).toFixed(2)}% (${years.toFixed(1)} years)`);

    // Write CSV
    const outputPath = path.join(equityDir, source.outputFilename);
    const lines = ['date,price'];
    for (const p of index) {
      lines.push(`${p.date},${p.price}`);
    }
    fs.writeFileSync(outputPath, lines.join('\n'));
    console.log(`  Saved: ${outputPath} (${index.length} rows)\n`);
  }

  // Update data version
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(VERSION_FILE, JSON.stringify({
    version: 1,
    lastUpdated: today,
    description: 'International equity proxies from Ken French Data Library (Mkt-RF + RF)',
  }, null, 2));

  // Cleanup
  fs.rmSync(tmpDir, { recursive: true, force: true });
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
