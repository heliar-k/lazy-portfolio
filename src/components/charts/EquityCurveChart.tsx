import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { MonthlyTimeSeriesPoint } from '@/engine/types';

interface EquityCurveChartProps {
  timeSeries: MonthlyTimeSeriesPoint[];
  status: 'idle' | 'running' | 'ready' | 'error';
}

export function EquityCurveChart({ timeSeries, status }: EquityCurveChartProps) {
  const option = useMemo(() => {
    if (!timeSeries || timeSeries.length === 0) return {};

    const dates = timeSeries.map((p) => p.date);
    const values = timeSeries.map((p) => p.portfolioValue);
    const realValues = timeSeries.map((p) => p.portfolioValueReal);
    const drawdowns = timeSeries.map((p) => p.drawdown * 100); // as percentage

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { axisValue: string; data: number; seriesName: string; color: string }[]) => {
          if (!params || params.length === 0) return '';
          let html = `<strong>${params[0].axisValue}</strong><br/>`;
          for (const p of params) {
            if (p.seriesName === 'Drawdown') {
              html += `${p.seriesName}: ${p.data.toFixed(2)}%<br/>`;
            } else {
              html += `${p.seriesName}: $${p.data.toLocaleString()}<br/>`;
            }
          }
          return html;
        },
      },
      legend: {
        data: ['Portfolio Value', 'Real Value (Inflation-Adjusted)', 'Drawdown'],
        top: 0,
        textStyle: { fontSize: 12 },
      },
      grid: [
        { left: 60, right: 20, top: 40, height: '55%' },
        { left: 60, right: 20, top: '70%', height: '20%' },
      ],
      xAxis: [
        {
          type: 'category',
          data: dates,
          gridIndex: 0,
          axisLabel: { show: false },
          axisLine: { show: false },
          axisTick: { show: false },
        },
        {
          type: 'category',
          data: dates,
          gridIndex: 1,
          axisLabel: {
            fontSize: 10,
            formatter: (d: string) => {
              const [y, m] = d.split('-');
              return `${m}/${y.slice(2)}`;
            },
            interval: Math.floor(dates.length / 12),
          },
        },
      ],
      yAxis: [
        {
          type: 'value',
          gridIndex: 0,
          axisLabel: {
            formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
            fontSize: 10,
          },
          splitLine: { lineStyle: { color: '#f0f0f0' } },
        },
        {
          type: 'value',
          gridIndex: 1,
          axisLabel: {
            formatter: '{value}%',
            fontSize: 10,
          },
          inverse: true,
          splitLine: { lineStyle: { color: '#f0f0f0' } },
        },
      ],
      dataZoom: [
        {
          type: 'slider',
          xAxisIndex: [0, 1],
          bottom: 0,
          height: 20,
          borderColor: '#e5e7eb',
        },
      ],
      series: [
        {
          name: 'Portfolio Value',
          type: 'line',
          data: values,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#3b82f6', width: 2 },
          xAxisIndex: 0,
          yAxisIndex: 0,
        },
        {
          name: 'Real Value (Inflation-Adjusted)',
          type: 'line',
          data: realValues,
          smooth: true,
          symbol: 'none',
          lineStyle: { color: '#93c5fd', width: 1.5, type: 'dashed' },
          xAxisIndex: 0,
          yAxisIndex: 0,
        },
        {
          name: 'Drawdown',
          type: 'line',
          data: drawdowns,
          smooth: false,
          symbol: 'none',
          lineStyle: { color: '#ef4444', width: 1 },
          areaStyle: { color: 'rgba(239, 68, 68, 0.15)' },
          xAxisIndex: 1,
          yAxisIndex: 1,
        },
      ],
    };
  }, [timeSeries]);

  if (status === 'idle') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p>Run a backtest to see the equity curve</p>
      </div>
    );
  }

  if (status === 'running') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12">
        <div className="animate-pulse h-80 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <ReactECharts option={option} style={{ height: 400 }} notMerge />
    </div>
  );
}
