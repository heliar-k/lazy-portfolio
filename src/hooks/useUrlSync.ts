import { useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useBacktestStore } from '@/stores/backtest-store';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useDataStore } from '@/stores/data-store';
import { serializeBacktestParams, deserializeBacktestParams } from '@/lib/url-serializer';
import { loadEtfMap } from '@/data/loader';
import type { PortfolioHolding } from '@/engine/types';

/**
 * Initialize ETF data at app level (so it's available on all pages).
 */
export function useDataInit() {
  const etfMap = useDataStore((s) => s.etfMap);
  const setEtfMap = useDataStore((s) => s.setEtfMap);
  const setReady = useDataStore((s) => s.setReady);
  const setError = useDataStore((s) => s.setError);

  useEffect(() => {
    if (etfMap.length > 0) return;

    loadEtfMap()
      .then((map) => {
        setEtfMap(map);
        setReady();
      })
      .catch((err) => {
        setError((err as Error).message || 'Failed to load ETF data');
      });
  }, [etfMap.length, setEtfMap, setReady, setError]);
}

/**
 * Sync backtest parameters and portfolio between URL query string and Zustand stores.
 *
 * On mount: URL params → store (URL takes priority)
 * On change: store → URL (via replaceState, no history pollution)
 */
export function useUrlSync() {
  const [searchParams, setSearchParams] = useSearchParams();
  const initialized = useRef(false);

  const params = useBacktestStore((s) => s.params);
  const setStartDate = useBacktestStore((s) => s.setStartDate);
  const setEndDate = useBacktestStore((s) => s.setEndDate);
  const setInitialCapital = useBacktestStore((s) => s.setInitialCapital);
  const setDisplayCurrency = useBacktestStore((s) => s.setDisplayCurrency);
  const setInflationRegion = useBacktestStore((s) => s.setInflationRegion);
  const setInflationAdjusted = useBacktestStore((s) => s.setInflationAdjusted);
  const setRebalancing = useBacktestStore((s) => s.setRebalancing);
  const setCashflows = useBacktestStore((s) => s.setCashflows);
  const setPortfolio = useBacktestStore((s) => s.setPortfolio);

  const portfolio = usePortfolioStore((s) => s.current);
  const loadFromDefinition = usePortfolioStore((s) => s.loadFromDefinition);

  const availableEtfs = useDataStore((s) => s.availableEtfs);

  const getAssetBySymbol = (symbol: string): PortfolioHolding['asset'] | null => {
    const found = availableEtfs.find((e) => e.symbol === symbol);
    if (!found) return null;
    return found as PortfolioHolding['asset'];
  };

  // On mount: deserialize URL → store
  // Depends on availableEtfs to ensure ETF data is loaded before deserializing
  useEffect(() => {
    if (initialized.current) return;
    if (availableEtfs.length === 0) return; // wait for data to load
    initialized.current = true;

    const urlParams = deserializeBacktestParams(searchParams, getAssetBySymbol);

    if (urlParams.startDate) setStartDate(urlParams.startDate);
    if (urlParams.endDate) setEndDate(urlParams.endDate);
    if (urlParams.initialCapital !== undefined) setInitialCapital(urlParams.initialCapital);
    if (urlParams.displayCurrency) setDisplayCurrency(urlParams.displayCurrency);
    if (urlParams.inflationRegion) setInflationRegion(urlParams.inflationRegion);
    if (urlParams.inflationAdjusted !== undefined) setInflationAdjusted(urlParams.inflationAdjusted);
    if (urlParams.rebalancing) setRebalancing(urlParams.rebalancing);
    if (urlParams.cashflows) setCashflows(urlParams.cashflows);

    // Portfolio from URL
    if (urlParams.portfolio) {
      loadFromDefinition(urlParams.portfolio);
      setPortfolio(urlParams.portfolio);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [availableEtfs.length]);

  // On store change: sync to URL
  useEffect(() => {
    if (!initialized.current) return;

    const newSearchParams = serializeBacktestParams({
      ...params,
      portfolio,
    });

    // Compare to avoid infinite loops
    const newStr = newSearchParams.toString();
    const oldStr = searchParams.toString();
    if (newStr !== oldStr) {
      setSearchParams(newSearchParams, { replace: true });
    }
  }, [params, portfolio, searchParams, setSearchParams]);
}
