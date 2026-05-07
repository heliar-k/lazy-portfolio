import { create } from 'zustand';
import type { DataVersion } from '../engine/types';
import type { EtfMapEntry } from '../data/loader';
import type { AssetIdentifier } from '../engine/types';

type DataStatus = 'loading' | 'ready' | 'error';

interface DataState {
  // ETF map
  etfMap: EtfMapEntry[];
  availableEtfs: AssetIdentifier[];
  // Data version
  dataVersion: DataVersion | null;
  // Status
  status: DataStatus;
  errorMessage: string | null;
  // Last checked
  lastChecked: string | null;

  // Actions
  setEtfMap: (map: EtfMapEntry[]) => void;
  setDataVersion: (version: DataVersion) => void;
  setReady: () => void;
  setError: (message: string) => void;
  setLoading: () => void;
}

export const useDataStore = create<DataState>()((set) => ({
  etfMap: [],
  availableEtfs: [],
  dataVersion: null,
  status: 'loading',
  errorMessage: null,
  lastChecked: null,

  setEtfMap: (etfMap) =>
    set({
      etfMap,
      availableEtfs: etfMap.map((e) => ({
        symbol: e.symbol,
        name: e.name,
        nameZh: e.nameZh,
        assetClass: e.assetClass as AssetIdentifier['assetClass'],
        region: e.region as AssetIdentifier['region'],
        currency: e.currency,
        provider: e.provider,
        expenseRatio: e.expenseRatio,
        inceptionDate: e.inceptionDate,
      })),
    }),

  setDataVersion: (version) =>
    set({ dataVersion: version, lastChecked: new Date().toISOString() }),

  setReady: () => set({ status: 'ready', errorMessage: null }),

  setError: (message) => set({ status: 'error', errorMessage: message }),

  setLoading: () => set({ status: 'loading', errorMessage: null }),
}));
