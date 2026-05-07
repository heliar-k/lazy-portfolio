import { useMemo, useState } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { MonthlyTimeSeriesPoint } from '@/engine/types';
import { runMonteCarlo } from '@/engine/monte-carlo';

interface MonteCarloChartProps {
  timeSeries: MonthlyTimeSeriesPoint[];
  initialCapital: number;
  status: 'idle' | 'running' | 'ready' | 'error';
}

const SIMULATIONS = 1000;
const DEFAULT_YEARS = 10;

export function MonteCarloChart({ timeSeries, initialCapital, status }: MonteCarloChartProps) {
  const { t } = useTranslation();
  const [years, setYears] = useState(DEFAULT_YEARS);

  const result = useMemo(() => {
    if (!timeSeries || timeSeries.length < 12) return null;
    return runMonteCarlo({
      timeSeries,
      years,
      simulations: SIMULATIONS,
      initialCapital: initialCapital || 10000,
      monthlyContribution: 0,
    });
  }, [timeSeries, years, initialCapital]);

  const option = useMemo(() => {
    if (!result || result.months === 0) return {};

    const yearLabels: string[] = [];
    for (let y = 0; y <= years; y++) {
      yearLabels.push(t('chart.year', { n: y }));
    }

    // Build fan chart: fill between percentiles
    const series: Record<string, unknown>[] = [
      {
        name: '90th',
        type: 'line',
        data: result.percentilePaths[90] || [],
        smooth: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(59, 130, 246, 0.2)', width: 1 },
        areaStyle: { color: 'rgba(59, 130, 246, 0.05)' },
        stack: 'confidence',
      },
      {
        name: '75th',
        type: 'line',
        data: result.percentilePaths[75] || [],
        smooth: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(59, 130, 246, 0.2)', width: 1 },
        areaStyle: { color: 'rgba(59, 130, 246, 0.08)' },
        stack: 'confidence',
      },
      {
        name: 'Median',
        type: 'line',
        data: result.percentilePaths[50] || [],
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 2 },
      },
      {
        name: '25th',
        type: 'line',
        data: result.percentilePaths[25] || [],
        smooth: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(239, 68, 68, 0.15)', width: 1 },
        areaStyle: { color: 'rgba(239, 68, 68, 0.05)' },
      },
      {
        name: '10th',
        type: 'line',
        data: result.percentilePaths[10] || [],
        smooth: true,
        symbol: 'none',
        lineStyle: { color: 'rgba(239, 68, 68, 0.15)', width: 1 },
        areaStyle: { color: 'rgba(239, 68, 68, 0.08)' },
      },
    ];

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { seriesName: string; value: number }[]) => {
          if (!params || params.length === 0) return '';
          let html = '';
          for (const p of params) {
            html += `${p.seriesName}: $${p.value.toLocaleString()}<br/>`;
          }
          return html;
        },
      },
      legend: {
        data: ['10th', '25th', 'Median', '75th', '90th'],
        top: 0,
        textStyle: { fontSize: 11 },
      },
      grid: { left: 70, right: 20, top: 35, bottom: 30 },
      xAxis: {
        type: 'category',
        data: yearLabels,
        axisLabel: { fontSize: 10 },
      },
      yAxis: {
        type: 'value',
        axisLabel: {
          formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
          fontSize: 10,
        },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series,
    };
  }, [result, years, t]);

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

  if (!result || result.months === 0) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p>{t('chart.needMoreDataMC')}</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-semibold text-gray-700">{t('chart.monteCarlo')}</h3>
        <div className="flex items-center gap-3">
          <select
            value={years}
            onChange={(e) => setYears(Number(e.target.value))}
            className="text-xs border border-gray-200 rounded px-2 py-1"
          >
            {[5, 10, 15, 20, 25, 30].map((y) => (
              <option key={y} value={y}>{y} {t('chart.years')}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 mb-3">
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">{t('chart.probPositive')}</div>
          <div className="text-lg font-bold text-green-600">
            {(result.probabilityPositive * 100).toFixed(0)}%
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-2 text-center">
          <div className="text-xs text-gray-500">{t('chart.probBeatInflation')}</div>
          <div className="text-lg font-bold text-blue-600">
            {(result.probabilityBeatInflation * 100).toFixed(0)}%
          </div>
        </div>
      </div>

      <ReactECharts option={option} style={{ height: 300 }} notMerge />
    </div>
  );
}
