import type { MonthlyTimeSeriesPoint } from './types';

interface MonteCarloParams {
  timeSeries: MonthlyTimeSeriesPoint[];
  years: number;
  simulations: number;
  initialCapital: number;
  monthlyContribution: number;
}

interface MonteCarloResult {
  /** Array of final capital values (one per simulation), sorted */
  finalValues: number[];
  /** Percentile paths: each key is a percentile, value is array of capital values */
  percentilePaths: Record<number, number[]>;
  /** Monthly timeline labels */
  months: number;
  /** Probability of positive return */
  probabilityPositive: number;
  /** Probability of beating inflation (2% annual) */
  probabilityBeatInflation: number;
}

export function runMonteCarlo(params: MonteCarloParams): MonteCarloResult {
  const { timeSeries, years, simulations, initialCapital, monthlyContribution } = params;

  if (timeSeries.length < 12) {
    return {
      finalValues: [],
      percentilePaths: {},
      months: 0,
      probabilityPositive: 0,
      probabilityBeatInflation: 0,
    };
  }

  // Extract monthly returns from time series
  const monthlyReturns: number[] = [];
  for (let i = 1; i < timeSeries.length; i++) {
    const prev = timeSeries[i - 1].portfolioValue;
    const curr = timeSeries[i].portfolioValue;
    if (prev > 0) {
      monthlyReturns.push(curr / prev - 1);
    }
  }

  if (monthlyReturns.length === 0) {
    return {
      finalValues: [],
      percentilePaths: {},
      months: 0,
      probabilityPositive: 0,
      probabilityBeatInflation: 0,
    };
  }

  const months = years * 12;
  const finalValues: number[] = [];
  const allPaths: number[][] = [];

  for (let s = 0; s < simulations; s++) {
    let capital = initialCapital;
    const path: number[] = [capital];

    for (let m = 0; m < months; m++) {
      // Randomly sample a historical monthly return (with replacement)
      const idx = Math.floor(Math.random() * monthlyReturns.length);
      const ret = monthlyReturns[idx];

      capital = capital * (1 + ret) + monthlyContribution;
      if (capital < 0) capital = 0;
      path.push(capital);
    }

    finalValues.push(capital);
    // Store sampled path (every 12th month for efficiency)
    const sampled: number[] = [];
    for (let i = 0; i <= months; i += 12) {
      sampled.push(path[i]);
    }
    allPaths.push(sampled);
  }

  finalValues.sort((a, b) => a - b);

  // Calculate percentile paths
  const percentiles = [10, 25, 50, 75, 90];
  const percentilePaths: Record<number, number[]> = {};

  for (const p of percentiles) {
    percentilePaths[p] = [];
    const numSteps = allPaths[0].length;
    for (let step = 0; step < numSteps; step++) {
      const stepValues = allPaths.map((path) => path[step]).sort((a, b) => a - b);
      const idx = Math.floor((p / 100) * (stepValues.length - 1));
      percentilePaths[p].push(stepValues[idx]);
    }
  }

  // Probabilities
  const positiveCount = finalValues.filter((v) => v > initialCapital + monthlyContribution * months).length;
  const inflationTarget = initialCapital * Math.pow(1.02, years);
  const beatInflationCount = finalValues.filter((v) => v > inflationTarget).length;

  return {
    finalValues,
    percentilePaths,
    months,
    probabilityPositive: positiveCount / simulations,
    probabilityBeatInflation: beatInflationCount / simulations,
  };
}

export function getPercentile(finalValues: number[], p: number): number {
  if (finalValues.length === 0) return 0;
  const idx = Math.floor((p / 100) * (finalValues.length - 1));
  return finalValues[idx];
}
