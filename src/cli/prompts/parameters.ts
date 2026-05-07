import * as prompts from '@clack/prompts';
import type { RebalancingStrategy, DisplayCurrency } from '../../engine/types';

export interface BacktestParams {
  startDate: string;
  endDate: string;
  initialCapital: number;
  rebalancing: RebalancingStrategy;
  displayCurrency: DisplayCurrency;
  inflationRegion: string;
  inflationAdjusted: boolean;
}

export async function collectParameters(): Promise<BacktestParams | null> {
  const now = new Date();
  const defaultEnd = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
  const defaultStart = `${now.getFullYear() - 10}-${String(now.getMonth() + 1).padStart(2, '0')}`;

  const startDate = await prompts.text({
    message: 'Start date (YYYY-MM)',
    placeholder: defaultStart,
    defaultValue: defaultStart,
    validate: (v) => (v && /^\d{4}-\d{2}$/.test(v) ? undefined : 'Format: YYYY-MM'),
  });
  if (prompts.isCancel(startDate)) return null;

  const endDate = await prompts.text({
    message: 'End date (YYYY-MM)',
    placeholder: defaultEnd,
    defaultValue: defaultEnd,
    validate: (v) => (v && /^\d{4}-\d{2}$/.test(v) ? undefined : 'Format: YYYY-MM'),
  });
  if (prompts.isCancel(endDate)) return null;

  const capitalStr = await prompts.text({
    message: 'Initial capital ($)',
    placeholder: '10000',
    defaultValue: '10000',
    validate: (v) => {
      const n = parseFloat(v ?? '');
      return isNaN(n) || n <= 0 ? 'Enter a positive number' : undefined;
    },
  });
  if (prompts.isCancel(capitalStr)) return null;

  const rebalancingKey = await prompts.select({
    message: 'Rebalancing strategy',
    options: [
      { value: 'annual' as const, label: 'Annual (January)' },
      { value: 'quarterly' as const, label: 'Quarterly (Mar, Jun, Sep, Dec)' },
      { value: 'monthly' as const, label: 'Monthly' },
      { value: 'band_5' as const, label: 'Tolerance band (5%)' },
      { value: 'band_10' as const, label: 'Tolerance band (10%)' },
    ],
  });
  if (prompts.isCancel(rebalancingKey)) return null;

  const displayCurrency = await prompts.select({
    message: 'Display currency',
    options: [
      { value: 'USD' as const, label: 'USD' },
      { value: 'CNY' as const, label: 'CNY' },
      { value: 'EUR' as const, label: 'EUR' },
      { value: 'JPY' as const, label: 'JPY' },
      { value: 'GBP' as const, label: 'GBP' },
    ],
  });
  if (prompts.isCancel(displayCurrency)) return null;

  const inflationAdjusted = await prompts.confirm({
    message: 'Adjust for inflation?',
    initialValue: true,
  });
  if (prompts.isCancel(inflationAdjusted)) return null;

  const currencyToRegion: Record<string, string> = {
    USD: 'US',
    CNY: 'CN',
    EUR: 'EU',
    JPY: 'JP',
    GBP: 'UK',
  };

  return {
    startDate,
    endDate,
    initialCapital: parseFloat(capitalStr),
    rebalancing: parseRebalancing(rebalancingKey),
    displayCurrency: displayCurrency as DisplayCurrency,
    inflationRegion: currencyToRegion[displayCurrency] ?? 'US',
    inflationAdjusted,
  };
}

function parseRebalancing(value: string): RebalancingStrategy {
  if (value === 'band_5') return { type: 'tolerance_band', threshold: 0.05 };
  if (value === 'band_10') return { type: 'tolerance_band', threshold: 0.10 };
  return { type: 'calendar', frequency: value as 'monthly' | 'quarterly' | 'annual' };
}
