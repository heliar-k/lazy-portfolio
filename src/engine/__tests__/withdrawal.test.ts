import { describe, it, expect } from 'vitest';
import { computeSWR } from '../withdrawal';
import type { MonthlyReturnPoint, PortfolioHolding } from '../types';

function makeHolding(): PortfolioHolding {
  return {
    asset: {
      symbol: 'CASH',
      name: 'Cash',
      assetClass: 'us_cash',
      region: 'US',
      currency: 'USD',
      provider: 'Test',
      expenseRatio: 0,
      inceptionDate: '2000-01-01',
    },
    targetWeight: 1,
  };
}

function makeReturns(startYear: number, years: number): MonthlyReturnPoint[] {
  const points: MonthlyReturnPoint[] = [];
  for (let m = 0; m <= years * 12; m++) {
    const d = new Date(startYear, m, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    points.push({ date: formatLocalDate(lastDay), totalReturn: 0 });
  }
  return points;
}

function makeCpi(startYear: number, years: number): Map<string, number> {
  const cpi = new Map<string, number>();
  for (let m = 0; m <= years * 12; m++) {
    const d = new Date(startYear, m, 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
    const monthKey = `${lastDay.getFullYear()}-${String(lastDay.getMonth() + 1).padStart(2, '0')}`;
    cpi.set(monthKey, 100);
    cpi.set(formatLocalDate(lastDay), 100);
  }
  return cpi;
}

function formatLocalDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

describe('computeSWR', () => {
  it('marks a period failed when planned withdrawals are not fully applied', () => {
    const assetReturns = new Map<string, MonthlyReturnPoint[]>();
    assetReturns.set('CASH', makeReturns(2000, 3));

    const result = computeSWR(
      [makeHolding()],
      assetReturns,
      makeCpi(2000, 3),
      {
        retirementYears: 2,
        initialCapital: 1000,
        rebalancing: { type: 'calendar', frequency: 'annual' },
        ratesToTest: [0.6, 0.04],
      },
    );

    const failedSweep = result.sweepResults.find(
      (row) => row.rate === 0.6 && row.startDate === '2000-01',
    );
    expect(failedSweep?.success).toBe(false);

    const detailedPeriod = result.periodResults.find((period) => period.startDate === '2000-01');
    expect(detailedPeriod?.annualResults[0].withdrawalRequested).toBe(40);
    expect(detailedPeriod?.annualResults[0].withdrawalAmount).toBe(40);
  });
});
