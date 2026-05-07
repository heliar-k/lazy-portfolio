import { useTranslation } from 'react-i18next';
import type { BacktestMetrics } from '@/engine/types';
import { formatPct, formatCurrency, formatNumber } from '@/lib/format';

export interface CompEntry {
  name: string;
  metrics: BacktestMetrics;
  isPrimary?: boolean;
}

interface ComparisonTableProps {
  entries: CompEntry[];
}

type BestFn = (entries: CompEntry[]) => string;

export function ComparisonTable({ entries }: ComparisonTableProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;

  if (entries.length === 0) return null;

  const highestBest = (key: keyof BacktestMetrics): BestFn =>
    (es) => es.reduce((b, e) => (e.metrics[key] as number) > (b.metrics[key] as number) ? e : b, es[0]).name;

  const lowestBest = (key: keyof BacktestMetrics): BestFn =>
    (es) => es.reduce((b, e) => (e.metrics[key] as number) < (b.metrics[key] as number) ? e : b, es[0]).name;

  const rows: { label: string; get: (m: BacktestMetrics) => string; best: BestFn | null }[] = [
    {
      label: t('metrics.cagr'),
      get: (m) => formatPct(m.cagr, locale),
      best: highestBest('cagr'),
    },
    {
      label: t('metrics.totalReturn'),
      get: (m) => formatPct(m.totalReturn, locale),
      best: highestBest('totalReturn'),
    },
    {
      label: t('metrics.stdDev'),
      get: (m) => formatPct(m.stdDevAnnualized, locale),
      best: lowestBest('stdDevAnnualized'),
    },
    {
      label: t('metrics.maxDrawdown'),
      get: (m) => formatPct(m.maxDrawdown, locale),
      best: (es) => es.reduce((b, e) => e.metrics.maxDrawdown > b.metrics.maxDrawdown ? e : b, es[0]).name,
    },
    {
      label: t('metrics.sharpeRatio'),
      get: (m) => formatNumber(m.sharpeRatio, locale, 2),
      best: highestBest('sharpeRatio'),
    },
    {
      label: t('metrics.sortinoRatio'),
      get: (m) => formatNumber(m.sortinoRatio, locale, 2),
      best: highestBest('sortinoRatio'),
    },
    {
      label: t('metrics.bestYear'),
      get: (m) => `${formatPct(m.bestYear.return, locale)} (${m.bestYear.year})`,
      best: (es) => es.reduce((b, e) => e.metrics.bestYear.return > b.metrics.bestYear.return ? e : b, es[0]).name,
    },
    {
      label: t('metrics.worstYear'),
      get: (m) => `${formatPct(m.worstYear.return, locale)} (${m.worstYear.year})`,
      best: (es) => es.reduce((b, e) => e.metrics.worstYear.return > b.metrics.worstYear.return ? e : b, es[0]).name,
    },
    {
      label: t('metrics.positiveMonths'),
      get: (m) => formatPct(m.positiveMonthsPct, locale),
      best: highestBest('positiveMonthsPct'),
    },
    {
      label: t('metrics.rolling3y'),
      get: (m) => `${formatPct(m.rolling3YrBest, locale)} / ${formatPct(m.rolling3YrWorst, locale)}`,
      best: null,
    },
    {
      label: t('metrics.rolling5y'),
      get: (m) => `${formatPct(m.rolling5YrBest, locale)} / ${formatPct(m.rolling5YrWorst, locale)}`,
      best: null,
    },
    {
      label: t('metrics.finalCapital'),
      get: (m) => formatCurrency(m.finalCapital, 'USD', locale),
      best: highestBest('finalCapital'),
    },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            <th className="text-left px-4 py-3 font-semibold text-gray-600 w-36">{t('compare.metric')}</th>
            {entries.map((e, i) => (
              <th
                key={i}
                className={`text-right px-4 py-3 font-semibold ${e.isPrimary ? 'text-blue-700' : 'text-gray-700'}`}
              >
                <div>{e.name}</div>
                {e.isPrimary && (
                  <div className="text-xs font-normal text-blue-400">{t('compare.primary')}</div>
                )}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-100">
          {rows.map((row) => {
            const bestName = row.best && entries.length > 1 ? row.best(entries) : null;
            return (
              <tr key={row.label} className="hover:bg-gray-50">
                <td className="px-4 py-2.5 text-gray-500 text-xs font-medium">{row.label}</td>
                {entries.map((e, i) => {
                  const isBest = bestName === e.name;
                  return (
                    <td
                      key={i}
                      className={`text-right px-4 py-2.5 font-medium tabular-nums ${
                        isBest ? 'text-green-600' : 'text-gray-800'
                      }`}
                    >
                      {row.get(e.metrics)}
                      {isBest && <span className="ml-1 text-green-400 text-xs">▲</span>}
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
