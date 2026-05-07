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
  // First month has no return (need previous month to compute return)
  result.push(nativeReturns[0] ?? null);

  for (let i = 1; i < nativeReturns.length; i++) {
    const nr = nativeReturns[i];
    const fxPrev = fxRates[i - 1];
    const fxCurr = fxRates[i];

    if (nr === null || fxPrev === null || fxCurr === null) {
      result.push(nr); // pass through as-is or null
    } else {
      result.push(convertReturn(nr, fxCurr, fxPrev));
    }
  }

  return result;
}
