import { useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/stores/backtest-store';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useBacktest } from '@/hooks/useBacktest';
import { getBenchmark } from '@/benchmarks/definitions';
import { runBenchmarkBacktest } from '@/benchmarks/runner';
import { ParameterForm } from '@/components/backtest/ParameterForm';
import { ResultsDashboard } from '@/components/backtest/ResultsDashboard';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';

export function BacktestPage() {
  const { t } = useTranslation();
  const { params, result, benchmarkId, benchmarkResult, status,
    setStartDate, setEndDate, setInitialCapital,
    setRebalancing, setDisplayCurrency, setInflationRegion, setInflationAdjusted,
    setPortfolio, setBenchmarkId, setBenchmarkResult,
    setResult, setRunning, setError } = useBacktestStore();
  const { current: portfolio } = usePortfolioStore();
  const { result: hookResult, status: hookStatus, errorMessage: hookError,
    run, reset: _reset } = useBacktest();

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
          // Benchmark failure is non-blocking
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
        />

        {result && (
          <div className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              Annual Returns
            </h3>
            <div className="flex flex-wrap gap-1">
              {result.annualReturns.map((yr) => (
                <div
                  key={yr.year}
                  className={`px-3 py-1.5 rounded text-sm font-medium ${
                    yr.return >= 0
                      ? 'bg-green-50 text-green-700'
                      : 'bg-red-50 text-red-700'
                  }`}
                >
                  <span className="text-xs text-gray-500">{yr.year}</span>{' '}
                  {(yr.return * 100).toFixed(1)}%
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
