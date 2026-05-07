import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useBacktestStore } from '@/stores/backtest-store';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useBacktest } from '@/hooks/useBacktest';
import { ParameterForm } from '@/components/backtest/ParameterForm';
import { ResultsDashboard } from '@/components/backtest/ResultsDashboard';
import { EquityCurveChart } from '@/components/charts/EquityCurveChart';

export function BacktestPage() {
  const { t } = useTranslation();
  const { params, result, status, setStartDate, setEndDate, setInitialCapital,
    setRebalancing, setDisplayCurrency, setInflationRegion, setInflationAdjusted,
    setPortfolio, setResult, setRunning, setError } = useBacktestStore();
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

  const handleRunBacktest = async () => {
    await run({ ...params, portfolio });
  };

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
        onStartDateChange={setStartDate}
        onEndDateChange={setEndDate}
        onCapitalChange={setInitialCapital}
        onRebalancingChange={setRebalancing}
        onCurrencyChange={setDisplayCurrency}
        onInflationChange={setInflationRegion}
        onInflationAdjustedChange={setInflationAdjusted}
        onRun={handleRunBacktest}
        canRun={canRun}
        isRunning={status === 'running'}
      />

      <div className="mt-6 space-y-6">
        <ResultsDashboard metrics={result?.metrics ?? null} status={status} />

        <EquityCurveChart
          timeSeries={result?.timeSeries ?? []}
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
