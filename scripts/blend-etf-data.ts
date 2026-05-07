/**
 * Blend actual ETF price history (Yahoo Finance adjclose) with proxy data.
 *
 * For each top ETF, fetches historical adjclose prices and creates a blended
 * series that uses proxy data scaled to ETF level before inception, and real
 * ETF data after inception.
 *
 * Usage: npx tsx scripts/blend-etf-data.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProxyAgent, setGlobalDispatcher, fetch as undiciFetch } from 'undici';

const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:7890';
const DATA_DIR = path.resolve('public/data/proxies');

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

interface BlendConfig {
  symbol: string;       // ETF ticker
  proxyFile: string;    // path relative to DATA_DIR, e.g. "equity/sp500_tr.csv"
  outputFile: string;   // path relative to DATA_DIR, e.g. "equity/spy_blended.csv"
  proxySymbol: string;  // proxy symbol to update in etf_map.json
}

const BLEND_CONFIGS: BlendConfig[] = [
  {
    symbol: 'SPY',
    proxyFile: 'equity/sp500_tr.csv',
    outputFile: 'equity/spy_blended.csv',
    proxySymbol: 'SP500_TR',
  },
  {
    symbol: 'TLT',
    proxyFile: 'bond/us_long_tr.csv',
    outputFile: 'bond/tlt_blended.csv',
    proxySymbol: 'US_LONG_TR',
  },
  {
    symbol: 'BND',
    proxyFile: 'bond/us_agg_bond_tr.csv',
    outputFile: 'bond/bnd_blended.csv',
    proxySymbol: 'US_AGG_BOND_TR',
  },
  {
    symbol: 'SHY',
    proxyFile: 'bond/cash.csv',
    outputFile: 'bond/shy_blended.csv',
    proxySymbol: 'CASH',
  },
  {
    symbol: 'VTI',
    proxyFile: 'equity/sp500_tr.csv',
    outputFile: 'equity/vti_blended.csv',
    proxySymbol: 'SP500_TR',
  },
  {
    symbol: 'BIL',
    proxyFile: 'bond/cash.csv',
    outputFile: 'bond/bil_blended.csv',
    proxySymbol: 'CASH',
  },
  {
    symbol: 'GLD',
    proxyFile: 'commodity/gold_spot.csv',
    outputFile: 'commodity/gld_blended.csv',
    proxySymbol: 'GOLD_SPOT',
  },
  {
    symbol: 'AGG',
    proxyFile: 'bond/us_agg_bond_tr.csv',
    outputFile: 'bond/agg_blended.csv',
    proxySymbol: 'US_AGG_BOND_TR',
  },
];

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface PricePoint {
  date: string;
  price: number;
}

function loadCSV(filePath: string): PricePoint[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.trim().split('\n');
  return lines.slice(1).map(line => {
    const [date, price] = line.split(',');
    return { date, price: parseFloat(price) };
  });
}

function writeCSV(filePath: string, data: PricePoint[]): void {
  const lines = ['date,price'];
  for (const p of data) {
    lines.push(`${p.date},${p.price}`);
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
}

// ---------------------------------------------------------------------------
// Yahoo Finance fetch
// ---------------------------------------------------------------------------

async function fetchYahooHistory(symbol: string): Promise<PricePoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=max`;

  const res = await undiciFetch(url, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
    },
  });

  if (!res.ok) {
    throw new Error(`Yahoo Finance returned ${res.status} for ${symbol}`);
  }

  const json = await res.json() as any;
  const result = json?.chart?.result?.[0];
  if (!result) throw new Error(`No data for ${symbol}`);

  const timestamps: number[] = result.timestamp ?? [];
  const adjclose: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];

  const data: PricePoint[] = [];
  for (let i = 0; i < Math.min(timestamps.length, adjclose.length); i++) {
    if (adjclose[i] === null || adjclose[i] === undefined || adjclose[i] <= 0) continue;
    const d = new Date(timestamps[i] * 1000);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const lastDay = new Date(y, d.getMonth() + 1, 0).getDate();
    data.push({
      date: `${y}-${m}-${String(lastDay).padStart(2, '0')}`,
      price: adjclose[i],
    });
  }

  // Deduplicate by date — Yahoo may return intra-month timestamps that
  // map to the same end-of-month date; keep the last (most recent) entry.
  const seen = new Map<string, PricePoint>();
  for (const p of data) {
    seen.set(p.date, p);
  }
  return [...seen.values()];
}

// ---------------------------------------------------------------------------
// Blending
// ---------------------------------------------------------------------------

function blendSeries(
  proxyData: PricePoint[],
  etfData: PricePoint[],
): PricePoint[] {
  // Build lookup from proxy data by YYYY-MM
  const proxyByMonth = new Map<string, number>();
  for (const p of proxyData) {
    proxyByMonth.set(p.date.substring(0, 7), p.price);
  }

  // Find inception: first month where ETF has data
  const inceptionYM = etfData[0].date.substring(0, 7);
  const inceptionPrice = etfData[0].price;
  const proxyAtInception = proxyByMonth.get(inceptionYM);

  if (!proxyAtInception || proxyAtInception <= 0) {
    throw new Error(`Cannot blend: no proxy data at inception ${inceptionYM}`);
  }

  const ratio = inceptionPrice / proxyAtInception;
  console.log(`   Inception: ${inceptionYM}, ETF=${inceptionPrice.toFixed(2)}, proxy=${proxyAtInception.toFixed(2)}, ratio=${ratio.toFixed(6)}`);

  // Build blended series:
  // - Pre-inception: use scaled proxy
  // - Post-inception: use ETF data
  const etfByMonth = new Map<string, number>();
  for (const p of etfData) {
    etfByMonth.set(p.date.substring(0, 7), p.price);
  }

  const result: PricePoint[] = [];

  for (const proxy of proxyData) {
    const ym = proxy.date.substring(0, 7);
    const etfPrice = etfByMonth.get(ym);

    if (etfPrice !== undefined && etfPrice > 0) {
      // Post-inception: use actual ETF adjclose
      result.push({ date: proxy.date, price: etfPrice });
    } else if (proxy.price > 0) {
      // Pre-inception: use scaled proxy
      result.push({ date: proxy.date, price: Math.round(proxy.price * ratio * 10000) / 10000 });
    }
  }

  // Append any ETF data past the end of proxy data (avoid duplicate dates)
  const existingDates = new Set(result.map(p => p.date));
  const lastProxyDate = proxyData[proxyData.length - 1].date;
  for (const etf of etfData) {
    if (etf.date > lastProxyDate && !existingDates.has(etf.date)) {
      result.push(etf);
      existingDates.add(etf.date);
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  // Set up proxy
  let proxyOk = false;
  try {
    setGlobalDispatcher(new ProxyAgent(PROXY_URL));
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await undiciFetch('https://www.google.com', { method: 'HEAD', signal: controller.signal });
    clearTimeout(timeout);
    proxyOk = true;
    console.log(`Proxy ${PROXY_URL} available\n`);
  } catch {
    console.log(`Proxy ${PROXY_URL} unavailable — cannot fetch ETF data`);
    console.log('Blending requires Yahoo Finance access. Skipping.\n');
    process.exit(0);
  }

  for (const config of BLEND_CONFIGS) {
    console.log(`=== ${config.symbol} ===`);

    // Load proxy data
    const proxyPath = path.join(DATA_DIR, config.proxyFile);
    if (!fs.existsSync(proxyPath)) {
      console.log(`  Proxy file not found: ${proxyPath}, skipping\n`);
      continue;
    }
    const proxyData = loadCSV(proxyPath);
    console.log(`  Proxy: ${proxyData.length} points (${proxyData[0].date} to ${proxyData[proxyData.length - 1].date})`);

    // Fetch ETF data
    let etfData: PricePoint[];
    try {
      console.log(`  Fetching ${config.symbol} from Yahoo Finance...`);
      etfData = await fetchYahooHistory(config.symbol);
      console.log(`  ETF: ${etfData.length} points (${etfData[0].date} to ${etfData[etfData.length - 1].date})`);
    } catch (err) {
      console.log(`  Yahoo Finance error: ${(err as Error).message}, skipping\n`);
      continue;
    }

    // Blend
    try {
      const blended = blendSeries(proxyData, etfData);
      const outputPath = path.join(DATA_DIR, config.outputFile);
      writeCSV(outputPath, blended);
      console.log(`  Blended: ${blended.length} points (${blended[0].date} to ${blended[blended.length - 1].date})`);

      // Compute CAGR for verification
      const firstPrice = blended[0].price;
      const lastPrice = blended[blended.length - 1].price;
      const firstDate = new Date(blended[0].date);
      const lastDate = new Date(blended[blended.length - 1].date);
      const years = (lastDate.getTime() - firstDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
      const cagr = Math.pow(lastPrice / firstPrice, 1 / years) - 1;
      console.log(`  CAGR: ${(cagr * 100).toFixed(2)}% over ${years.toFixed(1)} years`);
      console.log(`  Saved: ${outputPath}\n`);
    } catch (err) {
      console.log(`  Blend error: ${(err as Error).message}\n`);
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  // Update etf_map.json
  console.log('=== Updating ETF mappings ===');
  const etfMapPath = path.join(DATA_DIR, '..', 'etf_map.json'); // public/data/etf_map.json
  const etfMap = JSON.parse(fs.readFileSync(etfMapPath, 'utf-8')) as any[];

  const updates: Record<string, string> = {
    'SPY': 'SPY_BLENDED',
    'TLT': 'TLT_BLENDED',
    'BND': 'BND_BLENDED',
    'SHY': 'SHY_BLENDED',
    'VTI': 'VTI_BLENDED',
    'BIL': 'BIL_BLENDED',
    'GLD': 'GLD_BLENDED',
    'AGG': 'AGG_BLENDED',
  };

  let updated = 0;
  for (const entry of etfMap) {
    if (updates[entry.symbol]) {
      entry.proxySymbol = updates[entry.symbol];
      updated++;
    }
  }

  fs.writeFileSync(etfMapPath, JSON.stringify(etfMap, null, 2) + '\n');
  console.log(`   Updated ${updated} ETF mappings to use blended data`);
  console.log('Done.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
