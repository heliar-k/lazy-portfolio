import { useTranslation } from 'react-i18next';

export function MarketPage() {
  const { t } = useTranslation();

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        {t('market.title')}
      </h1>

      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p>Live market data coming soon.</p>
        <p className="text-sm mt-1">
          Current ETF prices, daily changes, and asset class returns
        </p>
      </div>
    </div>
  );
}
