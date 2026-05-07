import { useTranslation } from 'react-i18next';
import type { BacktestMetrics } from '@/engine/types';
import { formatPct, formatCurrency, formatNumber } from '@/lib/format';

interface ResultsDashboardProps {
  metrics: BacktestMetrics | null;
  benchmarkMetrics?: BacktestMetrics | null;
  benchmarkName?: string;
  status: 'idle' | 'running' | 'ready' | 'error';
}

export function ResultsDashboard({
  metrics,
  benchmarkMetrics,
  benchmarkName,
  status,
}: ResultsDashboardProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (status === 'idle') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p>{t('backtest.noResults')}</p>
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="animate-pulse">
              <div className="h-3 bg-gray-200 rounded w-16 mb-2" />
              <div className="h-6 bg-gray-200 rounded w-24" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!metrics) return null;

  const cards = [
    { label: t('metrics.finalCapital'), value: formatCurrency(metrics.finalCapital, 'USD', locale) },
    { label: t('metrics.totalReturn'), value: formatPct(metrics.totalReturn, locale), positive: metrics.totalReturn >= 0 },
    { label: t('metrics.cagr'), value: formatPct(metrics.cagr, locale), positive: metrics.cagr >= 0 },
    { label: t('metrics.stdDev'), value: formatPct(metrics.stdDevAnnualized, locale) },
    { label: t('metrics.maxDrawdown'), value: formatPct(metrics.maxDrawdown, locale), positive: false },
    { label: t('metrics.sharpeRatio'), value: formatNumber(metrics.sharpeRatio, locale, 2) },
    { label: t('metrics.sortinoRatio'), value: formatNumber(metrics.sortinoRatio, locale, 2) },
    { label: t('metrics.bestYear'), value: formatPct(metrics.bestYear.return, locale) + ` (${metrics.bestYear.year})` },
    { label: t('metrics.worstYear'), value: formatPct(metrics.worstYear.return, locale) + ` (${metrics.worstYear.year})` },
    { label: t('metrics.positiveMonths'), value: formatPct(metrics.positiveMonthsPct, locale) },
    {
      label: t('metrics.rolling3y'),
      value: `${formatPct(metrics.rolling3YrBest, locale)} / ${formatPct(metrics.rolling3YrWorst, locale)}`,
    },
    {
      label: t('metrics.rolling5y'),
      value: `${formatPct(metrics.rolling5YrBest, locale)} / ${formatPct(metrics.rolling5YrWorst, locale)}`,
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {cards.map((card) => (
          <div key={card.label}>
            <div className="text-xs text-gray-500 mb-1">{card.label}</div>
            <div
              className={`text-lg font-semibold ${
                card.positive === undefined
                  ? 'text-gray-900'
                  : card.positive
                    ? 'text-green-600'
                    : 'text-red-500'
              }`}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>

      {benchmarkMetrics && benchmarkName && (
        <div className="mt-4 pt-4 border-t border-gray-100">
          <div className="text-xs text-gray-500 mb-2">
            {t('metrics.vs')} {benchmarkName}
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: t('metrics.cagrDelta'), value: metrics ? formatPct(metrics.cagr - benchmarkMetrics.cagr, locale) : '—', positive: metrics ? metrics.cagr >= benchmarkMetrics.cagr : undefined },
              { label: t('metrics.maxDrawdownDelta'), value: metrics ? formatPct(metrics.maxDrawdown - benchmarkMetrics.maxDrawdown, locale) : '—', positive: metrics ? metrics.maxDrawdown >= benchmarkMetrics.maxDrawdown : undefined },
              { label: t('metrics.sharpeDelta'), value: metrics ? formatNumber(metrics.sharpeRatio - benchmarkMetrics.sharpeRatio, locale, 2) : '—', positive: metrics ? metrics.sharpeRatio >= benchmarkMetrics.sharpeRatio : undefined },
              { label: t('metrics.finalCapitalDelta'), value: metrics ? formatCurrency(metrics.finalCapital - benchmarkMetrics.finalCapital, 'USD', locale) : '—', positive: metrics ? metrics.finalCapital >= benchmarkMetrics.finalCapital : undefined },
            ].map((card) => (
              <div key={card.label}>
                <div className="text-xs text-gray-500 mb-1">{card.label}</div>
                <div
                  className={`text-sm font-semibold ${
                    card.positive === undefined
                      ? 'text-gray-900'
                      : card.positive
                        ? 'text-green-600'
                        : 'text-red-500'
                  }`}
                >
                  {card.value}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
