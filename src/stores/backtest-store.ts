import { create } from 'zustand';
import type {
  BacktestParameters,
  BacktestResult,
  DisplayCurrency,
  Region,
  RebalancingStrategy,
  CashflowEvent,
  PortfolioDefinition,
} from '../engine/types';

type ComputationStatus = 'idle' | 'running' | 'ready' | 'error';

interface BacktestState {
  // Parameters
  params: BacktestParameters;
  // Results
  result: BacktestResult | null;
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
  setRebalancing: (strategy: RebalancingStrategy) => void;
  setCashflows: (cashflows: CashflowEvent[]) => void;
  setPortfolio: (portfolio: PortfolioDefinition) => void;
  setResult: (result: BacktestResult) => void;
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
    rebalancing: { type: 'calendar', frequency: 'annual' },
    cashflows: [],
  };
}

export const useBacktestStore = create<BacktestState>()((set) => ({
  params: defaultParams(),
  result: null,
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

  setRebalancing: (strategy) =>
    set((s) => ({ params: { ...s.params, rebalancing: strategy } })),

  setCashflows: (cashflows) =>
    set((s) => ({ params: { ...s.params, cashflows } })),

  setPortfolio: (portfolio) =>
    set((s) => ({ params: { ...s.params, portfolio } })),

  setResult: (result) =>
    set({ result, status: 'ready', errorMessage: null }),

  setRunning: () =>
    set({ status: 'running', errorMessage: null }),

  setError: (message) =>
    set({ status: 'error', errorMessage: message }),

  reset: () =>
    set({ params: defaultParams(), result: null, status: 'idle', errorMessage: null }),
}));
