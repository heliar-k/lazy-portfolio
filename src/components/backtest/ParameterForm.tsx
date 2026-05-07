import { useTranslation } from 'react-i18next';
import type { RebalancingStrategy, DisplayCurrency, Region } from '@/engine/types';

interface ParameterFormProps {
  startDate: string;
  endDate: string;
  initialCapital: number;
  rebalancing: RebalancingStrategy;
  displayCurrency: DisplayCurrency;
  inflationRegion: Region;
  inflationAdjusted: boolean;
  onStartDateChange: (d: string) => void;
  onEndDateChange: (d: string) => void;
  onCapitalChange: (c: number) => void;
  onRebalancingChange: (r: RebalancingStrategy) => void;
  onCurrencyChange: (c: DisplayCurrency) => void;
  onInflationChange: (r: Region) => void;
  onInflationAdjustedChange: (enabled: boolean) => void;
  onRun: () => void;
  canRun: boolean;
  isRunning: boolean;
}

const CURRENCIES: { value: DisplayCurrency; label: string }[] = [
  { value: 'USD', label: 'USD' },
  { value: 'CNY', label: 'CNY' },
  { value: 'EUR', label: 'EUR' },
  { value: 'JPY', label: 'JPY' },
  { value: 'GBP', label: 'GBP' },
];

const REGIONS: { value: Region; label: string }[] = [
  { value: 'US', label: 'US' },
  { value: 'CN', label: 'CN' },
  { value: 'EU', label: 'EU' },
  { value: 'UK', label: 'UK' },
  { value: 'JP', label: 'JP' },
];

export function ParameterForm({
  startDate,
  endDate,
  initialCapital,
  rebalancing,
  displayCurrency,
  inflationRegion,
  inflationAdjusted,
  onStartDateChange,
  onEndDateChange,
  onCapitalChange,
  onRebalancingChange,
  onCurrencyChange,
  onInflationChange,
  onInflationAdjustedChange,
  onRun,
  canRun,
  isRunning,
}: ParameterFormProps) {
  const { t } = useTranslation();

  const rebalanceOptions: { value: string; label: string; strategy: RebalancingStrategy }[] = [
    { value: 'monthly', label: t('rebalance.monthly'), strategy: { type: 'calendar', frequency: 'monthly' } },
    { value: 'quarterly', label: t('rebalance.quarterly'), strategy: { type: 'calendar', frequency: 'quarterly' } },
    { value: 'annual', label: t('rebalance.annual'), strategy: { type: 'calendar', frequency: 'annual' } },
    { value: 'band5', label: t('rebalance.band5'), strategy: { type: 'tolerance_band', threshold: 0.05 } },
    { value: 'band10', label: t('rebalance.band10'), strategy: { type: 'tolerance_band', threshold: 0.10 } },
  ];

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('backtest.startDate')}
          </label>
          <input
            type="month"
            value={startDate}
            onChange={(e) => onStartDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('backtest.endDate')}
          </label>
          <input
            type="month"
            value={endDate}
            onChange={(e) => onEndDateChange(e.target.value)}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('backtest.initialCapital')}
          </label>
          <input
            type="number"
            min={1}
            value={initialCapital}
            onChange={(e) => onCapitalChange(Math.max(1, parseInt(e.target.value) || 0))}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('backtest.rebalancing')}
          </label>
          <select
            value={rebalanceOptions.find(
              (o) =>
                o.strategy.type === rebalancing.type &&
                (rebalancing.type === 'calendar'
                  ? o.strategy.type === 'calendar' && (o.strategy as { frequency: string }).frequency === (rebalancing as { frequency: string }).frequency
                  : o.strategy.type === 'tolerance_band' && (o.strategy as { threshold: number }).threshold === (rebalancing as { threshold: number }).threshold)
            )?.value ?? rebalanceOptions[2].value}
            onChange={(e) => {
              const opt = rebalanceOptions.find((o) => o.value === e.target.value);
              if (opt) onRebalancingChange(opt.strategy);
            }}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {rebalanceOptions.map((o) => (
              <option key={o.value} value={o.value}>{o.label}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="flex items-end gap-4 mt-4 flex-wrap">
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('backtest.displayCurrency')}
          </label>
          <select
            value={displayCurrency}
            onChange={(e) => onCurrencyChange(e.target.value as DisplayCurrency)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {CURRENCIES.map((c) => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1">
            {t('backtest.inflation')}
          </label>
          <select
            value={inflationRegion}
            onChange={(e) => onInflationChange(e.target.value as Region)}
            className="px-3 py-2 border border-gray-300 rounded-lg text-sm
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            {REGIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label} CPI</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-500 mb-1 invisible select-none" aria-hidden="true">&nbsp;</label>
          <div className="flex items-center gap-2 py-2">
            <input
              type="checkbox"
              id="inflation-adjusted"
              checked={inflationAdjusted}
              onChange={(e) => onInflationAdjustedChange(e.target.checked)}
              className="h-4 w-4 text-blue-600 rounded border-gray-300 focus:ring-blue-500"
            />
            <label htmlFor="inflation-adjusted" className="text-xs text-gray-600">
              {t('backtest.inflationAdjust')}
            </label>
          </div>
        </div>
        <button
          onClick={onRun}
          disabled={!canRun || isRunning}
          className="ml-auto px-6 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg
            hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed
            transition-colors flex items-center gap-2"
        >
          {isRunning && (
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
              <path className="opacity-75" fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
            </svg>
          )}
          {t('backtest.run')}
        </button>
      </div>
    </div>
  );
}
