import Table from 'cli-table3';
import pc from 'picocolors';
import type { BacktestResult } from '../../engine/types';

interface NamedResult {
  name: string;
  result: BacktestResult;
}

export function renderComparisonTable(
  results: NamedResult[],
  currency = 'USD',
): string {
  if (results.length === 0) return '';

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  const fmtNum = (v: number) => v.toFixed(2);

  const head = [pc.bold('Metric'), ...results.map((r) => pc.bold(truncate(r.name, 16)))];
  const colWidths = [20, ...results.map(() => 18)];

  const table = new Table({ head, style: { head: [], border: [] }, colWidths });

  type MetricRow = {
    label: string;
    values: number[];
    format: (v: number) => string;
    higherIsBetter: boolean;
  };

  const rows: MetricRow[] = [
    { label: 'CAGR', values: results.map((r) => r.result.metrics.cagr), format: fmtPct, higherIsBetter: true },
    { label: 'Total Return', values: results.map((r) => r.result.metrics.totalReturn), format: fmtPct, higherIsBetter: true },
    { label: 'Final Capital', values: results.map((r) => r.result.metrics.finalCapital), format: fmtMoney, higherIsBetter: true },
    { label: 'Std Dev', values: results.map((r) => r.result.metrics.stdDevAnnualized), format: fmtPct, higherIsBetter: false },
    { label: 'Max Drawdown', values: results.map((r) => r.result.metrics.maxDrawdown), format: fmtPct, higherIsBetter: false },
    { label: 'Sharpe', values: results.map((r) => r.result.metrics.sharpeRatio), format: fmtNum, higherIsBetter: true },
    { label: 'Sortino', values: results.map((r) => r.result.metrics.sortinoRatio), format: fmtNum, higherIsBetter: true },
    { label: 'Best Year', values: results.map((r) => r.result.metrics.bestYear.return), format: fmtPct, higherIsBetter: true },
    { label: 'Worst Year', values: results.map((r) => r.result.metrics.worstYear.return), format: fmtPct, higherIsBetter: true },
    { label: 'Positive Mo.', values: results.map((r) => r.result.metrics.positiveMonthsPct), format: fmtPct, higherIsBetter: true },
  ];

  for (const row of rows) {
    const bestIdx = findBestIndex(row.values, row.higherIsBetter);
    const cells = row.values.map((v, i) => {
      const s = row.format(v);
      return i === bestIdx ? pc.green(pc.bold(s)) : s;
    });
    table.push([row.label, ...cells]);
  }

  return table.toString();
}

function findBestIndex(values: number[], higherIsBetter: boolean): number {
  let bestIdx = 0;
  for (let i = 1; i < values.length; i++) {
    const isBetter = higherIsBetter
      ? values[i] > values[bestIdx]
      : values[i] < values[bestIdx];
    if (isBetter) bestIdx = i;
  }
  return bestIdx;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}
