// ---- Asset / ETF ----

export type AssetClass =
  // Equity — US
  | 'us_total_market'
  | 'us_large_cap'
  | 'us_small_cap'
  | 'us_mid_cap'
  | 'us_value'
  | 'us_growth'
  | 'us_reit'
  // Equity — Developed ex-US
  | 'intl_developed'
  | 'europe_equity'
  | 'japan_equity'
  | 'uk_equity'
  // Equity — Emerging
  | 'intl_emerging'
  | 'china_a_shares'
  // Fixed Income — US
  | 'us_agg_bond'
  | 'us_treasury_short'
  | 'us_treasury_intermediate'
  | 'us_treasury_long'
  | 'us_tips'
  | 'us_corporate_bond'
  | 'us_high_yield'
  | 'us_cash'
  // Fixed Income — Non-US
  | 'global_agg_bond'
  | 'eu_govt_bond'
  | 'cn_govt_bond'
  | 'jp_govt_bond'
  // Commodities / Alternatives
  | 'gold'
  | 'commodities';

export type Region = 'US' | 'CN' | 'JP' | 'EU' | 'UK' | 'CA' | 'AU' | 'BR' | 'IN' | 'GLOBAL';

export type DisplayCurrency = 'USD' | 'CNY' | 'EUR' | 'JPY' | 'GBP';

export interface AssetIdentifier {
  symbol: string;
  name: string;
  nameZh?: string;
  assetClass: AssetClass;
  region: Region;
  currency: string;
  provider: string;
  expenseRatio: number;
  inceptionDate: string;
  proxySymbol?: string;
}

export interface DataSourceConfig {
  type: 'bundled_proxy' | 'bundled_csv' | 'yahoo_finance';
  proxySymbol: string;
  proxyCurrency: string;
  fromDate: string;
  toDate: string;
}

// ---- Portfolio ----

export interface PortfolioHolding {
  asset: AssetIdentifier;
  targetWeight: number; // 0.0 to 1.0
}

export interface PortfolioDefinition {
  id: string;
  name: string;
  description?: string;
  holdings: PortfolioHolding[];
  tags: string[];
  source?: string;
  sourceUrl?: string;
}

// ---- Price / Return Data ----

export interface MonthlyPricePoint {
  date: string; // "2020-01-31"
  price: number;
}

export interface MonthlyReturnPoint {
  date: string;
  totalReturn: number; // e.g., 0.01 = 1%
}

// ---- Rebalancing ----

export type RebalancingFrequency = 'monthly' | 'quarterly' | 'annual';

export type RebalancingStrategy =
  | { type: 'calendar'; frequency: RebalancingFrequency }
  | { type: 'tolerance_band'; threshold: number };

// ---- Cashflows ----

export interface CashflowEvent {
  date: string;
  amount: number; // positive = deposit, negative = withdrawal
  type: 'deposit' | 'withdrawal';
  recurring?: {
    frequency: 'monthly' | 'quarterly' | 'annual';
    endDate?: string;
  };
}

// ---- Backtest ----

export interface BacktestParameters {
  portfolio: PortfolioDefinition;
  startDate: string;
  endDate: string;
  initialCapital: number;
  displayCurrency: DisplayCurrency;
  inflationRegion: Region;
  inflationAdjusted: boolean;
  rebalancing: RebalancingStrategy;
  cashflows: CashflowEvent[];
}

export interface MonthlyTimeSeriesPoint {
  date: string;
  portfolioValue: number;
  portfolioValueReal: number; // inflation-adjusted
  monthlyReturn: number;
  monthlyReturnReal: number;
  drawdown: number; // 0.0 to -1.0
  cumulativeReturn: number;
  cashflowImpact: number;
}

export interface BacktestMetrics {
  // Core
  finalCapital: number;
  totalReturn: number;
  cagr: number;
  stdDevAnnualized: number;
  bestYear: { year: number; return: number };
  worstYear: { year: number; return: number };

  // Risk
  maxDrawdown: number;
  maxDrawdownStart: string;
  maxDrawdownEnd: string;
  maxDrawdownRecovery: string | null;
  maxDrawdownDurationMonths: number;
  maxDrawdownPeakToTroughMonths: number;

  // Risk-adjusted
  sharpeRatio: number;
  sortinoRatio: number;

  // Distribution
  positiveMonthsPct: number;
  negativeMonthsPct: number;
  skewness: number;
  kurtosis: number;

  // Rolling returns
  rolling3YrBest: number;
  rolling3YrWorst: number;
  rolling5YrBest: number;
  rolling5YrWorst: number;
  rolling10YrBest: number;
  rolling10YrWorst: number;

  // Cashflow
  totalContributions: number;
  totalWithdrawals: number;
}

export interface BacktestResult {
  parameters: BacktestParameters;
  metrics: BacktestMetrics;
  timeSeries: MonthlyTimeSeriesPoint[];
  annualReturns: { year: number; return: number }[];
  monthlyReturnsDistribution: { bucket: string; count: number }[];
}

// ---- Benchmark ----

export interface BenchmarkDefinition {
  id: string;
  name: string;
  holdings: {
    proxySymbol: string;
    weight: number;
  }[];
}

// ---- Data Version ----

export interface DataVersion {
  version: number;
  lastUpdated: string;
}

// ---- Validation ----

export interface ValidationError {
  field: string;
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}
