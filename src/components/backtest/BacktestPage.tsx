import { useEffect, useCallback, useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/stores/backtest-store';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useDataStore } from '@/stores/data-store';
import { useBacktest } from '@/hooks/useBacktest';
import { getTemplateMetadata } from '@/portfolios/registry';
import { ParameterForm } from '@/components/backtest/ParameterForm';
import { CashflowEditor } from '@/components/backtest/CashflowEditor';
import { ComparisonPanel } from '@/components/backtest/ComparisonPanel';
import { ComparisonTable } from '@/components/backtest/ComparisonTable';
import { ResultsDashboard } from '@/components/backtest/ResultsDashboard';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';
import { MultiEquityChart } from '@/components/charts/MultiEquityChart';
import { AnnualReturnsChart } from '@/components/charts/AnnualReturnsChart';
import { DrawdownChart } from '@/components/charts/DrawdownChart';
import { RollingReturnsChart } from '@/components/charts/RollingReturnsChart';
import { ScatterChart } from '@/components/charts/ScatterChart';
import { MonteCarloChart } from '@/components/charts/MonteCarloChart';
import { timeSeriesToCSV, downloadCSV } from '@/lib/export-csv';
import type { BacktestParameters, BacktestResult, PortfolioDefinition } from '@/engine/types';
import type { CompSlot } from '@/components/backtest/ComparisonPanel';
import type { CompEntry } from '@/components/backtest/ComparisonTable';
import { BUILT_IN_BENCHMARKS } from '@/benchmarks/definitions';

type BrushWindow = { start: string; end: string } | null;

interface CompResult {
  id: string;
  name: string;
  result: BacktestResult | null;
  status: 'idle' | 'running' | 'ready' | 'error';
}

function paramsSignature(
  params: BacktestParameters,
  portfolio: PortfolioDefinition,
  compSlots: CompSlot[],
): string {
  const holdings = portfolio.holdings.map((h) => `${h.asset.symbol}:${h.targetWeight}`).join(',');
  const rebal =
    params.rebalancing.type === 'calendar'
      ? `cal:${params.rebalancing.frequency}`
      : `band:${(params.rebalancing as { type: 'tolerance_band'; threshold: number }).threshold}`;
  const slots = compSlots.map((s) => s.id).join('+');
  const cashflows = params.cashflows.map((c) => `${c.date}:${c.amount}:${c.recurring?.frequency ?? ''}`).join(';');
  return [
    holdings,
    params.startDate,
    params.endDate,
    params.initialCapital,
    params.displayCurrency,
    params.inflationRegion,
    String(params.inflationAdjusted),
    rebal,
    slots,
    cashflows,
  ].join('|');
}

async function runSlotBacktest(
  slot: CompSlot,
  params: BacktestParameters,
  etfMap: { symbol: string; name: string; nameZh?: string; assetClass: string; region: string; currency: string; provider: string; expenseRatio: number; inceptionDate: string }[],
  templates: ReturnType<typeof getTemplateMetadata>,
  saved: PortfolioDefinition[],
): Promise<BacktestResult> {
  if (slot.id.startsWith('bench:')) {
    const benchId = slot.id.replace('bench:', '');
    const benchmark = BUILT_IN_BENCHMARKS.find((b) => b.id === benchId);
    if (!benchmark) throw new Error('Benchmark not found');
    const { runBenchmarkBacktest: run } = await import('@/benchmarks/runner');
    return run({ ...params, portfolio: { id: '', name: '', holdings: [], tags: [] } }, benchmark);
  }

  let portfolio: PortfolioDefinition;

  if (slot.id.startsWith('template:')) {
    const tplId = slot.id.replace('template:', '');
    const tpl = templates.find((t) => t.id === tplId);
    if (!tpl) throw new Error('Template not found');
    const lookup = new Map(etfMap.map((e) => [e.symbol, e]));
    portfolio = {
      id: tpl.id,
      name: tpl.name,
      holdings: tpl.holdings
        .map((h) => {
          const e = lookup.get(h.symbol);
          if (!e) return null;
          return {
            asset: {
              symbol: e.symbol,
              name: e.name,
              nameZh: e.nameZh,
              assetClass: e.assetClass as PortfolioDefinition['holdings'][0]['asset']['assetClass'],
              region: e.region as PortfolioDefinition['holdings'][0]['asset']['region'],
              currency: e.currency,
              provider: e.provider,
              expenseRatio: e.expenseRatio,
              inceptionDate: e.inceptionDate,
            },
            targetWeight: h.weight,
          };
        })
        .filter((h): h is NonNullable<typeof h> => h !== null),
      tags: [],
    };
  } else {
    const found = saved.find((p) => p.id === slot.id);
    if (!found) throw new Error('Portfolio not found');
    portfolio = found;
  }

  const { runBacktest } = await import('@/engine/backtest');
  const { resolvePortfolioReturns, resolveCpiSeries, resolveFxRates } = await import('@/data/proxy-registry');
  const backtestParams: BacktestParameters = { ...params, portfolio };
  const assetReturns = await resolvePortfolioReturns(portfolio.holdings);
  const cpiSeries = await resolveCpiSeries(params.inflationRegion);
  const fxRates = new Map<string, (number | null)[]>();
  for (const holding of portfolio.holdings) {
    if (holding.asset.currency !== params.displayCurrency) {
      const rates = await resolveFxRates(holding.asset.currency, params.displayCurrency);
      fxRates.set(`${holding.asset.currency}${params.displayCurrency}`, rates);
    }
  }
  return runBacktest(backtestParams, assetReturns, fxRates, cpiSeries);
}

export function BacktestPage() {
  const { t } = useTranslation();
  const { params, result, status,
    setStartDate, setEndDate, setInitialCapital,
    setRebalancing, setDisplayCurrency, setInflationRegion, setInflationAdjusted,
    setCashflows, setPortfolio,
    setResult, setRunning, setError } = useBacktestStore();
  const { current: portfolio } = usePortfolioStore();
  const { etfMap } = useDataStore();
  const { result: hookResult, status: hookStatus, errorMessage: hookError, run } = useBacktest();

  const templates = useMemo(() => getTemplateMetadata(), []);
  const { saved } = usePortfolioStore();

  const [brushWindow, setBrushWindow] = useState<BrushWindow>(null);
  const [lastRunSignature, setLastRunSignature] = useState<string | null>(null);
  const [compSlots, setCompSlots] = useState<CompSlot[]>([]);
  const [compResults, setCompResults] = useState<CompResult[]>([]);
  const [runError, setRunError] = useState<string | null>(null);

  useEffect(() => {
    if (hookStatus === 'running') setBrushWindow(null);
  }, [hookStatus]);

  useEffect(() => { setPortfolio(portfolio); }, [portfolio, setPortfolio]);

  useEffect(() => {
    if (hookResult && hookStatus === 'ready') setResult(hookResult);
  }, [hookResult, hookStatus, setResult]);

  useEffect(() => {
    if (hookError && hookStatus === 'error') setError(hookError);
  }, [hookError, hookStatus, setError]);

  useEffect(() => {
    if (hookStatus === 'running') setRunning();
  }, [hookStatus, setRunning]);

  // Clear comparison results when slots change
  useEffect(() => {
    setCompResults(compSlots.map((s) => ({ ...s, result: null, status: 'idle' })));
  }, [compSlots]);

  const handleRunBacktest = useCallback(async () => {
    if (portfolio.holdings.length === 0) {
      setRunError(t('backtest.noPortfolioError'));
      return;
    }
    setRunError(null);
    const backtestParams = { ...params, portfolio };
    setLastRunSignature(paramsSignature(params, portfolio, compSlots));

    // Mark comparison slots as running
    if (compSlots.length > 0) {
      setCompResults(compSlots.map((s) => ({ ...s, result: null, status: 'running' })));
    }

    await run(backtestParams);

    // Run comparison slots sequentially
    if (compSlots.length > 0) {
      const results: CompResult[] = [];
      for (let i = 0; i < compSlots.length; i++) {
        const slot = compSlots[i];
        try {
          const slotResult = await runSlotBacktest(slot, backtestParams, etfMap, templates, saved);
          results.push({ ...slot, result: slotResult, status: 'ready' });
        } catch {
          results.push({ ...slot, result: null, status: 'error' });
        }
        setCompResults([
          ...results,
          ...compSlots.slice(results.length).map((s) => ({ ...s, result: null, status: 'running' as const })),
        ]);
      }
      setCompResults(results);
    }
  }, [params, portfolio, compSlots, run, etfMap, templates, saved, t]);

  const handleBrush = useCallback((start: string | null, end: string | null) => {
    if (start && end) setBrushWindow({ start, end });
    else setBrushWindow(null);
  }, []);

  const handleExportCSV = useCallback(() => {
    if (!result || result.timeSeries.length === 0) return;
    const csv = timeSeriesToCSV(result.timeSeries);
    downloadCSV(csv, `backtest-${new Date().toISOString().slice(0, 10)}.csv`);
  }, [result]);

  const canRun = true; // validation is done inside handleRunBacktest with error message
  const isRunning = status === 'running' || compResults.some((r) => r.status === 'running');
  const isStale =
    status === 'ready' &&
    result &&
    lastRunSignature !== null &&
    lastRunSignature !== paramsSignature(params, portfolio, compSlots);

  const hasComparison = compSlots.length > 0;

  // Build comparison entries (primary + ready comparison slots)
  const primaryName = portfolio.name || t('builder.untitled');
  const compEntries: CompEntry[] = useMemo(() => {
    if (!result || status !== 'ready') return [];
    const entries: CompEntry[] = [{ name: primaryName, metrics: result.metrics, isPrimary: true }];
    for (const cr of compResults) {
      if (cr.status === 'ready' && cr.result) {
        entries.push({ name: cr.name, metrics: cr.result.metrics });
      }
    }
    return entries;
  }, [result, status, compResults, primaryName]);

  // Build overlay series for multi-equity chart
  const allSeries = useMemo(() => {
    if (!result) return [];
    const series = [{ name: primaryName, data: result.timeSeries }];
    for (const cr of compResults) {
      if (cr.result) series.push({ name: cr.name, data: cr.result.timeSeries });
    }
    return series;
  }, [result, compResults, primaryName]);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('backtest.title')}</h1>

      <ParameterForm
        startDate={params.startDate}
        endDate={params.endDate}
        initialCapital={params.initialCapital}
        rebalancing={params.rebalancing}
        displayCurrency={params.displayCurrency}
        inflationRegion={params.inflationRegion}
        inflationAdjusted={params.inflationAdjusted}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onCapitalChange={setInitialCapital}
        onRebalancingChange={setRebalancing}
        onCurrencyChange={setDisplayCurrency}
        onInflationChange={setInflationRegion}
        onInflationAdjustedChange={setInflationAdjusted}
        onRun={handleRunBacktest}
        canRun={canRun}
        isRunning={isRunning}
      />

      <div className="mt-4">
        <CashflowEditor cashflows={params.cashflows} startDate={params.startDate} onChange={setCashflows} />
      </div>

      <div className="mt-4">
        <ComparisonPanel
          primaryName={primaryName}
          slots={compSlots}
          onChange={setCompSlots}
        />
      </div>

      {runError && (
        <div className="mt-3 px-4 py-2.5 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2">
          <span className="text-red-500 text-sm">✕</span>
          <span className="text-sm text-red-700">{runError}</span>
        </div>
      )}

      {brushWindow && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-gray-500">
            {t('backtest.zoomed')}: {brushWindow.start} — {brushWindow.end}
          </span>
          <button
            onClick={() => setBrushWindow(null)}
            className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            {t('backtest.resetZoom')}
          </button>
        </div>
      )}

      {status === 'ready' && result && result.timeSeries.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            {t('backtest.exportCsv')}
          </button>
        </div>
      )}

      {isStale && (
        <div className="mt-3 px-4 py-2.5 bg-amber-50 border border-amber-200 rounded-lg flex items-center gap-2">
          <span className="text-amber-600 text-sm">⚠</span>
          <span className="text-sm text-amber-700">{t('backtest.paramsChanged')}</span>
          <button
            onClick={handleRunBacktest}
            disabled={!canRun || isRunning}
            className="ml-auto text-xs px-3 py-1 bg-amber-500 text-white rounded hover:bg-amber-600 transition-colors disabled:opacity-40"
          >
            {t('backtest.run')}
          </button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        {/* Comparison mode: full 12-metric table */}
        {hasComparison ? (
          <>
            {compEntries.length > 0 && <ComparisonTable entries={compEntries} />}

            {/* Loading skeletons for slots still running */}
            {compResults.some((r) => r.status === 'running') && (
              <div className="bg-white rounded-xl border border-gray-200 p-4">
                <div className="space-y-2">
                  {compResults.filter((r) => r.status === 'running').map((r) => (
                    <div key={r.id} className="flex items-center gap-3 animate-pulse">
                      <div className="h-3 bg-gray-200 rounded w-32" />
                      <div className="h-3 bg-gray-200 rounded w-16" />
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Overlay equity chart */}
            <MultiEquityChart series={allSeries} />

            {/* Individual charts for primary portfolio */}
            <DrawdownChart timeSeries={result?.timeSeries ?? []} status={status} brushWindow={brushWindow} />
            <AnnualReturnsChart result={result} status={status} brushWindow={brushWindow} />
            <RollingReturnsChart timeSeries={result?.timeSeries ?? []} status={status} brushWindow={brushWindow} />
          </>
        ) : (
          <>
            {/* Single-portfolio mode: current layout */}
            <ResultsDashboard metrics={result?.metrics ?? null} status={status} />
            <EquityCurveChart
              timeSeries={result?.timeSeries ?? []}
              status={status}
              onBrush={handleBrush}
            />
            <DrawdownChart timeSeries={result?.timeSeries ?? []} status={status} brushWindow={brushWindow} />
            <AnnualReturnsChart result={result} status={status} brushWindow={brushWindow} />
            <RollingReturnsChart timeSeries={result?.timeSeries ?? []} status={status} brushWindow={brushWindow} />
            <ScatterChart metrics={result?.metrics ?? null} status={status} />
            <MonteCarloChart
              timeSeries={result?.timeSeries ?? []}
              initialCapital={params.initialCapital}
              status={status}
            />
          </>
        )}
      </div>
    </div>
  );
}
