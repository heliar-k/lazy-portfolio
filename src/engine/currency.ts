import type { MonthlyFxRatePoint } from './types';

const MAX_FX_FORWARD_FILL_MONTHS = 3;

/**
 * Convert a monthly return from one currency to another using FX rate changes.
 *
 * return_in_target ≈ (1 + nativeReturn) × (fx_t / fx_{t-1}) - 1
 */
export function convertReturn(
  nativeReturn: number,
  fxRateCurrent: number,
  fxRatePrevious: number,
): number {
  if (fxRatePrevious <= 0 || fxRateCurrent <= 0) {
    return nativeReturn; // fallback: no FX conversion possible
  }
  return (1 + nativeReturn) * (fxRateCurrent / fxRatePrevious) - 1;
}

/**
 * Convert an array of monthly native returns to target currency.
 * fxSeries: array of FX rates (e.g., USDCNY) where index 0 = rate at month 0.
 * Returns are monthly: return[i] spans from month i-1 to month i.
 * So we use fx[i-1] as previous, fx[i] as current.
 */
export function convertReturnSeries(
  nativeReturns: (number | null)[],
  fxRates: (number | null)[],
): (number | null)[] {
  if (nativeReturns.length === 0 || fxRates.length < 2) {
    return nativeReturns;
  }

  const result: (number | null)[] = [];
  // First month has no prior FX rate in the aligned window. Keep the native
  // return only when the current FX level exists; otherwise mark missing so the
  // caller can advance the effective start date or fail on a data gap.
  result.push(nativeReturns[0] === null || fxRates[0] === null ? null : nativeReturns[0]);

  for (let i = 1; i < nativeReturns.length; i++) {
    const nr = nativeReturns[i];
    const fxPrev = fxRates[i - 1];
    const fxCurr = fxRates[i];

    if (nr === null || fxPrev === null || fxCurr === null) {
      result.push(null);
    } else {
      result.push(convertReturn(nr, fxCurr, fxPrev));
    }
  }

  return result;
}

/**
 * Align dated FX rate levels to a monthly grid.
 * FX rates are end-of-month levels, not returns. Missing levels are
 * forward-filled for up to 3 months; longer gaps remain null.
 */
export function alignFxRatesToGrid(
  fxRates: MonthlyFxRatePoint[],
  months: string[],
): (number | null)[] {
  if (fxRates.length === 0) {
    return months.map(() => null);
  }

  const rateByDate = new Map<string, number>();
  for (const point of fxRates) {
    if (point.rate > 0 && Number.isFinite(point.rate)) {
      rateByDate.set(point.date, point.rate);
    }
  }

  const result: (number | null)[] = [];
  let lastKnownIdx = -1;
  let lastKnownRate: number | null = null;

  for (let i = 0; i < months.length; i++) {
    const rate = rateByDate.get(months[i]);

    if (rate !== undefined) {
      result.push(rate);
      lastKnownIdx = i;
      lastKnownRate = rate;
    } else if (
      lastKnownRate !== null &&
      i - lastKnownIdx <= MAX_FX_FORWARD_FILL_MONTHS
    ) {
      result.push(lastKnownRate);
    } else {
      result.push(null);
    }
  }

  return result;
}
