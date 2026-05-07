import type { PortfolioHolding, RebalancingStrategy } from './types';

/**
 * Compute effective weights for each month given target holdings,
 * actual monthly returns per asset, and a rebalancing strategy.
 *
 * Returns a matrix: weights[monthIdx][assetIdx].
 */
export function computeEffectiveWeights(
  holdings: PortfolioHolding[],
  monthlyReturns: (number | null)[][], // [assetIdx][monthIdx]
  strategy: RebalancingStrategy,
  months: string[],
): number[][] {
  const nAssets = holdings.length;
  const nMonths = months.length;

  if (nAssets === 0 || nMonths === 0) {
    return [];
  }

  const targetWeights = holdings.map((h) => h.targetWeight);

  // Initialize: month 0 uses target weights
  const weights: number[][] = Array.from({ length: nMonths }, () =>
    Array(nAssets).fill(0),
  );
  for (let a = 0; a < nAssets; a++) {
    weights[0][a] = targetWeights[a];
  }

  // Track actual values (not just weights) for drift simulation.
  // Start with a normalized portfolio value of 1.0, then apply month-0
  // returns so that weights for month 1 reflect month-0 drift.
  const assetValues = targetWeights.map(
    (w, a) => w * (1 + (monthlyReturns[a]?.[0] ?? 0)),
  );

  for (let m = 1; m < nMonths; m++) {
    const shouldRebalance = checkRebalanceTrigger(
      strategy,
      m,
      months,
      assetValues,
      targetWeights,
    );

    if (shouldRebalance) {
      // Reset to target weights, then apply this month's returns
      // so the next month's start-of-month weights include this month's drift.
      const totalValue = assetValues.reduce((a, b) => a + b, 0);
      for (let a = 0; a < nAssets; a++) {
        assetValues[a] = totalValue * targetWeights[a];
        weights[m][a] = targetWeights[a];
      }
      for (let a = 0; a < nAssets; a++) {
        const ret = monthlyReturns[a]?.[m] ?? 0;
        assetValues[a] *= 1 + ret;
      }
    } else {
      // Compute start-of-month weights from current asset values,
      // then apply this month's returns to drift for next month.
      const totalValue = assetValues.reduce((a, b) => a + b, 0);
      for (let a = 0; a < nAssets; a++) {
        weights[m][a] =
          totalValue > 0 ? assetValues[a] / totalValue : targetWeights[a];
      }
      for (let a = 0; a < nAssets; a++) {
        const ret = monthlyReturns[a]?.[m] ?? 0;
        assetValues[a] *= 1 + ret;
      }
    }
  }

  return weights;
}

function checkRebalanceTrigger(
  strategy: RebalancingStrategy,
  monthIdx: number,
  months: string[],
  currentValues: number[],
  targetWeights: number[],
): boolean {
  if (strategy.type === 'calendar') {
    return isCalendarTrigger(monthIdx, months, strategy.frequency);
  }

  if (strategy.type === 'tolerance_band') {
    return isToleranceTrigger(currentValues, targetWeights, strategy.threshold);
  }

  return false;
}

function isCalendarTrigger(
  monthIdx: number,
  months: string[],
  frequency: 'monthly' | 'quarterly' | 'annual',
): boolean {
  if (monthIdx === 0) return false; // already at target on start

  const date = new Date(months[monthIdx]);
  const month = date.getMonth(); // 0-11

  switch (frequency) {
    case 'monthly':
      return true;
    case 'quarterly':
      return month % 3 === 2; // Mar, Jun, Sep, Dec
    case 'annual':
      // Rebalance at January (month 0), matching "rebalance at January 1st" convention.
      // Skip month 0 (first January in the series already starts at target).
      return month === 0 && monthIdx > 0;
  }
}

function isToleranceTrigger(
  currentValues: number[],
  targetWeights: number[],
  threshold: number,
): boolean {
  const totalValue = currentValues.reduce((a, b) => a + b, 0);
  if (totalValue <= 0) return true; // edge case: liquidated

  const actualWeights = currentValues.map((v) => v / totalValue);

  for (let i = 0; i < actualWeights.length; i++) {
    const deviation = Math.abs(actualWeights[i] - targetWeights[i]);
    if (deviation > threshold) {
      return true; // any asset exceeds threshold → rebalance all
    }
  }

  return false;
}
