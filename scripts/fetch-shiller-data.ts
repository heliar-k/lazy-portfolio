/**
 * Data auto-update script.
 *
 * Downloads the latest Shiller CAPE spreadsheet, fetches latest FRED data,
 * and regenerates all proxy CSV files.
 *
 * Usage: npm run update-data
 *
 * What it does:
 * 1. Downloads Shiller ie_data.xls (if >30 days old or missing)
 * 2. Runs generate-real-proxies.ts (Shiller + FRED + GLD)
 * 3. Runs generate-intl-proxies.ts (Ken French international data)
 * 4. Updates data_version.json timestamp
 */

import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

const SHILLER_URL = 'http://www.econ.yale.edu/~shiller/data/ie_data.xls';
const SHILLER_PATH = '/tmp/ie_data.xls';
const DATA_DIR = path.resolve('public/data');
const MAX_AGE_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// ---------------------------------------------------------------------------
// Step 0: Backup
// ---------------------------------------------------------------------------

interface BackupState {
  etfMap: boolean;
  proxies: boolean;
}

function createBackup(): BackupState {
  console.log('\n[0/5] Creating backups...');
  const result: BackupState = { etfMap: false, proxies: false };

  const etfMapPath = path.join(DATA_DIR, 'etf_map.json');
  const etfMapBak = path.join(DATA_DIR, 'etf_map.json.bak');
  if (fs.existsSync(etfMapPath)) {
    fs.copyFileSync(etfMapPath, etfMapBak);
    result.etfMap = true;
  }

  const proxiesDir = path.join(DATA_DIR, 'proxies');
  const proxiesBak = '/tmp/proxies_backup';
  if (fs.existsSync(proxiesDir)) {
    fs.cpSync(proxiesDir, proxiesBak, { recursive: true });
    result.proxies = true;
  }

  console.log(`   etf_map.json: ${result.etfMap ? 'backed up' : 'not found'}`);
  console.log(`   proxies/: ${result.proxies ? 'backed up' : 'not found'}`);
  return result;
}

function restoreFromBackup(backup: BackupState): void {
  console.log('\n⚠️  Restoring from backups...');

  if (backup.etfMap) {
    const etfMapPath = path.join(DATA_DIR, 'etf_map.json');
    const etfMapBak = path.join(DATA_DIR, 'etf_map.json.bak');
    if (fs.existsSync(etfMapBak)) {
      fs.copyFileSync(etfMapBak, etfMapPath);
      fs.unlinkSync(etfMapBak);
      console.log('   Restored etf_map.json');
    }
  }

  if (backup.proxies) {
    const proxiesDir = path.join(DATA_DIR, 'proxies');
    const proxiesBak = '/tmp/proxies_backup';
    if (fs.existsSync(proxiesBak)) {
      fs.rmSync(proxiesDir, { recursive: true, force: true });
      fs.cpSync(proxiesBak, proxiesDir, { recursive: true });
      fs.rmSync(proxiesBak, { recursive: true, force: true });
      console.log('   Restored proxies/');
    }
  }
}

function cleanupBackup(backup: BackupState): void {
  if (backup.etfMap) {
    const bak = path.join(DATA_DIR, 'etf_map.json.bak');
    if (fs.existsSync(bak)) fs.unlinkSync(bak);
  }
  if (backup.proxies) {
    const bak = '/tmp/proxies_backup';
    if (fs.existsSync(bak)) fs.rmSync(bak, { recursive: true, force: true });
  }
}

// ---------------------------------------------------------------------------
// Step 1: Download Shiller data if needed
// ---------------------------------------------------------------------------

function shillerNeedsUpdate(): boolean {
  if (!fs.existsSync(SHILLER_PATH)) {
    console.log('Shiller XLS not found — downloading...');
    return true;
  }

  const stat = fs.statSync(SHILLER_PATH);
  const age = Date.now() - stat.mtimeMs;
  const days = Math.round(age / (24 * 60 * 60 * 1000));

  if (age > MAX_AGE_MS) {
    console.log(`Shiller XLS is ${days} days old (>30) — re-downloading...`);
    return true;
  }

  console.log(`Shiller XLS is ${days} days old — up to date`);
  return false;
}

async function downloadShiller(): Promise<void> {
  console.log(`Downloading ${SHILLER_URL}...`);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const res = await fetch(SHILLER_URL, { signal: controller.signal });
    if (!res.ok) {
      throw new Error(`HTTP ${res.status} ${res.statusText}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    fs.writeFileSync(SHILLER_PATH, buf);
    console.log(`Downloaded ${(buf.length / 1024).toFixed(0)} KB → ${SHILLER_PATH}`);
  } finally {
    clearTimeout(timeout);
  }
}

// ---------------------------------------------------------------------------
// Step 2: Run proxy generation scripts
// ---------------------------------------------------------------------------

function runScript(scriptPath: string, description: string): boolean {
  console.log(`\n--- ${description} ---`);
  try {
    execSync(`npx tsx ${scriptPath}`, {
      stdio: 'inherit',
      cwd: process.cwd(),
      timeout: 5 * 60 * 1000, // 5 minutes
    });
    return true;
  } catch (err) {
    console.error(`Failed: ${(err as Error).message}`);
    return false;
  }
}

// ---------------------------------------------------------------------------
// Step 3: Data integrity check
// ---------------------------------------------------------------------------

function validateData(): { files: number; ok: number; issues: string[] } {
  console.log('\n--- Data Integrity Check ---');

  const proxiesDir = path.join(DATA_DIR, 'proxies');
  const dirs = fs.readdirSync(proxiesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);

  let files = 0;
  let ok = 0;
  const issues: string[] = [];

  for (const dir of dirs) {
    const dirPath = path.join(proxiesDir, dir);
    const csvFiles = fs.readdirSync(dirPath).filter((f) => f.endsWith('.csv'));

    for (const file of csvFiles) {
      files++;
      const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length < 2) {
        issues.push(`${dir}/${file}: empty or header-only`);
        continue;
      }

      let nanCount = 0;
      for (let i = 1; i < lines.length; i++) {
        const parts = lines[i].split(',');
        if (parts.length < 2 || parts[1].trim() === '' || isNaN(parseFloat(parts[1]))) {
          nanCount++;
        }
      }

      if (nanCount > 0) {
        issues.push(`${dir}/${file}: ${nanCount} NaN values`);
      } else {
        ok++;
      }
    }
  }

  return { files, ok, issues };
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  console.log('╔════════════════════════════════════╗');
  console.log('║   Data Auto-Update               ║');
  console.log('╚════════════════════════════════════╝\n');

  const startTime = Date.now();

  // 0. Backup
  const backup = createBackup();

  try {
    // 1. Download Shiller data if needed
    console.log('\n[1/5] Shiller data:');
    if (shillerNeedsUpdate()) {
      try {
        await downloadShiller();
      } catch (err) {
        console.error(`Download failed: ${(err as Error).message}`);
        console.log('Using existing Shiller data if available...');
        if (!fs.existsSync(SHILLER_PATH)) {
          throw new Error('No Shiller data available.');
        }
      }
    }

    // 2. Generate proxy CSVs from Shiller + FRED
    console.log('\n[2/5] Generating proxy data from Shiller + FRED...');
    if (!runScript('scripts/generate-real-proxies.ts', 'Shiller + FRED proxies')) {
      throw new Error('Proxy generation failed.');
    }

    // 3. Blend ETF data on top (top ETFs get real Yahoo Finance prices post-inception)
    console.log('\n[3/5] Blending ETF data...');
    runScript('scripts/blend-etf-data.ts', 'ETF data blending');

    // 4. Generate international proxies from Ken French
    console.log('\n[4/5] International equity proxies:');
    const eafePath = path.join(DATA_DIR, 'proxies/equity/msci_eafe_tr.csv');
    if (fs.existsSync(eafePath)) {
      const stat = fs.statSync(eafePath);
      const ageDays = Math.round((Date.now() - stat.mtimeMs) / (24 * 60 * 60 * 1000));
      if (ageDays < 90) {
        console.log(`International proxies are ${ageDays} days old — skipping (Ken French updates quarterly)`);
      } else {
        runScript('scripts/generate-intl-proxies.ts --local /tmp', 'Ken French international');
      }
    } else {
      runScript('scripts/generate-intl-proxies.ts --local /tmp', 'Ken French international');
    }

    // 5. Validate
    console.log('\n[5/5] Validating...');
    const { files, ok, issues } = validateData();
    console.log(`Files: ${files} total, ${ok} OK, ${issues.length} with issues`);
    if (issues.length > 0) {
      console.log('Issues:');
      issues.forEach((i) => console.log(`  ⚠  ${i}`));
    }

    // Done
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    const status = issues.length === 0 ? '✅' : '⚠️';
    console.log(`\n${status} Data update complete (${elapsed}s)`);
    console.log('Run "npx tsx scripts/validate-backtest.ts" to verify engine integrity.');

    cleanupBackup(backup);
  } catch (err) {
    console.error(`\n❌ Data update FAILED at step: ${(err as Error).message}`);
    restoreFromBackup(backup);
    process.exit(1);
  }
}
