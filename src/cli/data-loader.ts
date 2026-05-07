import * as fs from 'node:fs';
import * as path from 'node:path';
import type { MonthlyPricePoint } from '../engine/types';

export interface EtfMapEntry {
  symbol: string;
  name: string;
  nameZh?: string;
  assetClass: string;
  region: string;
  currency: string;
  provider: string;
  expenseRatio: number;
  inceptionDate: string;
  proxySymbol: string;
}

const DEFAULT_DATA_DIR = path.resolve(process.cwd(), 'public/data');

export function loadEtfMap(dataDir = DEFAULT_DATA_DIR): EtfMapEntry[] {
  const raw = fs.readFileSync(path.join(dataDir, 'etf_map.json'), 'utf-8');
  return JSON.parse(raw);
}

export function loadProxySeries(
  proxySymbol: string,
  dataDir = DEFAULT_DATA_DIR,
): MonthlyPricePoint[] {
  const key = proxySymbol.toLowerCase();
  const dirs = ['equity', 'bond', 'real_estate', 'commodity'];

  for (const dir of dirs) {
    const p = path.join(dataDir, 'proxies', dir, `${key}.csv`);
    if (fs.existsSync(p)) {
      return parsePriceCsv(fs.readFileSync(p, 'utf-8'));
    }
  }

  throw new Error(`Proxy data not found for: ${proxySymbol}`);
}

export function loadCpiSeries(
  region: string,
  dataDir = DEFAULT_DATA_DIR,
): Map<string, number> {
  const filePath = path.join(dataDir, 'inflation', `${region.toLowerCase()}_cpi.csv`);
  if (!fs.existsSync(filePath)) return new Map();

  const csv = fs.readFileSync(filePath, 'utf-8');
  const lines = csv.trim().split('\n');
  const map = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const [date, valueStr] = lines[i].split(',');
    const value = parseFloat(valueStr);
    if (date && !isNaN(value)) map.set(date, value);
  }

  return map;
}

export function loadFxSeries(
  pair: string,
  dataDir = DEFAULT_DATA_DIR,
): (number | null)[] {
  const filePath = path.join(dataDir, 'proxies', 'fx', `${pair.toLowerCase()}.csv`);
  if (!fs.existsSync(filePath)) return [];

  const csv = fs.readFileSync(filePath, 'utf-8');
  const lines = csv.trim().split('\n');
  const rates: (number | null)[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [, rateStr] = line.split(',');
    const rate = parseFloat(rateStr);
    rates.push(!isNaN(rate) ? rate : null);
  }

  return rates;
}

function parsePriceCsv(csv: string): MonthlyPricePoint[] {
  const lines = csv.trim().split('\n');
  const points: MonthlyPricePoint[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    const [date, priceStr] = line.split(',');
    const price = parseFloat(priceStr);
    if (date && !isNaN(price)) points.push({ date, price });
  }

  return points;
}
