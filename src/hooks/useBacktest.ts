import { useState, useCallback, useRef } from 'react';
import { runBacktest } from '../engine/backtest';
import { resolvePortfolioReturns, resolveCpiSeries, resolveFxRates } from '../data/proxy-registry';
import type { BacktestParameters, BacktestResult } from '../engine/types';

interface UseBacktestReturn {
  result: BacktestResult | null;
  status: 'idle' | 'running' | 'ready' | 'error';
  errorMessage: string | null;
  run: (params: BacktestParameters) => Promise<void>;
  reset: () => void;
}

/**
 * Hook to run a backtest from the UI.
 * Handles data loading, engine execution, and error states.
 */
export function useBacktest(): UseBacktestReturn {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const run = useCallback(async (params: BacktestParameters) => {
    // Abort previous run
    if (abortRef.current) {
      abortRef.current.abort();
    }
    const controller = new AbortController();
    abortRef.current = controller;

    setStatus('running');
    setErrorMessage(null);

    try {
      // 1. Resolve portfolio returns for each holding
      const assetReturns = await resolvePortfolioReturns(
        params.portfolio.holdings,
      );

      if (controller.signal.aborted) return;

      // 2. Resolve CPI data for inflation adjustment
      const cpiSeries = await resolveCpiSeries(params.inflationRegion);

      if (controller.signal.aborted) return;

      // 3. Resolve FX rates for each holding that needs currency conversion
      const fxRates = new Map<string, (number | null)[]>();
      for (const holding of params.portfolio.holdings) {
        if (holding.asset.currency !== params.displayCurrency) {
          const rates = await resolveFxRates(
            holding.asset.currency,
            params.displayCurrency,
          );
          const pair = `${holding.asset.currency}${params.displayCurrency}`;
          fxRates.set(pair, rates);
        }
      }

      if (controller.signal.aborted) return;

      // 4. Run the backtest engine
      const backtestResult = runBacktest(
        params,
        assetReturns,
        fxRates,
        cpiSeries,
      );

      setResult(backtestResult);
      setStatus('ready');
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      setErrorMessage((err as Error).message || 'Backtest failed');
      setStatus('error');
    }
  }, []);

  const reset = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
    }
    setResult(null);
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  return { result, status, errorMessage, run, reset };
}
