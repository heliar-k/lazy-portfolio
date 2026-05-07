import { useState, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useComparisonStore } from '@/stores/comparison-store';
import { useBacktestStore } from '@/stores/backtest-store';
import { getBenchmark } from '@/benchmarks/definitions';
import { runBenchmarkBacktest } from '@/benchmarks/runner';
import { MultiEquityChart } from '@/components/charts/MultiEquityChart';
import type { BacktestResult, BacktestParameters } from '@/engine/types';
import { formatPct, formatCurrency, formatNumber } from '@/lib/format';

interface SlotResult {
  name: string;
  result: BacktestResult | null;
  status: 'empty' | 'loading' | 'ready' | 'error';
}

export function ComparePage() {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const { saved } = usePortfolioStore();
  const { slots, setSlot, removeSlot, clearAll } = useComparisonStore();
  const { params } = useBacktestStore();

  const [slotResults, setSlotResults] = useState<SlotResult[]>(
    slots.map((s) => ({ name: s.name, result: s.result, status: s.status })),
  );
  const [isRunning, setIsRunning] = useState(false);

  const handleSelectPortfolio = useCallback((slotIndex: number, portfolioId: string) => {
    const portfolio = saved.find((p) => p.id === portfolioId);
    if (portfolio) {
      setSlot(slotIndex, {
        id: portfolio.id,
        name: portfolio.name || t('compare.untitled'),
        status: 'empty',
        result: null,
      });
      setSlotResults((prev) => {
        const next = [...prev];
        next[slotIndex] = { name: portfolio.name || t('compare.untitled'), result: null, status: 'empty' };
        return next;
      });
    }
  }, [saved, setSlot]);

  const handleSelectBenchmark = useCallback((slotIndex: number, benchmarkId: string) => {
    const benchmark = getBenchmark(benchmarkId);
    if (benchmark) {
      setSlot(slotIndex, {
        id: `bench-${benchmark.id}`,
        name: benchmark.name,
        status: 'empty',
        result: null,
      });
      setSlotResults((prev) => {
        const next = [...prev];
        next[slotIndex] = { name: benchmark.name, result: null, status: 'empty' };
        return next;
      });
    }
  }, [setSlot]);

  const handleRunComparison = useCallback(async () => {
    const activeSlots = slots.filter((s) => s.id);
    if (activeSlots.length === 0) return;

    setIsRunning(true);
    const newResults = [...slotResults];

    // Set all to loading
    for (let i = 0; i < slots.length; i++) {
      if (slots[i].id) {
        newResults[i] = { ...newResults[i], status: 'loading' };
      }
    }
    setSlotResults([...newResults]);

    // Run each slot sequentially (could parallelize, but sequential is simpler for state)
    for (let i = 0; i < slots.length; i++) {
      const slot = slots[i];
      if (!slot.id) continue;

      try {
        let result: BacktestResult;

        if (slot.id.startsWith('bench-')) {
          // Run benchmark
          const benchmark = getBenchmark(slot.id.replace('bench-', ''));
          if (!benchmark) throw new Error('Benchmark not found');
          const benchParams: BacktestParameters = {
            ...params,
            portfolio: { id: '', name: '', holdings: [], tags: [] },
          };
          result = await runBenchmarkBacktest(benchParams, benchmark);
        } else {
          // Run portfolio backtest
          const portfolio = saved.find((p) => p.id === slot.id);
          if (!portfolio) throw new Error('Portfolio not found');

          const { runBacktest } = await import('@/engine/backtest');
          const { resolvePortfolioReturns, resolveCpiSeries, resolveFxRates } = await import('@/data/proxy-registry');

          const backtestParams: BacktestParameters = {
            ...params,
            portfolio,
          };

          const assetReturns = await resolvePortfolioReturns(backtestParams.portfolio.holdings);
          const cpiSeries = await resolveCpiSeries(backtestParams.inflationRegion);

          const fxRates = new Map<string, (number | null)[]>();
          for (const holding of backtestParams.portfolio.holdings) {
            if (holding.asset.currency !== backtestParams.displayCurrency) {
              const rates = await resolveFxRates(holding.asset.currency, backtestParams.displayCurrency);
              fxRates.set(`${holding.asset.currency}${backtestParams.displayCurrency}`, rates);
            }
          }

          result = runBacktest(backtestParams, assetReturns, fxRates, cpiSeries);
        }

        newResults[i] = { name: newResults[i].name, result, status: 'ready' };
      } catch (err) {
        newResults[i] = { ...newResults[i], status: 'error' };
      }
      setSlotResults([...newResults]);
    }

    setIsRunning(false);
  }, [slots, slotResults, params, saved]);

  const filledSlots = slots.filter((s) => s.id);
  const hasResults = slotResults.some((s) => s.status === 'ready' && s.result);

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('compare.title')}</h1>
        <div className="flex gap-2">
          {filledSlots.length > 0 && (
            <button
              onClick={() => {
                clearAll();
                setSlotResults(slots.map((_, i) => ({
                  name: t('compare.portfolioN', { n: i + 1 }),
                  result: null,
                  status: 'empty' as const,
                })));
              }}
              className="px-3 py-1.5 text-sm text-gray-600 hover:text-gray-800
                border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
            >
              {t('compare.clearAll')}
            </button>
          )}
          <button
            onClick={handleRunComparison}
            disabled={filledSlots.length === 0 || isRunning}
            className="px-4 py-1.5 text-sm font-medium text-white bg-blue-600
              rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
              transition-colors"
          >
            {isRunning ? t('compare.running') : t('compare.run')}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-6">
        {slots.map((slot, i) => (
          <div key={i} className="bg-white rounded-xl border border-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {t('compare.selectPortfolio', { index: i + 1 })}
            </h3>

            <select
              value={slot.id || ''}
              onChange={(e) => {
                const val = e.target.value;
                if (val.startsWith('benchmark:')) {
                  handleSelectBenchmark(i, val.replace('benchmark:', ''));
                } else {
                  handleSelectPortfolio(i, val);
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
                focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="">{t('compare.selectPlaceholder')}</option>
              <optgroup label={t('compare.savedPortfolios')}>
                {saved.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || t('compare.untitled')} ({p.holdings.length})
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('compare.benchmarks')}>
                {[{ id: 'sp500', name: 'S&P 500' }, { id: '6040', name: '60/40' }, { id: 'us_bonds', name: 'US Bonds' }, { id: 'gold', name: 'Gold' }].map((b) => (
                  <option key={`bench-${b.id}`} value={`benchmark:${b.id}`}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
            </select>

            {slotResults[i].status === 'loading' && (
              <div className="mt-3 animate-pulse h-8 bg-gray-100 rounded" />
            )}
            {slotResults[i].status === 'error' && (
              <div className="mt-3 text-sm text-red-500">{t('compare.runFailed')}</div>
            )}
            {slot.id && slotResults[i].status !== 'loading' && (
              <div className="mt-3 flex justify-between items-center">
                <span className="text-sm text-gray-600">{slot.name}</span>
                <button
                  onClick={() => {
                    removeSlot(i);
                    const next = [...slotResults];
                    next[i] = { name: t('compare.portfolioN', { n: i + 1 }), result: null, status: 'empty' };
                    setSlotResults(next);
                  }}
                  className="text-xs text-red-500 hover:text-red-700"
                >
                  {t('compare.remove')}
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Overlay Chart */}
      <div className="mb-6">
        <MultiEquityChart
          series={slotResults
            .filter((s) => s.status === 'ready' && s.result)
            .map((s) => ({
              name: s.name,
              data: s.result!.timeSeries,
            }))}
        />
      </div>

      {/* Comparison Table */}
      {hasResults && (
        <div className="bg-white rounded-xl border border-gray-200 overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left px-4 py-3 font-semibold text-gray-700">{t('compare.metric')}</th>
                {slotResults.map((s, i) =>
                  s.status === 'ready' && s.result ? (
                    <th key={i} className="text-right px-4 py-3 font-semibold text-gray-700">
                      {s.name}
                    </th>
                  ) : null,
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100">
              {[
                { label: t('metrics.cagr'), get: (r: BacktestResult) => formatPct(r.metrics.cagr, locale), color: (r: BacktestResult) => r.metrics.cagr >= 0 ? 'text-green-600' : 'text-red-500' },
                { label: t('metrics.maxDrawdown'), get: (r: BacktestResult) => formatPct(r.metrics.maxDrawdown, locale), color: () => 'text-red-500' },
                { label: t('metrics.sharpeRatio'), get: (r: BacktestResult) => formatNumber(r.metrics.sharpeRatio, locale, 2), color: () => 'text-gray-900' },
                { label: t('metrics.stdDev'), get: (r: BacktestResult) => formatPct(r.metrics.stdDevAnnualized, locale), color: () => 'text-gray-900' },
                { label: t('metrics.finalCapital'), get: (r: BacktestResult) => formatCurrency(r.metrics.finalCapital, 'USD', locale), color: () => 'text-gray-900' },
                { label: t('metrics.totalReturn'), get: (r: BacktestResult) => formatPct(r.metrics.totalReturn, locale), color: (r: BacktestResult) => r.metrics.totalReturn >= 0 ? 'text-green-600' : 'text-red-500' },
                { label: t('metrics.bestYear'), get: (r: BacktestResult) => `${formatPct(r.metrics.bestYear.return, locale)} (${r.metrics.bestYear.year})`, color: () => 'text-green-600' },
                { label: t('metrics.worstYear'), get: (r: BacktestResult) => `${formatPct(r.metrics.worstYear.return, locale)} (${r.metrics.worstYear.year})`, color: () => 'text-red-500' },
              ].map((row) => (
                <tr key={row.label} className="hover:bg-gray-50">
                  <td className="px-4 py-2.5 text-gray-600">{row.label}</td>
                  {slotResults.map((s, i) =>
                    s.status === 'ready' && s.result ? (
                      <td key={i} className={`text-right px-4 py-2.5 font-medium ${row.color(s.result)}`}>
                        {row.get(s.result)}
                      </td>
                    ) : null,
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
