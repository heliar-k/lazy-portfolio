/**
 * Yahoo Finance data fetcher for live ETF prices and historical data.
 *
 * In development, requests are proxied through Vite's dev server
 * (see vite.config.ts server.proxy) to bypass CORS and network restrictions.
 * In production, requests go directly to Yahoo Finance.
 */

export interface LiveQuote {
  symbol: string;
  name: string;
  price: number;
  change: number;
  changePct: number;
  previousClose: number;
  currency: string;
  timestamp: string;
}

export interface HistoricalPoint {
  date: string;
  price: number;
}

const CACHE_TTL = 15 * 60 * 1000; // 15 minutes

interface CacheEntry<T> {
  data: T;
  timestamp: number;
}

const quoteCache = new Map<string, CacheEntry<LiveQuote>>();
const historyCache = new Map<string, CacheEntry<HistoricalPoint[]>>();

// Use Vite proxy in dev, direct URL in production
const YAHOO_BASE = import.meta.env.DEV ? '/api/yahoo' : 'https://query1.finance.yahoo.com';

/**
 * Fetch live quote for a single ETF.
 */
export async function fetchLiveQuote(symbol: string): Promise<LiveQuote | null> {
  const cached = quoteCache.get(symbol);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1mo`;
    const res = await fetch(url);

    if (!res.ok) return null;

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return null;

    const meta = result.meta;
    const quote: LiveQuote = {
      symbol: meta.symbol,
      name: meta.shortName ?? meta.symbol,
      price: meta.regularMarketPrice,
      change: meta.regularMarketPrice - meta.previousClose,
      changePct: (meta.regularMarketPrice - meta.previousClose) / meta.previousClose,
      previousClose: meta.previousClose,
      currency: meta.currency ?? 'USD',
      timestamp: new Date().toISOString(),
    };

    quoteCache.set(symbol, { data: quote, timestamp: Date.now() });
    return quote;
  } catch {
    return null;
  }
}

/**
 * Fetch historical monthly prices for an ETF.
 * Used for gap-filling backtest data when bundled data is stale.
 */
export async function fetchHistoricalPrices(
  symbol: string,
  startDate: string,
  endDate: string,
): Promise<HistoricalPoint[]> {
  const cacheKey = `${symbol}:${startDate}:${endDate}`;
  const cached = historyCache.get(cacheKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const period1 = Math.floor(new Date(startDate + '-01').getTime() / 1000);
    const period2 = Math.floor(new Date(endDate + '-01').getTime() / 1000);

    const url = `${YAHOO_BASE}/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&period1=${period1}&period2=${period2}`;
    const res = await fetch(url);

    if (!res.ok) return [];

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close ?? [];

    const points: HistoricalPoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, quotes.length); i++) {
      if (quotes[i] === null || quotes[i] === undefined) continue;
      const date = new Date(timestamps[i] * 1000);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      points.push({
        date: `${y}-${m}-${d}`,
        price: quotes[i],
      });
    }

    historyCache.set(cacheKey, { data: points, timestamp: Date.now() });
    return points;
  } catch {
    return [];
  }
}

/**
 * Fetch live quotes for multiple symbols in parallel.
 */
export async function fetchLiveQuotes(
  symbols: string[],
): Promise<Map<string, LiveQuote | null>> {
  const results = new Map<string, LiveQuote | null>();

  // Fetch in batches to avoid rate limiting
  const batchSize = 5;
  for (let i = 0; i < symbols.length; i += batchSize) {
    const batch = symbols.slice(i, i + batchSize);
    const batchResults = await Promise.all(
      batch.map(async (symbol) => {
        const quote = await fetchLiveQuote(symbol);
        return { symbol, quote };
      }),
    );

    for (const { symbol, quote } of batchResults) {
      results.set(symbol, quote);
    }

    // Small delay between batches
    if (i + batchSize < symbols.length) {
      await new Promise((r) => setTimeout(r, 200));
    }
  }

  return results;
}

/**
 * Clear all cached quotes and historical data.
 */
export function clearYahooCache(): void {
  quoteCache.clear();
  historyCache.clear();
}
