import type { MonthlyPricePoint, DataVersion } from '../engine/types';

const BASE = '/data';

// In-memory cache for loaded data
const priceCache = new Map<string, MonthlyPricePoint[]>();
const cpiCache = new Map<string, Map<string, number>>();
const fxCache = new Map<string, (number | null)[]>();

let etfMapCache: EtfMapEntry[] | null = null;
let dataVersionCache: DataVersion | null = null;

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

/**
 * Load the ETF map from the bundled JSON file.
 */
export async function loadEtfMap(): Promise<EtfMapEntry[]> {
  if (etfMapCache) return etfMapCache;

  const res = await fetch(`${BASE}/etf_map.json`);
  if (!res.ok) throw new Error(`Failed to load ETF map: ${res.status}`);
  etfMapCache = await res.json();
  return etfMapCache!;
}

/**
 * Load the data version manifest.
 */
export async function loadDataVersion(): Promise<DataVersion> {
  if (dataVersionCache) return dataVersionCache;

  const res = await fetch(`${BASE}/data_version.json`);
  if (!res.ok) throw new Error(`Failed to load data version: ${res.status}`);
  dataVersionCache = await res.json();
  return dataVersionCache!;
}

/**
 * Load a proxy price series CSV and return parsed monthly price points.
 * CSV format: date,price
 */
export async function loadProxySeries(proxySymbol: string): Promise<MonthlyPricePoint[]> {
  const key = proxySymbol.toLowerCase();
  if (priceCache.has(key)) return priceCache.get(key)!;

  // Find the right subdirectory by checking common locations
  const dirs = ['equity', 'bond', 'real_estate', 'commodity'];
  let csv: string | null = null;

  for (const dir of dirs) {
    const url = `${BASE}/proxies/${dir}/${key}.csv`;
    const res = await fetch(url);
    // Skip HTML responses — Vite dev server returns index.html (200) for missing files
    if (res.ok && !res.headers.get('content-type')?.includes('text/html')) {
      csv = await res.text();
      break;
    }
  }

  if (csv === null) {
    throw new Error(`Proxy data not found for: ${proxySymbol}`);
  }

  const points = parsePriceCsv(csv);
  priceCache.set(key, points);
  return points;
}

/**
 * Load CPI series into a Map<date, cpiValue>.
 * CSV format: date,cpi
 */
export async function loadCpiSeries(region: string): Promise<Map<string, number>> {
  const key = `${region}_cpi`;
  if (cpiCache.has(key)) return cpiCache.get(key)!;

  const url = `${BASE}/inflation/${key}.csv`;
  const res = await fetch(url);
  if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
    return new Map();
  }

  const csv = await res.text();
  const map = parseCpiCsv(csv);
  cpiCache.set(key, map);
  return map;
}

/**
 * Load FX rate series for a currency pair.
 * CSV format: date,rate
 * Returns array of rates aligned with months (rate[i] = rate at end of month i).
 */
export async function loadFxSeries(pair: string): Promise<(number | null)[]> {
  const key = pair.toLowerCase();
  if (fxCache.has(key)) return fxCache.get(key)!;

  const url = `${BASE}/proxies/fx/${key}.csv`;
  const res = await fetch(url);
  if (!res.ok || res.headers.get('content-type')?.includes('text/html')) {
    return [];
  }

  const csv = await res.text();
  const rates = parseFxCsv(csv);
  fxCache.set(key, rates);
  return rates;
}

/** Parse a proxy price CSV string into MonthlyPricePoint[]. */
function parsePriceCsv(csv: string): MonthlyPricePoint[] {
  const lines = csv.trim().split('\n');
  // Skip header
  const points: MonthlyPricePoint[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const [date, priceStr] = line.split(',');
    const price = parseFloat(priceStr);

    if (date && !isNaN(price)) {
      points.push({ date, price });
    }
  }

  return points;
}

/** Parse a CPI CSV string into Map<date, cpiValue>. */
function parseCpiCsv(csv: string): Map<string, number> {
  const lines = csv.trim().split('\n');
  const map = new Map<string, number>();

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const [date, valueStr] = line.split(',');
    const value = parseFloat(valueStr);

    if (date && !isNaN(value)) {
      map.set(date, value);
    }
  }

  return map;
}

/** Parse an FX rate CSV into number[] sorted by date. */
function parseFxCsv(csv: string): (number | null)[] {
  const lines = csv.trim().split('\n');
  const rates: (number | null)[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    const [_date, rateStr] = line.split(',');
    const rate = parseFloat(rateStr);

    rates.push(!isNaN(rate) ? rate : null);
  }

  return rates;
}

/** Clear all cached data (useful for testing). */
export function clearCache(): void {
  priceCache.clear();
  cpiCache.clear();
  fxCache.clear();
  etfMapCache = null;
  dataVersionCache = null;
}
