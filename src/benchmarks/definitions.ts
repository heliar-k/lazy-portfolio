import type { BenchmarkDefinition } from '../engine/types';

/**
 * Built-in benchmark definitions for comparison.
 * Each uses proxy symbols directly (no ETF wrapper needed).
 */
export const BUILT_IN_BENCHMARKS: BenchmarkDefinition[] = [
  {
    id: 'sp500',
    name: 'S&P 500',
    holdings: [{ proxySymbol: 'SP500_TR', weight: 1.0 }],
  },
  {
    id: '6040',
    name: '60/40 Portfolio',
    holdings: [
      { proxySymbol: 'SP500_TR', weight: 0.6 },
      { proxySymbol: 'US_10Y_TR', weight: 0.4 },
    ],
  },
  {
    id: 'us_bonds',
    name: 'US Aggregate Bonds',
    holdings: [{ proxySymbol: 'US_AGG_BOND_TR', weight: 1.0 }],
  },
  {
    id: 'cash',
    name: 'Cash (T-Bills)',
    holdings: [{ proxySymbol: 'CASH', weight: 1.0 }],
  },
  {
    id: 'gold',
    name: 'Gold',
    holdings: [{ proxySymbol: 'GOLD_SPOT', weight: 1.0 }],
  },
];

/** Get a benchmark by ID. */
export function getBenchmark(id: string): BenchmarkDefinition | undefined {
  return BUILT_IN_BENCHMARKS.find((b) => b.id === id);
}
