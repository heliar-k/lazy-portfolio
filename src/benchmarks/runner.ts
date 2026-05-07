import type { BacktestParameters, BacktestResult, MonthlyReturnPoint } from '../engine/types';
import type { BenchmarkDefinition } from '../engine/types';
import { loadProxySeries } from '../data/loader';
import { computeMonthlyReturns } from '../engine/returns';
import { runBacktest } from '../engine/backtest';
import { resolveCpiSeries, resolveFxRates } from '../data/proxy-registry';

/**
 * Run a backtest for a benchmark definition using the same parameters
 * as the user's portfolio (same date range, capital, currency, etc.).
 */
export async function runBenchmarkBacktest(
  params: BacktestParameters,
  benchmark: BenchmarkDefinition,
): Promise<BacktestResult> {
  // Load proxy returns for each benchmark holding
  const assetReturns = new Map<string, MonthlyReturnPoint[]>();

  for (const holding of benchmark.holdings) {
    const pricePoints = await loadProxySeries(holding.proxySymbol);
    const returns = computeMonthlyReturns(pricePoints);
    assetReturns.set(holding.proxySymbol, returns);
  }

  // Load CPI and FX data
  const cpiSeries = await resolveCpiSeries(params.inflationRegion);

  const fxRates = new Map<string, (number | null)[]>();
  // Benchmarks are always USD-nominated
  if (params.displayCurrency !== 'USD') {
    const rates = await resolveFxRates('USD', params.displayCurrency);
    fxRates.set(`USD${params.displayCurrency}`, rates);
  }

  // Build pseudo-portfolio with benchmark holdings
  const benchmarkParams: BacktestParameters = {
    ...params,
    portfolio: {
      id: `benchmark-${benchmark.id}`,
      name: benchmark.name,
      holdings: benchmark.holdings.map((h) => ({
        asset: {
          symbol: h.proxySymbol,
          name: h.proxySymbol,
          assetClass: 'us_large_cap',
          region: 'US',
          currency: 'USD',
          provider: 'Benchmark',
          expenseRatio: 0,
          inceptionDate: '1900-01-01',
        },
        targetWeight: h.weight,
      })),
      tags: [],
    },
  };

  return runBacktest(benchmarkParams, assetReturns, fxRates, cpiSeries);
}
