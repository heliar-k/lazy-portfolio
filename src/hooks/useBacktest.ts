import { useState, useCallback, useRef, useEffect } from 'react';
import { resolvePortfolioReturns, resolveCpiSeries, resolveFxRates } from '../data/proxy-registry';
import { loadDataVersion } from '../data/loader';
import { getCachedResult, setCachedResult } from '../lib/cache';
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
 * Uses a Web Worker to keep the main thread responsive during heavy computation.
 * Falls back to main-thread execution if workers are unavailable.
 */
export function useBacktest(): UseBacktestReturn {
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestIdRef = useRef(0);
  const abortRef = useRef(false);

  // Cleanup worker on unmount
  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  const getWorker = useCallback((): Worker | null => {
    try {
      if (workerRef.current) return workerRef.current;
      workerRef.current = new Worker(
        new URL('../workers/backtest.worker.ts', import.meta.url),
        { type: 'module' },
      );
      return workerRef.current;
    } catch {
      return null;
    }
  }, []);

  const run = useCallback(async (params: BacktestParameters) => {
    // Abort previous run
    abortRef.current = true;
    workerRef.current?.terminate();
    workerRef.current = null;

    abortRef.current = false;
    const currentRequestId = ++requestIdRef.current;

    setStatus('running');
    setErrorMessage(null);

    try {
      // Load data version first — used as cache key component so stale results
      // are automatically invalidated when CSV data files are updated.
      const dataVersion = await loadDataVersion();
      const dv = dataVersion.version;

      // Check cache first
      const cached = getCachedResult(params, dv);
      if (cached) {
        if (abortRef.current || currentRequestId !== requestIdRef.current) return;
        setResult(cached);
        setStatus('ready');
        return;
      }

      // 1. Resolve data (main thread — involves fetch)
      const assetReturns = await resolvePortfolioReturns(params.portfolio.holdings);

      if (abortRef.current || currentRequestId !== requestIdRef.current) return;

      const cpiSeries = await resolveCpiSeries(params.inflationRegion);

      if (abortRef.current || currentRequestId !== requestIdRef.current) return;

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

      if (abortRef.current || currentRequestId !== requestIdRef.current) return;

      // 2. Offload computation to worker (or fallback to main thread)
      const worker = getWorker();

      if (worker) {
        // Serialize Maps to arrays for postMessage
        const result = await new Promise<BacktestResult>((resolve, reject) => {
          worker.onmessage = (e) => {
            const { id, result, error } = e.data;
            if (id !== currentRequestId) return;
            if (error) reject(new Error(error));
            else resolve(result as BacktestResult);
          };

          worker.onerror = (err) => {
            reject(new Error(err.message || 'Worker error'));
          };

          worker.postMessage({
            id: currentRequestId,
            params,
            assetReturns: Array.from(assetReturns.entries()),
            fxRates: Array.from(fxRates.entries()),
            cpiSeries: Array.from(cpiSeries.entries()),
          });
        });

        if (abortRef.current || currentRequestId !== requestIdRef.current) return;

        setResult(result);
        setCachedResult(params, result, dv);
        setStatus('ready');
      } else {
        // Fallback: run on main thread via dynamic import
        const { runBacktest } = await import('../engine/backtest');

        if (abortRef.current || currentRequestId !== requestIdRef.current) return;

        const backtestResult = runBacktest(
          params,
          assetReturns,
          fxRates,
          cpiSeries,
        );

        setResult(backtestResult);
        setCachedResult(params, backtestResult, dv);
        setStatus('ready');
      }
    } catch (err) {
      if ((err as Error).name === 'AbortError') return;
      if (abortRef.current || currentRequestId !== requestIdRef.current) return;
      setErrorMessage((err as Error).message || 'Backtest failed');
      setStatus('error');
    }
  }, [getWorker]);

  const reset = useCallback(() => {
    abortRef.current = true;
    workerRef.current?.terminate();
    workerRef.current = null;
    setResult(null);
    setStatus('idle');
    setErrorMessage(null);
  }, []);

  return { result, status, errorMessage, run, reset };
}
