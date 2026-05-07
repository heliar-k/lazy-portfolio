import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { fetchLiveQuotes, type LiveQuote } from '@/data/yahoo-finance';

const WATCH_SYMBOLS = [
  'VTI', 'VOO', 'SPY', 'VEA', 'VWO', 'BND', 'TLT', 'IEF',
  'SHY', 'BIL', 'GLD', 'VNQ', 'VXUS', 'QQQ', 'DIA',
];

export function MarketPage() {
  const { t } = useTranslation();
  const [quotes, setQuotes] = useState<Map<string, LiveQuote | null>>(new Map());
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);
      try {
        const result = await fetchLiveQuotes(WATCH_SYMBOLS);
        if (!cancelled) {
          setQuotes(result);
        }
      } catch {
        if (!cancelled) {
          setError('Failed to fetch live prices');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();
    return () => { cancelled = true; };
  }, []);

  const getQuote = (symbol: string): LiveQuote | null => quotes.get(symbol) ?? null;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('market.title')}</h1>

      {error && (
        <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-sm text-yellow-700">
          {t('market.unavailable')}
        </div>
      )}

      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
        {loading ? (
          <div className="p-12">
            <div className="animate-pulse space-y-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <div key={i} className="h-8 bg-gray-100 rounded" />
              ))}
            </div>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Symbol</th>
                <th className="text-left px-4 py-3 font-semibold text-gray-700">Name</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('market.price')}</th>
                <th className="text-right px-4 py-3 font-semibold text-gray-700">{t('market.dailyChange')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {WATCH_SYMBOLS.map((symbol) => {
                const quote = getQuote(symbol);
                return (
                  <tr key={symbol} className="hover:bg-gray-50">
                    <td className="px-4 py-2.5 font-medium text-gray-900">{symbol}</td>
                    <td className="px-4 py-2.5 text-gray-500">
                      {quote?.name ?? symbol}
                    </td>
                    <td className="px-4 py-2.5 text-right font-medium text-gray-900">
                      {quote ? `${quote.currency === 'USD' ? '$' : ''}${quote.price.toFixed(2)}` : '—'}
                    </td>
                    <td className={`px-4 py-2.5 text-right font-medium ${
                      !quote ? 'text-gray-400' :
                      quote.change >= 0 ? 'text-green-600' : 'text-red-500'
                    }`}>
                      {quote
                        ? `${quote.change >= 0 ? '+' : ''}${quote.change.toFixed(2)} (${(quote.changePct * 100).toFixed(2)}%)`
                        : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
