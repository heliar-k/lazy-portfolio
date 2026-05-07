import type { MonthlyTimeSeriesPoint } from '@/engine/types';

export function timeSeriesToCSV(
  timeSeries: MonthlyTimeSeriesPoint[],
  benchmarkTimeSeries?: MonthlyTimeSeriesPoint[],
  benchmarkName?: string,
): string {
  const headers = ['Date', 'Portfolio Value', 'Real Value', 'Drawdown (%)'];
  if (benchmarkTimeSeries && benchmarkTimeSeries.length > 0) {
    headers.push(`${benchmarkName || 'Benchmark'} Value`);
  }

  const rows: string[] = [headers.join(',')];

  // Build benchmark lookup
  const benchMap = new Map<string, number>();
  if (benchmarkTimeSeries) {
    for (const p of benchmarkTimeSeries) {
      benchMap.set(p.date, p.portfolioValue);
    }
  }

  for (const p of timeSeries) {
    const cells = [
      p.date,
      p.portfolioValue.toFixed(2),
      p.portfolioValueReal.toFixed(2),
      (p.drawdown * 100).toFixed(2),
    ];
    if (benchmarkTimeSeries && benchmarkTimeSeries.length > 0) {
      const benchVal = benchMap.get(p.date);
      cells.push(benchVal !== undefined ? benchVal.toFixed(2) : '');
    }
    rows.push(cells.join(','));
  }

  return rows.join('\n');
}

export function downloadCSV(csv: string, filename: string): void {
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
