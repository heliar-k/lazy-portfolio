import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { BacktestResult } from '@/engine/types';

interface AnnualReturnsChartProps {
  result: BacktestResult | null;
  status: 'idle' | 'running' | 'ready' | 'error';
}

export function AnnualReturnsChart({ result, status }: AnnualReturnsChartProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    if (!result || result.annualReturns.length === 0) return {};

    const years = result.annualReturns.map((r) => String(r.year));
    const returns = result.annualReturns.map((r) => r.return * 100);
    const colors = result.annualReturns.map((r) =>
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
          data: returns.map((val, i) => ({
            value: val,
            itemStyle: { color: colors[i], borderRadius: [2, 2, 0, 0] },
          })),
          emphasis: {
            itemStyle: { opacity: 0.8 },
          },
        },
      ],
    };
  }, [result]);

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
