import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { PortfolioHolding } from '@/engine/types';

interface WeightEditorProps {
  holdings: PortfolioHolding[];
  portfolioName: string;
  onWeightChange: (symbol: string, weight: number) => void;
  onRemove: (symbol: string) => void;
  onNormalize: () => void;
  onNameChange: (name: string) => void;
}

export function WeightEditor({
  holdings,
  portfolioName,
  onWeightChange,
  onRemove,
  onNormalize,
  onNameChange,
}: WeightEditorProps) {
  const { t } = useTranslation();
  // Local string state per symbol so user can type freely without store re-renders interfering
  const [localInputs, setLocalInputs] = useState<Record<string, string>>({});

  const totalWeight = holdings.reduce((s, h) => s + h.targetWeight, 0);
  const totalPct = (totalWeight * 100).toFixed(1);
  const isBalanced = Math.abs(totalWeight - 1.0) < 0.001;

  return (
    <div>
      {/* Portfolio name input */}
      <div className="mb-4">
        <input
          type="text"
          value={portfolioName}
          onChange={(e) => onNameChange(e.target.value)}
          placeholder={t('builder.namePlaceholder')}
          className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-medium
            focus:outline-none focus:ring-2 focus:ring-blue-500 placeholder:text-gray-400"
        />
      </div>

      {holdings.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-gray-400">
          <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
              d="M12 4v16m8-8H4" />
          </svg>
          <p className="text-sm">{t('builder.noEtfs')}</p>
        </div>
      ) : (
        <>
          {/* Header row */}
          <div className="flex items-center gap-2 px-2 mb-1 text-xs text-gray-400">
            <span className="flex-1">{t('builder.name')}</span>
            <span className="w-20 text-right">{t('builder.weight')}</span>
            <span className="w-4" />
          </div>

          <div className="space-y-1.5">
            {holdings.map((h) => (
              <div
                key={h.asset.symbol}
                className="flex items-center gap-2 px-2 py-2 bg-gray-50 rounded-lg"
              >
                <div className="flex-1 min-w-0">
                  <span className="font-semibold text-sm">{h.asset.symbol}</span>
                  <span className="text-xs text-gray-400 ml-1.5 truncate hidden sm:inline">
                    {h.asset.name}
                  </span>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    min="0"
                    max="100"
                    step="0.5"
                    value={localInputs[h.asset.symbol] ?? (h.targetWeight * 100).toFixed(1)}
                    onChange={(e) => {
                      setLocalInputs((prev) => ({ ...prev, [h.asset.symbol]: e.target.value }));
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 0 && v <= 100) onWeightChange(h.asset.symbol, v / 100);
                    }}
                    onBlur={(e) => {
                      // Commit final value and clear local override
                      const v = parseFloat(e.target.value);
                      if (!isNaN(v) && v >= 0 && v <= 100) onWeightChange(h.asset.symbol, v / 100);
                      setLocalInputs((prev) => {
                        const next = { ...prev };
                        delete next[h.asset.symbol];
                        return next;
                      });
                    }}
                    className="w-20 px-2 py-1 border border-gray-300 rounded text-sm text-right
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-xs text-gray-500">%</span>
                </div>
                <button
                  onClick={() => onRemove(h.asset.symbol)}
                  className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  title={t('builder.remove')}
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                      d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            ))}
          </div>

          <div className="mt-4 flex items-center gap-2">
            <span className="text-sm text-gray-600">{t('builder.totalWeight')}:</span>
            <span className={`text-sm font-semibold ${isBalanced ? 'text-green-600' : 'text-red-500'}`}>
              {totalPct}%
            </span>
            {!isBalanced && (
              <button
                onClick={onNormalize}
                className="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded
                  hover:bg-blue-200 transition-colors"
              >
                {t('builder.normalize')}
              </button>
            )}
          </div>
        </>
      )}
    </div>
  );
}
