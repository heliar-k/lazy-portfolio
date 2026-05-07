import type { CashflowEvent } from './types';

/**
 * Compound a portfolio forward in time given effective weights,
 * monthly asset returns, initial capital, and cashflows.
 */
export function compoundPortfolio(
  effectiveWeights: number[][], // [monthIdx][assetIdx]
  monthlyReturns: (number | null)[][], // [assetIdx][monthIdx]
  initialCapital: number,
  cashflowSchedule: Map<string, number>, // date → net cashflow (deposits positive)
  months: string[],
): {
  values: number[];
  cashflowImpacts: number[];
} {
  const nMonths = months.length;

  if (nMonths === 0) {
    return { values: [], cashflowImpacts: [] };
  }

  const values: number[] = [];
  const cashflowImpacts: number[] = [];

  // Month 0: start with initial capital + any cashflow on that date
  const cf0 = cashflowSchedule.get(months[0]) ?? 0;
  let capital = initialCapital + cf0;
  values.push(capital);
  cashflowImpacts.push(cf0);

  for (let m = 1; m < nMonths; m++) {
    // Compute weighted portfolio return for this month
    let portfolioReturn = 0;
    let totalWeight = 0;
    for (let a = 0; a < effectiveWeights[m].length; a++) {
      const weight = effectiveWeights[m][a];
      const assetRet = monthlyReturns[a]?.[m] ?? 0;
      portfolioReturn += weight * assetRet;
      totalWeight += weight;
    }
    // Normalize in case weights don't sum to 1 (floating point)
    if (totalWeight > 0) {
      portfolioReturn /= totalWeight;
    }

    // Apply return
    capital = capital * (1 + portfolioReturn);

    // Apply cashflow at end of month
    const cf = cashflowSchedule.get(months[m]) ?? 0;
    capital += cf;

    values.push(capital);
    cashflowImpacts.push(cf);
  }

  return { values, cashflowImpacts };
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
  const d = new Date(date);
  d.setMonth(d.getMonth() + 1);
  d.setDate(0); // last day of previous month
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
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
