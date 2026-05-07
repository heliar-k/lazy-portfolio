/**
 * Quick script to fetch additional FX rates from Yahoo Finance.
 * Usage: npx tsx scripts/fetch-fx-rates.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:7890';
setGlobalDispatcher(new ProxyAgent(PROXY_URL));

const FX_DIR = path.resolve('public/data/proxies/fx');

// Pairs to fetch: fromCurrency + toCurrency → Yahoo symbol
const PAIRS: { from: string; to: string; symbol: string }[] = [
  { from: 'USD', to: 'GBP', symbol: 'GBP=X' },
  { from: 'USD', to: 'CAD', symbol: 'CAD=X' },
  { from: 'USD', to: 'AUD', symbol: 'AUD=X' },
];

interface FxPoint {
  date: string;
  rate: number;
}

async function fetchFxHistory(symbol: string): Promise<FxPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=max`;
  console.log(`  Fetching ${symbol}...`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`    HTTP ${res.status} for ${symbol}`);
      return [];
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      console.log(`    No data for ${symbol}`);
      return [];
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close ?? [];

    const points: FxPoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, quotes.length); i++) {
      if (quotes[i] === null || quotes[i] === undefined || quotes[i] <= 0) continue;
      const date = new Date(timestamps[i] * 1000);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, date.getMonth() + 1, 0).getDate();
      const d = String(lastDay).padStart(2, '0');
      points.push({ date: `${y}-${m}-${d}`, rate: quotes[i] });
    }

    console.log(`    Got ${points.length} months (${points[0]?.date} to ${points[points.length - 1]?.date})`);
    return points;
  } catch (err) {
    console.log(`    Error: ${(err as Error).message}`);
    return [];
  }
}

async function main() {
  console.log('Fetching additional FX rates...\n');

  for (const pair of PAIRS) {
    const data = await fetchFxHistory(pair.symbol);
    if (data.length === 0) {
      console.log(`  Skipping ${pair.from}${pair.to} (no data)`);
      continue;
    }

    const filename = `${pair.from.toLowerCase()}${pair.to.toLowerCase()}.csv`;
    const lines = ['date,rate'];
    for (const p of data) {
      lines.push(`${p.date},${p.rate}`);
    }
    fs.writeFileSync(path.join(FX_DIR, filename), lines.join('\n'));
    console.log(`  Saved ${filename} (${data.length} rows)`);

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  console.log('\nDone.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
