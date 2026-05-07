import { describe, it, expect } from 'vitest';
import { compoundPortfolio, expandCashflows } from '../compounding';
import type { CashflowEvent } from '../types';

describe('expandCashflows', () => {
  it('expands a single non-recurring event', () => {
    const events: CashflowEvent[] = [
      { date: '2020-06-30', amount: 1000, type: 'deposit' },
    ];

    const schedule = expandCashflows(events);

    expect(schedule.get('2020-06-30')).toBe(1000);
    expect(schedule.size).toBe(1);
  });

  it('combines multiple events on the same date', () => {
    const events: CashflowEvent[] = [
      { date: '2020-06-30', amount: 1000, type: 'deposit' },
      { date: '2020-06-30', amount: 500, type: 'deposit' },
    ];

    const schedule = expandCashflows(events);

    expect(schedule.get('2020-06-30')).toBe(1500);
  });

  it('expands recurring monthly events', () => {
    const events: CashflowEvent[] = [
      {
        date: '2020-01-31',
        amount: 100,
        type: 'deposit',
        recurring: { frequency: 'monthly', endDate: '2020-03-31' },
      },
    ];

    const schedule = expandCashflows(events);

    expect(schedule.get('2020-01-31')).toBe(100);
    expect(schedule.get('2020-02-29')).toBe(100);
    expect(schedule.get('2020-03-31')).toBe(100);
    expect(schedule.get('2020-04-30')).toBeUndefined();
  });

  it('expands recurring quarterly events', () => {
    const events: CashflowEvent[] = [
      {
        date: '2020-01-31',
        amount: 300,
        type: 'deposit',
        recurring: { frequency: 'quarterly', endDate: '2020-07-31' },
      },
    ];

    const schedule = expandCashflows(events);

    expect(schedule.get('2020-01-31')).toBe(300);
    expect(schedule.get('2020-04-30')).toBe(300);
    expect(schedule.get('2020-07-31')).toBe(300);
    expect(schedule.get('2020-10-31')).toBeUndefined();
  });

  it('handles withdrawals (negative amounts)', () => {
    const events: CashflowEvent[] = [
      { date: '2020-06-30', amount: -500, type: 'withdrawal' },
    ];

    const schedule = expandCashflows(events);

    expect(schedule.get('2020-06-30')).toBe(-500);
  });
});

describe('compoundPortfolio', () => {
  it('compounds a single-asset portfolio with constant returns', () => {
    // 12 months, 1% monthly return, $10,000 initial
    const months = Array.from({ length: 13 }, (_, i) => {
      const d = new Date(2020, i, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return lastDay.toISOString().slice(0, 10);
    });

    const weights: number[][] = months.map(() => [1.0]);
    const returns: (number | null)[][] = [
      months.map((_, i) => (i === 0 ? null : 0.01)),
    ];
    const cashflows = new Map<string, number>();

    const { values } = compoundPortfolio(
      weights,
      returns,
      10000,
      cashflows,
      months,
    );

    expect(values).toHaveLength(13);
    expect(values[0]).toBe(10000);

    // After 12 months at 1%: 10000 * (1.01)^12 ≈ 11268.25
    expect(values[12]).toBeCloseTo(10000 * Math.pow(1.01, 12), 0);
  });

  it('applies cashflows at end of month', () => {
    const months = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(2020, i, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return lastDay.toISOString().slice(0, 10);
    });

    const weights: number[][] = months.map(() => [1.0]);
    const returns: (number | null)[][] = [
      [null, 0.01, 0.01, 0.01],
    ];
    const cashflows = new Map<string, number>();
    cashflows.set(months[2], 1000); // add $1000 at end of month 2

    const { values } = compoundPortfolio(weights, returns, 10000, cashflows, months);

    // Month 0: 10000
    // Month 1: 10000 * 1.01 = 10100
    // Month 2: 10100 * 1.01 + 1000 = 11201
    // Month 3: 11201 * 1.01 = 11313.01
    expect(values[0]).toBe(10000);
    expect(values[1]).toBeCloseTo(10100, 0);
    expect(values[2]).toBeCloseTo(11201, 0);
    expect(values[3]).toBeCloseTo(11313.01, 0);
  });

  it('handles two-asset portfolio', () => {
    const months = Array.from({ length: 4 }, (_, i) => {
      const d = new Date(2020, i, 1);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0);
      return lastDay.toISOString().slice(0, 10);
    });

    // 60/40, rebalanced monthly
    const weights: number[][] = [
      [0.6, 0.4],
      [0.6, 0.4],
      [0.6, 0.4],
      [0.6, 0.4],
    ];
    const returns: (number | null)[][] = [
      [null, 0.02, -0.01, 0.03],
      [null, 0.005, 0.005, 0.005],
    ];
    const cashflows = new Map<string, number>();

    const { values } = compoundPortfolio(weights, returns, 10000, cashflows, months);

    // Month 1 return = 0.6*0.02 + 0.4*0.005 = 0.012 + 0.002 = 0.014
    // value[1] = 10000 * 1.014 = 10140
    expect(values[1]).toBeCloseTo(10140, 0);

    // Month 2 return = 0.6*(-0.01) + 0.4*0.005 = -0.006 + 0.002 = -0.004
    // value[2] = 10140 * 0.996 = 10099.44
    expect(values[2]).toBeCloseTo(10099.44, 0);
  });
});
