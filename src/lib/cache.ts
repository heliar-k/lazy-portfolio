import type { BacktestParameters, BacktestResult } from '../engine/types';

const CACHE_KEY_PREFIX = 'btcache_';
const MAX_ENTRIES = 20;

interface CacheEntry {
  key: string;
  params: BacktestParameters;
  result: BacktestResult;
  timestamp: number;
}

/**
 * Generate a deterministic cache key from backtest parameters.
 */
export function generateCacheKey(params: BacktestParameters): string {
  const { portfolio, startDate, endDate, initialCapital, displayCurrency,
    inflationRegion, inflationAdjusted, rebalancing, cashflows } = params;

  const holdingsKey = portfolio.holdings
    .map((h) => `${h.asset.symbol}:${h.targetWeight.toFixed(4)}`)
    .sort()
    .join(',');

  const cashflowKey = cashflows
    .map((c) => `${c.date}:${c.amount}:${c.type}:${c.recurring?.frequency ?? ''}:${c.recurring?.endDate ?? ''}`)
    .sort()
    .join(';');

  const rebalanceKey = rebalancing.type === 'calendar'
    ? `cal:${rebalancing.frequency}`
    : `band:${rebalancing.threshold}`;

  return [
    holdingsKey,
    startDate,
    endDate,
    String(initialCapital),
    displayCurrency,
    inflationRegion,
    String(inflationAdjusted),
    rebalanceKey,
    cashflowKey,
  ].join('|');
}

/**
 * Look up a cached backtest result.
 */
export function getCachedResult(params: BacktestParameters): BacktestResult | null {
  try {
    const key = generateCacheKey(params);
    const raw = localStorage.getItem(CACHE_KEY_PREFIX + key);
    if (!raw) return null;
    const entry: CacheEntry = JSON.parse(raw);
    // Touch the entry (update timestamp for LRU)
    entry.timestamp = Date.now();
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry));
    return entry.result;
  } catch {
    return null;
  }
}

/**
 * Store a backtest result in the cache.
 */
export function setCachedResult(params: BacktestParameters, result: BacktestResult): void {
  try {
    const key = generateCacheKey(params);
    const entry: CacheEntry = {
      key,
      params,
      result,
      timestamp: Date.now(),
    };
    localStorage.setItem(CACHE_KEY_PREFIX + key, JSON.stringify(entry));
    evictLRU();
  } catch {
    // localStorage full or unavailable — silently ignore
  }
}

/**
 * Evict oldest entries when cache exceeds MAX_ENTRIES.
 */
function evictLRU(): void {
  const entries: CacheEntry[] = [];

  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (k?.startsWith(CACHE_KEY_PREFIX)) {
      try {
        const raw = localStorage.getItem(k);
        if (raw) {
          entries.push(JSON.parse(raw));
        }
      } catch {
        // corrupt entry — skip
      }
    }
  }

  if (entries.length <= MAX_ENTRIES) return;

  // Sort oldest first, remove excess
  entries.sort((a, b) => a.timestamp - b.timestamp);
  const toRemove = entries.slice(0, entries.length - MAX_ENTRIES);
  for (const entry of toRemove) {
    localStorage.removeItem(CACHE_KEY_PREFIX + entry.key);
  }
}

/**
 * Clear all cached backtest results.
 */
export function clearBacktestCache(): void {
  const keysToRemove: string[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith(CACHE_KEY_PREFIX)) {
      keysToRemove.push(key);
    }
  }
  for (const key of keysToRemove) {
    localStorage.removeItem(key);
  }
}
