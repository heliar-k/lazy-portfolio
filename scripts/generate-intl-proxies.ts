/**
 * Generate international proxy data CSV files using Yahoo Finance.
 *
 * Fetches historical monthly prices for international equity and bond ETFs
 * and saves them as proxy CSV files in public/data/proxies/.
 *
 * Requires a local proxy to access Yahoo Finance from restricted regions.
 * Set PROXY_URL env var or defaults to http://127.0.0.1:7890.
 *
 * Usage: npx tsx scripts/generate-intl-proxies.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:7890';

// Set up global proxy for all fetch() calls
setGlobalDispatcher(new ProxyAgent(PROXY_URL));

const DATA_DIR = path.resolve('public/data/proxies');
const INFLATION_DIR = path.resolve('public/data/inflation');
const VERSION_FILE = path.resolve('public/data/data_version.json');

interface HistPoint {
  date: string;
  price: number;
}

// ETFs to fetch as equity proxies
const EQUITY_ETFS: { symbol: string; proxyName: string; currency: string; region: string }[] = [
  { symbol: 'EWJ', proxyName: 'topix_tr', currency: 'JPY', region: 'JP' },
  { symbol: 'EWG', proxyName: 'euro_stoxx50_tr', currency: 'EUR', region: 'EU' },
  { symbol: 'EWU', proxyName: 'ftse100_tr', currency: 'GBP', region: 'UK' },
  { symbol: 'EWC', proxyName: 'canada_equity_tr', currency: 'CAD', region: 'CA' },
  { symbol: 'EWA', proxyName: 'australia_equity_tr', currency: 'AUD', region: 'AU' },
  { symbol: 'FXI', proxyName: 'csi300_tr', currency: 'CNY', region: 'CN' },
  { symbol: 'EWZ', proxyName: 'brazil_equity_tr', currency: 'BRL', region: 'BR' },
  { symbol: 'INDA', proxyName: 'india_equity_tr', currency: 'INR', region: 'IN' },
];

// Bond ETFs
const BOND_ETFS: { symbol: string; proxyName: string; currency: string; region: string }[] = [
  { symbol: 'IGOV', proxyName: 'intl_treasury_tr', currency: 'USD', region: 'GLOBAL' },
  { symbol: 'BNDX', proxyName: 'intl_agg_bond_tr', currency: 'USD', region: 'GLOBAL' },
  { symbol: 'EMB', proxyName: 'em_bond_tr', currency: 'USD', region: 'GLOBAL' },
  { symbol: 'BWX', proxyName: 'intl_govt_bond_tr', currency: 'USD', region: 'GLOBAL' },
];

// Currency-specific bond approximations
const REGIONAL_BOND_ETFS: { symbol: string; proxyName: string; currency: string; region: string }[] = [
  { symbol: 'BNDX', proxyName: 'eu_govt_bond_tr', currency: 'EUR', region: 'EU' },
];

async function fetchYahooHistory(symbol: string, maxMonths = 600): Promise<HistPoint[]> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&range=max`;
  console.log(`  Fetching ${symbol}...`);

  try {
    const res = await fetch(url);
    if (!res.ok) {
      console.log(`    HTTP ${res.status} for ${symbol}`);
      return [];
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result) {
      console.log(`    No data for ${symbol}`);
      return [];
    }

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close ?? [];

    const points: HistPoint[] = [];
    for (let i = 0; i < Math.min(timestamps.length, quotes.length); i++) {
      if (quotes[i] === null || quotes[i] === undefined || quotes[i] <= 0) continue;
      const date = new Date(timestamps[i] * 1000);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, date.getMonth() + 1, 0).getDate();
      const d = String(lastDay).padStart(2, '0');
      points.push({
        date: `${y}-${m}-${d}`,
        price: quotes[i],
      });
    }

    if (points.length > maxMonths) {
      return points.slice(points.length - maxMonths);
    }

    console.log(`    Got ${points.length} months (${points[0]?.date} to ${points[points.length - 1]?.date})`);
    return points;
  } catch (err) {
    console.log(`    Error: ${(err as Error).message}`);
    return [];
  }
}

function saveProxyCSV(dir: string, filename: string, data: HistPoint[]): void {
  if (data.length === 0) {
    console.log(`  Skipping ${filename} (no data)`);
    return;
  }

  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const lines = ['date,price'];
  for (const p of data) {
    lines.push(`${p.date},${p.price}`);
  }

  fs.writeFileSync(path.join(dir, filename), lines.join('\n'));
  console.log(`  Saved ${filename} (${data.length} rows: ${data[0]?.date} to ${data[data.length - 1]?.date})`);
}

function updateDataVersion(): void {
  const today = new Date().toISOString().slice(0, 10);
  fs.writeFileSync(VERSION_FILE, JSON.stringify({
    version: 1,
    lastUpdated: today,
    description: 'International proxy data from Yahoo Finance (real ETF data)',
  }, null, 2));
}

// ---------------------------------------------------------------------------
// CPI data generation (offline — based on known annual inflation rates)
// ---------------------------------------------------------------------------

function generateCPI(
  filename: string,
  startYear: number,
  startMonth: number,
  annualRates: { year: number; rate: number }[],
): void {
  const lines = ['date,value'];
  let cpi = 100;
  const endYear = 2026;
  const endMonth = 4;

  for (let y = startYear; y <= endYear; y++) {
    for (let m = 1; m <= 12; m++) {
      if (y === startYear && m < startMonth) continue;
      if (y === endYear && m > endMonth) break;

      const rate = annualRates.find(r => r.year === y)?.rate ?? 0.02;
      const monthlyRate = Math.pow(1 + rate, 1 / 12) - 1;
      cpi *= (1 + monthlyRate);

      const lastDay = new Date(y, m, 0).getDate();
      const date = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
      lines.push(`${date},${cpi.toFixed(2)}`);
    }
  }

  if (!fs.existsSync(INFLATION_DIR)) {
    fs.mkdirSync(INFLATION_DIR, { recursive: true });
  }
  fs.writeFileSync(path.join(INFLATION_DIR, filename), lines.join('\n'));
  console.log(`  Saved ${filename}`);
}

function generateAllCPI(): void {
  // China CPI (approximate annual rates based on World Bank data)
  generateCPI('cn_cpi.csv', 1994, 1, [
    { year: 1994, rate: 0.241 }, { year: 1995, rate: 0.171 }, { year: 1996, rate: 0.083 },
    { year: 1997, rate: 0.028 }, { year: 1998, rate: -0.008 }, { year: 1999, rate: -0.014 },
    { year: 2000, rate: 0.004 }, { year: 2001, rate: 0.007 }, { year: 2002, rate: -0.008 },
    { year: 2003, rate: 0.012 }, { year: 2004, rate: 0.039 }, { year: 2005, rate: 0.018 },
    { year: 2006, rate: 0.015 }, { year: 2007, rate: 0.048 }, { year: 2008, rate: 0.059 },
    { year: 2009, rate: -0.007 }, { year: 2010, rate: 0.033 }, { year: 2011, rate: 0.054 },
    { year: 2012, rate: 0.026 }, { year: 2013, rate: 0.026 }, { year: 2014, rate: 0.020 },
    { year: 2015, rate: 0.014 }, { year: 2016, rate: 0.020 }, { year: 2017, rate: 0.016 },
    { year: 2018, rate: 0.021 }, { year: 2019, rate: 0.029 }, { year: 2020, rate: 0.025 },
    { year: 2021, rate: 0.009 }, { year: 2022, rate: 0.020 }, { year: 2023, rate: 0.002 },
    { year: 2024, rate: 0.005 }, { year: 2025, rate: 0.008 }, { year: 2026, rate: 0.010 },
  ]);

  // Eurozone HICP (approximate)
  generateCPI('eu_cpi.csv', 1997, 1, [
    { year: 1997, rate: 0.017 }, { year: 1998, rate: 0.012 }, { year: 1999, rate: 0.012 },
    { year: 2000, rate: 0.021 }, { year: 2001, rate: 0.024 }, { year: 2002, rate: 0.023 },
    { year: 2003, rate: 0.021 }, { year: 2004, rate: 0.021 }, { year: 2005, rate: 0.022 },
    { year: 2006, rate: 0.022 }, { year: 2007, rate: 0.021 }, { year: 2008, rate: 0.033 },
    { year: 2009, rate: 0.003 }, { year: 2010, rate: 0.016 }, { year: 2011, rate: 0.027 },
    { year: 2012, rate: 0.025 }, { year: 2013, rate: 0.013 }, { year: 2014, rate: 0.004 },
    { year: 2015, rate: 0.000 }, { year: 2016, rate: 0.002 }, { year: 2017, rate: 0.015 },
    { year: 2018, rate: 0.018 }, { year: 2019, rate: 0.012 }, { year: 2020, rate: 0.003 },
    { year: 2021, rate: 0.026 }, { year: 2022, rate: 0.084 }, { year: 2023, rate: 0.054 },
    { year: 2024, rate: 0.024 }, { year: 2025, rate: 0.022 }, { year: 2026, rate: 0.020 },
  ]);

  // Japan CPI (approximate)
  generateCPI('jp_cpi.csv', 1970, 1, [
    { year: 1970, rate: 0.069 }, { year: 1971, rate: 0.064 }, { year: 1972, rate: 0.048 },
    { year: 1973, rate: 0.118 }, { year: 1974, rate: 0.232 }, { year: 1975, rate: 0.118 },
    { year: 1976, rate: 0.094 }, { year: 1977, rate: 0.082 }, { year: 1978, rate: 0.042 },
    { year: 1979, rate: 0.037 }, { year: 1980, rate: 0.078 }, { year: 1981, rate: 0.049 },
    { year: 1982, rate: 0.027 }, { year: 1983, rate: 0.019 }, { year: 1984, rate: 0.023 },
    { year: 1985, rate: 0.020 }, { year: 1986, rate: 0.006 }, { year: 1987, rate: 0.001 },
    { year: 1988, rate: 0.007 }, { year: 1989, rate: 0.023 }, { year: 1990, rate: 0.031 },
    { year: 1991, rate: 0.033 }, { year: 1992, rate: 0.017 }, { year: 1993, rate: 0.013 },
    { year: 1994, rate: 0.007 }, { year: 1995, rate: -0.001 }, { year: 1996, rate: 0.001 },
    { year: 1997, rate: 0.018 }, { year: 1998, rate: 0.006 }, { year: 1999, rate: -0.003 },
    { year: 2000, rate: -0.007 }, { year: 2001, rate: -0.008 }, { year: 2002, rate: -0.009 },
    { year: 2003, rate: -0.003 }, { year: 2004, rate: 0.000 }, { year: 2005, rate: -0.003 },
    { year: 2006, rate: 0.003 }, { year: 2007, rate: 0.000 }, { year: 2008, rate: 0.014 },
    { year: 2009, rate: -0.013 }, { year: 2010, rate: -0.007 }, { year: 2011, rate: -0.003 },
    { year: 2012, rate: 0.000 }, { year: 2013, rate: 0.004 }, { year: 2014, rate: 0.027 },
    { year: 2015, rate: 0.008 }, { year: 2016, rate: -0.001 }, { year: 2017, rate: 0.005 },
    { year: 2018, rate: 0.010 }, { year: 2019, rate: 0.005 }, { year: 2020, rate: 0.000 },
    { year: 2021, rate: -0.002 }, { year: 2022, rate: 0.025 }, { year: 2023, rate: 0.033 },
    { year: 2024, rate: 0.027 }, { year: 2025, rate: 0.020 }, { year: 2026, rate: 0.015 },
  ]);

  // UK CPI (approximate)
  generateCPI('uk_cpi.csv', 1988, 1, [
    { year: 1988, rate: 0.049 }, { year: 1989, rate: 0.078 }, { year: 1990, rate: 0.095 },
    { year: 1991, rate: 0.059 }, { year: 1992, rate: 0.037 }, { year: 1993, rate: 0.016 },
    { year: 1994, rate: 0.025 }, { year: 1995, rate: 0.034 }, { year: 1996, rate: 0.025 },
    { year: 1997, rate: 0.031 }, { year: 1998, rate: 0.034 }, { year: 1999, rate: 0.015 },
    { year: 2000, rate: 0.030 }, { year: 2001, rate: 0.018 }, { year: 2002, rate: 0.013 },
    { year: 2003, rate: 0.014 }, { year: 2004, rate: 0.013 }, { year: 2005, rate: 0.021 },
    { year: 2006, rate: 0.023 }, { year: 2007, rate: 0.023 }, { year: 2008, rate: 0.036 },
    { year: 2009, rate: 0.022 }, { year: 2010, rate: 0.033 }, { year: 2011, rate: 0.045 },
    { year: 2012, rate: 0.028 }, { year: 2013, rate: 0.026 }, { year: 2014, rate: 0.015 },
    { year: 2015, rate: 0.000 }, { year: 2016, rate: 0.007 }, { year: 2017, rate: 0.027 },
    { year: 2018, rate: 0.025 }, { year: 2019, rate: 0.018 }, { year: 2020, rate: 0.009 },
    { year: 2021, rate: 0.026 }, { year: 2022, rate: 0.091 }, { year: 2023, rate: 0.073 },
    { year: 2024, rate: 0.033 }, { year: 2025, rate: 0.025 }, { year: 2026, rate: 0.022 },
  ]);
}

// =========================================================================
// Main
// =========================================================================

async function main() {
  console.log('=== Generating International Proxy Data ===\n');
  console.log(`Proxy: ${PROXY_URL}\n`);

  // Equity proxies
  console.log('[1/3] International equity proxies:');
  const equityDir = path.join(DATA_DIR, 'equity');
  for (const etf of EQUITY_ETFS) {
    const data = await fetchYahooHistory(etf.symbol);
    saveProxyCSV(equityDir, `${etf.proxyName}.csv`, data);
    // Rate limit
    await new Promise(r => setTimeout(r, 750));
  }

  // Bond proxies
  console.log('\n[2/3] International bond proxies:');
  const bondDir = path.join(DATA_DIR, 'bond');
  for (const etf of [...BOND_ETFS, ...REGIONAL_BOND_ETFS]) {
    const data = await fetchYahooHistory(etf.symbol);
    saveProxyCSV(bondDir, `${etf.proxyName}.csv`, data);
    await new Promise(r => setTimeout(r, 750));
  }

  // CPI data
  console.log('\n[3/3] International CPI data:');
  generateAllCPI();

  // Update version
  updateDataVersion();
  console.log('\nDone. Data version updated.');
}

main().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});
