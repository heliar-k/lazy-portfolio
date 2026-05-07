import {
  loadEtfMap,
  loadProxySeries,
  loadCpiSeries,
  loadFxSeries,
} from './loader';
import { computeMonthlyReturns } from '../engine/returns';
import type { EtfMapEntry } from './loader';
import type {
  AssetIdentifier,
  MonthlyReturnPoint,
  PortfolioHolding,
} from '../engine/types';

export interface ResolvedHolding {
  holding: PortfolioHolding;
  returns: MonthlyReturnPoint[];
  asset: AssetIdentifier;
}

/**
 * Resolve all holdings in a portfolio to their monthly return series.
 * Handles proxy fallback and currency conversion prep.
 */
export async function resolvePortfolioReturns(
  holdings: PortfolioHolding[],
): Promise<Map<string, MonthlyReturnPoint[]>> {
  const etfMap = await loadEtfMap();
  const etfBySymbol = new Map<string, EtfMapEntry>(
    etfMap.map((e) => [e.symbol, e]),
  );

  const result = new Map<string, MonthlyReturnPoint[]>();

  for (const holding of holdings) {
    const symbol = holding.asset.symbol;
    const entry = etfBySymbol.get(symbol);

    if (!entry) {
      console.warn(`ETF "${symbol}" not found in ETF map, skipping`);
      continue;
    }

    // Skip ETFs with no proxy data available (e.g., BTC placeholder)
    if (!entry.proxySymbol) {
      console.warn(`ETF "${symbol}" has no proxy data available, skipping`);
      continue;
    }

    // Load proxy price series
    const pricePoints = await loadProxySeries(entry.proxySymbol);

    // Convert prices to monthly returns
    const returnPoints = computeMonthlyReturns(pricePoints);

    result.set(symbol, returnPoints);
  }

  return result;
}

/**
 * Load CPI data for a given region.
 */
export async function resolveCpiSeries(
  region: string,
): Promise<Map<string, number>> {
  // Normalize region to CPI file name
  const cpiRegion = region.toLowerCase();
  return loadCpiSeries(cpiRegion);
}

/**
 * Load FX rates for converting from one currency to another.
 * Returns array of rates where index corresponds to month index.
 */
export async function resolveFxRates(
  fromCurrency: string,
  toCurrency: string,
): Promise<(number | null)[]> {
  if (fromCurrency === toCurrency) return [];

  const pair = `${fromCurrency}${toCurrency}`.toLowerCase();
  return loadFxSeries(pair);
}

/**
 * Get AssetIdentifier from ETF symbol for display purposes.
 */
export async function getAssetInfo(
  symbol: string,
): Promise<AssetIdentifier | null> {
  const etfMap = await loadEtfMap();
  const entry = etfMap.find((e) => e.symbol === symbol);
  if (!entry) return null;

  return {
    symbol: entry.symbol,
    name: entry.name,
    nameZh: entry.nameZh,
    assetClass: entry.assetClass as AssetIdentifier['assetClass'],
    region: entry.region as AssetIdentifier['region'],
    currency: entry.currency,
    provider: entry.provider,
    expenseRatio: entry.expenseRatio,
    inceptionDate: entry.inceptionDate,
  };
}

/**
 * Get all known ETF symbols for the builder UI.
 */
export async function getAvailableEtfs(): Promise<AssetIdentifier[]> {
  const etfMap = await loadEtfMap();
  return etfMap.map((entry) => ({
    symbol: entry.symbol,
    name: entry.name,
    nameZh: entry.nameZh,
    assetClass: entry.assetClass as AssetIdentifier['assetClass'],
    region: entry.region as AssetIdentifier['region'],
    currency: entry.currency,
    provider: entry.provider,
    expenseRatio: entry.expenseRatio,
    inceptionDate: entry.inceptionDate,
  }));
}
