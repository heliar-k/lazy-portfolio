import { loadEtfMap, loadProxySeries, loadCpiSeries, loadFxSeries } from './data-loader';
import type { EtfMapEntry } from './data-loader';
import { computeMonthlyReturns } from '../engine/returns';
import type {
  PortfolioHolding,
  MonthlyReturnPoint,
  DisplayCurrency,
} from '../engine/types';

export function resolvePortfolioData(
  holdings: PortfolioHolding[],
  displayCurrency: DisplayCurrency,
  inflationRegion: string,
  inflationAdjusted: boolean,
  dataDir?: string,
): {
  assetReturns: Map<string, MonthlyReturnPoint[]>;
  fxRates: Map<string, (number | null)[]>;
  cpiSeries: Map<string, number>;
} {
  const etfMap = loadEtfMap(dataDir);
  const etfBySymbol = new Map<string, EtfMapEntry>(
    etfMap.map((e) => [e.symbol, e]),
  );

  const assetReturns = new Map<string, MonthlyReturnPoint[]>();
  const fxRates = new Map<string, (number | null)[]>();

  for (const holding of holdings) {
    const symbol = holding.asset.symbol;
    const entry = etfBySymbol.get(symbol);
    if (!entry || !entry.proxySymbol) continue;

    const prices = loadProxySeries(entry.proxySymbol, dataDir);
    const returns = computeMonthlyReturns(prices);

    const isBlended = entry.proxySymbol.endsWith('_BLENDED');
    if (!isBlended && entry.expenseRatio > 0) {
      const monthlyER = entry.expenseRatio / 12;
      for (const rp of returns) {
        if (rp.totalReturn !== null) rp.totalReturn -= monthlyER;
      }
    }

    assetReturns.set(symbol, returns);

    if (holding.asset.currency !== displayCurrency) {
      const pair = `${holding.asset.currency}${displayCurrency}`;
      if (!fxRates.has(pair)) {
        const rates = loadFxSeries(pair, dataDir);
        if (rates.length > 0) fxRates.set(pair, rates);
      }
    }
  }

  const cpiSeries = inflationAdjusted
    ? loadCpiSeries(inflationRegion, dataDir)
    : new Map<string, number>();

  return { assetReturns, fxRates, cpiSeries };
}
