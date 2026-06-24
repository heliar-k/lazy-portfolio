import { useTranslation } from 'react-i18next';
import type { BacktestMetrics } from '@/engine/types';
import { formatPct, formatCurrency, formatNumber } from '@/lib/format';

interface ResultsDashboardProps {
  metrics: BacktestMetrics | null;
  status: 'idle' | 'running' | 'ready' | 'error';
}

export function ResultsDashboard({ metrics, status }: ResultsDashboardProps) {
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
    { label: t('metrics.totalReturn'), value: formatPct(metrics.twr, locale), positive: metrics.twr >= 0 },
    { label: t('metrics.cagr'), value: formatPct(metrics.cagr, locale), positive: metrics.cagr >= 0 },
    { label: t('metrics.stdDev'), value: formatPct(metrics.stdDevAnnualized, locale) },
    { label: t('metrics.maxDrawdown'), value: formatPct(metrics.maxDrawdown, locale)+`(${metrics.maxDrawdownStart.substring(0,7).replace('-','.')}~${metrics.maxDrawdownEnd.substring(0,7).replace('-','.')}~${metrics.maxDrawdownRecovery.substring(0,7).replace('-','.')})`, positive: false ,fontSize: 'text-sl' },
    { label: t('metrics.sharpeRatio'), value: formatNumber(metrics.sharpeRatio, locale, 2) },
    { label: t('metrics.sortinoRatio'), value: formatNumber(metrics.sortinoRatio, locale, 2) },
    { label: t('metrics.bestYear'), value: formatPct(metrics.bestYear.return, locale) + ` (${metrics.bestYear.year})` },
    { label: t('metrics.worstYear'), value: formatPct(metrics.worstYear.return, locale) + ` (${metrics.worstYear.year})` },
    { label: t('metrics.evl_date_range'), value: `${metrics.start_date.substring(0,7)} ~ ${metrics.end_date.substring(0,7)}`,fontSize: 'text-base' },
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
              className={`font-semibold ${
                card.positive === undefined
                  ? 'text-gray-900'
                  : card.positive
                    ? 'text-green-600'
                    : 'text-red-500'
              } ${card.fontSize || 'text-lg'}`}
            >
              {card.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
