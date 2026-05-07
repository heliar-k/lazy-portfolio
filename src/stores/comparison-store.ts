import { create } from 'zustand';
import type { BacktestResult } from '../engine/types';

const MAX_SLOTS = 4;

type SlotStatus = 'empty' | 'loading' | 'ready' | 'error';

interface ComparisonSlot {
  id: string;
  name: string;
  result: BacktestResult | null;
  status: SlotStatus;
}

interface ComparisonState {
  slots: ComparisonSlot[];

  // Actions
  setSlot: (index: number, slot: ComparisonSlot) => void;
  setSlotResult: (index: number, result: BacktestResult) => void;
  setSlotLoading: (index: number) => void;
  setSlotError: (index: number) => void;
  removeSlot: (index: number) => void;
  clearAll: () => void;
}

function emptySlots(): ComparisonSlot[] {
  return Array.from({ length: MAX_SLOTS }, (_, i) => ({
    id: '',
    name: `Portfolio ${i + 1}`,
    result: null,
    status: 'empty' as SlotStatus,
  }));
}

export const useComparisonStore = create<ComparisonState>()((set) => ({
  slots: emptySlots(),

  setSlot: (index, slot) =>
    set((s) => {
      const slots = [...s.slots];
      if (index >= 0 && index < MAX_SLOTS) {
        slots[index] = slot;
      }
      return { slots };
    }),

  setSlotResult: (index, result) =>
    set((s) => {
      const slots = [...s.slots];
      if (index >= 0 && index < MAX_SLOTS) {
        slots[index] = {
          ...slots[index],
          result,
          status: 'ready',
          name: result.parameters.portfolio.name || slots[index].name,
        };
      }
      return { slots };
    }),

  setSlotLoading: (index) =>
    set((s) => {
      const slots = [...s.slots];
      if (index >= 0 && index < MAX_SLOTS) {
        slots[index] = { ...slots[index], status: 'loading' };
      }
      return { slots };
    }),

  setSlotError: (index) =>
    set((s) => {
      const slots = [...s.slots];
      if (index >= 0 && index < MAX_SLOTS) {
        slots[index] = { ...slots[index], status: 'error' };
      }
      return { slots };
    }),

  removeSlot: (index) =>
    set((s) => {
      const slots = [...s.slots];
      if (index >= 0 && index < MAX_SLOTS) {
        slots[index] = { id: '', name: `Portfolio ${index + 1}`, result: null, status: 'empty' };
      }
      return { slots };
    }),

  clearAll: () => set({ slots: emptySlots() }),
}));
