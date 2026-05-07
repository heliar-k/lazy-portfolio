import { useEffect, useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/stores/backtest-store';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useBacktest } from '@/hooks/useBacktest';
import { getBenchmark } from '@/benchmarks/definitions';
import { runBenchmarkBacktest } from '@/benchmarks/runner';
import { ParameterForm } from '@/components/backtest/ParameterForm';
import { CashflowEditor } from '@/components/backtest/CashflowEditor';
import { ResultsDashboard } from '@/components/backtest/ResultsDashboard';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';
import { AnnualReturnsChart } from '@/components/charts/AnnualReturnsChart';
import { DrawdownChart } from '@/components/charts/DrawdownChart';
import { RollingReturnsChart } from '@/components/charts/RollingReturnsChart';
import { ScatterChart } from '@/components/charts/ScatterChart';
import { MonteCarloChart } from '@/components/charts/MonteCarloChart';
import { timeSeriesToCSV, downloadCSV } from '@/lib/export-csv';

type BrushWindow = { start: string; end: string } | null;

export function BacktestPage() {
  const { t } = useTranslation();
  const { params, result, benchmarkId, benchmarkResult, status,
    setStartDate, setEndDate, setInitialCapital,
    setRebalancing, setDisplayCurrency, setInflationRegion, setInflationAdjusted,
    setCashflows, setPortfolio, setBenchmarkId, setBenchmarkResult,
    setResult, setRunning, setError } = useBacktestStore();
  const { current: portfolio } = usePortfolioStore();
  const { result: hookResult, status: hookStatus, errorMessage: hookError,
    run, reset: _reset } = useBacktest();

  const [brushWindow, setBrushWindow] = useState<BrushWindow>(null);

  // Clear brush when new backtest starts
  useEffect(() => {
    if (hookStatus === 'running') {
      setBrushWindow(null);
    }
  }, [hookStatus]);

  // Sync portfolio into backtest params
  useEffect(() => {
    setPortfolio(portfolio);
  }, [portfolio, setPortfolio]);

  // Sync hook results back to store
  useEffect(() => {
    if (hookResult && hookStatus === 'ready') {
      setResult(hookResult);
    }
  }, [hookResult, hookStatus, setResult]);

  useEffect(() => {
    if (hookError && hookStatus === 'error') {
      setError(hookError);
    }
  }, [hookError, hookStatus, setError]);

  useEffect(() => {
    if (hookStatus === 'running') {
      setRunning();
    }
  }, [hookStatus, setRunning]);

  const handleRunBacktest = useCallback(async () => {
    const backtestParams = { ...params, portfolio };
    await run(backtestParams);

    // Run benchmark if selected
    if (benchmarkId) {
      const benchmark = getBenchmark(benchmarkId);
      if (benchmark) {
        try {
          const benchResult = await runBenchmarkBacktest(backtestParams, benchmark);
          setBenchmarkResult(benchResult);
        } catch {
          setBenchmarkResult(null);
        }
      }
    } else {
      setBenchmarkResult(null);
    }
  }, [params, portfolio, benchmarkId, run, setBenchmarkResult]);

  const handleBenchmarkChange = useCallback((id: string | null) => {
    setBenchmarkId(id);
    if (!id) setBenchmarkResult(null);
  }, [setBenchmarkId, setBenchmarkResult]);

  const handleBrush = useCallback((start: string | null, end: string | null) => {
    if (start && end) {
      setBrushWindow({ start, end });
    } else {
      setBrushWindow(null);
    }
  }, []);

  const handleResetZoom = useCallback(() => {
    setBrushWindow(null);
  }, []);

  const handleExportCSV = useCallback(() => {
    if (!result || result.timeSeries.length === 0) return;
    const csv = timeSeriesToCSV(
      result.timeSeries,
      benchmarkResult?.timeSeries,
      benchmarkResult?.parameters.portfolio.name,
    );
    const date = new Date().toISOString().slice(0, 10);
    downloadCSV(csv, `backtest-${date}.csv`);
  }, [result, benchmarkResult]);

  const canRun = portfolio.holdings.length > 0;

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
        benchmarkId={benchmarkId}
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onCapitalChange={setInitialCapital}
        onRebalancingChange={setRebalancing}
        onCurrencyChange={setDisplayCurrency}
        onInflationChange={setInflationRegion}
        onInflationAdjustedChange={setInflationAdjusted}
        onBenchmarkChange={handleBenchmarkChange}
        onRun={handleRunBacktest}
        canRun={canRun}
        isRunning={status === 'running'}
      />

      <div className="mt-4">
        <CashflowEditor
          cashflows={params.cashflows}
          onChange={setCashflows}
        />
      </div>

      {brushWindow && (
        <div className="mt-4 flex items-center gap-2">
          <span className="text-xs text-gray-500">
            Zoomed: {brushWindow.start} — {brushWindow.end}
          </span>
          <button
            onClick={handleResetZoom}
            className="text-xs px-2 py-1 text-blue-600 hover:bg-blue-50 rounded transition-colors"
          >
            Reset zoom
          </button>
        </div>
      )}

      {status === 'ready' && result && result.timeSeries.length > 0 && (
        <div className="mt-4 flex items-center gap-2">
          <button
            onClick={handleExportCSV}
            className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 hover:bg-gray-200 rounded transition-colors"
          >
            Export CSV
          </button>
        </div>
      )}

      <div className="mt-6 space-y-6">
        <ResultsDashboard
          metrics={result?.metrics ?? null}
          benchmarkMetrics={benchmarkResult?.metrics ?? null}
          benchmarkName={benchmarkResult?.parameters.portfolio.name}
          status={status}
        />

        <EquityCurveChart
          timeSeries={result?.timeSeries ?? []}
          benchmarkTimeSeries={benchmarkResult?.timeSeries ?? []}
          benchmarkName={benchmarkResult?.parameters.portfolio.name}
          status={status}
          onBrush={handleBrush}
        />

        <DrawdownChart
          timeSeries={result?.timeSeries ?? []}
          status={status}
          brushWindow={brushWindow}
        />

        <AnnualReturnsChart
          result={result}
          status={status}
          brushWindow={brushWindow}
        />

        <RollingReturnsChart
          timeSeries={result?.timeSeries ?? []}
          status={status}
          brushWindow={brushWindow}
        />

        <ScatterChart
          metrics={result?.metrics ?? null}
          benchmarkMetrics={benchmarkResult?.metrics ?? null}
          benchmarkName={benchmarkResult?.parameters.portfolio.name}
          status={status}
        />

        <MonteCarloChart
          timeSeries={result?.timeSeries ?? []}
          initialCapital={params.initialCapital}
          status={status}
        />
      </div>
    </div>
  );
}
