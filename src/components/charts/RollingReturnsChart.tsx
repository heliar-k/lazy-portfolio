import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { MonthlyTimeSeriesPoint } from '@/engine/types';

interface RollingReturnsChartProps {
  timeSeries: MonthlyTimeSeriesPoint[];
  status: 'idle' | 'running' | 'ready' | 'error';
}

function computeRollingReturns(
  timeSeries: MonthlyTimeSeriesPoint[],
  months: number,
): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < timeSeries.length; i++) {
    if (i < months) {
      result.push(null);
    } else {
      const startVal = timeSeries[i - months].portfolioValue;
      const endVal = timeSeries[i].portfolioValue;
      if (startVal > 0) {
        const years = months / 12;
        const totalReturn = endVal / startVal;
        result.push(Math.pow(totalReturn, 1 / years) - 1);
      } else {
        result.push(null);
      }
    }
  }
  return result;
}

export function RollingReturnsChart({ timeSeries, status }: RollingReturnsChartProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    if (!timeSeries || timeSeries.length < 36) return {};

    const dates = timeSeries.map((p) => p.date);
    const rolling3Y = computeRollingReturns(timeSeries, 36);
    const rolling5Y = computeRollingReturns(timeSeries, 60);
    const rolling10Y = computeRollingReturns(timeSeries, 120);

    const series: Record<string, unknown>[] = [
      {
        name: '3-Year Rolling',
        type: 'line',
        data: rolling3Y.map((v) => (v !== null ? (v * 100).toFixed(2) : null)),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#3b82f6', width: 1.5 },
      },
      {
        name: '5-Year Rolling',
        type: 'line',
        data: rolling5Y.map((v) => (v !== null ? (v * 100).toFixed(2) : null)),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#f97316', width: 1.5 },
      },
    ];

    if (timeSeries.length >= 120) {
      series.push({
        name: '10-Year Rolling',
        type: 'line',
        data: rolling10Y.map((v) => (v !== null ? (v * 100).toFixed(2) : null)),
        smooth: true,
        symbol: 'none',
        lineStyle: { color: '#22c55e', width: 1.5 },
      });
    }

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { axisValue: string; seriesName: string; value: number | null }[]) => {
          if (!params || params.length === 0) return '';
          let html = `<strong>${params[0].axisValue}</strong><br/>`;
          for (const p of params) {
            if (p.value !== null && p.value !== undefined) {
              html += `${p.seriesName}: ${Number(p.value).toFixed(2)}%<br/>`;
            }
          }
          return html;
        },
      },
      legend: {
        data: series.map((s) => s.name as string),
        top: 0,
        textStyle: { fontSize: 12 },
      },
      grid: { left: 50, right: 20, top: 35, bottom: 30 },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          fontSize: 10,
          formatter: (d: string) => {
            const [y, m] = d.split('-');
            return `${m}/${y.slice(2)}`;
          },
          interval: Math.floor(dates.length / 8),
        },
      },
      yAxis: {
        type: 'value',
        axisLabel: { formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      series,
    };
  }, [timeSeries]);

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

  if (!timeSeries || timeSeries.length < 36) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p>At least 3 years of data needed for rolling returns</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">Rolling Returns</h3>
      <ReactECharts option={option} style={{ height: 300 }} notMerge />
    </div>
  );
}
