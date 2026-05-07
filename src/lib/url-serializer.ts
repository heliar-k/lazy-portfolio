import type {
  PortfolioDefinition,
  BacktestParameters,
  PortfolioHolding,
  RebalancingStrategy,
  DisplayCurrency,
  Region,
  CashflowEvent,
} from '../engine/types';

/**
 * Serialize a portfolio to URL query params.
 * Format: VTI:0.6,BND:0.4
 */
export function serializePortfolioToParams(
  p: PortfolioDefinition,
): string {
  return p.holdings
    .map((h) => `${encodeURIComponent(h.asset.symbol)}:${h.targetWeight.toFixed(4)}`)
    .join(',');
}

/**
 * Deserialize a portfolio from URL query params.
 * Expects format: VTI:0.6,BND:0.4
 */
export function deserializePortfolioFromParams(
  params: string,
  getAssetBySymbol: (symbol: string) => PortfolioHolding['asset'] | null,
): PortfolioDefinition | null {
  if (!params || params.length === 0) return null;

  const pairs = params.split(',');
  const holdings: PortfolioHolding[] = [];

  for (const pair of pairs) {
    const [encodedSymbol, weightStr] = pair.split(':');
    const symbol = decodeURIComponent(encodedSymbol);
    const weight = parseFloat(weightStr);

    if (!symbol || isNaN(weight) || weight <= 0) continue;

    const asset = getAssetBySymbol(symbol);
    if (!asset) {
      console.warn(`ETF "${symbol}" not recognized, skipping`);
      continue;
    }

    holdings.push({
      asset,
      targetWeight: weight,
    });
  }

  if (holdings.length === 0) return null;

  return {
    id: `url-${Date.now()}`,
    name: 'Shared Portfolio',
    holdings,
    tags: ['shared'],
  };
}

/**
 * Serialize backtest parameters to URL query string (without the leading '?').
 */
export function serializeBacktestParams(
  params: BacktestParameters,
): URLSearchParams {
  const sp = new URLSearchParams();

  sp.set('p', serializePortfolioToParams(params.portfolio));
  sp.set('start', params.startDate);
  sp.set('end', params.endDate);
  sp.set('capital', String(params.initialCapital));
  sp.set('currency', params.displayCurrency);
  sp.set('inflation', params.inflationRegion);
  sp.set('rebalance', serializeRebalancing(params.rebalancing));

  if (params.cashflows.length > 0) {
    sp.set('cashflows', serializeCashflows(params.cashflows));
  }

  sp.set('v', '1'); // version tag

  return sp;
}

/**
 * Deserialize backtest parameters from URL search params.
 * Falls back to defaults for missing values.
 */
export function deserializeBacktestParams(
  sp: URLSearchParams,
  getAssetBySymbol: (symbol: string) => PortfolioHolding['asset'] | null,
): Partial<BacktestParameters> {
  const result: Partial<BacktestParameters> & {
    portfolio?: PortfolioDefinition | null;
  } = {};

  const pParam = sp.get('p');
  if (pParam) {
    result.portfolio = deserializePortfolioFromParams(pParam, getAssetBySymbol) ?? undefined;
  }

  const start = sp.get('start');
  if (start) result.startDate = start;

  const end = sp.get('end');
  if (end) result.endDate = end;

  const capital = sp.get('capital');
  if (capital) result.initialCapital = parseFloat(capital);

  const currency = sp.get('currency');
  if (currency) result.displayCurrency = currency as DisplayCurrency;

  const inflation = sp.get('inflation');
  if (inflation) result.inflationRegion = inflation as Region;

  const rebalance = sp.get('rebalance');
  if (rebalance) result.rebalancing = deserializeRebalancing(rebalance);

  const cashflows = sp.get('cashflows');
  if (cashflows) result.cashflows = deserializeCashflows(cashflows);

  return result;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function serializeRebalancing(r: RebalancingStrategy): string {
  if (r.type === 'calendar') {
    return `cal:${r.frequency}`;
  }
  return `band:${r.threshold}`;
}

function deserializeRebalancing(s: string): RebalancingStrategy {
  const [type, value] = s.split(':');
  if (type === 'cal') {
    return {
      type: 'calendar',
      frequency: value as RebalancingStrategy extends { type: 'calendar' }
        ? RebalancingStrategy['frequency']
        : never,
    };
  }
  if (type === 'band') {
    return {
      type: 'tolerance_band',
      threshold: parseFloat(value) || 0.05,
    };
  }
  return { type: 'calendar', frequency: 'annual' };
}

function serializeCashflows(cashflows: CashflowEvent[]): string {
  return cashflows
    .map((c) => {
      let s = `${c.date}:${c.amount}:${c.type}`;
      if (c.recurring) {
        s += `:${c.recurring.frequency}`;
        if (c.recurring.endDate) s += `:${c.recurring.endDate}`;
      }
      return s;
    })
    .join(';');
}

function deserializeCashflows(s: string): CashflowEvent[] {
  return s.split(';').map((part) => {
    const [date, amountStr, type, freq, endDate] = part.split(':');
    const event: CashflowEvent = {
      date,
      amount: parseFloat(amountStr),
      type: type as 'deposit' | 'withdrawal',
    };
    if (freq) {
      event.recurring = {
        frequency: freq as 'monthly' | 'quarterly' | 'annual',
        endDate,
      };
    }
    return event;
  });
}
