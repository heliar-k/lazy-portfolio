import * as asciichart from 'asciichart';
import pc from 'picocolors';
import type { MonthlyTimeSeriesPoint } from '../../engine/types';

export function renderEquityCurve(
  timeSeries: MonthlyTimeSeriesPoint[],
  label = 'Portfolio Value',
): string {
  if (timeSeries.length === 0) return '';

  const width = Math.min(process.stdout.columns || 80, 120) - 15;
  const values = timeSeries.map((p) => p.portfolioValue);
  const sampled = downsample(values, width);

  const startDate = timeSeries[0].date.slice(0, 7);
  const endDate = timeSeries[timeSeries.length - 1].date.slice(0, 7);

  const chart = asciichart.plot(sampled, {
    height: 15,
    format: (v: number) => formatCompact(v).padStart(8),
  });

  const lines: string[] = [];
  lines.push(pc.bold(`  ${label} (${startDate} ~ ${endDate})`));
  lines.push(chart);
  return lines.join('\n');
}

function downsample(data: number[], targetLen: number): number[] {
  if (data.length <= targetLen) return data;
  const step = (data.length - 1) / (targetLen - 1);
  const result: number[] = [];
  for (let i = 0; i < targetLen; i++) {
    result.push(data[Math.round(i * step)]);
  }
  return result;
}

function formatCompact(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(0);
}
