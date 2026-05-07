import Table from 'cli-table3';
import pc from 'picocolors';
import type { BacktestMetrics } from '../../engine/types';

export function renderMetricsTable(metrics: BacktestMetrics, currency = 'USD'): string {
  const table = new Table({
    head: [pc.bold('Metric'), pc.bold('Value')],
    style: { head: [], border: [] },
    colWidths: [24, 18],
  });

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  const fmtNum = (v: number) => v.toFixed(2);
  const color = (v: number, s: string) => (v >= 0 ? pc.green(s) : pc.red(s));

  table.push(
    ['CAGR', color(metrics.cagr, fmtPct(metrics.cagr))],
    ['Total Return', color(metrics.totalReturn, fmtPct(metrics.totalReturn))],
    ['Final Capital', fmtMoney(metrics.finalCapital)],
    ['Std Dev (Ann.)', fmtPct(metrics.stdDevAnnualized)],
    ['Max Drawdown', pc.red(fmtPct(metrics.maxDrawdown))],
    ['Sharpe Ratio', color(metrics.sharpeRatio, fmtNum(metrics.sharpeRatio))],
    ['Sortino Ratio', color(metrics.sortinoRatio, fmtNum(metrics.sortinoRatio))],
    ['Best Year', `${metrics.bestYear.year}  ${pc.green(fmtPct(metrics.bestYear.return))}`],
    ['Worst Year', `${metrics.worstYear.year}  ${pc.red(fmtPct(metrics.worstYear.return))}`],
    ['Positive Months', fmtPct(metrics.positiveMonthsPct)],
  );

  if (metrics.totalContributions > 0 || metrics.totalWithdrawals > 0) {
    table.push(
      ['Contributions', fmtMoney(metrics.totalContributions)],
      ['Withdrawals', fmtMoney(metrics.totalWithdrawals)],
    );
  }

  return table.toString();
}
