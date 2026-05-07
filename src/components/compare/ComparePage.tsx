import { useTranslation } from 'react-i18next';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useComparisonStore } from '@/stores/comparison-store';

export function ComparePage() {
  const { t } = useTranslation();
  const { saved } = usePortfolioStore();
  const { slots, setSlot, removeSlot, clearAll } =
    useComparisonStore();

  const handleSelectPortfolio = (slotIndex: number, portfolioId: string) => {
    const portfolio = saved.find((p) => p.id === portfolioId);
    if (portfolio) {
      setSlot(slotIndex, {
        id: portfolio.id,
        name: portfolio.name || 'Untitled',
        status: 'empty',
        result: null,
      });
    }
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('compare.title')}</h1>
        {slots.some((s) => s.id) && (
          <button
            onClick={clearAll}
            className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800
              border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            Clear All
          </button>
        )}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {slots.map((slot, i) => (
          <div
            key={i}
            className="bg-white rounded-xl border border-gray-200 p-6"
          >
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {t('compare.selectPortfolio', { index: i + 1 })}
            </h3>

            {saved.length === 0 ? (
              <p className="text-sm text-gray-400">
                Save a portfolio first in the Builder page
              </p>
            ) : (
              <select
                value={slot.id || ''}
                onChange={(e) => handleSelectPortfolio(i, e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">— Select —</option>
                {saved.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || 'Untitled'} ({p.holdings.length} holdings)
                  </option>
                ))}
              </select>
            )}

            {slot.id && (
              <div className="mt-3">
                <div className="text-xs text-gray-500 mb-1">
                  {slot.name}
                  {slot.status === 'loading' && ' — Running...'}
                  {slot.status === 'error' && ' — Failed'}
                </div>
                <button
                  onClick={() => removeSlot(i)}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  Remove
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
