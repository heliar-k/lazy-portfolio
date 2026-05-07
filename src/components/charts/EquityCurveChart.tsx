import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { MonthlyTimeSeriesPoint } from '@/engine/types';
import { C } from '@/lib/chart-colors';

interface EquityCurveChartProps {
  timeSeries: MonthlyTimeSeriesPoint[];
  benchmarkTimeSeries?: MonthlyTimeSeriesPoint[];
  benchmarkName?: string;
  status: 'idle' | 'running' | 'ready' | 'error';
  onBrush?: (start: string | null, end: string | null) => void;
}

export function EquityCurveChart({
  timeSeries,
  benchmarkTimeSeries,
  benchmarkName,
  status,
  onBrush,
}: EquityCurveChartProps) {
  const { t } = useTranslation();
  const onEvents = useMemo(() => {
    if (!onBrush) return undefined;
    return {
      dataZoom: (params: { batch?: { start?: number; end?: number }[] }) => {
        const batch = params?.batch ?? [params as { start?: number; end?: number }];
        if (batch.length === 0) return;
        const dz = batch[0];
        if (dz?.start !== undefined && dz?.end !== undefined) {
          const dates = timeSeries.map((p) => p.date);
          const startIdx = Math.floor(dz.start / 100 * (dates.length - 1));
          const endIdx = Math.ceil(dz.end / 100 * (dates.length - 1));
          const isFullRange = startIdx === 0 && endIdx >= dates.length - 1;
          onBrush(
            isFullRange ? null : dates[startIdx] ?? null,
            isFullRange ? null : dates[endIdx] ?? null,
          );
        }
      },
    };
  }, [onBrush, timeSeries]);

  const option = useMemo(() => {
    if (!timeSeries || timeSeries.length === 0) return {};

    const dates = timeSeries.map((p) => p.date);
    const values = timeSeries.map((p) => p.portfolioValue);
    const realValues = timeSeries.map((p) => p.portfolioValueReal);
    const drawdowns = timeSeries.map((p) => p.drawdown * 100);

    const legendData = [t('chart.portfolioValue')];
    if (realValues.some((v) => v !== values.find((pv, i) => pv === timeSeries[i]?.portfolioValueReal))) {
      legendData.push(t('chart.realValue'));
    }
    legendData.push(t('chart.drawdown'));

    const series: Record<string, unknown>[] = [
      {
        name: t('chart.portfolioValue'),
        type: 'line',
        data: values,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: C.portfolio, width: 2 },
        xAxisIndex: 0,
        yAxisIndex: 0,
      },
      {
        name: t('chart.realValue'),
        type: 'line',
        data: realValues,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: C.portfolioReal, width: 1.5, type: 'dashed' },
        xAxisIndex: 0,
        yAxisIndex: 0,
      },
      {
        name: t('chart.drawdown'),
        type: 'line',
        data: drawdowns,
        smooth: false,
        symbol: 'none',
        lineStyle: { color: C.drawdown, width: 1 },
        areaStyle: { color: C.drawdownArea },
        xAxisIndex: 1,
        yAxisIndex: 1,
      },
    ];

    // Add benchmark series if provided
    if (benchmarkTimeSeries && benchmarkTimeSeries.length > 0) {
      const benchName = benchmarkName || t('chart.benchmark');
      const benchValues = benchmarkTimeSeries.map((p) => p.portfolioValue);
      legendData.splice(1, 0, benchName);
      series.splice(1, 0, {
        name: benchName,
        type: 'line',
        data: benchValues,
        smooth: true,
        symbol: 'none',
        lineStyle: { color: C.series[1], width: 2, type: 'dotted' },
        xAxisIndex: 0,
        yAxisIndex: 0,
      });
    }

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { axisValue: string; data: number; seriesName: string; color: string }[]) => {
          if (!params || params.length === 0) return '';
          let html = `<strong>${params[0].axisValue}</strong><br/>`;
          for (const p of params) {
            if (p.seriesName === t('chart.drawdown')) {
              html += `${p.seriesName}: ${p.data.toFixed(2)}%<br/>`;
            } else {
              html += `${p.seriesName}: $${p.data.toLocaleString()}<br/>`;
            }
          }
          return html;
        },
      },
      legend: {
        data: legendData,
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
          splitLine: { lineStyle: { color: C.grid } },
        },
        {
          type: 'value',
          gridIndex: 1,
          axisLabel: {
            formatter: '{value}%',
            fontSize: 10,
          },
          inverse: true,
          splitLine: { lineStyle: { color: C.grid } },
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
      series,
    };
  }, [timeSeries, benchmarkTimeSeries, benchmarkName, t]);

  if (status === 'idle') {
    return (
      <div className="bg-white rounded-xl border border-gray-200 p-12 text-center text-gray-400">
        <p>{t('chart.runBacktestFirst')}</p>
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
      <ReactECharts option={option} style={{ height: 400 }} notMerge onEvents={onEvents} />
    </div>
  );
}
