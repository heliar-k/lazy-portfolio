import { describe, it, expect } from 'vitest';
import { alignFxRatesToGrid, convertReturn, convertReturnSeries } from '../currency';

describe('convertReturn', () => {
  it('converts native return using FX rate change', () => {
    // nativeReturn = 10%, USDCNY goes from 7.0 to 7.07 (CNY weakens 1%)
    // return_in_USD ≈ (1.10) * (7.07/7.0) - 1 = 1.10 * 1.01 - 1 = 0.111
    const result = convertReturn(0.10, 7.07, 7.0);
    expect(result).toBeCloseTo(0.111);
  });

  it('returns native return when FX strengthens proportionally', () => {
    // nativeReturn = 5%, USDCNY goes from 7.0 to 6.65 (CNY strengthens 5%)
    // return_in_USD ≈ (1.05) * (6.65/7.0) - 1 = 1.05 * 0.95 - 1 = -0.0025
    const result = convertReturn(0.05, 6.65, 7.0);
    expect(result).toBeCloseTo(-0.0025);
  });

  it('falls back to native return when FX rate is zero/negative', () => {
    expect(convertReturn(0.05, 0, 7.0)).toBe(0.05);
    expect(convertReturn(0.05, 7.0, 0)).toBe(0.05);
    expect(convertReturn(0.05, -1, 7.0)).toBe(0.05);
  });
});

describe('convertReturnSeries', () => {
  it('converts a full series of returns', () => {
    // month 0: no conversion (first month)
    // month 1: native=0.01, fx 7.0→7.07 → (1.01)*(7.07/7.0)-1 ≈ 0.0201
    // month 2: native=0.02, fx 7.07→7.14 → (1.02)*(7.14/7.07)-1 ≈ 0.0301
    const nativeReturns = [null, 0.01, 0.02];
    const fxRates = [7.0, 7.07, 7.14];

    const result = convertReturnSeries(nativeReturns, fxRates);

    expect(result[0]).toBeNull();
    expect(result[1]).toBeCloseTo(0.0201, 4);
    expect(result[2]).toBeCloseTo(0.0301, 4);
  });

  it('passes through null returns unchanged', () => {
    const nativeReturns = [null, null, 0.01];
    const fxRates = [7.0, 7.07, 7.14];

    const result = convertReturnSeries(nativeReturns, fxRates);

    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
    expect(result[2]).toBeCloseTo(0.02, 4);
  });

  it('returns null when FX rates are null', () => {
    const nativeReturns = [null, 0.01, 0.02];
    const fxRates = [7.0, null, 7.14];

    const result = convertReturnSeries(nativeReturns, fxRates);

    expect(result[1]).toBeNull();
    expect(result[2]).toBeNull();
  });

  it('returns original when fewer than 2 FX rates', () => {
    const nativeReturns = [null, 0.01];
    const fxRates = [7.0];

    const result = convertReturnSeries(nativeReturns, fxRates);
    expect(result).toEqual(nativeReturns);
  });
});

describe('alignFxRatesToGrid', () => {
  it('aligns dated FX rates to the requested month grid', () => {
    const result = alignFxRatesToGrid(
      [
        { date: '2020-01-31', rate: 7.0 },
        { date: '2020-02-29', rate: 7.1 },
      ],
      ['2020-02-29'],
    );

    expect(result).toEqual([7.1]);
  });

  it('forward-fills missing FX rates for up to 3 months', () => {
    const result = alignFxRatesToGrid(
      [{ date: '2020-01-31', rate: 7.0 }],
      ['2020-01-31', '2020-02-29', '2020-03-31', '2020-04-30'],
    );

    expect(result).toEqual([7.0, 7.0, 7.0, 7.0]);
  });

  it('returns null for FX gaps longer than 3 months', () => {
    const result = alignFxRatesToGrid(
      [{ date: '2020-01-31', rate: 7.0 }],
      ['2020-01-31', '2020-02-29', '2020-03-31', '2020-04-30', '2020-05-31'],
    );

    expect(result).toEqual([7.0, 7.0, 7.0, 7.0, null]);
  });

  it('returns null before the first known FX rate', () => {
    const result = alignFxRatesToGrid(
      [{ date: '2020-03-31', rate: 7.2 }],
      ['2020-01-31', '2020-02-29', '2020-03-31'],
    );

    expect(result).toEqual([null, null, 7.2]);
  });
});
