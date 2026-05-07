import { useTranslation } from 'react-i18next';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { EtfSelector } from '@/components/builder/EtfSelector';
import { WeightEditor } from '@/components/builder/WeightEditor';
import type { AssetIdentifier } from '@/engine/types';

export function PortfolioBuilder() {
  const { t } = useTranslation();
  const {
    current,
    saved,
    isDirty,
    addHolding,
    removeHolding,
    setWeight,
    normalizeWeights,
    save,
    load,
    delete: deletePortfolio,
    reset,
  } = usePortfolioStore();

  const selectedSymbols = new Set(current.holdings.map((h) => h.asset.symbol));

  const handleSelectEtf = (etf: AssetIdentifier) => {
    addHolding({
      asset: etf,
      targetWeight: 0,
    });
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('builder.title')}</h1>
        <div className="flex gap-2">
          {isDirty && (
            <button
              onClick={reset}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800
                border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('common.cancel')}
            </button>
          )}
          <button
            onClick={save}
            disabled={!isDirty || current.holdings.length === 0}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600
              rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors"
          >
            {t('common.save')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h2 className="text-sm font-semibold text-gray-700 mb-3">
              {t('builder.addEtf')}
            </h2>
            <EtfSelector
              onSelect={handleSelectEtf}
              selectedSymbols={selectedSymbols}
            />
          </div>
        </div>

        <div className="lg:col-span-2">
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <WeightEditor
              holdings={current.holdings}
              onWeightChange={setWeight}
              onRemove={removeHolding}
              onNormalize={normalizeWeights}
            />
          </div>
        </div>
      </div>

      {saved.length > 0 && (
        <div className="mt-8">
          <h2 className="text-lg font-semibold text-gray-900 mb-3">{t('builder.savedPortfolios')}</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {saved.map((p) => (
              <div
                key={p.id}
                className={`p-3 rounded-lg border cursor-pointer transition-colors
                  ${current.id === p.id
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300 bg-white'
                  }`}
                onClick={() => load(p.id)}
              >
                <div className="flex justify-between items-center">
                  <span className="font-medium text-sm">{p.name || t('builder.untitled')}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deletePortfolio(p.id);
                    }}
                    className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2}
                        d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  {p.holdings.map((h) => h.asset.symbol).join(', ')}
                </div>
                <div className="text-xs text-gray-400 mt-0.5">
                  {p.holdings.length} {t('templates.holdings')}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
