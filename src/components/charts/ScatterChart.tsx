import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { BacktestMetrics } from '@/engine/types';

interface ScatterChartProps {
  metrics: BacktestMetrics | null;
  benchmarkMetrics?: BacktestMetrics | null;
  benchmarkName?: string;
  status: 'idle' | 'running' | 'ready' | 'error';
}

export function ScatterChart({ metrics, benchmarkMetrics, benchmarkName, status }: ScatterChartProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    if (!metrics) return {};

    const data: { name: string; value: [number, number]; itemStyle: { color: string } }[] = [
      {
        name: t('chart.portfolio'),
        value: [metrics.stdDevAnnualized * 100, metrics.cagr * 100],
        itemStyle: { color: '#3b82f6' },
      },
    ];

    if (benchmarkMetrics) {
      data.push({
        name: benchmarkName || 'Benchmark',
        value: [benchmarkMetrics.stdDevAnnualized * 100, benchmarkMetrics.cagr * 100],
        itemStyle: { color: '#f97316' },
      });
    }

    return {
      tooltip: {
        trigger: 'item',
        formatter: (params: { name: string; value: number[] }) =>
          `<strong>${params.name}</strong><br/>Std Dev: ${params.value[0].toFixed(1)}%<br/>CAGR: ${params.value[1].toFixed(1)}%`,
      },
      grid: { left: 55, right: 30, top: 20, bottom: 40 },
      xAxis: {
        type: 'value',
        name: t('metrics.stdDev'),
        nameLocation: 'center',
        nameGap: 25,
        nameTextStyle: { fontSize: 11 },
        axisLabel: { formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      yAxis: {
        type: 'value',
        name: t('chart.cagr'),
        nameLocation: 'center',
        nameGap: 40,
        nameTextStyle: { fontSize: 11 },
        axisLabel: { formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series: [
        {
          type: 'scatter',
          data,
          symbolSize: 16,
          label: {
            show: true,
            formatter: '{b}',
            position: 'right',
            distance: 8,
            fontSize: 11,
            color: '#374151',
          },
          emphasis: {
            scale: 1.3,
            label: { fontSize: 13, fontWeight: 'bold' },
          },
        },
      ],
    };
  }, [metrics, benchmarkMetrics, benchmarkName, t]);

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

  if (!metrics) return null;

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('chart.riskReturn')}</h3>
      <ReactECharts option={option} style={{ height: 280 }} notMerge />
    </div>
  );
}
