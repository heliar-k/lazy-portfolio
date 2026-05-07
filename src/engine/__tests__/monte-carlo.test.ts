import { describe, expect, it, vi } from 'vitest';
import { runMonteCarlo } from '../monte-carlo';
import type { MonthlyTimeSeriesPoint } from '../types';

function makePoint(
  date: string,
  portfolioValue: number,
  monthlyReturn: number,
  cashflowImpact = 0,
): MonthlyTimeSeriesPoint {
  return {
    date,
    portfolioValue,
    portfolioValueReal: portfolioValue,
    monthlyReturn,
    monthlyReturnReal: monthlyReturn,
    drawdown: 0,
    cumulativeReturn: portfolioValue / 1000 - 1,
    cashflowImpact,
    cashflowRequested: cashflowImpact,
  };
}

describe('runMonteCarlo', () => {
  it('samples monthlyReturn instead of portfolio value changes polluted by cashflows', () => {
    const timeSeries: MonthlyTimeSeriesPoint[] = [
      makePoint('2020-01-31', 1000, 0),
      makePoint('2020-02-29', 2000, 0, 1000),
    ];
    for (let month = 3; month <= 13; month++) {
      timeSeries.push(
        makePoint(`2020-${String(month).padStart(2, '0')}-28`, 2000, 0),
      );
    }

    const randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);

    const result = runMonteCarlo({
      timeSeries,
      years: 1,
      simulations: 20,
      initialCapital: 1000,
      monthlyContribution: 0,
    });
    randomSpy.mockRestore();

    expect(result.finalValues).toHaveLength(20);
    expect(result.finalValues.every((value) => value === 1000)).toBe(true);
  });
});
