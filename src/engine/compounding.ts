import { checkRebalanceTrigger } from './rebalancing';
import type { CashflowEvent, RebalancingStrategy } from './types';

/**
 * Compound a portfolio forward in time, tracking per-asset capital.
 *
 * Rebalancing is applied according to the strategy. Cashflows are invested
 * at target weights so deposits/withdrawals don't distort the allocation.
 */
export function compoundPortfolio(
  targetWeights: number[],         // [assetIdx] target allocation
  monthlyReturns: (number | null)[][], // [assetIdx][monthIdx]
  initialCapital: number,
  cashflowSchedule: Map<string, number>, // date → net cashflow
  months: string[],
  strategy: RebalancingStrategy,
  cashflowTriggersRebalance = false,
): {
  values: number[];
  cashflowImpacts: number[];
  cashflowRequests: number[];
  effectiveWeights: number[][];
} {
  const nAssets = targetWeights.length;
  const nMonths = months.length;

  if (nMonths === 0 || nAssets === 0) {
    return { values: [], cashflowImpacts: [], cashflowRequests: [], effectiveWeights: [] };
  }

  // Per-asset capital — starts at target weights
  const assetCapital = targetWeights.map((w) => w * initialCapital);

  const values: number[] = [];
  const cashflowImpacts: number[] = [];
  const cashflowRequests: number[] = [];
  const effectiveWeights: number[][] = [];

  for (let m = 0; m < nMonths; m++) {
    const totalBefore = assetCapital.reduce((s, v) => s + v, 0);

    // Rebalance if the strategy triggers, OR if this month has a cashflow
    // and cashflowTriggersRebalance is enabled (skip month 0 — already at target).
    const hasCashflow = (cashflowSchedule.get(months[m]) ?? 0) !== 0;
    const shouldRebalance =
      (m > 0 && checkRebalanceTrigger(strategy, m, months, assetCapital, targetWeights)) ||
      (m > 0 && cashflowTriggersRebalance && hasCashflow);

    if (shouldRebalance) {
      for (let a = 0; a < nAssets; a++) {
        assetCapital[a] = totalBefore * targetWeights[a];
      }
    }

    // Record start-of-month weights for TWR calculation
    const total = assetCapital.reduce((s, v) => s + v, 0);
    effectiveWeights.push(
      total > 0 ? assetCapital.map((v) => v / total) : [...targetWeights],
    );

    // Apply monthly returns to each asset
    for (let a = 0; a < nAssets; a++) {
      const ret = monthlyReturns[a]?.[m] ?? 0;
      assetCapital[a] *= 1 + ret;
    }

    // Apply cashflow at target weights so deposits/withdrawals are split
    // proportionally rather than going into whichever assets have drifted highest.
    const cf = cashflowSchedule.get(months[m]) ?? 0;
    let actualCf = cf;
    if (cf !== 0) {
      const totalAfterReturns = assetCapital.reduce((s, v) => s + v, 0);
      // Cap withdrawal to available capital so values don't go negative
      actualCf = cf < 0 ? Math.max(cf, -totalAfterReturns) : cf;
      for (let a = 0; a < nAssets; a++) {
        assetCapital[a] += actualCf * targetWeights[a];
      }
    }

    values.push(assetCapital.reduce((s, v) => s + v, 0));
    cashflowImpacts.push(actualCf);
    cashflowRequests.push(cf);
  }

  return { values, cashflowImpacts, cashflowRequests, effectiveWeights };
}

/**
 * Expand recurring cashflow events into a flat map of date → amount.
 */
export function expandCashflows(
  events: CashflowEvent[],
): Map<string, number> {
  const schedule = new Map<string, number>();

  for (const event of events) {
    // Add the single event
    const current = schedule.get(event.date) ?? 0;
    schedule.set(event.date, current + event.amount);

    // Expand recurring
    if (event.recurring) {
      const startDate = parseLocalDate(event.date);
      const endDate = event.recurring.endDate
        ? parseLocalDate(event.recurring.endDate)
        : new Date(2099, 11, 31); // local time

      let currentDate = addMonths(startDate, frequencyToMonths(event.recurring.frequency));
      while (currentDate <= endDate) {
        const dateStr = toEndOfMonth(currentDate);
        const existing = schedule.get(dateStr) ?? 0;
        schedule.set(dateStr, existing + event.amount);
        currentDate = addMonths(
          currentDate,
          frequencyToMonths(event.recurring.frequency),
        );
      }
    }
  }

  return schedule;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // Handle month overflow (e.g. Jan 31 + 1 month → Mar 2 instead of Feb 28)
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0); // clamp to last day of target month
  }
  return d;
}

function toEndOfMonth(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based
  const lastDay = new Date(y, m + 1, 0).getDate(); // day 0 of next month = last day of this month
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function frequencyToMonths(f: 'monthly' | 'quarterly' | 'annual'): number {
  switch (f) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'annual':
      return 12;
  }
}
