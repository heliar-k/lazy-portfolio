import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { PortfolioHolding, PortfolioDefinition } from '../engine/types';
import { validatePortfolio, normalizeWeights } from '../lib/validate';

interface PortfolioState {
  // Current working portfolio (may be unsaved)
  current: PortfolioDefinition;
  // Saved portfolios
  saved: PortfolioDefinition[];
  // Dirty flag (current differs from last saved)
  isDirty: boolean;
  // Index for generating unique IDs
  _nextId: number;

  // Actions
  setHoldings: (holdings: PortfolioHolding[]) => void;
  addHolding: (holding: PortfolioHolding) => void;
  removeHolding: (symbol: string) => void;
  setWeight: (symbol: string, weight: number) => void;
  normalizeWeights: () => void;
  setName: (name: string) => void;
  save: () => void;
  load: (id: string) => void;
  delete: (id: string) => void;
  reset: () => void;
  loadFromDefinition: (def: PortfolioDefinition) => void;
}

function emptyPortfolio(): PortfolioDefinition {
  return {
    id: '',
    name: '',
    holdings: [],
    tags: [],
  };
}

export const usePortfolioStore = create<PortfolioState>()(
  persist(
    (set, get) => ({
      current: emptyPortfolio(),
      saved: [],
      isDirty: false,
      _nextId: 1,

      setHoldings: (holdings) =>
        set((s) => ({
          current: { ...s.current, holdings },
          isDirty: true,
        })),

      addHolding: (holding) =>
        set((s) => {
          // Prevent duplicates
          if (s.current.holdings.some((h) => h.asset.symbol === holding.asset.symbol)) {
            return s;
          }
          // Max 20
          if (s.current.holdings.length >= 20) return s;

          return {
            current: {
              ...s.current,
              holdings: [...s.current.holdings, holding],
            },
            isDirty: true,
          };
        }),

      removeHolding: (symbol) =>
        set((s) => ({
          current: {
            ...s.current,
            holdings: s.current.holdings.filter((h) => h.asset.symbol !== symbol),
          },
          isDirty: true,
        })),

      setWeight: (symbol, weight) =>
        set((s) => ({
          current: {
            ...s.current,
            holdings: s.current.holdings.map((h) =>
              h.asset.symbol === symbol
                ? { ...h, targetWeight: Math.max(0, Math.min(1, weight)) }
                : h,
            ),
          },
          isDirty: true,
        })),

      normalizeWeights: () =>
        set((s) => ({
          current: {
            ...s.current,
            holdings: normalizeWeights(s.current.holdings),
          },
          isDirty: true,
        })),

      setName: (name) =>
        set((s) => ({
          current: { ...s.current, name },
          isDirty: true,
        })),

      save: () => {
        const state = get();
        const result = validatePortfolio(state.current);
        if (!result.valid) return;

        let portfolio: PortfolioDefinition;
        if (state.current.id) {
          // Update existing
          portfolio = { ...state.current };
        } else {
          // Create new
          portfolio = {
            ...state.current,
            id: `pf_${state._nextId}`,
          };
        }

        const existing = state.saved.findIndex((p) => p.id === portfolio.id);
        const saved =
          existing >= 0
            ? state.saved.map((p) => (p.id === portfolio.id ? portfolio : p))
            : [...state.saved, portfolio];

        set({
          current: portfolio,
          saved,
          isDirty: false,
          _nextId: existing >= 0 ? state._nextId : state._nextId + 1,
        });
      },

      load: (id) => {
        const state = get();
        const found = state.saved.find((p) => p.id === id);
        if (found) {
          set({ current: { ...found }, isDirty: false });
        }
      },

      delete: (id) =>
        set((s) => ({
          saved: s.saved.filter((p) => p.id !== id),
          current: s.current.id === id ? emptyPortfolio() : s.current,
          isDirty: s.current.id === id ? false : s.isDirty,
        })),

      reset: () =>
        set({
          current: emptyPortfolio(),
          isDirty: false,
        }),

      loadFromDefinition: (def) =>
        set({
          current: { ...def },
          isDirty: false,
        }),
    }),
    {
      name: 'lazy-portfolio-portfolios',
      version: 1,
    },
  ),
);
