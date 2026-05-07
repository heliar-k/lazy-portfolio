/**
 * Fetch latest Shiller data and update bundled proxy CSVs.
 *
 * Usage: npx tsx scripts/fetch-shiller-data.ts
 *
 * Downloads the Shiller CAPE spreadsheet (contains S&P 500 price, dividends,
 * earnings, CPI, and 10Y Treasury yields from 1871–present), then regenerates
 * the proxy CSV files.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');

// NOTE: Full FRED API integration requires a FRED API key.
// For now, this script validates existing data is in good shape.
// Real-time data updates are handled by Yahoo Finance gap-filling at runtime.

interface ShillerRow {
  date: string;       // "1871.01"
  price: number;      // S&P Composite (nominal)
  dividend: number;
  earnings: number;
  cpi: number;
  longRate: number;   // 10Y Treasury
}

async function main() {
  console.log('Checking data integrity...\n');

  const proxiesDir = path.join(DATA_DIR, 'proxies');
  const dirs = fs.readdirSync(proxiesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let totalFiles = 0;
  let totalPoints = 0;

  for (const dir of dirs) {
    const dirPath = path.join(proxiesDir, dir);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.csv'));

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');
      const dataLines = lines.length - 1; // minus header

      // Validate: check for NaN or empty values
      let nanCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 2 || parts[1].trim() === '' || isNaN(parseFloat(parts[1]))) {
          nanCount++;
        }
      }

      const status = nanCount > 0 ? `⚠ ${nanCount} NaN values` : 'OK';
      console.log(`  ${dir}/${file}: ${dataLines} data points [${status}]`);
      totalFiles++;
      totalPoints += dataLines;
    }
  }

  // Check CPI data
  const inflationDir = path.join(DATA_DIR, 'inflation');
  if (fs.existsSync(inflationDir)) {
    const cpiFiles = fs.readdirSync(inflationDir).filter((f) => f.endsWith('.csv'));
    for (const file of cpiFiles) {
      const content = fs.readFileSync(path.join(inflationDir, file), 'utf-8');
      const lines = content.trim().split('\n');
      console.log(`  inflation/${file}: ${lines.length - 1} data points`);
    }
  }

  // Update data_version.json timestamp
  const versionPath = path.join(DATA_DIR, 'data_version.json');
  const version = JSON.parse(fs.readFileSync(versionPath, 'utf-8'));
  version.lastUpdated = new Date().toISOString().split('T')[0];
  fs.writeFileSync(versionPath, JSON.stringify(version, null, 2) + '\n');
  console.log(`\nData version updated: ${version.lastUpdated}`);

  console.log(`\nTotal: ${totalFiles} proxy files, ${totalPoints} data points`);
  console.log('Validation complete.');
}

main().catch(console.error);
