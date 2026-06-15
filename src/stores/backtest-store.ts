import { create } from 'zustand';
import type {
  BacktestParameters,
  BacktestResult,
  CashflowEvent,
  DisplayCurrency,
  PortfolioDefinition,
  RebalancingStrategy,
  Region,
} from '../engine/types';

type ComputationStatus = 'idle' | 'running' | 'ready' | 'error';

interface BacktestState {
  // Parameters
  params: BacktestParameters;
  // Benchmark selection
  benchmarkId: string | null;
  // Results
  result: BacktestResult | null;
  benchmarkResult: BacktestResult | null;
  // Status
  status: ComputationStatus;
  errorMessage: string | null;
  // Cache
  cache: Map<string, BacktestResult>;

  // Actions
  setStartDate: (date: string) => void;
  setEndDate: (date: string) => void;
  setInitialCapital: (capital: number) => void;
  setDisplayCurrency: (currency: DisplayCurrency) => void;
  setInflationRegion: (region: Region) => void;
  setInflationAdjusted: (enabled: boolean) => void;
  setRebalancing: (strategy: RebalancingStrategy) => void;
  setCashflowTriggersRebalance: (enabled: boolean) => void;
  setCashflows: (cashflows: CashflowEvent[]) => void;
  setPortfolio: (portfolio: PortfolioDefinition) => void;
  setBenchmarkId: (id: string | null) => void;
  setResult: (result: BacktestResult) => void;
  setBenchmarkResult: (result: BacktestResult | null) => void;
  setRunning: () => void;
  setError: (message: string) => void;
  reset: () => void;
}

function defaultParams(): BacktestParameters {
  const now = new Date();
  const end = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const start = `${now.getFullYear() - 10}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  return {
    portfolio: { id: '', name: '', holdings: [], tags: [] },
    startDate: start,
    endDate: end,
    initialCapital: 10000,
    displayCurrency: 'USD',
    inflationRegion: 'US',
    inflationAdjusted: true,
    rebalancing: { type: 'calendar', frequency: 'annual' },
    cashflowTriggersRebalance: false,
    cashflows: [],
  };
}

export const useBacktestStore = create<BacktestState>()((set) => ({
  params: defaultParams(),
  benchmarkId: null,
  result: null,
  benchmarkResult: null,
  status: 'idle',
  errorMessage: null,
  cache: new Map(),

  setStartDate: (date) =>
    set((s) => ({ params: { ...s.params, startDate: date } })),

  setEndDate: (date) =>
    set((s) => ({ params: { ...s.params, endDate: date } })),

  setInitialCapital: (capital) =>
    set((s) => ({ params: { ...s.params, initialCapital: capital } })),

  setDisplayCurrency: (currency) =>
    set((s) => ({ params: { ...s.params, displayCurrency: currency } })),

  setInflationRegion: (region) =>
    set((s) => ({ params: { ...s.params, inflationRegion: region } })),

  setInflationAdjusted: (enabled) =>
    set((s) => ({ params: { ...s.params, inflationAdjusted: enabled } })),

  setRebalancing: (strategy) =>
    set((s) => ({ params: { ...s.params, rebalancing: strategy } })),

  setCashflowTriggersRebalance: (enabled) =>
    set((s) => ({ params: { ...s.params, cashflowTriggersRebalance: enabled } })),

  setCashflows: (cashflows) =>
    set((s) => ({ params: { ...s.params, cashflows } })),

  setPortfolio: (portfolio) =>
    set((s) => ({ params: { ...s.params, portfolio } })),

  setBenchmarkId: (id) =>
    set({ benchmarkId: id, benchmarkResult: null }),

  setResult: (result) =>
    set({ result, status: 'ready', errorMessage: null }),

  setBenchmarkResult: (benchmarkResult) =>
    set({ benchmarkResult }),

  setRunning: () =>
    set({ status: 'running', errorMessage: null }),

  setError: (message) =>
    set({ status: 'error', errorMessage: message }),

  reset: () =>
    set({ params: defaultParams(), result: null, benchmarkResult: null, benchmarkId: null, status: 'idle', errorMessage: null }),
}));
