/**
 * Generate synthetic proxy CSV data with realistic returns and volatility.
 * Run: npx tsx scripts/generate-proxy-data.ts
 *
 * Each CSV has format: date,price
 * Dates are end-of-month (YYYY-MM-DD).
 */

import * as fs from 'fs';
import * as path from 'path';

const DATA_DIR = path.resolve('public/data');

// Asset class configs: [annualizedReturn, annualizedVolatility, startPrice]
const ASSETS: Record<string, { ret: number; vol: number; price: number; dir: string }> = {
  SP500_TR:       { ret: 0.10, vol: 0.15, price: 2000, dir: 'proxies/equity' },
  MSCI_EAFE_TR:   { ret: 0.07, vol: 0.18, price: 1600, dir: 'proxies/equity' },
  MSCI_EM_TR:     { ret: 0.08, vol: 0.22, price:  900, dir: 'proxies/equity' },
  US_10Y_TR:      { ret: 0.04, vol: 0.08, price:  500, dir: 'proxies/bond' },
  US_AGG_BOND_TR: { ret: 0.03, vol: 0.04, price:  300, dir: 'proxies/bond' },
  US_REIT_TR:     { ret: 0.09, vol: 0.20, price:  800, dir: 'proxies/real_estate' },
  GOLD_SPOT:      { ret: 0.06, vol: 0.16, price: 1200, dir: 'proxies/commodity' },
  CASH:           { ret: 0.015, vol: 0.005, price: 100, dir: 'proxies/bond' },
};

// FX rates
const FX_PAIRS: Record<string, { initial: number; drift: number; vol: number; dir: string }> = {
  USDCNY: { initial: 6.20, drift: 0.015, vol: 0.04, dir: 'proxies/fx' },
  USDEUR: { initial: 0.83, drift: 0.00, vol: 0.06, dir: 'proxies/fx' },
  USDJPY: { initial: 120, drift: 0.005, vol: 0.07, dir: 'proxies/fx' },
};

function seedRandom(seed: number): () => number {
  let s = seed;
  return () => {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

/** Box-Muller normal random */
function normalRandom(rand: () => number): number {
  const u1 = rand();
  const u2 = rand();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function generateMonths(): string[] {
  const months: string[] = [];
  for (let y = 2015; y <= 2024; y++) {
    for (let m = 0; m < 12; m++) {
      const d = new Date(y, m + 1, 0); // last day of month
      const yStr = d.getFullYear();
      const mStr = String(d.getMonth() + 1).padStart(2, '0');
      const dStr = String(d.getDate()).padStart(2, '0');
      months.push(`${yStr}-${mStr}-${dStr}`);
    }
  }
  return months;
}

function generatePriceSeries(
  annualRet: number,
  annualVol: number,
  startPrice: number,
  months: string[],
  rand: () => number,
): string[] {
  const monthlyRet = (1 + annualRet) ** (1 / 12) - 1;
  const monthlyVol = annualVol / Math.sqrt(12);

  const lines: string[] = ['date,price'];
  let price = startPrice;

  for (const month of months) {
    const shock = normalRandom(rand) * monthlyVol;
    price = price * (1 + monthlyRet + shock);
    if (price < 0.01) price = 0.01;
    lines.push(`${month},${price.toFixed(4)}`);
  }

  return lines;
}

function generateFXSeries(
  initial: number,
  drift: number,
  vol: number,
  months: string[],
  rand: () => number,
): string[] {
  const monthlyDrift = drift / 12;
  const monthlyVol = vol / Math.sqrt(12);

  const lines: string[] = ['date,rate'];
  let rate = initial;

  for (const month of months) {
    const shock = normalRandom(rand) * monthlyVol;
    rate = rate * (1 + monthlyDrift + shock);
    if (rate < 0.01) rate = 0.01;
    lines.push(`${month},${rate.toFixed(4)}`);
  }

  return lines;
}

function generateCPI(months: string[], rand: () => number): string[] {
  const monthlyInf = 0.025 / 12; // ~2.5% annual
  const monthlyVol = 0.003;

  const lines: string[] = ['date,cpi'];
  let cpi = 240; // starting CPI level

  for (const month of months) {
    const shock = normalRandom(rand) * monthlyVol;
    cpi = cpi * (1 + monthlyInf + shock);
    if (cpi < 1) cpi = 1;
    lines.push(`${month},${cpi.toFixed(2)}`);
  }

  return lines;
}

function main() {
  const months = generateMonths();
  console.log(`Generating data for ${months.length} months (${months[0]} to ${months[months.length - 1]})`);

  // Seed each asset differently for variety
  let seed = 42;

  for (const [symbol, config] of Object.entries(ASSETS)) {
    const rand = seedRandom(seed++);
    const lines = generatePriceSeries(config.ret, config.vol, config.price, months, rand);
    const dir = path.join(DATA_DIR, config.dir);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${symbol.toLowerCase()}.csv`);
    fs.writeFileSync(filePath, lines.join('\n') + '\n');
    console.log(`  Wrote ${filePath} (${lines.length - 1} rows)`);
  }

  for (const [pair, config] of Object.entries(FX_PAIRS)) {
    const rand = seedRandom(seed++);
    const lines = generateFXSeries(config.initial, config.drift, config.vol, months, rand);
    const dir = path.join(DATA_DIR, config.dir);
    fs.mkdirSync(dir, { recursive: true });
    const filePath = path.join(dir, `${pair.toLowerCase()}.csv`);
    fs.writeFileSync(filePath, lines.join('\n') + '\n');
    console.log(`  Wrote ${filePath} (${lines.length - 1} rows)`);
  }

  // CPI
  {
    const rand = seedRandom(seed++);
    const lines = generateCPI(months, rand);
    const filePath = path.join(DATA_DIR, 'inflation', 'us_cpi.csv');
    fs.writeFileSync(filePath, lines.join('\n') + '\n');
    console.log(`  Wrote ${filePath} (${lines.length - 1} rows)`);
  }

  // data_version.json
  const version = {
    version: 1,
    lastUpdated: new Date().toISOString().slice(0, 10),
  };
  fs.writeFileSync(
    path.join(DATA_DIR, 'data_version.json'),
    JSON.stringify(version, null, 2) + '\n',
  );
  console.log(`  Wrote data_version.json`);
}

main();
