import { useState, useMemo } from 'react';
import { Box, Text, useInput, useApp } from 'ink';
import SelectInput from 'ink-select-input';
import TextInput from 'ink-text-input';
import Spinner from 'ink-spinner';
import * as asciichart from 'asciichart';
import { getTemplateMetadata, getPortfolioTemplates } from '../portfolios/registry.js';
import { loadEtfMap } from './data-loader.js';
import { resolvePortfolioData } from './data-resolver.js';
import { runBacktest } from '../engine/backtest.js';
import { runMonteCarlo, getPercentile } from '../engine/monte-carlo.js';
import { computeSWR } from '../engine/withdrawal.js';
import type {
  PortfolioDefinition,
  PortfolioHolding,
  BacktestResult,
  BacktestParameters,
  RebalancingStrategy,
  DisplayCurrency,
  SWRResult,
} from '../engine/types.js';
import type { EtfMapEntry } from './data-loader.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type AppMode = 'backtest' | 'compare' | 'swr';

type View =
  | 'mode'
  | 'add_type'
  | 'category'
  | 'portfolio'
  | 'etf_class'
  | 'etf_select'
  | 'custom_build'
  | 'custom_weight'
  | 'params'
  | 'running'
  | 'results'
  | 'swr_params'
  | 'swr_running'
  | 'swr_results'
  | 'compare_select'
  | 'compare_running'
  | 'compare_results';

type ResultTab = 'metrics' | 'chart' | 'annual' | 'holdings' | 'monte';
type SWRTab = 'summary' | 'sweep' | 'periods';
type CompareTab = 'table' | 'chart';

const RESULT_TABS: { key: ResultTab; label: string }[] = [
  { key: 'metrics', label: 'Metrics' },
  { key: 'chart', label: 'Chart' },
  { key: 'annual', label: 'Annual' },
  { key: 'holdings', label: 'Holdings' },
  { key: 'monte', label: 'Monte Carlo' },
];

const SWR_TABS: { key: SWRTab; label: string }[] = [
  { key: 'summary', label: 'Summary' },
  { key: 'sweep', label: 'Rate Sweep' },
  { key: 'periods', label: 'Periods' },
];

const COMPARE_TABS: { key: CompareTab; label: string }[] = [
  { key: 'table', label: 'Comparison' },
  { key: 'chart', label: 'Charts' },
];

const REBALANCING_OPTIONS = [
  { label: 'Annual (January)', value: 'annual' },
  { label: 'Quarterly', value: 'quarterly' },
  { label: 'Monthly', value: 'monthly' },
  { label: 'Tolerance 5%', value: 'band_5' },
  { label: 'Tolerance 10%', value: 'band_10' },
];

const CURRENCY_OPTIONS: { label: string; value: DisplayCurrency }[] = [
  { label: 'USD', value: 'USD' },
  { label: 'CNY', value: 'CNY' },
  { label: 'EUR', value: 'EUR' },
  { label: 'JPY', value: 'JPY' },
  { label: 'GBP', value: 'GBP' },
];

function parseRebalancing(v: string): RebalancingStrategy {
  if (v === 'band_5') return { type: 'tolerance_band', threshold: 0.05 };
  if (v === 'band_10') return { type: 'tolerance_band', threshold: 0.10 };
  return { type: 'calendar', frequency: v as 'monthly' | 'quarterly' | 'annual' };
}

const CURRENCY_REGION: Record<string, string> = {
  USD: 'US', CNY: 'CN', EUR: 'EU', JPY: 'JP', GBP: 'UK',
};

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { exit } = useApp();

  const [mode, setMode] = useState<AppMode>('backtest');
  const [view, setView] = useState<View>('mode');
  const [category, setCategory] = useState('');
  const [portfolio, setPortfolio] = useState<PortfolioDefinition | null>(null);
  const [result, setResult] = useState<BacktestResult | null>(null);
  const [tab, setTab] = useState<ResultTab>('metrics');
  const [error, setError] = useState('');

  // SWR state
  const [swrResult, setSwrResult] = useState<SWRResult | null>(null);
  const [swrTab, setSwrTab] = useState<SWRTab>('summary');
  const [retirementYears, setRetirementYears] = useState('30');

  // Compare state
  const [comparePortfolios, setComparePortfolios] = useState<PortfolioDefinition[]>([]);
  const [compareResults, setCompareResults] = useState<{ name: string; result: BacktestResult }[]>([]);
  const [compareTab, setCompareTab] = useState<CompareTab>('table');
  const [_compareStep, setCompareStep] = useState(0);

  // Custom portfolio state
  const [customHoldings, setCustomHoldings] = useState<PortfolioHolding[]>([]);
  const [selectedEtfClass, setSelectedEtfClass] = useState('');
  const [pendingEtf, setPendingEtf] = useState<EtfMapEntry | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [isCustomMode, setIsCustomMode] = useState(false);

  // Monte Carlo state
  const [mcYears, setMcYears] = useState(10);

  // Params
  const now = new Date();
  const [startDate, setStartDate] = useState(`${now.getFullYear() - 10}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [endDate, setEndDate] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`);
  const [capital, setCapital] = useState('10000');
  const [rebalancing, setRebalancing] = useState('annual');
  const [currency, setCurrency] = useState<DisplayCurrency>('USD');
  const [inflation, setInflation] = useState(true);
  const [paramStep, setParamStep] = useState(0);

  // Data
  const etfMap = useMemo(() => loadEtfMap(), []);
  const etfsWithProxy = useMemo(
    () => etfMap.filter((e) => e.proxySymbol),
    [etfMap],
  );
  const etfAssetClasses = useMemo(
    () => [...new Set(etfsWithProxy.map((e) => e.assetClass))],
    [etfsWithProxy],
  );
  const metadata = useMemo(
    () => getTemplateMetadata().filter((t) => t.holdingCount > 0),
    [],
  );
  const categories = useMemo(
    () => [...new Set(metadata.map((t) => t.category))],
    [metadata],
  );

  const resolvePortfolio = (id: string): PortfolioDefinition | undefined => {
    const etfBySymbol = new Map<string, EtfMapEntry>(etfMap.map((e) => [e.symbol, e]));
    const all = getPortfolioTemplates((symbol) => {
      const entry = etfBySymbol.get(symbol);
      if (!entry) return null;
      return {
        symbol: entry.symbol, name: entry.name, nameZh: entry.nameZh,
        assetClass: entry.assetClass, region: entry.region,
        currency: entry.currency, provider: entry.provider,
        expenseRatio: entry.expenseRatio, inceptionDate: entry.inceptionDate,
      };
    });
    return all.find((p) => p.id === id);
  };

  const etfToHolding = (entry: EtfMapEntry, weight: number): PortfolioHolding => ({
    asset: {
      symbol: entry.symbol, name: entry.name, nameZh: entry.nameZh,
      assetClass: entry.assetClass as any, region: entry.region as any,
      currency: entry.currency, provider: entry.provider,
      expenseRatio: entry.expenseRatio, inceptionDate: entry.inceptionDate,
    },
    targetWeight: weight,
  });

  const etfToPortfolio = (entry: EtfMapEntry): PortfolioDefinition => ({
    id: `single_${entry.symbol.toLowerCase()}`,
    name: `${entry.symbol} (${entry.name})`,
    holdings: [etfToHolding(entry, 1.0)],
    tags: ['single-etf'],
  });

  const customToPortfolio = (holdings: PortfolioHolding[]): PortfolioDefinition => ({
    id: `custom_${holdings.map((h) => h.asset.symbol).join('_').toLowerCase()}`,
    name: holdings.map((h) => `${h.asset.symbol} ${(h.targetWeight * 100).toFixed(0)}%`).join(' / '),
    holdings,
    tags: ['custom'],
  });

  const handlePortfolioSelected = (p: PortfolioDefinition) => {
    if (mode === 'compare') {
      setComparePortfolios((prev) => [...prev, p]);
      setCompareStep((s) => s + 1);
      setView('compare_select');
    } else {
      setPortfolio(p);
      setParamStep(0);
      setView('params');
    }
  };

  const buildParams = (): BacktestParameters | null => {
    if (!portfolio) return null;
    const region = CURRENCY_REGION[currency] ?? 'US';
    return {
      portfolio,
      startDate,
      endDate,
      initialCapital: parseFloat(capital) || 10000,
      displayCurrency: currency,
      inflationRegion: region as BacktestParameters['inflationRegion'],
      inflationAdjusted: inflation,
      rebalancing: parseRebalancing(rebalancing),
      cashflows: [],
    };
  };

  const doBacktest = () => {
    const params = buildParams();
    if (!params) return;
    setView('running');
    setError('');

    setTimeout(() => {
      try {
        const region = CURRENCY_REGION[currency] ?? 'US';
        const { assetReturns, fxRates, cpiSeries } = resolvePortfolioData(
          params.portfolio.holdings, currency, region, inflation,
        );
        const r = runBacktest(params, assetReturns, fxRates, cpiSeries);
        setResult(r);
        setTab('metrics');
        setView('results');
      } catch (e: any) {
        setError(e.message ?? 'Backtest failed');
        setView('params');
      }
    }, 10);
  };

  const doSWR = () => {
    if (!portfolio) return;
    setView('swr_running');
    setError('');

    setTimeout(() => {
      try {
        const region = CURRENCY_REGION[currency] ?? 'US';
        const { assetReturns, cpiSeries } = resolvePortfolioData(
          portfolio.holdings, currency, region, true,
        );
        const years = parseInt(retirementYears) || 30;
        const r = computeSWR(portfolio.holdings, assetReturns, cpiSeries, {
          retirementYears: years,
          initialCapital: parseFloat(capital) || 10000,
          rebalancing: parseRebalancing(rebalancing),
          displayCurrency: currency,
          inflationRegion: region as BacktestParameters['inflationRegion'],
        });
        setSwrResult(r);
        setSwrTab('summary');
        setView('swr_results');
      } catch (e: any) {
        setError(e.message ?? 'SWR analysis failed');
        setView('params');
      }
    }, 10);
  };

  const doCompare = () => {
    if (comparePortfolios.length < 2) return;
    setView('compare_running');
    setError('');

    setTimeout(() => {
      try {
        const region = CURRENCY_REGION[currency] ?? 'US';
        const results: { name: string; result: BacktestResult }[] = [];

        for (const p of comparePortfolios) {
          const { assetReturns, fxRates, cpiSeries } = resolvePortfolioData(
            p.holdings, currency, region, inflation,
          );
          const params: BacktestParameters = {
            portfolio: p,
            startDate,
            endDate,
            initialCapital: parseFloat(capital) || 10000,
            displayCurrency: currency,
            inflationRegion: region as BacktestParameters['inflationRegion'],
            inflationAdjusted: inflation,
            rebalancing: parseRebalancing(rebalancing),
            cashflows: [],
          };
          results.push({ name: p.name, result: runBacktest(params, assetReturns, fxRates, cpiSeries) });
        }

        setCompareResults(results);
        setCompareTab('table');
        setView('compare_results');
      } catch (e: any) {
        setError(e.message ?? 'Comparison failed');
        setView('mode');
      }
    }, 10);
  };

  // ─── Global keyboard ─────────────────────────────────────────────────────

  const isTextEditing = [1, 2, 3].includes(paramStep) && view === 'params';
  const isSWRTextEditing = view === 'swr_params';
  const isWeightEditing = view === 'custom_weight';

  useInput(
    (input, key) => {
      if (input === 'q' && !isTextEditing && !isSWRTextEditing) {
        exit();
        return;
      }

      // Tab switching in results views
      if (view === 'results') {
        if (key.tab || input === 'l' || key.rightArrow) {
          const idx = RESULT_TABS.findIndex((t) => t.key === tab);
          setTab(RESULT_TABS[(idx + 1) % RESULT_TABS.length].key);
        } else if (input === 'h' || key.leftArrow) {
          const idx = RESULT_TABS.findIndex((t) => t.key === tab);
          setTab(RESULT_TABS[(idx - 1 + RESULT_TABS.length) % RESULT_TABS.length].key);
        } else if (input === 'p') {
          setView('add_type');
        } else if (input === 's') {
          setParamStep(0);
          setView('params');
        } else if (input === 'r') {
          doBacktest();
        } else if (input === 'w') {
          setView('swr_params');
        } else if (tab === 'monte') {
          if (input === '+' || input === '=') setMcYears((y) => Math.min(y + 5, 30));
          if (input === '-') setMcYears((y) => Math.max(y - 5, 5));
        }
      }

      if (view === 'swr_results') {
        if (key.tab || input === 'l' || key.rightArrow) {
          const idx = SWR_TABS.findIndex((t) => t.key === swrTab);
          setSwrTab(SWR_TABS[(idx + 1) % SWR_TABS.length].key);
        } else if (input === 'h' || key.leftArrow) {
          const idx = SWR_TABS.findIndex((t) => t.key === swrTab);
          setSwrTab(SWR_TABS[(idx - 1 + SWR_TABS.length) % SWR_TABS.length].key);
        } else if (input === 'p') {
          setView('add_type');
        } else if (key.escape) {
          if (result) setView('results');
          else setView('mode');
        }
      }

      if (view === 'compare_results') {
        if (key.tab || input === 'l' || key.rightArrow) {
          const idx = COMPARE_TABS.findIndex((t) => t.key === compareTab);
          setCompareTab(COMPARE_TABS[(idx + 1) % COMPARE_TABS.length].key);
        } else if (input === 'h' || key.leftArrow) {
          const idx = COMPARE_TABS.findIndex((t) => t.key === compareTab);
          setCompareTab(COMPARE_TABS[(idx - 1 + COMPARE_TABS.length) % COMPARE_TABS.length].key);
        } else if (key.escape) {
          setView('mode');
        }
      }

      // Navigation
      if (view === 'mode' && key.escape) {
        if (result) setView('results');
      }
      if (view === 'add_type' && key.escape) {
        if (mode === 'compare') setView('compare_select');
        else setView('mode');
      }
      if (view === 'category' && key.escape) {
        setView('add_type');
      }
      if (view === 'portfolio' && key.escape) {
        setView('category');
      }
      if (view === 'etf_class' && key.escape) {
        if (isCustomMode) setView('custom_build');
        else setView('add_type');
      }
      if (view === 'etf_select' && key.escape) {
        setView('etf_class');
      }
      if (view === 'custom_build' && key.escape) {
        setView('add_type');
      }
      if (view === 'custom_weight' && key.escape) {
        setView('etf_select');
      }
      if (view === 'params' && key.escape && !isTextEditing) {
        if (result) setView('results');
        else setView('add_type');
      }
      if (view === 'compare_select' && key.escape) {
        setView('mode');
      }
    },
    { isActive: !isTextEditing && !isSWRTextEditing && !isWeightEditing && !['running', 'swr_running', 'compare_running'].includes(view) },
  );

  const height = process.stdout.rows || 24;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <Box flexDirection="column" height={height}>
      {/* Header */}
      <Box borderStyle="single" paddingX={1}>
        <Text bold color="cyan">Lazy Portfolio Backtest</Text>
        {portfolio && (
          <Text>  ·  <Text bold>{portfolio.name}</Text>  ({portfolio.holdings.length} holdings)</Text>
        )}
      </Box>

      {/* Main content */}
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {view === 'mode' && (
          <ModeView onSelect={(m) => {
            setMode(m);
            if (m === 'compare') {
              setComparePortfolios([]);
              setCompareStep(0);
              setView('compare_select');
            } else {
              setView('add_type');
            }
          }} />
        )}

        {view === 'add_type' && (
          <AddTypeView onSelect={(type) => {
            if (type === 'template') {
              setIsCustomMode(false);
              setView('category');
            } else if (type === 'single_etf') {
              setIsCustomMode(false);
              setView('etf_class');
            } else if (type === 'custom') {
              setIsCustomMode(true);
              setCustomHoldings([]);
              setView('custom_build');
            }
          }} />
        )}

        {view === 'category' && (
          <CategoryView categories={categories} metadata={metadata} onSelect={(c) => { setCategory(c); setView('portfolio'); }} />
        )}

        {view === 'portfolio' && (
          <PortfolioView
            metadata={metadata.filter((t) => t.category === category)}
            onSelect={(id) => {
              const p = resolvePortfolio(id);
              if (!p) return;
              handlePortfolioSelected(p);
            }}
          />
        )}

        {view === 'etf_class' && (
          <ETFClassView
            assetClasses={etfAssetClasses}
            etfs={etfsWithProxy}
            onSelect={(cls) => { setSelectedEtfClass(cls); setView('etf_select'); }}
          />
        )}

        {view === 'etf_select' && (
          <ETFSelectView
            etfs={etfsWithProxy.filter((e) => e.assetClass === selectedEtfClass)}
            onSelect={(entry) => {
              if (isCustomMode) {
                setPendingEtf(entry);
                setWeightInput('');
                setView('custom_weight');
              } else {
                handlePortfolioSelected(etfToPortfolio(entry));
              }
            }}
          />
        )}

        {view === 'custom_build' && (
          <CustomBuildView
            holdings={customHoldings}
            onAdd={() => setView('etf_class')}
            onRemove={(i) => setCustomHoldings((prev) => prev.filter((_, idx) => idx !== i))}
            onDone={() => {
              if (customHoldings.length === 0) return;
              handlePortfolioSelected(customToPortfolio(customHoldings));
            }}
          />
        )}

        {view === 'custom_weight' && pendingEtf && (
          <CustomWeightView
            etf={pendingEtf}
            weightInput={weightInput}
            onWeightChange={setWeightInput}
            onSubmit={(w) => {
              const weight = parseFloat(w) / 100;
              if (isNaN(weight) || weight <= 0 || weight > 1) return;
              setCustomHoldings((prev) => [...prev, etfToHolding(pendingEtf!, weight)]);
              setPendingEtf(null);
              setWeightInput('');
              setView('custom_build');
            }}
          />
        )}

        {view === 'params' && (
          <ParamsView
            startDate={startDate} endDate={endDate} capital={capital}
            rebalancing={rebalancing} currency={currency} inflation={inflation}
            paramStep={paramStep}
            onStartDate={setStartDate} onEndDate={setEndDate} onCapital={setCapital}
            onRebalancing={setRebalancing} onCurrency={setCurrency} onInflation={setInflation}
            onNextStep={() => setParamStep((s) => s + 1)}
            onRun={mode === 'swr' ? doSWR : mode === 'compare' ? doCompare : doBacktest}
            runLabel={mode === 'swr' ? 'Run SWR Analysis' : mode === 'compare' ? 'Run Comparison' : 'Run Backtest'}
            error={error}
          />
        )}

        {view === 'swr_params' && (
          <SWRParamsView
            retirementYears={retirementYears}
            onRetirementYears={setRetirementYears}
            onRun={() => doSWR()}
          />
        )}

        {(view === 'running' || view === 'swr_running' || view === 'compare_running') && (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <Text color="green"><Spinner type="dots" /></Text>
              {' '}{view === 'swr_running' ? 'Running SWR analysis (this may take a moment)...' :
                   view === 'compare_running' ? 'Running comparison backtests...' :
                   'Loading data and running backtest...'}
            </Text>
          </Box>
        )}

        {view === 'results' && result && (
          <ResultsView result={result} tab={tab} currency={currency} height={height - 5} mcYears={mcYears} />
        )}

        {view === 'swr_results' && swrResult && (
          <SWRResultsView swrResult={swrResult} swrTab={swrTab} currency={currency} />
        )}

        {view === 'compare_select' && (
          <CompareSelectView
            selected={comparePortfolios}
            onAddMore={() => setView('add_type')}
            onRun={() => {
              setParamStep(0);
              setView('params');
            }}
          />
        )}

        {view === 'compare_results' && (
          <CompareResultsView results={compareResults} tab={compareTab} currency={currency} height={height - 5} />
        )}
      </Box>

      {/* Status bar */}
      <Box borderStyle="single" paddingX={1}>
        <StatusBar view={view} tab={tab} />
      </Box>
    </Box>
  );
}

// ─── Status Bar ──────────────────────────────────────────────────────────────

function StatusBar({ view, tab }: { view: View; tab: ResultTab }) {
  if (view === 'results') {
    return (
      <Text dimColor>
        ←→: tab  {tab === 'monte' ? '+/-: years  ' : ''}p: portfolio  s: settings  r: re-run  w: SWR  q: quit
      </Text>
    );
  }
  if (view === 'swr_results' || view === 'compare_results') {
    return <Text dimColor>←→: tab   Esc: back   q: quit</Text>;
  }
  if (['category', 'portfolio', 'compare_select', 'add_type', 'etf_class', 'etf_select', 'custom_build'].includes(view)) {
    return <Text dimColor>↑↓: navigate   Enter: select   Esc: back   q: quit</Text>;
  }
  return <Text dimColor>Enter: confirm   Esc: back   q: quit</Text>;
}

// ─── Mode View ───────────────────────────────────────────────────────────────

function ModeView({ onSelect }: { onSelect: (m: AppMode) => void }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Mode</Text>
      <Box marginTop={1}>
        <SelectInput
          items={[
            { label: 'Backtest — run single portfolio backtest', value: 'backtest' as AppMode },
            { label: 'Compare — compare multiple portfolios', value: 'compare' as AppMode },
            { label: 'SWR     — safe withdrawal rate analysis', value: 'swr' as AppMode },
          ]}
          onSelect={(item) => onSelect(item.value)}
        />
      </Box>
    </Box>
  );
}

// ─── Category View ───────────────────────────────────────────────────────────

function CategoryView({ categories, metadata, onSelect }: {
  categories: string[];
  metadata: { category: string }[];
  onSelect: (c: string) => void;
}) {
  const items = categories.map((c) => ({
    label: `${c} (${metadata.filter((t) => t.category === c).length})`,
    value: c,
  }));
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Category</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
}

// ─── Portfolio View ──────────────────────────────────────────────────────────

function PortfolioView({ metadata, onSelect }: {
  metadata: { id: string; name: string; nameZh: string; holdingCount: number; riskLevel: string }[];
  onSelect: (id: string) => void;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Portfolio</Text>
      <Box marginTop={1}>
        <SelectInput
          items={metadata.map((t) => ({
            label: t.nameZh ? `${t.name} (${t.nameZh})` : t.name,
            value: t.id,
          }))}
          onSelect={(item) => onSelect(item.value)}
          limit={15}
        />
      </Box>
    </Box>
  );
}

// ─── Params View ─────────────────────────────────────────────────────────────

// ─── Add Type View ──────────────────────────────────────────────────────────

function AddTypeView({ onSelect }: { onSelect: (type: 'template' | 'single_etf' | 'custom') => void }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Portfolio Type</Text>
      <Box marginTop={1}>
        <SelectInput
          items={[
            { label: 'Template portfolio (e.g., All Weather, Golden Butterfly)', value: 'template' as const },
            { label: 'Single ETF (e.g., SPY, QQQ, VTI)', value: 'single_etf' as const },
            { label: 'Custom portfolio (pick ETFs & weights)', value: 'custom' as const },
          ]}
          onSelect={(item) => onSelect(item.value)}
        />
      </Box>
    </Box>
  );
}

// ─── ETF Class View ─────────────────────────────────────────────────────────

const ETF_CLASS_LABELS: Record<string, string> = {
  us_large_cap: 'US Large Cap',
  us_small_cap: 'US Small/Mid Cap',
  us_total_market: 'US Total Market',
  intl_developed: 'Intl Developed',
  intl_emerging: 'Intl Emerging',
  us_agg_bond: 'US Aggregate Bond',
  us_treasury_long: 'US Treasury Long',
  us_treasury_intermediate: 'US Treasury Intermediate',
  us_treasury_short: 'US Treasury Short',
  global_agg_bond: 'Global Bond',
  us_tips: 'US TIPS',
  us_reit: 'US REIT',
  us_cash: 'US Cash/Short-term',
  gold: 'Gold',
  commodities: 'Commodities',
};

function ETFClassView({ assetClasses, etfs, onSelect }: {
  assetClasses: string[];
  etfs: EtfMapEntry[];
  onSelect: (cls: string) => void;
}) {
  const items = assetClasses.map((c) => ({
    label: `${ETF_CLASS_LABELS[c] ?? c} (${etfs.filter((e) => e.assetClass === c).length})`,
    value: c,
  }));
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Asset Class</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} limit={15} />
      </Box>
    </Box>
  );
}

// ─── ETF Select View ────────────────────────────────────────────────────────

function ETFSelectView({ etfs, onSelect }: {
  etfs: EtfMapEntry[];
  onSelect: (entry: EtfMapEntry) => void;
}) {
  const items = etfs.map((e) => ({
    label: `${e.symbol.padEnd(6)} ${e.name}`,
    value: e.symbol,
  }));
  const bySymbol = new Map(etfs.map((e) => [e.symbol, e]));
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select ETF</Text>
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            const entry = bySymbol.get(item.value);
            if (entry) onSelect(entry);
          }}
          limit={15}
        />
      </Box>
    </Box>
  );
}

// ─── Custom Build View ──────────────────────────────────────────────────────

function CustomBuildView({ holdings, onAdd, onRemove, onDone }: {
  holdings: PortfolioHolding[];
  onAdd: () => void;
  onRemove: (index: number) => void;
  onDone: () => void;
}) {
  const totalWeight = holdings.reduce((s, h) => s + h.targetWeight, 0);

  const items: { label: string; value: string }[] = [
    { label: '+ Add ETF', value: 'add' },
  ];
  holdings.forEach((h, i) => {
    items.push({ label: `✕ Remove ${h.asset.symbol} (${(h.targetWeight * 100).toFixed(1)}%)`, value: `remove_${i}` });
  });
  if (holdings.length > 0) {
    items.push({ label: `▶ Done — use this portfolio (${(totalWeight * 100).toFixed(1)}% total)`, value: 'done' });
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Build Custom Portfolio</Text>
      {holdings.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {holdings.map((h, i) => (
            <Text key={h.asset.symbol + i}>
              {' '}{h.asset.symbol.padEnd(6)} <Text color="cyan">{(h.targetWeight * 100).toFixed(1).padStart(5)}%</Text> {h.asset.name}
            </Text>
          ))}
          <Text dimColor>  Total: {(totalWeight * 100).toFixed(1)}%{Math.abs(totalWeight - 1) > 0.001 ? ' (weights should sum to 100%)' : ''}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === 'add') onAdd();
            else if (item.value === 'done') onDone();
            else if (item.value.startsWith('remove_')) onRemove(parseInt(item.value.slice(7)));
          }}
        />
      </Box>
    </Box>
  );
}

// ─── Custom Weight View ─────────────────────────────────────────────────────

function CustomWeightView({ etf, weightInput, onWeightChange, onSubmit }: {
  etf: EtfMapEntry;
  weightInput: string;
  onWeightChange: (v: string) => void;
  onSubmit: (v: string) => void;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Set Weight for {etf.symbol}</Text>
      <Text dimColor>{etf.name}</Text>
      <Box marginTop={1}>
        <Text>▸ Weight (%): </Text>
        <TextInput value={weightInput} onChange={onWeightChange} onSubmit={onSubmit} />
      </Box>
      <Text dimColor>  Enter a number between 1-100, press Enter to confirm</Text>
    </Box>
  );
}

// ─── Params View ─────────────────────────────────────────────────────────────

function ParamsView({
  startDate, endDate, capital, rebalancing, currency, inflation,
  paramStep, onStartDate, onEndDate, onCapital, onRebalancing, onCurrency, onInflation,
  onNextStep, onRun, runLabel, error,
}: {
  startDate: string; endDate: string; capital: string;
  rebalancing: string; currency: DisplayCurrency; inflation: boolean;
  paramStep: number;
  onStartDate: (v: string) => void; onEndDate: (v: string) => void; onCapital: (v: string) => void;
  onRebalancing: (v: string) => void; onCurrency: (v: DisplayCurrency) => void; onInflation: (v: boolean) => void;
  onNextStep: () => void; onRun: () => void; runLabel: string; error: string;
}) {
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const [localCapital, setLocalCapital] = useState(capital);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Configure Parameters</Text>
      {error && <Text color="red">Error: {error}</Text>}

      <Box marginTop={1} flexDirection="column" gap={0}>
        <Box>
          <Text>{paramStep === 1 ? '▸' : ' '} Start Date: </Text>
          {paramStep === 1 ? (
            <TextInput value={localStart} onChange={setLocalStart} onSubmit={(v) => { onStartDate(v); onNextStep(); }} />
          ) : (
            <Text color={paramStep > 1 ? 'green' : 'gray'}>{startDate}</Text>
          )}
        </Box>

        {paramStep >= 2 && (
          <Box>
            <Text>{paramStep === 2 ? '▸' : ' '} End Date:   </Text>
            {paramStep === 2 ? (
              <TextInput value={localEnd} onChange={setLocalEnd} onSubmit={(v) => { onEndDate(v); onNextStep(); }} />
            ) : (
              <Text color={paramStep > 2 ? 'green' : 'gray'}>{endDate}</Text>
            )}
          </Box>
        )}

        {paramStep >= 3 && (
          <Box>
            <Text>{paramStep === 3 ? '▸' : ' '} Capital:    $</Text>
            {paramStep === 3 ? (
              <TextInput value={localCapital} onChange={setLocalCapital} onSubmit={(v) => { onCapital(v); onNextStep(); }} />
            ) : (
              <Text color={paramStep > 3 ? 'green' : 'gray'}>{capital}</Text>
            )}
          </Box>
        )}

        {paramStep === 4 && (
          <Box flexDirection="column">
            <Text>▸ Rebalancing:</Text>
            <SelectInput items={REBALANCING_OPTIONS} onSelect={(item) => { onRebalancing(item.value); onNextStep(); }} />
          </Box>
        )}
        {paramStep > 4 && (
          <Box><Text>  Rebalancing: </Text><Text color="green">{REBALANCING_OPTIONS.find((o) => o.value === rebalancing)?.label}</Text></Box>
        )}

        {paramStep === 5 && (
          <Box flexDirection="column">
            <Text>▸ Currency:</Text>
            <SelectInput items={CURRENCY_OPTIONS} onSelect={(item) => { onCurrency(item.value); onNextStep(); }} />
          </Box>
        )}
        {paramStep > 5 && (
          <Box><Text>  Currency:    </Text><Text color="green">{currency}</Text></Box>
        )}

        {paramStep === 6 && (
          <Box flexDirection="column">
            <Text>▸ Inflation Adjusted:</Text>
            <SelectInput
              items={[{ label: 'Yes', value: 'yes' }, { label: 'No', value: 'no' }]}
              onSelect={(item) => { onInflation(item.value === 'yes'); onNextStep(); }}
            />
          </Box>
        )}
        {paramStep > 6 && (
          <Box><Text>  Inflation:   </Text><Text color="green">{inflation ? 'Yes' : 'No'}</Text></Box>
        )}

        {paramStep >= 7 && (
          <Box marginTop={1}>
            <SelectInput items={[{ label: `▶  ${runLabel}`, value: 'run' }]} onSelect={onRun} />
          </Box>
        )}
      </Box>

      {paramStep === 0 && (
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: `Use defaults (${startDate} ~ ${endDate}, $${capital}, ${rebalancing})`, value: 'defaults' },
              { label: 'Customize parameters', value: 'custom' },
            ]}
            onSelect={(item) => item.value === 'defaults' ? onRun() : onNextStep()}
          />
        </Box>
      )}
    </Box>
  );
}

// ─── SWR Params View ─────────────────────────────────────────────────────────

function SWRParamsView({ retirementYears, onRetirementYears, onRun }: {
  retirementYears: string;
  onRetirementYears: (v: string) => void;
  onRun: () => void;
}) {
  const [local, setLocal] = useState(retirementYears);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>SWR Analysis — Retirement Duration</Text>
      <Box marginTop={1}>
        <Text>▸ Retirement years: </Text>
        <TextInput value={local} onChange={setLocal} onSubmit={(v) => { onRetirementYears(v); onRun(); }} />
      </Box>
      <Text dimColor>  (typical: 25-30 years, press Enter to run)</Text>
    </Box>
  );
}

// ─── Results View ────────────────────────────────────────────────────────────

function ResultsView({ result, tab, currency, height, mcYears }: {
  result: BacktestResult; tab: ResultTab; currency: string; height: number; mcYears: number;
}) {
  return (
    <Box flexDirection="column">
      <TabBar tabs={RESULT_TABS} active={tab} />
      {tab === 'metrics' && <MetricsPanel metrics={result.metrics} currency={currency} />}
      {tab === 'chart' && <ChartPanel timeSeries={result.timeSeries} height={height - 8} />}
      {tab === 'annual' && <AnnualPanel annualReturns={result.annualReturns} />}
      {tab === 'holdings' && <HoldingsPanel holdings={result.parameters.portfolio.holdings} />}
      {tab === 'monte' && <MonteCarloPanel result={result} years={mcYears} />}
    </Box>
  );
}

// ─── SWR Results View ────────────────────────────────────────────────────────

function SWRResultsView({ swrResult, swrTab, currency }: {
  swrResult: SWRResult; swrTab: SWRTab; currency: string;
}) {
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);

  return (
    <Box flexDirection="column">
      <TabBar tabs={SWR_TABS} active={swrTab} />

      {swrTab === 'summary' && (
        <Box flexDirection="column">
          <Box gap={1}><Text>{'Safe WR Rate'.padEnd(20)}</Text><Text bold color="green">{fmtPct(swrResult.safeWithdrawalRate)}</Text></Box>
          <Box gap={1}><Text>{'Success Rate (4%)'.padEnd(20)}</Text><Text color={swrResult.successRate >= 0.95 ? 'green' : 'red'}>{fmtPct(swrResult.successRate)}</Text></Box>
          <Box gap={1}><Text>{'Median Final (4%)'.padEnd(20)}</Text><Text>{fmtMoney(swrResult.medianFinalBalance)}</Text></Box>
          <Box gap={1}><Text>{'Worst Case (4%)'.padEnd(20)}</Text><Text color="red">{fmtMoney(swrResult.worstCaseFinalBalance)}</Text></Box>
          <Box gap={1}><Text>{'Retirement Years'.padEnd(20)}</Text><Text>{swrResult.params.retirementYears}</Text></Box>
          <Box gap={1}><Text>{'Periods Tested'.padEnd(20)}</Text><Text>{swrResult.periodResults.length}</Text></Box>
        </Box>
      )}

      {swrTab === 'sweep' && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text bold>{'Rate'.padEnd(8)}</Text>
            <Text bold>{'Success'.padStart(10)}</Text>
            <Text bold>  Bar</Text>
          </Box>
          {(() => {
            const rates = [...new Set(swrResult.sweepResults.map((r) => r.rate))].sort((a, b) => a - b);
            const nPeriods = swrResult.periodResults.length || 1;
            return rates.map((rate) => {
              const successes = swrResult.sweepResults.filter((r) => r.rate === rate && r.success).length;
              const pct = successes / nPeriods;
              const bar = '█'.repeat(Math.round(pct * 30));
              return (
                <Box key={rate} gap={1}>
                  <Text>{fmtPct(rate).padEnd(8)}</Text>
                  <Text color={pct >= 1 ? 'green' : pct >= 0.8 ? 'yellow' : 'red'}>{fmtPct(pct).padStart(10)}</Text>
                  <Text color={pct >= 1 ? 'green' : pct >= 0.8 ? 'yellow' : 'red'}>  {bar}</Text>
                </Box>
              );
            });
          })()}
        </Box>
      )}

      {swrTab === 'periods' && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text bold>{'Start'.padEnd(10)}</Text>
            <Text bold>{'Status'.padEnd(8)}</Text>
            <Text bold>{'Final Balance'.padStart(15)}</Text>
            <Text bold>{'Min Balance'.padStart(13)}</Text>
          </Box>
          {swrResult.periodResults.slice(0, 20).map((p) => (
            <Box key={p.startDate} gap={1}>
              <Text>{p.startDate.padEnd(10)}</Text>
              <Text color={p.success ? 'green' : 'red'}>{(p.success ? 'OK' : 'FAIL').padEnd(8)}</Text>
              <Text>{fmtMoney(p.finalBalance).padStart(15)}</Text>
              <Text color={p.minBalance < 0 ? 'red' : 'white'}>{fmtMoney(p.minBalance).padStart(13)}</Text>
            </Box>
          ))}
          {swrResult.periodResults.length > 20 && (
            <Text dimColor>  ... and {swrResult.periodResults.length - 20} more periods</Text>
          )}
        </Box>
      )}
    </Box>
  );
}

// ─── Compare Select View ─────────────────────────────────────────────────────

function CompareSelectView({ selected, onAddMore, onRun }: {
  selected: PortfolioDefinition[];
  onAddMore: () => void;
  onRun: () => void;
}) {
  const items: { label: string; value: string }[] = [];

  if (selected.length < 4) {
    items.push({ label: `+ Add portfolio (${selected.length}/4 selected)`, value: 'add' });
  }
  if (selected.length >= 2) {
    items.push({ label: '▶ Configure parameters & run', value: 'run' });
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Compare Portfolios</Text>
      {selected.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {selected.map((p, i) => (
            <Text key={p.id + i}> {i + 1}. <Text color="cyan">{p.name}</Text> ({p.holdings.length} holdings)</Text>
          ))}
        </Box>
      )}
      {selected.length < 2 && (
        <Box marginTop={1}><Text dimColor>Select at least 2 portfolios</Text></Box>
      )}
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === 'add') onAddMore();
            else onRun();
          }}
        />
      </Box>
    </Box>
  );
}

// ─── Compare Results View ────────────────────────────────────────────────────

function CompareResultsView({ results, tab, currency, height }: {
  results: { name: string; result: BacktestResult }[];
  tab: CompareTab; currency: string; height: number;
}) {
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  const fmtNum = (v: number) => v.toFixed(2);

  return (
    <Box flexDirection="column">
      <TabBar tabs={COMPARE_TABS} active={tab} />

      {tab === 'table' && (
        <Box flexDirection="column">
          {/* Header */}
          <Box gap={1}>
            <Text bold>{'Metric'.padEnd(16)}</Text>
            {results.map((r) => (
              <Text key={r.name} bold>{truncate(r.name, 14).padStart(14)}</Text>
            ))}
          </Box>

          {/* Rows */}
          {([
            ['CAGR', (r: BacktestResult) => r.metrics.cagr, fmtPct, true],
            ['Total Return', (r: BacktestResult) => r.metrics.totalReturn, fmtPct, true],
            ['Final Capital', (r: BacktestResult) => r.metrics.finalCapital, fmtMoney, true],
            ['Std Dev', (r: BacktestResult) => r.metrics.stdDevAnnualized, fmtPct, false],
            ['Max Drawdown', (r: BacktestResult) => r.metrics.maxDrawdown, fmtPct, false],
            ['Sharpe', (r: BacktestResult) => r.metrics.sharpeRatio, fmtNum, true],
            ['Sortino', (r: BacktestResult) => r.metrics.sortinoRatio, fmtNum, true],
            ['Best Year', (r: BacktestResult) => r.metrics.bestYear.return, fmtPct, true],
            ['Worst Year', (r: BacktestResult) => r.metrics.worstYear.return, fmtPct, true],
            ['Positive Mo.', (r: BacktestResult) => r.metrics.positiveMonthsPct, fmtPct, true],
          ] as [string, (r: BacktestResult) => number, (v: number) => string, boolean][]).map(([label, getter, fmt, higherBetter]) => {
            const values = results.map((r) => getter(r.result));
            const bestIdx = findBestIndex(values, higherBetter);
            return (
              <Box key={label} gap={1}>
                <Text>{label.padEnd(16)}</Text>
                {values.map((v, i) => (
                  <Text key={results[i].name} color={i === bestIdx ? 'green' : 'white'} bold={i === bestIdx}>
                    {fmt(v).padStart(14)}
                  </Text>
                ))}
              </Box>
            );
          })}
        </Box>
      )}

      {tab === 'chart' && (
        <Box flexDirection="column">
          {results.map((r) => {
            const values = r.result.timeSeries.map((p) => p.portfolioValue);
            const sampled = downsample(values, Math.min((process.stdout.columns || 80) - 15, 100));
            const formatVal = (v: number) => (v >= 1000 ? `${(v / 1000).toFixed(0)}K` : v.toFixed(0)).padStart(7);
            const chartH = Math.max(Math.floor((height - 6) / results.length) - 2, 5);
            return (
              <Box key={r.name} flexDirection="column" marginBottom={1}>
                <Text bold color="cyan">{r.name}</Text>
                <Text>{asciichart.plot(sampled, { height: chartH, format: formatVal })}</Text>
              </Box>
            );
          })}
        </Box>
      )}
    </Box>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

function TabBar<T extends string>({ tabs, active }: { tabs: { key: T; label: string }[]; active: T }) {
  return (
    <Box gap={2} marginBottom={1}>
      {tabs.map((t) => (
        <Text key={t.key} bold={active === t.key} color={active === t.key ? 'cyan' : 'gray'}>
          {active === t.key ? `[${t.label}]` : ` ${t.label} `}
        </Text>
      ))}
    </Box>
  );
}

// ─── Metrics Panel ───────────────────────────────────────────────────────────

function MetricsPanel({ metrics, currency }: { metrics: BacktestResult['metrics']; currency: string }) {
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);

  const rows: [string, string, string][] = [
    ['CAGR', fmtPct(metrics.cagr), metrics.cagr >= 0 ? 'green' : 'red'],
    ['Total Return', fmtPct(metrics.totalReturn), metrics.totalReturn >= 0 ? 'green' : 'red'],
    ['Final Capital', fmtMoney(metrics.finalCapital), 'white'],
    ['Std Dev (Ann.)', fmtPct(metrics.stdDevAnnualized), 'yellow'],
    ['Max Drawdown', fmtPct(metrics.maxDrawdown), 'red'],
    ['Sharpe Ratio', metrics.sharpeRatio.toFixed(2), metrics.sharpeRatio >= 0 ? 'green' : 'red'],
    ['Sortino Ratio', metrics.sortinoRatio.toFixed(2), metrics.sortinoRatio >= 0 ? 'green' : 'red'],
    ['Best Year', `${metrics.bestYear.year}  ${fmtPct(metrics.bestYear.return)}`, 'green'],
    ['Worst Year', `${metrics.worstYear.year}  ${fmtPct(metrics.worstYear.return)}`, 'red'],
    ['Positive Months', fmtPct(metrics.positiveMonthsPct), 'white'],
    ['Rolling 3Y Best', fmtPct(metrics.rolling3YrBest), 'green'],
    ['Rolling 3Y Worst', fmtPct(metrics.rolling3YrWorst), 'red'],
  ];

  return (
    <Box flexDirection="column">
      {rows.map(([label, value, color]) => (
        <Box key={label} gap={1}>
          <Text>{label.padEnd(18)}</Text>
          <Text color={color as any}>{value}</Text>
        </Box>
      ))}
    </Box>
  );
}

// ─── Chart Panel ─────────────────────────────────────────────────────────────

function ChartPanel({ timeSeries, height }: { timeSeries: BacktestResult['timeSeries']; height: number }) {
  if (timeSeries.length === 0) return <Text dimColor>No data</Text>;

  const width = Math.min((process.stdout.columns || 80) - 15, 120);
  const chartHeight = Math.max(height - 4, 10);
  const values = timeSeries.map((p) => p.portfolioValue);
  const sampled = downsample(values, width);
  const formatVal = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(0);
  };
  const chart = asciichart.plot(sampled, { height: chartHeight, format: (v: number) => formatVal(v).padStart(8) });
  const start = timeSeries[0].date.slice(0, 7);
  const end = timeSeries[timeSeries.length - 1].date.slice(0, 7);

  return (
    <Box flexDirection="column">
      <Text dimColor>{start} ~ {end}  ({timeSeries.length} months)</Text>
      <Text>{chart}</Text>
    </Box>
  );
}

// ─── Monte Carlo Panel ───────────────────────────────────────────────────────

function MonteCarloPanel({ result, years }: { result: BacktestResult; years: number }) {
  const mc = useMemo(
    () => runMonteCarlo({
      timeSeries: result.timeSeries,
      years,
      simulations: 1000,
      initialCapital: result.parameters.initialCapital,
      monthlyContribution: 0,
    }),
    [result, years],
  );

  if (mc.finalValues.length === 0) return <Text dimColor>Not enough data for Monte Carlo</Text>;

  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency: result.parameters.displayCurrency, maximumFractionDigits: 0 }).format(v);

  return (
    <Box flexDirection="column">
      <Text bold>Monte Carlo Simulation — {years} Year Projection  (+/-: change)</Text>
      <Text dimColor>1000 simulations, bootstrap sampling from historical returns</Text>
      <Box marginTop={1} flexDirection="column">
        <Box gap={1}><Text>{'Prob. Positive'.padEnd(22)}</Text><Text bold color="green">{(mc.probabilityPositive * 100).toFixed(1)}%</Text></Box>
        <Box gap={1}><Text>{'Prob. Beat Inflation'.padEnd(22)}</Text><Text bold color="blue">{(mc.probabilityBeatInflation * 100).toFixed(1)}%</Text></Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Percentile Outcomes:</Text>
        {[10, 25, 50, 75, 90].map((p) => (
          <Box key={p} gap={1}>
            <Text>{`${p}th percentile`.padEnd(22)}</Text>
            <Text color={p >= 50 ? 'green' : p >= 25 ? 'yellow' : 'red'}>
              {fmtMoney(getPercentile(mc.finalValues, p))}
            </Text>
          </Box>
        ))}
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Yearly Percentile Paths:</Text>
        <Box gap={1}>
          <Text>{'Year'.padEnd(6)}</Text>
          {[10, 25, 50, 75, 90].map((p) => (
            <Text key={p} bold>{`P${p}`.padStart(10)}</Text>
          ))}
        </Box>
        {mc.percentilePaths[50]?.map((_, i) => (
          <Box key={i} gap={1}>
            <Text>{`Y${i}`.padEnd(6)}</Text>
            {[10, 25, 50, 75, 90].map((p) => (
              <Text key={p} color={p >= 50 ? 'green' : p >= 25 ? 'yellow' : 'red'}>
                {fmtMoney(mc.percentilePaths[p]?.[i] ?? 0).padStart(10)}
              </Text>
            ))}
          </Box>
        ))}
      </Box>
    </Box>
  );
}

// ─── Annual Panel ────────────────────────────────────────────────────────────

function AnnualPanel({ annualReturns }: { annualReturns: BacktestResult['annualReturns'] }) {
  if (annualReturns.length === 0) return <Text dimColor>No data</Text>;

  return (
    <Box flexDirection="column">
      <Box gap={1}>
        <Text bold>{'Year'.padEnd(6)}</Text>
        <Text bold>{'Return'.padStart(8)}</Text>
        <Text bold>  Bar</Text>
      </Box>
      {annualReturns.map((ar) => {
        const ret = ar.return;
        const pct = `${(ret * 100).toFixed(2)}%`.padStart(8);
        const barLen = Math.round(Math.min(Math.abs(ret) * 200, 40));
        const bar = '█'.repeat(barLen);
        return (
          <Box key={ar.year} gap={1}>
            <Text>{String(ar.year).padEnd(6)}</Text>
            <Text color={ret >= 0 ? 'green' : 'red'}>{pct}</Text>
            <Text color={ret >= 0 ? 'green' : 'red'}>  {ret < 0 ? '-' : ' '}{bar}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Holdings Panel ──────────────────────────────────────────────────────────

function HoldingsPanel({ holdings }: { holdings: BacktestResult['parameters']['portfolio']['holdings'] }) {
  return (
    <Box flexDirection="column">
      <Box gap={1} marginBottom={1}>
        <Text bold>{'Symbol'.padEnd(8)}</Text>
        <Text bold>{'Weight'.padStart(7)}</Text>
        <Text bold>  Name</Text>
      </Box>
      {holdings.map((h) => (
        <Box key={h.asset.symbol} gap={1}>
          <Text color="cyan">{h.asset.symbol.padEnd(8)}</Text>
          <Text>{`${(h.targetWeight * 100).toFixed(1)}%`.padStart(7)}</Text>
          <Text>  {h.asset.name}</Text>
        </Box>
      ))}
      <Box marginTop={1}>
        <Text dimColor>Total: {(holdings.reduce((s, h) => s + h.targetWeight, 0) * 100).toFixed(0)}% across {holdings.length} holdings</Text>
      </Box>
    </Box>
  );
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function downsample(data: number[], targetLen: number): number[] {
  if (data.length <= targetLen) return data;
  const step = (data.length - 1) / (targetLen - 1);
  const result: number[] = [];
  for (let i = 0; i < targetLen; i++) {
    result.push(data[Math.round(i * step)]);
  }
  return result;
}

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + '…' : s;
}

function findBestIndex(values: number[], higherIsBetter: boolean): number {
  let bestIdx = 0;
  for (let i = 1; i < values.length; i++) {
    if (higherIsBetter ? values[i] > values[bestIdx] : values[i] < values[bestIdx]) bestIdx = i;
  }
  return bestIdx;
}
