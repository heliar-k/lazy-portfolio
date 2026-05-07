import { useMemo } from 'react';
import ReactECharts from 'echarts-for-react';
import { useTranslation } from 'react-i18next';
import type { MonthlyTimeSeriesPoint } from '@/engine/types';
import { filterByDateRange } from '@/lib/filter-series';

interface DrawdownChartProps {
  timeSeries: MonthlyTimeSeriesPoint[];
  status: 'idle' | 'running' | 'ready' | 'error';
  brushWindow?: { start: string; end: string } | null;
}

export function DrawdownChart({ timeSeries, status, brushWindow }: DrawdownChartProps) {
  const { t } = useTranslation();

  const option = useMemo(() => {
    const filtered = brushWindow
      ? filterByDateRange(timeSeries ?? [], brushWindow.start, brushWindow.end)
      : (timeSeries ?? []);
    if (!filtered || filtered.length === 0) return {};

    const dates = filtered.map((p) => p.date);
    const drawdowns = filtered.map((p) => p.drawdown * 100);

    // Find max drawdown period for marking
    let maxDD = 0;
    let maxDDStart = 0;
    let maxDDEnd = 0;
    let peakIdx = 0;
    let peak = -Infinity;

    for (let i = 0; i < filtered.length; i++) {
      const val = filtered[i].portfolioValue;
      if (val > peak) {
        peak = val;
        peakIdx = i;
      }
      const dd = peak > 0 ? (val - peak) / peak * 100 : 0;
      if (dd < maxDD) {
        maxDD = dd;
        maxDDStart = peakIdx;
        maxDDEnd = i;
      }
    }

    const markArea =
      maxDD < 0
        ? [
            [
              {
                xAxis: dates[maxDDStart],
                itemStyle: { color: 'rgba(239, 68, 68, 0.08)' },
              },
              { xAxis: dates[maxDDEnd] },
            ],
          ]
        : [];

    return {
      tooltip: {
        trigger: 'axis',
        formatter: (params: { axisValue: string; data: number }[]) => {
          if (!params || params.length === 0) return '';
          const p = params[0];
          return `${p.axisValue}<br/>Drawdown: <strong>${p.data.toFixed(2)}%</strong>`;
        },
      },
      grid: { left: 50, right: 20, top: 10, bottom: 30 },
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
        inverse: true,
        axisLabel: { formatter: '{value}%', fontSize: 10 },
        splitLine: { lineStyle: { color: '#f0f0f0' } },
        max: 0,
      },
      series: [
        {
          type: 'line',
          data: drawdowns,
          smooth: false,
          symbol: 'none',
          lineStyle: { color: '#ef4444', width: 1.5 },
          areaStyle: { color: 'rgba(239, 68, 68, 0.2)' },
          markArea: {
            silent: true,
            data: markArea,
          },
        },
      ],
    };
  }, [timeSeries, brushWindow]);

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
        <div className="animate-pulse h-48 bg-gray-100 rounded" />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-4">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">{t('chart.drawdown')}</h3>
      <ReactECharts option={option} style={{ height: 200 }} notMerge />
    </div>
  );
}
