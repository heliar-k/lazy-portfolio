import Table from 'cli-table3';
import pc from 'picocolors';

export function renderAnnualReturns(
  annualReturns: { year: number; return: number }[],
): string {
  if (annualReturns.length === 0) return '';

  const table = new Table({
    head: [pc.bold('Year'), pc.bold('Return')],
    style: { head: [], border: [] },
    colWidths: [10, 12],
  });

  for (const ar of annualReturns) {
    const year = ar.year;
    const ret = ar.return;
    const pct = `${(ret * 100).toFixed(2)}%`;
    table.push([String(year), ret >= 0 ? pc.green(pct) : pc.red(pct)]);
  }

  return table.toString();
}
