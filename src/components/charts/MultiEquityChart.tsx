import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import type { MonthlyTimeSeriesPoint } from '@/engine/types';

const COLORS = ['#3b82f6', '#f97316', '#22c55e', '#8b5cf6'];

interface MultiEquityChartProps {
  series: { name: string; data: MonthlyTimeSeriesPoint[] }[];
}

export function MultiEquityChart({ series: inputSeries }: MultiEquityChartProps) {
  const option = useMemo(() => {
    const validSeries = inputSeries.filter((s) => s.data.length > 0);
    if (validSeries.length === 0) return {};

    // Use the first series dates as x-axis
    const dates = validSeries[0].data.map((p) => p.date);

    const chartSeries = validSeries.map((s, i) => ({
      name: s.name,
      type: 'line' as const,
      data: s.data.map((p) => p.portfolioValue),
      smooth: true,
      symbol: 'none' as const,
      lineStyle: { color: COLORS[i % COLORS.length], width: 2 },
    }));

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { axisValue: string; seriesName: string; value: number; color?: string }[]) => {
          if (!params || params.length === 0) return '';
          let html = `<strong>${params[0].axisValue}</strong><br/>`;
          for (const p of params) {
            html += `<span style="display:inline-block;margin-right:4px;border-radius:50%;width:8px;height:8px;background:${p.color};"></span>`;
            html += `${p.seriesName}: $${p.value.toLocaleString()}<br/>`;
          }
          return html;
        },
      },
      legend: {
        data: validSeries.map((s) => s.name),
        top: 0,
        textStyle: { fontSize: 12 },
      },
      grid: { left: 60, right: 20, top: 35, bottom: 30 },
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
        axisLabel: {
          formatter: (v: number) => `$${(v / 1000).toFixed(0)}k`,
          fontSize: 10,
        },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
      },
      dataZoom: [
        {
          type: 'slider',
          bottom: 0,
          height: 20,
          borderColor: '#e5e7eb',
        },
      ],
      series: chartSeries,
    };
  }, [inputSeries]);

  if (inputSeries.every((s) => s.data.length === 0)) {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p>Run comparison to see equity curves</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <ReactECharts option={option} style={{ height: 400 }} notMerge />
    </div>
  );
}
