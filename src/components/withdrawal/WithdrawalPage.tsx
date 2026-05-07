import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useDataStore } from '@/stores/data-store';
import { resolvePortfolioReturns, resolveCpiSeries } from '@/data/proxy-registry';
import { computeSWR } from '@/engine/withdrawal';
import type {
  RebalancingStrategy,
  SWRResult,
} from '@/engine/types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function fmtPctFull(v: number): string {
  return `${(v * 100).toFixed(1)}%`;
}

function fmtDollar(v: number): string {
  if (Math.abs(v) >= 1_000_000) return `$${(v / 1_000_000).toFixed(2)}M`;
  if (Math.abs(v) >= 1_000) return `$${(v / 1_000).toFixed(0)}K`;
  return `$${Math.round(v).toLocaleString('en-US')}`;
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function ParameterForm({
  retirementYears,
  setRetirementYears,
  initialCapital,
  setInitialCapital,
  rebalancing,
  setRebalancing,
  onRun,
  running,
  canRun,
}: {
  retirementYears: number;
  setRetirementYears: (v: number) => void;
  initialCapital: number;
  setInitialCapital: (v: number) => void;
  rebalancing: RebalancingStrategy;
  setRebalancing: (v: RebalancingStrategy) => void;
  onRun: () => void;
  running: boolean;
  canRun: boolean;
}) {
  const { t } = useTranslation();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-5">
      <h2 className="text-lg font-semibold text-slate-900">
        {t('withdrawal.parameters', 'Withdrawal Parameters')}
      </h2>

      {/* Retirement Duration */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {t('withdrawal.retirementYears', 'Retirement Duration')}: {retirementYears} {t('withdrawal.years', 'years')}
        </label>
        <input
          type="range"
          min={10}
          max={50}
          step={1}
          value={retirementYears}
          onChange={e => setRetirementYears(Number(e.target.value))}
          className="w-full accent-blue-500"
        />
        <div className="flex justify-between text-xs text-slate-400">
          <span>10</span>
          <span>30</span>
          <span>50</span>
        </div>
      </div>

      {/* Initial Capital */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {t('withdrawal.initialCapital', 'Initial Capital')}
        </label>
        <select
          value={initialCapital}
          onChange={e => setInitialCapital(Number(e.target.value))}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value={100000}>$100,000</option>
          <option value={500000}>$500,000</option>
          <option value={1000000}>$1,000,000</option>
          <option value={2000000}>$2,000,000</option>
        </select>
      </div>

      {/* Rebalancing */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">
          {t('withdrawal.rebalancing', 'Rebalancing')}
        </label>
        <select
          value={rebalancing.type === 'calendar' ? rebalancing.frequency : 'annual'}
          onChange={e => {
            setRebalancing({
              type: 'calendar',
              frequency: e.target.value as RebalancingStrategy extends { type: 'calendar'; frequency: infer F } ? F : never,
            });
          }}
          className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm"
        >
          <option value="monthly">{t('rebalance.monthly')}</option>
          <option value="quarterly">{t('rebalance.quarterly')}</option>
          <option value="annual">{t('rebalance.annual')}</option>
        </select>
      </div>

      {/* Strategy Info */}
      <div className="bg-blue-50 rounded-lg p-3 text-sm text-blue-800">
        <p className="font-medium mb-1">{t('withdrawal.strategy', 'Strategy')}: {t('withdrawal.fixedPercentage', 'Fixed Percentage (4% Rule)')}</p>
        <p className="text-blue-600 text-xs">
          {t('withdrawal.strategyDesc', 'Initial withdrawal = {{rate}} of starting capital, adjusted for inflation each year. Tests all possible start years.', {
            rate: 'initialCapital × withdrawalRate',
          })}
        </p>
      </div>

      {/* Run Button */}
      <button
        onClick={onRun}
        disabled={!canRun || running}
        className="w-full rounded-lg bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        {running ? (
          <span className="inline-flex items-center gap-2">
            <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            {t('withdrawal.running', 'Running simulations...')}
          </span>
        ) : (
          t('withdrawal.runAnalysis', 'Run Withdrawal Analysis')
        )}
      </button>
    </div>
  );
}

function ResultsSummary({ result }: { result: SWRResult }) {
  const { t } = useTranslation();

  const successColor = result.successRate >= 0.95 ? 'text-green-600' :
    result.successRate >= 0.8 ? 'text-yellow-600' : 'text-red-600';

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6 space-y-4">
      <h2 className="text-lg font-semibold text-slate-900">
        {t('withdrawal.results', 'Results')}
      </h2>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Success Rate */}
        <div className="bg-slate-50 rounded-lg p-4 text-center">
          <div className={`text-3xl font-bold ${successColor}`}>
            {fmtPctFull(result.successRate)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {t('withdrawal.successRate', 'Success Rate')}
          </div>
          <div className="text-xs text-slate-400">
            {t('withdrawal.at4pct', '@ 4% withdrawal')}
          </div>
        </div>

        {/* Safe Withdrawal Rate */}
        <div className="bg-slate-50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-blue-600">
            {fmtPctFull(result.safeWithdrawalRate)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {t('withdrawal.swr', 'Safe Withdrawal Rate')}
          </div>
          <div className="text-xs text-slate-400">
            {t('withdrawal.swrDesc', '100% historical success')}
          </div>
        </div>

        {/* Median Final Balance */}
        <div className="bg-slate-50 rounded-lg p-4 text-center">
          <div className="text-3xl font-bold text-slate-800">
            {fmtDollar(result.medianFinalBalance)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {t('withdrawal.medianFinal', 'Median Final Balance')}
          </div>
          <div className="text-xs text-slate-400">
            {t('withdrawal.nominal', 'Nominal · @ 4% withdrawal')}
          </div>
        </div>

        {/* Worst Case */}
        <div className="bg-slate-50 rounded-lg p-4 text-center">
          <div className={`text-3xl font-bold ${result.worstCaseFinalBalance <= 0 ? 'text-red-600' : 'text-slate-800'}`}>
            {fmtDollar(result.worstCaseFinalBalance)}
          </div>
          <div className="text-xs text-slate-500 mt-1">
            {t('withdrawal.worstCase', 'Worst Final Balance')}
          </div>
          <div className="text-xs text-slate-400">
            {t('withdrawal.nominal', 'Nominal · @ 4% withdrawal')}
          </div>
        </div>
      </div>

      {/* Periods tested */}
      <p className="text-xs text-slate-400">
        {t('withdrawal.periodsTested', 'Tested {{count}} retirement periods from {{first}} to {{last}}', {
          count: result.periodResults.length,
          first: result.periodResults[0]?.startDate?.substring(0, 4) ?? '?',
          last: result.periodResults[result.periodResults.length - 1]?.startDate?.substring(0, 4) ?? '?',
        })}
      </p>
    </div>
  );
}

function SuccessHeatmap({ result }: { result: SWRResult }) {
  const { t } = useTranslation();

  // Build grid: rows = start years, cols = withdrawal rates
  const rates = [...new Set(result.sweepResults.map(r => r.rate))].sort((a, b) => a - b);
  const years = [...new Set(result.sweepResults.map(r => r.startDate.substring(0, 4)))].sort();

  // Build lookup: "year-rate" → result
  const lookup = new Map<string, { success: boolean; finalBalance: number }>();
  for (const r of result.sweepResults) {
    lookup.set(`${r.startDate.substring(0, 4)}-${r.rate}`, {
      success: r.success,
      finalBalance: r.finalBalance,
    });
  }

  const getColor = (success: boolean, finalBalance: number): string => {
    if (!success) {
      // Darker red = failed and lost all money
      if (finalBalance <= 0) return 'bg-red-600';
      return 'bg-red-400';
    }
    // Green shades: lighter = more final capital
    if (finalBalance > 5_000_000) return 'bg-green-600';
    if (finalBalance > 2_000_000) return 'bg-green-500';
    if (finalBalance > 1_000_000) return 'bg-green-400';
    if (finalBalance > 500_000) return 'bg-green-300';
    return 'bg-green-200';
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        {t('withdrawal.successHeatmap', 'Success Rate Heatmap')}
      </h2>
      <p className="text-xs text-slate-500 mb-3">
        {t('withdrawal.heatmapDesc', 'Each cell = one retirement period. Green = survived, Red = depleted.')}
      </p>

      <div className="overflow-x-auto">
        <div className="inline-flex flex-col text-xs">
          {/* Header row */}
          <div className="flex">
            <div className="w-14 shrink-0 text-slate-400 py-0.5 text-right pr-1">
              {t('withdrawal.year', 'Year')}
            </div>
            {rates.map(rate => (
              <div
                key={rate}
                className="w-7 text-center text-slate-400 py-0.5"
                title={`${(rate * 100).toFixed(1)}%`}
              >
                {(rate * 100).toFixed(0)}%
              </div>
            ))}
          </div>

          {/* Data rows */}
          {years.map(year => (
            <div key={year} className="flex">
              <div className="w-14 shrink-0 text-slate-400 py-0.5 text-right pr-1">
                {year}
              </div>
              {rates.map(rate => {
                const cell = lookup.get(`${year}-${rate}`);
                if (!cell) return <div key={rate} className="w-7 py-0.5" />;
                return (
                  <div
                    key={rate}
                    className={`w-7 h-4 ${getColor(cell.success, cell.finalBalance)}`}
                    title={`${year} @ ${(rate * 100).toFixed(1)}%: ${cell.success ? 'Survived' : 'Failed'} (${fmtDollar(cell.finalBalance)})`}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-2 mt-3 text-xs text-slate-500">
        <span>{t('withdrawal.failed', 'Failed')}</span>
        <div className="flex gap-0.5">
          <div className="w-4 h-3 bg-red-600" />
          <div className="w-4 h-3 bg-red-400" />
        </div>
        <div className="flex gap-0.5 ml-2">
          <div className="w-4 h-3 bg-green-200" />
          <div className="w-4 h-3 bg-green-300" />
          <div className="w-4 h-3 bg-green-400" />
          <div className="w-4 h-3 bg-green-500" />
          <div className="w-4 h-3 bg-green-600" />
        </div>
        <span>{t('withdrawal.survived', 'Survived')}</span>
      </div>
    </div>
  );
}

function PeriodResultsTable({ result }: { result: SWRResult }) {
  const { t } = useTranslation();

  // Show top 10 worst + top 5 best periods
  const sorted = [...result.periodResults].sort((a, b) => a.finalBalance - b.finalBalance);
  const worst = sorted.slice(0, 10);
  const best = sorted.slice(-5).reverse();

  return (
    <div className="bg-white rounded-xl border border-slate-200 p-6">
      <h2 className="text-lg font-semibold text-slate-900 mb-4">
        {t('withdrawal.periodDetails', 'Period Details (@ 4% WR)')}
      </h2>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Worst periods */}
        <div>
          <h3 className="text-sm font-medium text-red-700 mb-2">
            {t('withdrawal.worstPeriods', 'Worst Starting Years')}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b">
                <th className="pb-1">{t('withdrawal.startYear', 'Start')}</th>
                <th className="pb-1 text-right">{t('withdrawal.finalBalance', 'Final')}</th>
                <th className="pb-1 text-right">{t('withdrawal.minBalance', 'Min')}</th>
                <th className="pb-1 text-right">{t('withdrawal.status', 'Status')}</th>
              </tr>
            </thead>
            <tbody>
              {worst.map(p => (
                <tr key={p.startDate} className="border-b border-slate-100">
                  <td className="py-1">{p.startDate.substring(0, 4)}</td>
                  <td className="py-1 text-right font-mono">
                    {fmtDollar(p.finalBalance)}
                  </td>
                  <td className="py-1 text-right font-mono">
                    {fmtDollar(p.minBalance)}
                  </td>
                  <td className="py-1 text-right">
                    {p.success ? (
                      <span className="text-green-600">{t('withdrawal.survived', 'Survived')}</span>
                    ) : (
                      <span className="text-red-600">
                        {p.depletionDate
                          ? t('withdrawal.depletedAt', 'Depleted {{date}}', { date: p.depletionDate.substring(0, 4) })
                          : t('withdrawal.failed', 'Failed')}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Best periods */}
        <div>
          <h3 className="text-sm font-medium text-green-700 mb-2">
            {t('withdrawal.bestPeriods', 'Best Starting Years')}
          </h3>
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-slate-500 border-b">
                <th className="pb-1">{t('withdrawal.startYear', 'Start')}</th>
                <th className="pb-1 text-right">{t('withdrawal.finalBalance', 'Final')}</th>
                <th className="pb-1 text-right">{t('withdrawal.totalWithdrawn', 'Withdrawn')}</th>
              </tr>
            </thead>
            <tbody>
              {best.map(p => (
                <tr key={p.startDate} className="border-b border-slate-100">
                  <td className="py-1">{p.startDate.substring(0, 4)}</td>
                  <td className="py-1 text-right font-mono">
                    {fmtDollar(p.finalBalance)}
                  </td>
                  <td className="py-1 text-right font-mono">
                    {fmtDollar(p.totalWithdrawals)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main Page
// ---------------------------------------------------------------------------

export function WithdrawalPage() {
  const { t } = useTranslation();

  // Portfolio from store
  const currentPortfolio = usePortfolioStore(s => s.current);
  const etfMap = useDataStore(s => s.etfMap);

  // Form state
  const [retirementYears, setRetirementYears] = useState(30);
  const [initialCapital, setInitialCapital] = useState(1_000_000);
  const [rebalancing, setRebalancing] = useState<RebalancingStrategy>({
    type: 'calendar',
    frequency: 'annual',
  });

  // Results state
  const [result, setResult] = useState<SWRResult | null>(null);
  const [status, setStatus] = useState<'idle' | 'running' | 'ready' | 'error'>('idle');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const canRun = currentPortfolio.holdings.length > 0 && etfMap.length > 0;

  const runAnalysis = useCallback(async () => {
    if (!canRun) return;

    setStatus('running');
    setErrorMessage(null);

    try {
      // Use holdings directly from the store (already have full AssetIdentifier)
      const holdings = currentPortfolio.holdings.filter(h => {
        const etf = etfMap.find(e => e.symbol === h.asset.symbol);
        return etf && etf.proxySymbol; // only include ETFs with proxy data
      });

      if (holdings.length === 0) {
        throw new Error('No valid holdings with proxy data found. Add ETFs to your portfolio first.');
      }

      // Resolve return data
      const assetReturns = await resolvePortfolioReturns(holdings);
      const cpiSeries = await resolveCpiSeries('us');

      // Run SWR computation (in worker-like fashion, but on main thread for now)
      const swrResult = computeSWR(holdings, assetReturns, cpiSeries, {
        retirementYears,
        initialCapital,
        rebalancing,
      });

      setResult(swrResult);
      setStatus('ready');
    } catch (err) {
      setErrorMessage((err as Error).message || 'Analysis failed');
      setStatus('error');
    }
  }, [canRun, currentPortfolio.holdings, etfMap, retirementYears, initialCapital, rebalancing]);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">
          {t('withdrawal.title', 'Withdrawal Strategy Analysis')}
        </h1>
        <p className="text-sm text-slate-500 mt-1">
          {t('withdrawal.subtitle', 'Historical safe withdrawal rate analysis using your portfolio allocation')}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
        {/* Left sidebar: form */}
        <div className="lg:col-span-1">
          <ParameterForm
            retirementYears={retirementYears}
            setRetirementYears={setRetirementYears}
            initialCapital={initialCapital}
            setInitialCapital={setInitialCapital}
            rebalancing={rebalancing}
            setRebalancing={setRebalancing}
            onRun={runAnalysis}
            running={status === 'running'}
            canRun={canRun}
          />

          {!canRun && (
            <p className="mt-3 text-xs text-amber-600 bg-amber-50 rounded-lg p-3">
              {t('withdrawal.noPortfolio', 'Build a portfolio first. Go to the Builder page to add ETFs.')}
            </p>
          )}
        </div>

        {/* Right: results */}
        <div className="lg:col-span-3 space-y-6">
          {status === 'idle' && !result && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <p className="text-slate-400">
                {t('withdrawal.idleMessage', 'Configure parameters and run the analysis to see safe withdrawal rates across historical periods.')}
              </p>
            </div>
          )}

          {status === 'running' && (
            <div className="bg-white rounded-xl border border-slate-200 p-12 text-center">
              <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-3" />
              <p className="text-slate-500">
                {t('withdrawal.runningMessage', 'Running simulations across all historical starting periods...')}
              </p>
            </div>
          )}

          {status === 'error' && (
            <div className="bg-red-50 rounded-xl border border-red-200 p-6">
              <p className="text-red-700 font-medium">{t('withdrawal.error', 'Error')}</p>
              <p className="text-red-600 text-sm mt-1">{errorMessage}</p>
            </div>
          )}

          {result && status === 'ready' && (
            <>
              <ResultsSummary result={result} />
              <SuccessHeatmap result={result} />
              <PeriodResultsTable result={result} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
