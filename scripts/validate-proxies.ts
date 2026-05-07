/**
 * Validate all proxy data files for integrity:
 * - Date continuity (no gaps > 3 months)
 * - NaN checks
 * - Monotonic CPI values
 * - Price > 0
 *
 * Usage: npx tsx scripts/validate-proxies.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DATA_DIR = path.resolve(__dirname, '..', 'public', 'data');

interface ValidationIssue {
  file: string;
  line: number;
  issue: string;
}

function parseLocalDate(dateStr: string): Date {
  const parts = dateStr.split('-');
  return new Date(
    parseInt(parts[0]),
    parseInt(parts[1]) - 1,
    parseInt(parts[2]),
  );
}

function main() {
  const issues: ValidationIssue[] = [];
  let filesChecked = 0;
  let pointsChecked = 0;

  const proxiesDir = path.join(DATA_DIR, 'proxies');
  if (!fs.existsSync(proxiesDir)) {
    console.error('Proxies directory not found:', proxiesDir);
    process.exit(1);
  }

  const dirs = fs.readdirSync(proxiesDir, { withFileTypes: true })
    .filter((d) => d.isDirectory());

  for (const dirEnt of dirs) {
    const dirPath = path.join(proxiesDir, dirEnt.name);
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith('.csv'));

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const relPath = `proxies/${dirEnt.name}/${file}`;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      if (lines.length < 2) {
        issues.push({ file: relPath, line: 0, issue: 'File has no data rows' });
        continue;
      }

      let prevDate: Date | null = null;
      let prevPrice = NaN;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',');
        const dateStr = parts[0];
        const price = parseFloat(parts[1]);
        const lineNum = i + 1;

        // NaN check
        if (isNaN(price)) {
          issues.push({ file: relPath, line: lineNum, issue: `NaN price value at ${dateStr}` });
        }

        // Positive price check
        if (price <= 0 && !isNaN(price)) {
          issues.push({ file: relPath, line: lineNum, issue: `Non-positive price (${price}) at ${dateStr}` });
        }

        // Date continuity (max 3 month gap)
        if (dateStr) {
          try {
            const date = parseLocalDate(dateStr);
            if (prevDate && !isNaN(date.getTime())) {
              const monthsDiff =
                (date.getFullYear() - prevDate.getFullYear()) * 12 +
                (date.getMonth() - prevDate.getMonth());
              if (monthsDiff > 3) {
                issues.push({
                  file: relPath,
                  line: lineNum,
                  issue: `Date gap of ${monthsDiff} months between ${formatLocalDate(prevDate)} and ${dateStr}`,
                });
              }
            }
            prevDate = date;
          } catch {
            issues.push({ file: relPath, line: lineNum, issue: `Invalid date: ${dateStr}` });
          }
        }

        prevPrice = price;
        pointsChecked++;
      }

      filesChecked++;
    }
  }

  // Check CPI data
  const inflationDir = path.join(DATA_DIR, 'inflation');
  if (fs.existsSync(inflationDir)) {
    const cpiFiles = fs.readdirSync(inflationDir).filter((f) => f.endsWith('.csv'));
    for (const file of cpiFiles) {
      const filePath = path.join(inflationDir, file);
      const relPath = `inflation/${file}`;
      const content = fs.readFileSync(filePath, 'utf-8');
      const lines = content.trim().split('\n');

      let prevCpi = NaN;

      for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;

        const parts = line.split(',');
        const cpi = parseFloat(parts[1]);
        const lineNum = i + 1;

        if (isNaN(cpi)) {
          issues.push({ file: relPath, line: lineNum, issue: 'NaN CPI value' });
        }

        // CPI should be monotonically increasing (or at least non-decreasing)
        if (!isNaN(prevCpi) && !isNaN(cpi) && cpi < prevCpi * 0.95) {
          issues.push({
            file: relPath,
            line: lineNum,
            issue: `CPI dropped >5% from ${prevCpi.toFixed(1)} to ${cpi.toFixed(1)} (suspicious)`,
          });
        }

        prevCpi = cpi;
        pointsChecked++;
      }

      filesChecked++;
    }
  }

  // Report
  console.log(`Checked ${filesChecked} files, ${pointsChecked} data points\n`);

  if (issues.length === 0) {
    console.log('All data valid! No issues found.');
  } else {
    console.log(`Found ${issues.length} issues:\n`);
    for (const issue of issues) {
      console.log(`  [${issue.file}:${issue.line}] ${issue.issue}`);
    }
    process.exit(1);
  }
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

main();
