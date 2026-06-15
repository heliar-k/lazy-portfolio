import * as asciichart from 'asciichart';
import { Box, Text, useApp, useInput } from 'ink';
import SelectInput from 'ink-select-input';
import Spinner from 'ink-spinner';
import TextInput from 'ink-text-input';
import { createContext, useContext, useMemo, useState } from 'react';
import { runBacktest } from '../engine/backtest.js';
import { getPercentile, runMonteCarlo } from '../engine/monte-carlo.js';
import type {
    BacktestParameters,
    BacktestResult,
    DisplayCurrency,
    PortfolioDefinition,
    PortfolioHolding,
    RebalancingStrategy,
    SWRResult,
} from '../engine/types.js';
import { computeSWR } from '../engine/withdrawal.js';
import { getPortfolioTemplates, getTemplateMetadata } from '../portfolios/registry.js';
import { APP_VERSION } from '../version.js';
import { addCustomPortfolio, deleteCustomPortfolio, loadCustomPortfolios, loadPreferences, savePreferences, updateCustomPortfolio } from './custom-store.js';
import type { EtfMapEntry } from './data-loader.js';
import { loadEtfMap } from './data-loader.js';
import { resolvePortfolioData } from './data-resolver.js';

// ─── Types ───────────────────────────────────────────────────────────────────

type View =
  | 'home'
  | 'select'
  | 'add_type'
  | 'portfolio'
  | 'etf_select'
  | 'manage'
  | 'custom_build'
  | 'custom_weight'
  | 'custom_name'
  | 'rename'
  | 'fork_template'
  | 'theme'
  | 'params'
  | 'running'
  | 'results'
  | 'compare_results'
  | 'swr_params'
  | 'swr_running'
  | 'swr_results';

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

const ETF_CLASS_LABELS: Record<string, string> = {
  us_large_cap: 'US Large Cap', us_small_cap: 'US Small/Mid Cap',
  us_total_market: 'US Total Market', intl_developed: 'Intl Developed',
  intl_emerging: 'Intl Emerging', us_agg_bond: 'US Aggregate Bond',
  us_treasury_long: 'US Treasury Long', us_treasury_intermediate: 'US Treasury Intermediate',
  us_treasury_short: 'US Treasury Short', global_agg_bond: 'Global Bond',
  us_tips: 'US TIPS', us_reit: 'US REIT', us_cash: 'US Cash/Short-term',
  gold: 'Gold', commodities: 'Commodities',
};

// ─── Themes ─────────────────────────────────────────────────────────────────

interface ThemeColors {
  accent: string;
  positive: string;
  negative: string;
  warning: string;
  muted: string;
  text: string;
  highlight: string;
  info: string;
  chartColors: readonly string[];
  chartAsciiColors: readonly string[];
}

interface ThemeDef {
  name: string;
  dark: ThemeColors;
  light: ThemeColors;
}

type ColorScheme = 'dark' | 'light' | 'auto';

function detectColorScheme(): 'dark' | 'light' {
  const colorfgbg = process.env.COLORFGBG;
  if (colorfgbg) {
    const parts = colorfgbg.split(';');
    const bg = parseInt(parts[parts.length - 1], 10);
    if (!isNaN(bg) && bg >= 7) return 'light';
  }
  return 'dark';
}

function resolveScheme(scheme: ColorScheme): 'dark' | 'light' {
  return scheme === 'auto' ? detectColorScheme() : scheme;
}

const THEMES: Record<string, ThemeDef> = {
  catppuccin: {
    name: 'Catppuccin',
    dark: {
      accent: 'blueBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'whiteBright', highlight: 'magentaBright', info: 'cyanBright',
      chartColors: ['blueBright', 'magentaBright', 'greenBright', 'yellowBright'],
      chartAsciiColors: [asciichart.blue, asciichart.magenta, asciichart.green, asciichart.yellow],
    },
    light: {
      accent: 'blue', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'magenta', info: 'cyan',
      chartColors: ['blue', 'magenta', 'green', 'yellow'],
      chartAsciiColors: [asciichart.blue, asciichart.magenta, asciichart.green, asciichart.yellow],
    },
  },
  dracula: {
    name: 'Dracula',
    dark: {
      accent: 'magentaBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'whiteBright', highlight: 'cyanBright', info: 'yellowBright',
      chartColors: ['magentaBright', 'greenBright', 'cyanBright', 'yellowBright'],
      chartAsciiColors: [asciichart.magenta, asciichart.green, asciichart.cyan, asciichart.yellow],
    },
    light: {
      accent: 'magenta', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'cyan', info: 'yellow',
      chartColors: ['magenta', 'green', 'cyan', 'yellow'],
      chartAsciiColors: [asciichart.magenta, asciichart.green, asciichart.cyan, asciichart.yellow],
    },
  },
  tokyonight: {
    name: 'Tokyo Night',
    dark: {
      accent: 'blueBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'whiteBright', highlight: 'magentaBright', info: 'cyanBright',
      chartColors: ['blueBright', 'magentaBright', 'yellowBright', 'cyanBright'],
      chartAsciiColors: [asciichart.blue, asciichart.magenta, asciichart.yellow, asciichart.cyan],
    },
    light: {
      accent: 'blue', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'magenta', info: 'cyan',
      chartColors: ['blue', 'magenta', 'yellow', 'cyan'],
      chartAsciiColors: [asciichart.blue, asciichart.magenta, asciichart.yellow, asciichart.cyan],
    },
  },
  nord: {
    name: 'Nord',
    dark: {
      accent: 'cyanBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'whiteBright', highlight: 'blueBright', info: 'cyanBright',
      chartColors: ['cyanBright', 'blueBright', 'greenBright', 'magentaBright'],
      chartAsciiColors: [asciichart.cyan, asciichart.blue, asciichart.green, asciichart.magenta],
    },
    light: {
      accent: 'cyan', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'blue', info: 'cyan',
      chartColors: ['cyan', 'blue', 'green', 'magenta'],
      chartAsciiColors: [asciichart.cyan, asciichart.blue, asciichart.green, asciichart.magenta],
    },
  },
  onedark: {
    name: 'One Dark',
    dark: {
      accent: 'blueBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'whiteBright', highlight: 'cyanBright', info: 'magentaBright',
      chartColors: ['blueBright', 'greenBright', 'cyanBright', 'magentaBright'],
      chartAsciiColors: [asciichart.blue, asciichart.green, asciichart.cyan, asciichart.magenta],
    },
    light: {
      accent: 'blue', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'cyan', info: 'magenta',
      chartColors: ['blue', 'green', 'cyan', 'magenta'],
      chartAsciiColors: [asciichart.blue, asciichart.green, asciichart.cyan, asciichart.magenta],
    },
  },
  gruvbox: {
    name: 'Gruvbox',
    dark: {
      accent: 'yellowBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'whiteBright', highlight: 'cyanBright', info: 'blueBright',
      chartColors: ['yellowBright', 'greenBright', 'cyanBright', 'blueBright'],
      chartAsciiColors: [asciichart.yellow, asciichart.green, asciichart.cyan, asciichart.blue],
    },
    light: {
      accent: 'yellow', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'cyan', info: 'blue',
      chartColors: ['yellow', 'green', 'cyan', 'blue'],
      chartAsciiColors: [asciichart.yellow, asciichart.green, asciichart.cyan, asciichart.blue],
    },
  },
  monokai: {
    name: 'Monokai',
    dark: {
      accent: 'yellowBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'whiteBright', highlight: 'magentaBright', info: 'cyanBright',
      chartColors: ['yellowBright', 'greenBright', 'cyanBright', 'magentaBright'],
      chartAsciiColors: [asciichart.yellow, asciichart.green, asciichart.cyan, asciichart.magenta],
    },
    light: {
      accent: 'yellow', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'magenta', info: 'cyan',
      chartColors: ['yellow', 'green', 'cyan', 'magenta'],
      chartAsciiColors: [asciichart.yellow, asciichart.green, asciichart.cyan, asciichart.magenta],
    },
  },
  solarized: {
    name: 'Solarized',
    dark: {
      accent: 'blueBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'white', highlight: 'cyanBright', info: 'magentaBright',
      chartColors: ['blueBright', 'greenBright', 'yellowBright', 'magentaBright'],
      chartAsciiColors: [asciichart.blue, asciichart.green, asciichart.yellow, asciichart.magenta],
    },
    light: {
      accent: 'blue', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'cyan', info: 'magenta',
      chartColors: ['blue', 'green', 'yellow', 'magenta'],
      chartAsciiColors: [asciichart.blue, asciichart.green, asciichart.yellow, asciichart.magenta],
    },
  },
  kanagawa: {
    name: 'Kanagawa',
    dark: {
      accent: 'blueBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'gray', text: 'whiteBright', highlight: 'magentaBright', info: 'cyanBright',
      chartColors: ['blueBright', 'magentaBright', 'greenBright', 'yellowBright'],
      chartAsciiColors: [asciichart.blue, asciichart.magenta, asciichart.green, asciichart.yellow],
    },
    light: {
      accent: 'blue', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'magenta', info: 'cyan',
      chartColors: ['blue', 'magenta', 'green', 'yellow'],
      chartAsciiColors: [asciichart.blue, asciichart.magenta, asciichart.green, asciichart.yellow],
    },
  },
  highContrast: {
    name: 'High Contrast',
    dark: {
      accent: 'whiteBright', positive: 'greenBright', negative: 'redBright', warning: 'yellowBright',
      muted: 'white', text: 'whiteBright', highlight: 'whiteBright', info: 'blueBright',
      chartColors: ['greenBright', 'yellowBright', 'cyanBright', 'magentaBright'],
      chartAsciiColors: [asciichart.green, asciichart.yellow, asciichart.cyan, asciichart.magenta],
    },
    light: {
      accent: 'black', positive: 'green', negative: 'red', warning: 'yellow',
      muted: 'gray', text: 'black', highlight: 'black', info: 'blue',
      chartColors: ['green', 'red', 'blue', 'magenta'],
      chartAsciiColors: [asciichart.green, asciichart.red, asciichart.blue, asciichart.magenta],
    },
  },
};

const THEME_KEYS = Object.keys(THEMES);

const ThemeContext = createContext<ThemeColors>(THEMES.catppuccin.dark);
const useTheme = () => useContext(ThemeContext);

// ─── App ─────────────────────────────────────────────────────────────────────

export default function App() {
  const { exit } = useApp();

  const [view, setView] = useState<View>('home');
  const [isSWRMode, setIsSWRMode] = useState(false);
  const [error, setError] = useState('');

  // Theme state
  const [themeKey, setThemeKey] = useState<string>(() => loadPreferences().theme ?? 'catppuccin');
  const [colorScheme, setColorScheme] = useState<ColorScheme>(() => loadPreferences().colorScheme ?? 'auto');
  const resolvedScheme = resolveScheme(colorScheme);
  const themeDef = THEMES[themeKey] ?? THEMES.catppuccin;
  const themeColors = themeDef[resolvedScheme];
  // Portfolio selection (1–4 portfolios, unified for backtest & compare)
  const [selectedPortfolios, setSelectedPortfolios] = useState<PortfolioDefinition[]>([]);
  const [results, setResults] = useState<{ name: string; result: BacktestResult }[]>([]);
  const [tab, setTab] = useState<ResultTab>('metrics');
  const [compareTab, setCompareTab] = useState<CompareTab>('table');

  // SWR state
  const [swrResult, setSwrResult] = useState<SWRResult | null>(null);
  const [swrTab, setSwrTab] = useState<SWRTab>('summary');
  const [retirementYears, setRetirementYears] = useState('30');

  // Custom portfolio build state
  const [customHoldings, setCustomHoldings] = useState<PortfolioHolding[]>([]);
  const [pendingEtf, setPendingEtf] = useState<EtfMapEntry | null>(null);
  const [weightInput, setWeightInput] = useState('');
  const [customName, setCustomName] = useState('');
  const [savedCustoms, setSavedCustoms] = useState<PortfolioDefinition[]>(() => loadCustomPortfolios());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [renamingPortfolio, setRenamingPortfolio] = useState<PortfolioDefinition | null>(null);

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
  const [cfRebalance, setCfRebalance] = useState(false);
  const [paramStep, setParamStep] = useState(0);

  // Data
  const etfMap = useMemo(() => loadEtfMap(), []);
  const etfsWithProxy = useMemo(() => etfMap.filter((e) => e.proxySymbol), [etfMap]);
  const metadata = useMemo(() => getTemplateMetadata().filter((t) => t.holdingCount > 0), []);

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

  const handlePortfolioAdded = (p: PortfolioDefinition) => {
    if (selectedPortfolios.some((sp) => sp.id === p.id)) {
      setError(`"${p.name}" is already added`);
      setView('select');
      return;
    }
    setError('');
    setSelectedPortfolios((prev) => [...prev, p]);
    setView('select');
  };

  const doRun = () => {
    if (selectedPortfolios.length === 0) return;
    setView('running');
    setError('');

    setTimeout(() => {
      try {
        const region = CURRENCY_REGION[currency] ?? 'US';
        const allResults: { name: string; result: BacktestResult }[] = [];

        for (const p of selectedPortfolios) {
          const { assetReturns, fxRates, cpiSeries } = resolvePortfolioData(
            p.holdings, currency, region, inflation,
          );
          const params: BacktestParameters = {
            portfolio: p, startDate, endDate,
            initialCapital: parseFloat(capital) || 10000,
            displayCurrency: currency,
            inflationRegion: region as BacktestParameters['inflationRegion'],
            inflationAdjusted: inflation,
            rebalancing: parseRebalancing(rebalancing),
            cashflowTriggersRebalance: cfRebalance,
            cashflows: [],
          };
          allResults.push({ name: p.name, result: runBacktest(params, assetReturns, fxRates, cpiSeries) });
        }

        setResults(allResults);
        if (allResults.length === 1) {
          setTab('metrics');
          setView('results');
        } else {
          setCompareTab('table');
          setView('compare_results');
        }
      } catch (e: any) {
        setError(e.message ?? 'Backtest failed');
        setView('params');
      }
    }, 10);
  };

  const doSWR = () => {
    if (selectedPortfolios.length === 0) return;
    const portfolio = selectedPortfolios[0];
    setView('swr_running');
    setError('');

    setTimeout(() => {
      try {
        const region = CURRENCY_REGION[currency] ?? 'US';
        const { assetReturns, fxRates, cpiSeries } = resolvePortfolioData(
          portfolio.holdings, currency, region, true,
        );
        const years = parseInt(retirementYears) || 30;
        const r = computeSWR(portfolio.holdings, assetReturns, cpiSeries, {
          retirementYears: years,
          initialCapital: parseFloat(capital) || 10000,
          rebalancing: parseRebalancing(rebalancing),
          displayCurrency: currency,
          inflationRegion: region as BacktestParameters['inflationRegion'],
          fxRates,
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

  // ─── Global keyboard ─────────────────────────────────────────────────────

  const isTextEditing = [1, 2, 3].includes(paramStep) && view === 'params';
  const isSWRTextEditing = view === 'swr_params';
  const isWeightEditing = view === 'custom_weight';
  const isNameEditing = view === 'custom_name';
  const isRenaming = view === 'rename';

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
          setView('select');
        } else if (input === 's') {
          setParamStep(0);
          setView('params');
        } else if (input === 'r') {
          doRun();
        } else if (input === 'w') {
          setView('swr_params');
        } else if (tab === 'monte') {
          if (input === '+' || input === '=') setMcYears((y) => Math.min(y + 5, 30));
          if (input === '-') setMcYears((y) => Math.max(y - 5, 5));
        }
      }

      if (view === 'compare_results') {
        if (key.tab || input === 'l' || key.rightArrow) {
          const idx = COMPARE_TABS.findIndex((t) => t.key === compareTab);
          setCompareTab(COMPARE_TABS[(idx + 1) % COMPARE_TABS.length].key);
        } else if (input === 'h' || key.leftArrow) {
          const idx = COMPARE_TABS.findIndex((t) => t.key === compareTab);
          setCompareTab(COMPARE_TABS[(idx - 1 + COMPARE_TABS.length) % COMPARE_TABS.length].key);
        } else if (input === 'p') {
          setView('select');
        } else if (input === 's') {
          setParamStep(0);
          setView('params');
        } else if (input === 'r') {
          doRun();
        } else if (key.escape) {
          setView('select');
        }
      }

      if (view === 'swr_results') {
        if (key.tab || input === 'l' || key.rightArrow) {
          const idx = SWR_TABS.findIndex((t) => t.key === swrTab);
          setSwrTab(SWR_TABS[(idx + 1) % SWR_TABS.length].key);
        } else if (input === 'h' || key.leftArrow) {
          const idx = SWR_TABS.findIndex((t) => t.key === swrTab);
          setSwrTab(SWR_TABS[(idx - 1 + SWR_TABS.length) % SWR_TABS.length].key);
        } else if (key.escape) {
          if (results.length > 0) setView('results');
          else setView('home');
        }
      }

      // Navigation
      if (view === 'home' && key.escape) {
        if (results.length > 0) setView(results.length === 1 ? 'results' : 'compare_results');
      }
      if (view === 'select' && key.escape) {
        setView('home');
      }
      if (view === 'add_type' && key.escape) {
        setView('select');
      }
      if (view === 'manage' && key.escape) {
        setView('home');
      }
      if (view === 'theme' && key.escape) {
        setView('home');
      }
      if (view === 'custom_build' && key.escape) {
        setView('manage');
      }
      if (view === 'custom_weight' && key.escape) {
        setView('custom_build');
      }
      if (view === 'rename' && key.escape) {
        setRenamingPortfolio(null);
        setView('manage');
      }
      if (view === 'fork_template' && key.escape) {
        setView('manage');
      }
      if (view === 'params' && key.escape && !isTextEditing) {
        setView('select');
      }
    },
    { isActive: !isTextEditing && !isSWRTextEditing && !isWeightEditing && !isNameEditing && !isRenaming && !['running', 'swr_running', 'portfolio', 'etf_select', 'fork_template'].includes(view) },
  );

  const height = process.stdout.rows || 24;

  // ─── Render ───────────────────────────────────────────────────────────────

  return (
    <ThemeContext.Provider value={themeColors}>
    <Box flexDirection="column" height={height}>
      {/* Header */}
      <Box borderStyle="single" paddingX={1}>
        <Text bold color={themeColors.accent as any}>Lazy Portfolio Backtest</Text>
        {selectedPortfolios.length === 1 && (
          <Text>  ·  <Text bold>{selectedPortfolios[0].name}</Text></Text>
        )}
        {selectedPortfolios.length > 1 && (
          <Text>  ·  <Text bold>{selectedPortfolios.length} portfolios</Text></Text>
        )}
        <Text dimColor>  [{themeDef.name} · {resolvedScheme}]</Text>
      </Box>

      {/* Main content */}
      <Box flexGrow={1} flexDirection="column" paddingX={1}>
        {view === 'home' && (
          <HomeView onSelect={(action) => {
            if (action === 'backtest') {
              setIsSWRMode(false);
              setSelectedPortfolios([]);
              setView('select');
            } else if (action === 'manage') {
              setSavedCustoms(loadCustomPortfolios());
              setView('manage');
            } else if (action === 'swr') {
              setIsSWRMode(true);
              setSelectedPortfolios([]);
              setView('select');
            } else if (action === 'theme') {
              setView('theme');
            }
          }} />
        )}

        {view === 'theme' && (
          <ThemeSelectView
            currentTheme={themeKey}
            currentScheme={colorScheme}
            onSelectTheme={(key) => {
              setThemeKey(key);
              savePreferences({ theme: key, colorScheme });
            }}
            onSelectScheme={(scheme) => {
              setColorScheme(scheme);
              savePreferences({ theme: themeKey, colorScheme: scheme });
            }}
            onBack={() => setView('home')}
          />
        )}

        {view === 'select' && (
          <SelectView
            selected={selectedPortfolios}
            isSWRMode={isSWRMode}
            error={error}
            onAdd={() => { setError(''); setView('add_type'); }}
            onRemove={(i) => setSelectedPortfolios((prev) => prev.filter((_, idx) => idx !== i))}
            onRun={() => { setParamStep(0); setView('params'); }}
          />
        )}

        {view === 'add_type' && (
          <AddTypeView
            savedCount={savedCustoms.length}
            onSelect={(type) => {
              if (type === 'template') setView('portfolio');
              else if (type === 'single_etf') setView('etf_select');
              else if (type === 'saved') {
                setSavedCustoms(loadCustomPortfolios());
                setView('manage');
              }
            }}
          />
        )}

        {view === 'portfolio' && (
          <PortfolioView
            metadata={metadata}
            onSelect={(id) => {
              const p = resolvePortfolio(id);
              if (p) handlePortfolioAdded(p);
            }}
            onBack={() => setView('add_type')}
          />
        )}

        {view === 'etf_select' && (
          <ETFSelectView
            etfs={etfsWithProxy}
            onSelect={(entry) => {
              if (customHoldings.length > 0 || editingId !== null) {
                setPendingEtf(entry);
                setWeightInput('');
                setView('custom_weight');
              } else {
                handlePortfolioAdded(etfToPortfolio(entry));
              }
            }}
            onBack={() => {
              if (customHoldings.length > 0 || editingId !== null) setView('custom_build');
              else setView('add_type');
            }}
          />
        )}

        {view === 'manage' && (
          <ManageView
            customs={savedCustoms}
            onCreateNew={() => {
              setEditingId(null);
              setCustomHoldings([]);
              setView('custom_build');
            }}
            onForkTemplate={() => {
              setEditingId(null);
              setCustomHoldings([]);
              setView('fork_template');
            }}
            onDelete={(id) => {
              const updated = deleteCustomPortfolio(id);
              setSavedCustoms(updated);
            }}
            onRename={(p) => {
              setRenamingPortfolio(p);
              setCustomName(p.name);
              setView('rename');
            }}
            onEdit={(p) => {
              setEditingId(p.id);
              setCustomHoldings([...p.holdings]);
              setView('custom_build');
            }}
            onUse={(p) => handlePortfolioAdded(p)}
            onBack={() => {
              if (selectedPortfolios.length > 0 || view === 'manage') setView(selectedPortfolios.length > 0 ? 'select' : 'home');
            }}
            showUse={selectedPortfolios !== undefined}
          />
        )}

        {view === 'custom_build' && (
          <CustomBuildView
            holdings={customHoldings}
            isEditing={editingId !== null}
            onAdd={() => setView('etf_select')}
            onRemove={(i) => setCustomHoldings((prev) => prev.filter((_, idx) => idx !== i))}
            onDone={() => {
              if (customHoldings.length === 0) return;
              if (editingId) {
                const updated = updateCustomPortfolio(editingId, { holdings: customHoldings });
                setSavedCustoms(updated);
                setEditingId(null);
                setCustomHoldings([]);
                setView('manage');
              } else {
                setCustomName('');
                setView('custom_name');
              }
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

        {view === 'custom_name' && (
          <CustomNameView
            name={customName}
            onChange={setCustomName}
            onSubmit={(name) => {
              const id = `custom_${Date.now()}`;
              const p: PortfolioDefinition = { id, name, holdings: customHoldings, tags: ['custom'] };
              const updated = addCustomPortfolio(p);
              setSavedCustoms(updated);
              setCustomHoldings([]);
              setEditingId(null);
              setView('manage');
            }}
          />
        )}

        {view === 'rename' && renamingPortfolio && (
          <CustomNameView
            name={customName}
            onChange={setCustomName}
            onSubmit={(name) => {
              const updated = updateCustomPortfolio(renamingPortfolio.id, { name });
              setSavedCustoms(updated);
              setRenamingPortfolio(null);
              setView('manage');
            }}
            label="Rename Portfolio"
          />
        )}

        {view === 'fork_template' && (
          <PortfolioView
            metadata={metadata}
            onSelect={(id) => {
              const p = resolvePortfolio(id);
              if (p) {
                setEditingId(null);
                setCustomHoldings([...p.holdings]);
                setView('custom_build');
              }
            }}
            onBack={() => setView('manage')}
          />
        )}

        {view === 'params' && (
          <ParamsView
            startDate={startDate} endDate={endDate} capital={capital}
            rebalancing={rebalancing} currency={currency} inflation={inflation}
            cfRebalance={cfRebalance}
            paramStep={paramStep}
            onStartDate={setStartDate} onEndDate={setEndDate} onCapital={setCapital}
            onRebalancing={setRebalancing} onCurrency={setCurrency} onInflation={setInflation}
            onCfRebalance={setCfRebalance}
            onNextStep={() => setParamStep((s) => s + 1)}
            onRun={isSWRMode ? doSWR : doRun}
            runLabel={isSWRMode ? 'Run SWR Analysis' : selectedPortfolios.length > 1 ? 'Run Comparison' : 'Run Backtest'}
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

        {(view === 'running' || view === 'swr_running') && (
          <Box flexDirection="column" marginTop={1}>
            <Text>
              <Text color={themeColors.positive as any}><Spinner type="dots" /></Text>
              {' '}{view === 'swr_running' ? 'Running SWR analysis...' :
                   selectedPortfolios.length > 1 ? 'Running comparison backtests...' :
                   'Loading data and running backtest...'}
            </Text>
          </Box>
        )}

        {view === 'results' && results.length > 0 && (
          <ResultsView result={results[0].result} tab={tab} currency={currency} height={height - 5} mcYears={mcYears} />
        )}

        {view === 'compare_results' && results.length > 1 && (
          <CompareResultsView results={results} tab={compareTab} currency={currency} height={height - 5} />
        )}

        {view === 'swr_results' && swrResult && (
          <SWRResultsView swrResult={swrResult} swrTab={swrTab} currency={currency} />
        )}
      </Box>

      {/* Status bar */}
      <Box borderStyle="single" paddingX={1}>
        <StatusBar view={view} tab={tab} />
      </Box>
    </Box>
    </ThemeContext.Provider>
  );
}

// ─── Theme Select View ──────────────────────────────────────────────────────

function ThemeSelectView({ currentTheme, currentScheme, onSelectTheme, onSelectScheme, onBack }: {
  currentTheme: string;
  currentScheme: ColorScheme;
  onSelectTheme: (key: string) => void;
  onSelectScheme: (scheme: ColorScheme) => void;
  onBack: () => void;
}) {
  const t = useTheme();
  const [step, setStep] = useState<'theme' | 'scheme'>('theme');

  if (step === 'scheme') {
    return (
      <Box flexDirection="column" marginTop={1}>
        <Text bold>Color Scheme</Text>
        <Box marginTop={1}>
          <SelectInput
            items={[
              { label: `Auto (detect from terminal)${currentScheme === 'auto' ? '  ←' : ''}`, value: 'auto' as const },
              { label: `Dark${currentScheme === 'dark' ? '  ←' : ''}`, value: 'dark' as const },
              { label: `Light${currentScheme === 'light' ? '  ←' : ''}`, value: 'light' as const },
              { label: '← Back to themes', value: 'back' as const },
            ]}
            onSelect={(item) => {
              if (item.value === 'back') { setStep('theme'); return; }
              onSelectScheme(item.value as ColorScheme);
            }}
          />
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Theme</Text>
      <Box marginTop={1} flexDirection="column">
        <Text>  Preview:  <Text color={t.accent as any}>accent</Text>  <Text color={t.positive as any}>positive</Text>  <Text color={t.negative as any}>negative</Text>  <Text color={t.warning as any}>warning</Text>  <Text color={t.highlight as any}>highlight</Text>  <Text color={t.info as any}>info</Text></Text>
      </Box>
      <Box marginTop={1}>
        <SelectInput
          items={[
            ...THEME_KEYS.map((key) => ({
              label: `${THEMES[key].name}${key === currentTheme ? '  ←' : ''}`,
              value: key,
            })),
            { label: `Color Scheme: ${currentScheme}`, value: '__scheme__' },
            { label: '← Back', value: '__back__' },
          ]}
          onSelect={(item) => {
            if (item.value === '__back__') onBack();
            else if (item.value === '__scheme__') setStep('scheme');
            else onSelectTheme(item.value);
          }}
        />
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
  if (view === 'compare_results') {
    return <Text dimColor>←→: tab  p: portfolio  s: settings  r: re-run  Esc: back  q: quit</Text>;
  }
  if (view === 'swr_results') {
    return <Text dimColor>←→: tab  Esc: back  q: quit</Text>;
  }
  if (['portfolio', 'etf_select', 'select', 'add_type', 'manage', 'custom_build', 'fork_template', 'theme'].includes(view)) {
    return <Text dimColor>↑↓: navigate  Enter: select  Esc: back  q: quit</Text>;
  }
  return <Text dimColor>Enter: confirm  Esc: back  q: quit</Text>;
}

// ─── Home View ──────────────────────────────────────────────────────────────

function HomeView({ onSelect }: { onSelect: (action: 'backtest' | 'manage' | 'swr' | 'theme') => void }) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Box>
        <Text bold>Lazy Portfolio </Text>
        <Text dimColor>v{APP_VERSION}</Text>
      </Box>
      <Box marginTop={1}>
        <SelectInput
          items={[
            { label: 'Backtest    — run & compare portfolios', value: 'backtest' as const },
            { label: 'My Portfolios — create & manage custom portfolios', value: 'manage' as const },
            { label: 'SWR Analysis  — safe withdrawal rate', value: 'swr' as const },
            { label: 'Theme         — change color theme', value: 'theme' as const },
          ]}
          onSelect={(item) => onSelect(item.value)}
        />
      </Box>
    </Box>
  );
}

// ─── Select View (unified backtest/compare) ─────────────────────────────────

function SelectView({ selected, isSWRMode, error, onAdd, onRemove, onRun }: {
  selected: PortfolioDefinition[];
  isSWRMode: boolean;
  error: string;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onRun: () => void;
}) {
  const t = useTheme();
  const maxCount = isSWRMode ? 1 : 4;
  const minCount = 1;
  const items: { label: string; value: string }[] = [];

  if (selected.length < maxCount) {
    items.push({ label: `+ Add portfolio (${selected.length}/${maxCount})`, value: 'add' });
  }
  selected.forEach((p, i) => {
    items.push({ label: `✕ Remove ${p.name}`, value: `remove_${i}` });
  });
  if (selected.length >= minCount) {
    const label = isSWRMode ? '▶ Configure parameters & run SWR'
      : selected.length === 1 ? '▶ Configure parameters & run backtest'
      : '▶ Configure parameters & run comparison';
    items.push({ label, value: 'run' });
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{isSWRMode ? 'SWR Analysis — Select Portfolio' : 'Select Portfolios'}</Text>
      {!isSWRMode && <Text dimColor>Select 1 portfolio for backtest, 2–4 for comparison</Text>}
      {error && <Text color={t.negative as any}>{error}</Text>}
      {selected.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {selected.map((p, i) => (
            <Text key={p.id + i}> {i + 1}. <Text color={t.accent as any}>{p.name}</Text> ({p.holdings.length} holdings)</Text>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === 'add') onAdd();
            else if (item.value === 'run') onRun();
            else if (item.value.startsWith('remove_')) onRemove(parseInt(item.value.slice(7)));
          }}
        />
      </Box>
    </Box>
  );
}

// ─── Add Type View ──────────────────────────────────────────────────────────

function AddTypeView({ savedCount, onSelect }: {
  savedCount: number;
  onSelect: (type: 'template' | 'single_etf' | 'saved') => void;
}) {
  const items: { label: string; value: 'template' | 'single_etf' | 'saved' }[] = [
    { label: 'Template portfolio (All Weather, Golden Butterfly...)', value: 'template' },
    { label: 'Single ETF (SPY, QQQ, VTI...)', value: 'single_etf' },
  ];
  if (savedCount > 0) {
    items.push({ label: `My custom portfolios (${savedCount} saved)`, value: 'saved' });
  }
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Add Portfolio — Select Type</Text>
      <Box marginTop={1}>
        <SelectInput items={items} onSelect={(item) => onSelect(item.value)} />
      </Box>
    </Box>
  );
}

// ─── Portfolio View ──────────────────────────────────────────────────────────

function PortfolioView({ metadata, onSelect, onBack }: {
  metadata: { id: string; name: string; nameZh: string; holdingCount: number; riskLevel: string; category: string }[];
  onSelect: (id: string) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase();
  const filtered = q
    ? metadata.filter((t) =>
        t.name.toLowerCase().includes(q) || t.nameZh?.toLowerCase().includes(q)
        || t.id.toLowerCase().includes(q) || t.category.toLowerCase().includes(q))
    : metadata;

  useInput((_input, key) => {
    if (key.escape) onBack();
  }, { isActive: !query });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select Template Portfolio</Text>
      <Box marginTop={1}>
        <Text>🔍 </Text>
        <TextInput value={query} onChange={setQuery} placeholder="search by name, category..." />
      </Box>
      <Box marginTop={1}>
        {filtered.length > 0 ? (
          <SelectInput
            items={filtered.map((t) => ({
              label: `[${t.category}] ${t.nameZh ? `${t.name} (${t.nameZh})` : t.name}`,
              value: t.id,
            }))}
            onSelect={(item) => onSelect(item.value)}
            limit={15}
          />
        ) : (
          <Text dimColor>No matching portfolios</Text>
        )}
      </Box>
    </Box>
  );
}

// ─── ETF Select View ────────────────────────────────────────────────────────

function ETFSelectView({ etfs, onSelect, onBack }: {
  etfs: EtfMapEntry[];
  onSelect: (entry: EtfMapEntry) => void;
  onBack: () => void;
}) {
  const [query, setQuery] = useState('');
  const q = query.toLowerCase();
  const filtered = q
    ? etfs.filter((e) =>
        e.symbol.toLowerCase().includes(q) || e.name.toLowerCase().includes(q)
        || e.nameZh?.toLowerCase().includes(q) || (ETF_CLASS_LABELS[e.assetClass] ?? e.assetClass).toLowerCase().includes(q))
    : etfs;
  const bySymbol = new Map(etfs.map((e) => [e.symbol, e]));

  useInput((_input, key) => {
    if (key.escape) onBack();
  }, { isActive: !query });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Select ETF</Text>
      <Box marginTop={1}>
        <Text>🔍 </Text>
        <TextInput value={query} onChange={setQuery} placeholder="symbol, name, or asset class..." />
      </Box>
      <Box marginTop={1}>
        {filtered.length > 0 ? (
          <SelectInput
            items={filtered.map((e) => ({
              label: `${e.symbol.padEnd(6)} [${ETF_CLASS_LABELS[e.assetClass] ?? e.assetClass}] ${e.name}`,
              value: e.symbol,
            }))}
            onSelect={(item) => {
              const entry = bySymbol.get(item.value);
              if (entry) onSelect(entry);
            }}
            limit={15}
          />
        ) : (
          <Text dimColor>No matching ETFs</Text>
        )}
      </Box>
    </Box>
  );
}

// ─── Manage Custom Portfolios View ──────────────────────────────────────────

function ManageView({ customs, onCreateNew, onForkTemplate, onDelete, onRename, onEdit, onUse, onBack, showUse }: {
  customs: PortfolioDefinition[];
  onCreateNew: () => void;
  onForkTemplate: () => void;
  onDelete: (id: string) => void;
  onRename: (p: PortfolioDefinition) => void;
  onEdit: (p: PortfolioDefinition) => void;
  onUse: (p: PortfolioDefinition) => void;
  onBack: () => void;
  showUse: boolean;
}) {
  const t = useTheme();
  const items: { label: string; value: string }[] = [
    { label: '+ Create from scratch', value: 'create' },
    { label: '+ Fork from template', value: 'fork' },
  ];
  customs.forEach((p) => {
    const summary = p.holdings.map((h) => `${h.asset.symbol} ${(h.targetWeight * 100).toFixed(0)}%`).join(', ');
    if (showUse) {
      items.push({ label: `▶ Use: ${p.name} — ${summary}`, value: `use_${p.id}` });
    }
    items.push({ label: `✎ Edit: ${p.name}`, value: `edit_${p.id}` });
    items.push({ label: `✎ Rename: ${p.name}`, value: `rename_${p.id}` });
    items.push({ label: `✕ Delete: ${p.name}`, value: `delete_${p.id}` });
  });
  items.push({ label: '← Back', value: 'back' });

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>My Custom Portfolios</Text>
      {customs.length === 0 && (
        <Box marginTop={1}><Text dimColor>No custom portfolios saved yet</Text></Box>
      )}
      {customs.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {customs.map((p, i) => (
            <Box key={p.id} flexDirection="column">
              <Text> {i + 1}. <Text bold color={t.accent as any}>{p.name}</Text></Text>
              <Text dimColor>    {p.holdings.map((h) => `${h.asset.symbol} ${(h.targetWeight * 100).toFixed(0)}%`).join(' / ')}</Text>
            </Box>
          ))}
        </Box>
      )}
      <Box marginTop={1}>
        <SelectInput
          items={items}
          onSelect={(item) => {
            if (item.value === 'create') onCreateNew();
            else if (item.value === 'fork') onForkTemplate();
            else if (item.value === 'back') onBack();
            else if (item.value.startsWith('use_')) {
              const p = customs.find((c) => c.id === item.value.slice(4));
              if (p) onUse(p);
            } else if (item.value.startsWith('edit_')) {
              const p = customs.find((c) => c.id === item.value.slice(5));
              if (p) onEdit(p);
            } else if (item.value.startsWith('rename_')) {
              const p = customs.find((c) => c.id === item.value.slice(7));
              if (p) onRename(p);
            } else if (item.value.startsWith('delete_')) {
              onDelete(item.value.slice(7));
            }
          }}
        />
      </Box>
    </Box>
  );
}

// ─── Custom Build View ──────────────────────────────────────────────────────

function CustomBuildView({ holdings, isEditing, onAdd, onRemove, onDone }: {
  holdings: PortfolioHolding[];
  isEditing: boolean;
  onAdd: () => void;
  onRemove: (index: number) => void;
  onDone: () => void;
}) {
  const t = useTheme();
  const totalWeight = holdings.reduce((s, h) => s + h.targetWeight, 0);
  const items: { label: string; value: string }[] = [
    { label: '+ Add ETF', value: 'add' },
  ];
  holdings.forEach((h, i) => {
    items.push({ label: `✕ Remove ${h.asset.symbol} (${(h.targetWeight * 100).toFixed(1)}%)`, value: `remove_${i}` });
  });
  if (holdings.length > 0) {
    const label = isEditing
      ? `▶ Save changes (${(totalWeight * 100).toFixed(1)}% total)`
      : `▶ Save portfolio (${(totalWeight * 100).toFixed(1)}% total)`;
    items.push({ label, value: 'done' });
  }

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{isEditing ? 'Edit Portfolio' : 'Build Custom Portfolio'}</Text>
      {holdings.length > 0 && (
        <Box flexDirection="column" marginTop={1}>
          {holdings.map((h, i) => (
            <Text key={h.asset.symbol + i}>
              {' '}{h.asset.symbol.padEnd(6)} <Text color={t.accent as any}>{(h.targetWeight * 100).toFixed(1).padStart(5)}%</Text> {h.asset.name}
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

// ─── Custom Name View ───────────────────────────────────────────────────────

function CustomNameView({ name, onChange, onSubmit, label }: {
  name: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  label?: string;
}) {
  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>{label ?? 'Name Your Portfolio'}</Text>
      <Box marginTop={1}>
        <Text>▸ Name: </Text>
        <TextInput value={name} onChange={onChange} onSubmit={(v) => { if (v.trim()) onSubmit(v.trim()); }} />
      </Box>
      <Text dimColor>  Enter a name, press Enter to save</Text>
    </Box>
  );
}

// ─── Params View ─────────────────────────────────────────────────────────────

function ParamsView({
  startDate, endDate, capital, rebalancing, currency, inflation, cfRebalance,
  paramStep, onStartDate, onEndDate, onCapital, onRebalancing, onCurrency, onInflation, onCfRebalance,
  onNextStep, onRun, runLabel, error,
}: {
  startDate: string; endDate: string; capital: string;
  rebalancing: string; currency: DisplayCurrency; inflation: boolean; cfRebalance: boolean;
  paramStep: number;
  onStartDate: (v: string) => void; onEndDate: (v: string) => void; onCapital: (v: string) => void;
  onRebalancing: (v: string) => void; onCurrency: (v: DisplayCurrency) => void; onInflation: (v: boolean) => void;
  onCfRebalance: (v: boolean) => void;
  onNextStep: () => void; onRun: () => void; runLabel: string; error: string;
}) {
  const t = useTheme();
  const [localStart, setLocalStart] = useState(startDate);
  const [localEnd, setLocalEnd] = useState(endDate);
  const [localCapital, setLocalCapital] = useState(capital);

  return (
    <Box flexDirection="column" marginTop={1}>
      <Text bold>Configure Parameters</Text>
      {error && <Text color={t.negative as any}>Error: {error}</Text>}

      <Box marginTop={1} flexDirection="column" gap={0}>
        <Box>
          <Text>{paramStep === 1 ? '▸' : ' '} Start Date: </Text>
          {paramStep === 1 ? (
            <TextInput value={localStart} onChange={setLocalStart} onSubmit={(v) => { onStartDate(v); onNextStep(); }} />
          ) : (
            <Text color={paramStep > 1 ? t.positive as any : t.muted as any}>{startDate}</Text>
          )}
        </Box>

        {paramStep >= 2 && (
          <Box>
            <Text>{paramStep === 2 ? '▸' : ' '} End Date:   </Text>
            {paramStep === 2 ? (
              <TextInput value={localEnd} onChange={setLocalEnd} onSubmit={(v) => { onEndDate(v); onNextStep(); }} />
            ) : (
              <Text color={paramStep > 2 ? t.positive as any : t.muted as any}>{endDate}</Text>
            )}
          </Box>
        )}

        {paramStep >= 3 && (
          <Box>
            <Text>{paramStep === 3 ? '▸' : ' '} Capital:    $</Text>
            {paramStep === 3 ? (
              <TextInput value={localCapital} onChange={setLocalCapital} onSubmit={(v) => { onCapital(v); onNextStep(); }} />
            ) : (
              <Text color={paramStep > 3 ? t.positive as any : t.muted as any}>{capital}</Text>
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
          <Box><Text>  Rebalancing: </Text><Text color={t.positive as any}>{REBALANCING_OPTIONS.find((o) => o.value === rebalancing)?.label}</Text></Box>
        )}

        {paramStep === 5 && (
          <Box flexDirection="column">
            <Text>▸ Currency:</Text>
            <SelectInput items={CURRENCY_OPTIONS} onSelect={(item) => { onCurrency(item.value); onNextStep(); }} />
          </Box>
        )}
        {paramStep > 5 && (
          <Box><Text>  Currency:    </Text><Text color={t.positive as any}>{currency}</Text></Box>
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
          <Box><Text>  Inflation:   </Text><Text color={t.positive as any}>{inflation ? 'Yes' : 'No'}</Text></Box>
        )}

        {paramStep === 7 && (
          <Box flexDirection="column">
            <Text>▸ Rebalance on Cashflow:</Text>
            <SelectInput
              items={[{ label: 'Yes (force rebalance)', value: 'yes' }, { label: 'No (soft rebalance)', value: 'no' }]}
              onSelect={(item) => { onCfRebalance(item.value === 'yes'); onNextStep(); }}
            />
          </Box>
        )}
        {paramStep > 7 && (
          <Box><Text>  CF Rebalance: </Text><Text color={t.positive as any}>{cfRebalance ? 'Yes' : 'No'}</Text></Box>
        )}

        {paramStep >= 8 && (
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
  const t = useTheme();
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);

  return (
    <Box flexDirection="column">
      <TabBar tabs={SWR_TABS} active={swrTab} />
      {swrTab === 'summary' && (
        <Box flexDirection="column">
          <Box gap={1}><Text>{'Safe WR Rate'.padEnd(20)}</Text><Text bold color={t.positive as any}>{fmtPct(swrResult.safeWithdrawalRate)}</Text></Box>
          <Box gap={1}><Text>{'Success Rate (4%)'.padEnd(20)}</Text><Text color={(swrResult.successRate >= 0.95 ? t.positive : t.negative) as any}>{fmtPct(swrResult.successRate)}</Text></Box>
          <Box gap={1}><Text>{'Median Final (4%)'.padEnd(20)}</Text><Text>{fmtMoney(swrResult.medianFinalBalance)}</Text></Box>
          <Box gap={1}><Text>{'Worst Case (4%)'.padEnd(20)}</Text><Text color={t.negative as any}>{fmtMoney(swrResult.worstCaseFinalBalance)}</Text></Box>
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
                  <Text color={(pct >= 1 ? t.positive : pct >= 0.8 ? t.warning : t.negative) as any}>{fmtPct(pct).padStart(10)}</Text>
                  <Text color={(pct >= 1 ? t.positive : pct >= 0.8 ? t.warning : t.negative) as any}>  {bar}</Text>
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
              <Text color={(p.success ? t.positive : t.negative) as any}>{(p.success ? 'OK' : 'FAIL').padEnd(8)}</Text>
              <Text>{fmtMoney(p.finalBalance).padStart(15)}</Text>
              <Text color={(p.minBalance < 0 ? t.negative : t.text) as any}>{fmtMoney(p.minBalance).padStart(13)}</Text>
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

// ─── Compare Results View ────────────────────────────────────────────────────

function CompareResultsView({ results, tab, currency, height }: {
  results: { name: string; result: BacktestResult }[];
  tab: CompareTab; currency: string; height: number;
}) {
  const t = useTheme();
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);
  const fmtNum = (v: number) => v.toFixed(2);

  return (
    <Box flexDirection="column">
      <TabBar tabs={COMPARE_TABS} active={tab} />
      {tab === 'table' && (
        <Box flexDirection="column">
          <Box gap={1}>
            <Text bold>{'Metric'.padEnd(16)}</Text>
            {results.map((r) => (
              <Text key={r.name} bold>{truncate(r.name, 14).padStart(14)}</Text>
            ))}
          </Box>
          {([
            ['CAGR', (r: BacktestResult) => r.metrics.cagr, fmtPct, true],
            ['Total Return', (r: BacktestResult) => r.metrics.totalReturn, fmtPct, true],
            ['Final Capital', (r: BacktestResult) => r.metrics.finalCapital, fmtMoney, true],
            ['Std Dev', (r: BacktestResult) => r.metrics.stdDevAnnualized, fmtPct, false],
            ['Max Drawdown', (r: BacktestResult) => r.metrics.maxDrawdown, fmtPct, true],
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
                  <Text key={results[i].name} color={(i === bestIdx ? t.positive : t.text) as any} bold={i === bestIdx}>
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
          {(() => {
            const maxWidth = (process.stdout.columns || 80) - Y_AXIS_OFFSET - 2;
            const chartH = Math.max(height - 10, 8);
            const series = results.map((r) => {
              const values = r.result.timeSeries.map((p) => p.portfolioValue);
              return downsample(values, maxWidth);
            });
            const dates = results[0].result.timeSeries.map((p) => p.date);
            const sampledDates = downsampleDates(dates, maxWidth);
            const formatVal = (v: number) => {
              if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
              if (v >= 1_000) return `${(v / 1_000).toFixed(0)}K`;
              return v.toFixed(0);
            };
            const chart = asciichart.plot(series, {
              height: chartH,
              colors: [...t.chartAsciiColors].slice(0, results.length),
              symbols: CHART_SYMBOLS,
              format: (v: number) => formatVal(v).padStart(8),
            });
            const xAxis = buildXAxis(sampledDates, series[0].length, Y_AXIS_OFFSET);
            return (
              <>
                <Box gap={2} marginBottom={1}>
                  {results.map((r, i) => (
                    <Text key={r.name} color={t.chartColors[i] as any}>
                      ■ {truncate(r.name, 30)}
                    </Text>
                  ))}
                </Box>
                <Text>{chart}</Text>
                <Text dimColor>{xAxis}</Text>
              </>
            );
          })()}
        </Box>
      )}
    </Box>
  );
}

// ─── Tab Bar ─────────────────────────────────────────────────────────────────

function TabBar<T extends string>({ tabs, active }: { tabs: { key: T; label: string }[]; active: T }) {
  const t = useTheme();
  return (
    <Box gap={2} marginBottom={1}>
      {tabs.map((tb) => (
        <Text key={tb.key} bold={active === tb.key} color={(active === tb.key ? t.accent : t.muted) as any}>
          {active === tb.key ? `[${tb.label}]` : ` ${tb.label} `}
        </Text>
      ))}
    </Box>
  );
}

// ─── Metrics Panel ───────────────────────────────────────────────────────────

function MetricsPanel({ metrics, currency }: { metrics: BacktestResult['metrics']; currency: string }) {
  const t = useTheme();
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtMoney = (v: number) =>
    new Intl.NumberFormat('en', { style: 'currency', currency, maximumFractionDigits: 0 }).format(v);

  const rows: [string, string, string][] = [
    ['CAGR', fmtPct(metrics.cagr), metrics.cagr >= 0 ? t.positive : t.negative],
    ['Total Return', fmtPct(metrics.totalReturn), metrics.totalReturn >= 0 ? t.positive : t.negative],
    ['Final Capital', fmtMoney(metrics.finalCapital), t.text],
    ['Std Dev (Ann.)', fmtPct(metrics.stdDevAnnualized), t.warning],
    ['Max Drawdown', fmtPct(metrics.maxDrawdown), t.negative],
    ['Sharpe Ratio', metrics.sharpeRatio.toFixed(2), metrics.sharpeRatio >= 0 ? t.positive : t.negative],
    ['Sortino Ratio', metrics.sortinoRatio.toFixed(2), metrics.sortinoRatio >= 0 ? t.positive : t.negative],
    ['Best Year', `${metrics.bestYear.year}  ${fmtPct(metrics.bestYear.return)}`, t.positive],
    ['Worst Year', `${metrics.worstYear.year}  ${fmtPct(metrics.worstYear.return)}`, t.negative],
    ['Positive Months', fmtPct(metrics.positiveMonthsPct), t.text],
    ['Rolling 3Y Best', fmtPct(metrics.rolling3YrBest), t.positive],
    ['Rolling 3Y Worst', fmtPct(metrics.rolling3YrWorst), t.negative],
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

  const maxWidth = (process.stdout.columns || 80) - Y_AXIS_OFFSET - 2;
  const chartHeight = Math.max(height - 6, 8);
  const values = timeSeries.map((p) => p.portfolioValue);
  const dates = timeSeries.map((p) => p.date);
  const sampled = downsample(values, maxWidth);
  const sampledDates = downsampleDates(dates, maxWidth);
  const formatVal = (v: number) => {
    if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
    if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
    return v.toFixed(0);
  };
  const chart = asciichart.plot(sampled, { height: chartHeight, symbols: CHART_SYMBOLS, format: (v: number) => formatVal(v).padStart(8) });
  const xAxis = buildXAxis(sampledDates, sampled.length, Y_AXIS_OFFSET);

  return (
    <Box flexDirection="column">
      <Text>{chart}</Text>
      <Text dimColor>{xAxis}</Text>
    </Box>
  );
}

// ─── Monte Carlo Panel ───────────────────────────────────────────────────────

function MonteCarloPanel({ result, years }: { result: BacktestResult; years: number }) {
  const t = useTheme();
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

  const pctColor = (p: number) => (p >= 50 ? t.positive : p >= 25 ? t.warning : t.negative) as any;

  return (
    <Box flexDirection="column">
      <Text bold>Monte Carlo Simulation — {years} Year Projection  (+/-: change)</Text>
      <Text dimColor>1000 simulations, bootstrap sampling from historical returns</Text>
      <Box marginTop={1} flexDirection="column">
        <Box gap={1}><Text>{'Prob. Positive'.padEnd(22)}</Text><Text bold color={t.positive as any}>{(mc.probabilityPositive * 100).toFixed(1)}%</Text></Box>
        <Box gap={1}><Text>{'Prob. Beat Inflation'.padEnd(22)}</Text><Text bold color={t.info as any}>{(mc.probabilityBeatInflation * 100).toFixed(1)}%</Text></Box>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Text bold>Percentile Outcomes:</Text>
        {[10, 25, 50, 75, 90].map((p) => (
          <Box key={p} gap={1}>
            <Text>{`${p}th percentile`.padEnd(22)}</Text>
            <Text color={pctColor(p)}>
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
              <Text key={p} color={pctColor(p)}>
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
  const t = useTheme();
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
            <Text color={(ret >= 0 ? t.positive : t.negative) as any}>{pct}</Text>
            <Text color={(ret >= 0 ? t.positive : t.negative) as any}>  {ret < 0 ? '-' : ' '}{bar}</Text>
          </Box>
        );
      })}
    </Box>
  );
}

// ─── Holdings Panel ──────────────────────────────────────────────────────────

function HoldingsPanel({ holdings }: { holdings: BacktestResult['parameters']['portfolio']['holdings'] }) {
  const t = useTheme();
  return (
    <Box flexDirection="column">
      <Box gap={1} marginBottom={1}>
        <Text bold>{'Symbol'.padEnd(8)}</Text>
        <Text bold>{'Weight'.padStart(7)}</Text>
        <Text bold>  Name</Text>
      </Box>
      {holdings.map((h) => (
        <Box key={h.asset.symbol} gap={1}>
          <Text color={t.accent as any}>{h.asset.symbol.padEnd(8)}</Text>
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

function downsampleDates(dates: string[], targetLen: number): string[] {
  if (dates.length <= targetLen) return dates;
  const step = (dates.length - 1) / (targetLen - 1);
  const result: string[] = [];
  for (let i = 0; i < targetLen; i++) {
    result.push(dates[Math.round(i * step)]);
  }
  return result;
}

function buildXAxis(dates: string[], chartWidth: number, axisOffset: number): string {
  const labelCount = Math.max(Math.floor(chartWidth / 10), 2);
  const step = (dates.length - 1) / (labelCount - 1);
  const axis = new Array(chartWidth).fill(' ');

  for (let i = 0; i < labelCount; i++) {
    const dataIdx = Math.round(i * step);
    const label = dates[dataIdx]?.slice(0, 7) ?? '';
    const pos = dataIdx;
    if (pos + label.length <= chartWidth) {
      for (let c = 0; c < label.length; c++) {
        axis[pos + c] = label[c];
      }
    }
  }

  return ' '.repeat(axisOffset) + axis.join('');
}

const Y_AXIS_OFFSET = 10;

const CHART_SYMBOLS: [string, string, string, string, string, string, string, string, string, string] =
  ['┼', '┤', '╶', '╴', '─', '└', '┌', '┐', '┘', '│'];

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
