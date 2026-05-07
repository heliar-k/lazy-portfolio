import { useTranslation } from 'react-i18next';
import type { PortfolioHolding } from '@/engine/types';

interface WeightEditorProps {
  holdings: PortfolioHolding[];
  onWeightChange: (symbol: string, weight: number) => void;
  onRemove: (symbol: string) => void;
  onNormalize: () => void;
}

export function WeightEditor({
  holdings,
  onWeightChange,
  onRemove,
  onNormalize,
}: WeightEditorProps) {
  const { t } = useTranslation();

  const totalWeight = holdings.reduce((s, h) => s + h.targetWeight, 0);
  const totalPct = (totalWeight * 100).toFixed(1);
  const isBalanced = Math.abs(totalWeight - 1.0) < 0.001;

  if (holdings.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-16 text-gray-400">
        <svg className="w-12 h-12 mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5}
            d="M12 4v16m8-8H4" />
        </svg>
        <p className="text-sm">{t('builder.noEtfs')}</p>
      </div>
    );
  }

  return (
    <div>
      <div className="space-y-3">
        {holdings.map((h) => (
          <div
            key={h.asset.symbol}
            className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg"
          >
            <div className="flex-1 min-w-0">
              <div className="flex justify-between items-center mb-1">
                <span className="font-semibold text-sm">{h.asset.symbol}</span>
                <span className="text-xs text-gray-500">
                  {(h.targetWeight * 100).toFixed(1)}%
                </span>
              </div>
              <input
                type="range"
                min="0"
                max="100"
                step="0.5"
                value={h.targetWeight * 100}
                onChange={(e) =>
                  onWeightChange(h.asset.symbol, parseFloat(e.target.value) / 100)
                }
                className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer
                  accent-blue-600"
              />
            </div>
            <button
              onClick={() => onRemove(h.asset.symbol)}
              className="p-1 text-gray-400 hover:text-red-500 transition-colors"
              title="Remove"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-gray-600">
            {t('builder.totalWeight')}:
          </span>
          <span
            className={`text-sm font-semibold ${
              isBalanced ? 'text-green-600' : 'text-red-500'
            }`}
          >
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
      </div>
    </div>
  );
}
