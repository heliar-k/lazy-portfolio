import { describe, it, expect } from 'vitest';
import { computeMonthlyReturns, alignReturnsToGrid } from '../returns';
import type { MonthlyPricePoint, MonthlyReturnPoint } from '../types';

describe('computeMonthlyReturns', () => {
  it('returns empty array for less than 2 price points', () => {
    expect(computeMonthlyReturns([])).toEqual([]);
    expect(computeMonthlyReturns([{ date: '2020-01-31', price: 100 }])).toEqual([]);
  });

  it('computes simple returns from sorted prices', () => {
    const prices: MonthlyPricePoint[] = [
      { date: '2020-01-31', price: 100 },
      { date: '2020-02-29', price: 110 },
      { date: '2020-03-31', price: 99 },
    ];

    const result = computeMonthlyReturns(prices);

    expect(result).toHaveLength(2);
    expect(result[0]).toEqual({ date: '2020-02-29', totalReturn: 0.10 });
    expect(result[1]).toEqual({ date: '2020-03-31', totalReturn: -0.10 });
  });

  it('sorts input by date before computing returns', () => {
    const prices: MonthlyPricePoint[] = [
      { date: '2020-03-31', price: 121 },
      { date: '2020-01-31', price: 100 },
      { date: '2020-02-29', price: 110 },
    ];

    const result = computeMonthlyReturns(prices);

    expect(result[0].date).toBe('2020-02-29');
    expect(result[0].totalReturn).toBeCloseTo(0.10);
    expect(result[1].date).toBe('2020-03-31');
    expect(result[1].totalReturn).toBeCloseTo(0.10);
  });
});

describe('alignReturnsToGrid', () => {
  const returns: MonthlyReturnPoint[] = [
    { date: '2020-02-29', totalReturn: 0.02 },
    { date: '2020-03-31', totalReturn: 0.03 },
  ];

  it('aligns exact matches to grid', () => {
    const grid = ['2020-02-29', '2020-03-31'];
    const result = alignReturnsToGrid(returns, grid);

    expect(result).toEqual([0.02, 0.03]);
  });

  it('forward-fills gaps ≤ 3 months', () => {
    const grid = ['2020-02-29', '2020-03-31', '2020-04-30', '2020-05-31'];
    const result = alignReturnsToGrid(returns, grid);

    // Feb=0.02, Mar=0.03, Apr=fill(0.03), May=fill(0.03)
    expect(result).toEqual([0.02, 0.03, 0.03, 0.03]);
  });

  it('returns null for gaps > 3 months', () => {
    // Returns at Feb, Mar, then a gap to Aug (5 months = 5 grid positions from Mar)
    const grid = [
      '2020-02-29', '2020-03-31', '2020-04-30',
      '2020-05-31', '2020-06-30', '2020-07-31', '2020-08-31',
    ];
    const result = alignReturnsToGrid(returns, grid);

    // Feb=0.02, Mar=0.03, Apr=fill, May=fill, Jun=fill, Jul=null (gap > 3), Aug=null
    expect(result[0]).toBe(0.02);
    expect(result[1]).toBe(0.03);
    expect(result[2]).toBe(0.03); // filled
    expect(result[3]).toBe(0.03); // filled
    expect(result[4]).toBe(0.03); // filled (3 months)
    expect(result[5]).toBeNull(); // gap > 3
    expect(result[6]).toBeNull();
  });

  it('returns null for month 0 with no data', () => {
    const grid = ['2020-01-31', '2020-02-29'];
    const result = alignReturnsToGrid(returns, grid);

    expect(result[0]).toBeNull(); // no data for Jan
    expect(result[1]).toBe(0.02);
  });

  it('returns all null when return series is empty', () => {
    const grid = ['2020-01-31', '2020-02-29'];
    const result = alignReturnsToGrid([], grid);

    expect(result).toEqual([null, null]);
  });
});
