import type {
  PortfolioDefinition,
  BacktestParameters,
  ValidationResult,
  ValidationError,
} from '../engine/types';

/**
 * Validate a portfolio definition.
 */
export function validatePortfolio(
  p: PortfolioDefinition,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // At least 1 holding
  if (p.holdings.length === 0) {
    errors.push({
      field: 'holdings',
      message: 'validation.noEtfs',
    });
    return { valid: false, errors, warnings };
  }

  // Max 20 holdings
  if (p.holdings.length > 20) {
    errors.push({
      field: 'holdings',
      message: 'validation.tooManyEtfs',
    });
  }

  // Weight validation
  const totalWeight = p.holdings.reduce((s, h) => s + h.targetWeight, 0);
  const weightDiff = Math.abs(totalWeight - 1.0);

  if (weightDiff > 0.01) {
    errors.push({
      field: 'weights',
      message: 'validation.weightsNot100',
    });
  } else if (weightDiff > 0.001) {
    warnings.push({
      field: 'weights',
      message: 'validation.weightsNotExact100',
    });
  }

  // Check for negative weights
  for (let i = 0; i < p.holdings.length; i++) {
    if (p.holdings[i].targetWeight < 0) {
      errors.push({
        field: `holdings.${i}.weight`,
        message: 'validation.negativeWeight',
      });
    }
    if (p.holdings[i].targetWeight > 1.0) {
      errors.push({
        field: `holdings.${i}.weight`,
        message: 'validation.weightOver100',
      });
    }
  }

  // Check for duplicate tickers
  const symbols = new Set<string>();
  for (const h of p.holdings) {
    if (symbols.has(h.asset.symbol)) {
      errors.push({
        field: 'holdings',
        message: 'validation.duplicateEtf',
      });
      break;
    }
    symbols.add(h.asset.symbol);
  }

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Validate backtest parameters.
 */
export function validateBacktestParams(
  params: BacktestParameters,
): ValidationResult {
  const errors: ValidationError[] = [];
  const warnings: ValidationError[] = [];

  // Date range
  const start = new Date(params.startDate + '-01');
  const end = new Date(params.endDate + '-01');

  if (isNaN(start.getTime())) {
    errors.push({ field: 'startDate', message: 'validation.invalidStartDate' });
  }
  if (isNaN(end.getTime())) {
    errors.push({ field: 'endDate', message: 'validation.invalidEndDate' });
  }

  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start >= end) {
    errors.push({ field: 'dateRange', message: 'validation.invalidDateRange' });
  }

  // Minimum 12 months
  if (!isNaN(start.getTime()) && !isNaN(end.getTime()) && start < end) {
    const months =
      (end.getFullYear() - start.getFullYear()) * 12 +
      (end.getMonth() - start.getMonth());
    if (months < 12) {
      warnings.push({
        field: 'dateRange',
        message: 'validation.shortPeriod',
      });
    }
  }

  // Initial capital > 0
  if (params.initialCapital <= 0) {
    errors.push({
      field: 'initialCapital',
      message: 'validation.capitalPositive',
    });
  }

  // Initial capital reasonable
  if (params.initialCapital > 100_000_000) {
    warnings.push({
      field: 'initialCapital',
      message: 'validation.capitalLarge',
    });
  }

  // Portfolio validation
  const portfolioResult = validatePortfolio(params.portfolio);
  errors.push(...portfolioResult.errors);
  warnings.push(...portfolioResult.warnings);

  return { valid: errors.length === 0, errors, warnings };
}

/**
 * Normalize portfolio weights to sum to 100%.
 */
export function normalizeWeights(
  holdings: PortfolioDefinition['holdings'],
): PortfolioDefinition['holdings'] {
  const total = holdings.reduce((s, h) => s + h.targetWeight, 0);
  if (total <= 0) return holdings;

  return holdings.map((h) => ({
    ...h,
    targetWeight: h.targetWeight / total,
  }));
}
