import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { BacktestResult } from '@/engine/types';

interface AnnualReturnsChartProps {
  result: BacktestResult | null;
  status: 'idle' | 'running' | 'ready' | 'error';
  brushWindow?: { start: string; end: string } | null;
}

export function AnnualReturnsChart({ result, status, brushWindow }: AnnualReturnsChartProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    if (!result || result.annualReturns.length === 0) return {};

    let returns = result.annualReturns;

    // Filter by brushWindow
    if (brushWindow) {
      const startYear = parseInt(brushWindow.start.slice(0, 4));
      const endYear = parseInt(brushWindow.end.slice(0, 4));
      returns = returns.filter((r) => r.year >= startYear && r.year <= endYear);
    }

    if (returns.length === 0) return {};

    const years = returns.map((r) => String(r.year));
    const values = returns.map((r) => r.return * 100);
    const colors = returns.map((r) =>
      r.return >= 0 ? '#22c55e' : '#ef4444',
    );

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { name: string; value: number; color: string }[]) => {
          if (!params || params.length === 0) return '';
          const p = params[0];
          return `${p.name}: <strong style="color:${p.color}">${p.value.toFixed(1)}%</strong>`;
        },
      },
      grid: { left: 50, right: 20, top: 10, bottom: 30 },
      xAxis: {
        type: 'category',
        data: years,
        axisLabel: { fontSize: 10, rotate: years.length > 15 ? 45 : 0 },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series: [
        {
          type: 'bar',
          data: values.map((val, i) => ({
            value: val,
            itemStyle: { color: colors[i], borderRadius: [2, 2, 0, 0] },
          })),
          emphasis: {
            itemStyle: { opacity: 0.8 },
          },
        },
      ],
    };
  }, [result, brushWindow]);

  if (status === 'idle') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p>{t('backtest.noResults')}</p>
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12">
        <div className="animate-pulse h-64 bg-gray-100 rounded" />
      </div>
    );
  }

  if (!result) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Annual Returns</h3>
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
    </div>
  );
}
