import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useDataStore } from '@/stores/data-store';
import { loadEtfMap } from '@/data/loader';
import type { AssetIdentifier } from '@/engine/types';

interface EtfSelectorProps {
  onSelect: (etf: AssetIdentifier) => void;
  selectedSymbols: Set<string>;
}

export function EtfSelector({ onSelect, selectedSymbols }: EtfSelectorProps) {
  const { t } = useTranslation();
  const { etfMap, setEtfMap, setReady, setError } = useDataStore();
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (etfMap.length > 0) return;

    setLoading(true);
    loadEtfMap()
      .then((map) => {
        setEtfMap(map);
        setReady();
      })
      .catch((err) => {
        setError(err.message);
      })
      .finally(() => setLoading(false));
  }, [etfMap.length, setEtfMap, setReady, setError]);

  const availableEtfs = etfMap
    .map((e) => ({
      symbol: e.symbol,
      name: e.name,
      nameZh: e.nameZh,
      assetClass: e.assetClass as AssetIdentifier['assetClass'],
      region: e.region as AssetIdentifier['region'],
      currency: e.currency,
      provider: e.provider,
      expenseRatio: e.expenseRatio,
      inceptionDate: e.inceptionDate,
    }))
    .filter((e) => {
      if (!search) return true;
      const q = search.toLowerCase();
      return (
        e.symbol.toLowerCase().includes(q) ||
        e.name.toLowerCase().includes(q) ||
        e.nameZh?.includes(q)
      );
    });

  if (loading) {
    return (
      <div className="p-4">
        <div className="animate-pulse space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 bg-gray-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder={t('builder.searchPlaceholder')}
        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
          focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
      />
      <div className="mt-2 max-h-96 overflow-y-auto space-y-1">
        {availableEtfs.map((etf) => {
          const isSelected = selectedSymbols.has(etf.symbol);
          return (
            <button
              key={etf.symbol}
              disabled={isSelected}
              onClick={() => onSelect(etf)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-colors
                ${isSelected
                  ? 'bg-blue-50 text-blue-400 cursor-not-allowed'
                  : 'hover:bg-gray-100 text-gray-700'
                }`}
            >
              <div className="flex justify-between items-center">
                <span className="font-semibold">{etf.symbol}</span>
                <span className="text-xs text-gray-400">{etf.currency}</span>
              </div>
              <div className="text-xs text-gray-500 truncate">
                {etf.name}
                {etf.nameZh && <span className="ml-1 text-gray-400">({etf.nameZh})</span>}
              </div>
            </button>
          );
        })}
        {availableEtfs.length === 0 && search && (
          <p className="text-sm text-gray-400 text-center py-4">{t('common.noDataFound')}</p>
        )}
      </div>
    </div>
  );
}
