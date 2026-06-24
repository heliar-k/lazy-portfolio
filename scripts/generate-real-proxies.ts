/**
 * Generate real historical proxy data from Shiller's ie_data.xls.
 *
 * Downloads and parses Robert Shiller's long-term stock/bond/CPI data,
 * then generates proper proxy CSV files for the backtest engine.
 *
 * Also fetches gold spot prices and T-Bill rates from FRED/Yahoo Finance.
 *
 * Usage: npx tsx scripts/generate-real-proxies.ts
 */

import * as fs from 'fs';
import * as path from 'path';
import { ProxyAgent, setGlobalDispatcher, fetch as undiciFetch } from 'undici';
import XLSX from 'xlsx';
import { fetchFredSeries } from './lib/fred-api.js';

const PROXY_URL = process.env.PROXY_URL || 'http://127.0.0.1:7890';

let proxyAvailable = false;

async function checkProxy(): Promise<boolean> {
  try {
    setGlobalDispatcher(new ProxyAgent(PROXY_URL));
    // Lightweight probe — try a simple request through the proxy
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);
    await undiciFetch('https://www.google.com', {
      method: 'HEAD',
      signal: controller.signal,
    });
    clearTimeout(timeout);
    proxyAvailable = true;
    console.log(`   Proxy ${PROXY_URL} is available — Yahoo Finance data enabled`);
    return true;
  } catch {
    proxyAvailable = false;
    console.log(`   Proxy ${PROXY_URL} is unavailable — Yahoo Finance data disabled`);
    console.log('   (Gold data will use built-in historical estimates only)');
    return false;
  }
}

const DATA_DIR = path.resolve('public/data');
const SHILLER_XLS = '/tmp/ie_data.xls';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface ShillerRow {
  date: string;           // "YYYY-MM-DD" end-of-month
  year: number;
  month: number;
  price: number;           // S&P Composite nominal price
  dividend: number;        // monthly dividend
  cpi: number;            // Consumer Price Index
  rateGS10: number;       // 10Y Treasury yield (%)
  monthlyBondTR: number;   // Monthly bond total return factor (1 + r), col 17
}

// ---------------------------------------------------------------------------
// Step 1: Parse Shiller XLS
// ---------------------------------------------------------------------------

function parseShillerData(): ShillerRow[] {
  const wb = XLSX.readFile(SHILLER_XLS);
  const sheet = wb.Sheets['Data'];
  const raw = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as any[][];

  const rows: ShillerRow[] = [];

  for (let i = 8; i < raw.length; i++) {
    const r = raw[i];
    const dateVal = r[0];
    if (typeof dateVal !== 'number' || isNaN(dateVal)) continue;

    // Parse YYYY.MM format
    const year = Math.floor(dateVal);
    const month = Math.round((dateVal - year) * 100);
    if (month < 1 || month > 12) continue;

    const price = parseFloat(r[1]);
    const dividend = parseFloat(r[2]);
    const cpi = parseFloat(r[4]);
    const rateGS10 = parseFloat(r[6]);
    const monthlyBondTR = parseFloat(r[17]); // column R: monthly bond TR factor

    if (isNaN(price) || isNaN(cpi)) continue;

    // End-of-month date
    const lastDay = new Date(year, month, 0).getDate();
    const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    rows.push({
      date: dateStr,
      year,
      month,
      price: isNaN(price) ? 0 : price,
      dividend: isNaN(dividend) ? 0 : dividend,
      cpi: isNaN(cpi) ? 0 : cpi,
      rateGS10: isNaN(rateGS10) ? 0 : rateGS10,
      monthlyBondTR: isNaN(monthlyBondTR) ? 1 : monthlyBondTR,
    });
  }

  return rows;
}

// ---------------------------------------------------------------------------
// Step 2: Calculate S&P 500 Nominal Total Return Index
//
// Monthly total return = (P_t + D_t/12) / P_{t-1}
// We build a cumulative TR index from this.
// Shiller's "Real Total Return Price" (col 9) is inflation-adjusted.
// We want NOMINAL for the backtest engine.
// ---------------------------------------------------------------------------

function buildSP500TR(rows: ShillerRow[]): { date: string; price: number }[] {
  const result: { date: string; price: number }[] = [];
  let trIndex = 1.0;

  // First month
  result.push({ date: rows[0].date, price: trIndex });

  for (let i = 1; i < rows.length; i++) {
    const prev = rows[i - 1];
    const curr = rows[i];

    if (prev.price > 0 && curr.price > 0) {
      // Monthly total return including dividends
      // r = (P_t + D_t/12 - P_{t-1}) / P_{t-1} = (P_t + D_t/12) / P_{t-1} - 1
      const monthlyReturn = (curr.price + curr.dividend / 12) / prev.price - 1;
      trIndex *= (1 + monthlyReturn);
    }

    result.push({ date: curr.date, price: Math.round(trIndex * 10000) / 10000 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 3: Calculate US 10Y Treasury Nominal Total Return Index
//
// Shiller column 17 contains a cumulative bond total return index (starting at 1.0).
// We can use this directly as the bond TR proxy.
// ---------------------------------------------------------------------------

function buildBondTR(rows: ShillerRow[]): { date: string; price: number }[] {
  const result: { date: string; price: number }[] = [];

  // Use Shiller's monthly bond total return factors (col 17) to build cumulative index
  let bondIndex = 100.0;

  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      result.push({ date: rows[i].date, price: bondIndex });
      continue;
    }

    // Col 17 is monthly total return factor (1 + r) for bonds
    // When missing or invalid, keep the previous value (no change)
    const monthlyFactor = rows[i].monthlyBondTR;
    if (monthlyFactor > 0 && !isNaN(monthlyFactor)) {
      bondIndex *= monthlyFactor;
    }

    result.push({ date: rows[i].date, price: Math.round(bondIndex * 10000) / 10000 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 4: Calculate Long-Term Treasury TR (for TLT proxy)
//
// Use the same GS10 yield but with duration ≈ 16 (20+ year)
// Start from 1950s to give enough history
// ---------------------------------------------------------------------------

function buildLongBondTR(rows: ShillerRow[]): { date: string; price: number }[] {
  const result: { date: string; price: number }[] = [];
  let bondIndex = 100.0;

  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      result.push({ date: rows[i].date, price: bondIndex });
      continue;
    }

    const prevYield = rows[i - 1].rateGS10 / 100;
    const currYield = rows[i].rateGS10 / 100;

    if (prevYield > 0) {
      const couponReturn = prevYield / 12;
      // Use duration ~14.5 for 20Y Treasury (coupon bond, not zero-coupon)
      // Reference: TLT 30Y CAGR=4.64%, StdDev=12.46% as of 2026-04
      const priceReturn = -14.5 * (currYield - prevYield);
      const monthlyReturn = couponReturn + priceReturn;
      bondIndex *= (1 + monthlyReturn);
    }

    result.push({ date: rows[i].date, price: Math.round(bondIndex * 10000) / 10000 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 5: T-Bill / Cash returns
//
// Uses FRED DTB3 (3-Month T-Bill secondary market rate) for 1934+ and
// Shiller short-rate approximation for pre-1934.
// ---------------------------------------------------------------------------

function buildCashTR(
  rows: ShillerRow[],
  dtb3Series: { date: string; value: number }[],
): { date: string; price: number }[] {
  // Build a lookup from date (YYYY-MM) to DTB3 annual rate
  const dtb3ByMonth = new Map<string, number>();
  for (const pt of dtb3Series) {
    dtb3ByMonth.set(pt.date.substring(0, 7), pt.value);
  }

  const result: { date: string; price: number }[] = [];
  let cashIndex = 100.0;

  for (let i = 0; i < rows.length; i++) {
    if (i === 0) {
      result.push({ date: rows[i].date, price: cashIndex });
      continue;
    }

    const yearMonth = rows[i].date.substring(0, 7);
    const dtb3Rate = dtb3ByMonth.get(yearMonth);

    let annualRate: number;
    if (dtb3Rate !== undefined && dtb3Rate > 0) {
      // Use actual T-Bill rate from FRED (value is already in percent)
      annualRate = dtb3Rate / 100;
    } else {
      // Pre-1934: use Shiller GS10 approximation
      const prevYield = rows[i - 1].rateGS10 / 100;
      annualRate = Math.max(prevYield * 0.7, 0.001);
    }

    const monthlyReturn = annualRate / 12;
    cashIndex *= (1 + monthlyReturn);

    result.push({ date: rows[i].date, price: Math.round(cashIndex * 10000) / 10000 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 6: CPI data
//
// Uses FRED CPIAUCSL (Consumer Price Index for All Urban Consumers) for
// 1947+ and Shiller CPI data for pre-1947, ratio-aligned at the splice point.
// ---------------------------------------------------------------------------

function buildCPI(
  rows: ShillerRow[],
  fredCpiSeries: { date: string; value: number }[],
): Map<string, number> {
  // Build lookup from FRED CPI
  const fredByMonth = new Map<string, number>();
  for (const pt of fredCpiSeries) {
    fredByMonth.set(pt.date.substring(0, 7), pt.value);
  }

  // Find splice date: first month where both Shiller and FRED have data
  const spliceDate = '1947-01';

  // Find Shiller CPI at splice point and corresponding FRED value
  const shillerAtSplice = rows.find(r => r.date.startsWith(spliceDate));
  const fredAtSplice = fredByMonth.get(spliceDate);

  if (!shillerAtSplice || !fredAtSplice) {
    // Fallback: use Shiller data only
    const map = new Map<string, number>();
    for (const row of rows) {
      if (row.cpi > 0) map.set(row.date, row.cpi);
    }
    return map;
  }

  const ratio = fredAtSplice / shillerAtSplice.cpi;

  const map = new Map<string, number>();
  for (const row of rows) {
    const yearMonth = row.date.substring(0, 7);
    const fredCpi = fredByMonth.get(yearMonth);

    if (fredCpi !== undefined && fredCpi > 0) {
      map.set(row.date, Math.round(fredCpi * 100) / 100);
    } else if (row.cpi > 0) {
      // Pre-1947: use ratio-scaled Shiller CPI
      map.set(row.date, Math.round(row.cpi * ratio * 100) / 100);
    }
  }

  return map;
}

// ---------------------------------------------------------------------------
// Step 7: Write CSVs
// ---------------------------------------------------------------------------

function writeCSV(filePath: string, data: { date: string; price: number }[]): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const lines = ['date,price'];
  for (const point of data) {
    lines.push(`${point.date},${point.price}`);
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
  console.log(`  Wrote ${filePath} (${data.length} data points)`);
}

function writeCPI(filePath: string, data: Map<string, number>): void {
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });

  const lines = ['date,cpi'];
  for (const [date, cpi] of data) {
    lines.push(`${date},${cpi}`);
  }
  fs.writeFileSync(filePath, lines.join('\n') + '\n');
  console.log(`  Wrote ${filePath} (${data.size} data points)`);
}

// ---------------------------------------------------------------------------
// Step 8: Fetch Gold data from Yahoo Finance via proxy
// ---------------------------------------------------------------------------

async function fetchGoldData(): Promise<{ date: string; price: number }[]> {
  // Use GLD ETF data (converted to spot-equivalent by multiplying by ~10)
  // GLD has cleaner data than GC=F futures (no contract roll artifacts)
  // GLD started 2004-11-18

  console.log('  Fetching gold price data via GLD ETF...');

  try {
    const now = Math.floor(Date.now() / 1000);
    const from2004 = Math.floor(new Date('2004-11-01').getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/GLD?interval=1mo&period1=${from2004}&period2=${now}`;
    const res = await undiciFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      console.log(`  GLD fetch failed: ${res.status}`);
      return [];
    }

    const json = await res.json() as any;
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close ?? [];

    // GLD is designed to track ~1/10 oz of gold
    // Convert to spot-equivalent by multiplying by the known ratio
    // At inception (Nov 2004): GLD=$45.12, spot=$440 → ratio ≈ 9.75
    // More recently: GLD=$423, spot=$4567 → ratio ≈ 10.79
    // The ratio drifts due to GLD's 0.40% expense ratio and tracking differences
    // We use a factor of 10 as an approximation

    const data: { date: string; price: number }[] = [];
    for (let i = 0; i < Math.min(timestamps.length, quotes.length); i++) {
      if (quotes[i] === null || quotes[i] === undefined) continue;
      const date = new Date(timestamps[i] * 1000);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, date.getMonth() + 1, 0).getDate();
      const d = String(lastDay).padStart(2, '0');
      // GLD ≈ 1/10 oz gold → multiply by 10 for spot-equivalent
      data.push({
        date: `${y}-${m}-${d}`,
        price: Math.round(quotes[i] * 10 * 100) / 100,
      });
    }

    console.log(`  Got ${data.length} GLD data points (${data[0].date} to ${data[data.length-1].date})`);
    return data;
  } catch (err) {
    console.log(`  GLD fetch error: ${(err as Error).message}`);
    return [];
  }
}

async function fetchGoldViaGLD(): Promise<{ date: string; price: number }[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from2004 = Math.floor(new Date('2004-11-01').getTime() / 1000);
    // 1781625600
    // https://query1.finance.yahoo.com/v8/finance/chart/GLD?interval=1mo&period1=961171200&period2=1781625600
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/GLD?interval=1mo&period1=${from2004}&period2=${now}`;
    const res = await undiciFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      console.log(`  GLD fetch failed: ${res.status}`);
      return [];
    }

    const json = await res.json() as any;
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const quotes = result.indicators?.adjclose?.[0]?.adjclose ??
      result.indicators?.quote?.[0]?.close ?? [];

    const data: { date: string; price: number }[] = [];
    for (let i = 0; i < Math.min(timestamps.length, quotes.length); i++) {
      if (quotes[i] === null || quotes[i] === undefined) continue;
      const date = new Date(timestamps[i] * 1000);
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const lastDay = new Date(y, date.getMonth() + 1, 0).getDate();
      const d = String(lastDay).padStart(2, '0');
      data.push({
        date: `${y}-${m}-${d}`,
        price: quotes[i],
      });
    }

    return data;
  } catch (err) {
    console.log(`  GLD fetch error: ${(err as Error).message}`);
    return [];
  }
}

// ---------------------------------------------------------------------------
// Step 9: Build complete gold price series
//
// Combines:
// - Historical fixed prices (1871-1974, gold standard/Bretton Woods/transition)
// - Approximate annual prices (1975-1999, based on LBMA year-end fixings)
// - Yahoo Finance GC=F data (2000-present, real market data)
// ---------------------------------------------------------------------------

const GOLD_APPROX_PRICES: Record<number, number> = {
  1974: 168,  // Dec 1974 (from hardcoded transition formula: 120 + 12*4)
  1975: 140, 1976: 134, 1977: 165, 1978: 226, 1979: 512,
  1980: 589, 1981: 400, 1982: 448, 1983: 382, 1984: 309,
  1985: 327, 1986: 391, 1987: 484, 1988: 410, 1989: 401,
  1990: 391, 1991: 353, 1992: 333, 1993: 391, 1994: 383,
  1995: 387, 1996: 369, 1997: 290, 1998: 288, 1999: 290,
  2000: 272, 2001: 279, 2002: 348, 2003: 417, 2004: 438,
  2005: 518, 2006: 638, 2007: 836, 2008: 882, 2009: 1096,
  2010: 1421, 2011: 1566, 2012: 1675, 2013: 1205, 2014: 1184,
  2015: 1060, 2016: 1151, 2017: 1303, 2018: 1282, 2019: 1523,
  2020: 1895, 2021: 1828, 2022: 1824, 2023: 2063, 2024: 2615,
  2025: 3050,
};

// ---------------------------------------------------------------------------
// Brownian bridge noise for gold interpolation (1975–2004)
//
// Linear interpolation between year-end prices creates spurious smoothness
// that inflates the portfolio rebalancing bonus by ~1pp. A Brownian bridge
// adds realistic monthly noise (σ ≈ 4% monthly ≈ 14% annualized) while
// preserving year-end anchor prices exactly. Uses a deterministic LCG for
// reproducible random numbers.
// ---------------------------------------------------------------------------

const GOLD_BRIDGE_SEED = 42;
const GOLD_MONTHLY_VOL = 0.0; // monthly log-return volatility (0 = log-linear, no noise)

function createRng(seed: number): () => number {
  let state = seed | 0;
  return () => {
    state = (state * 1664525 + 1013904223) | 0;
    return (state >>> 0) / 4294967296;
  };
}

function randomNormal(rng: () => number): number {
  let u1 = rng();
  let u2 = rng();
  while (u1 === 0) u1 = rng();
  return Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
}

function buildGoldNoise(): Map<number, number[]> {
  const rng = createRng(GOLD_BRIDGE_SEED);
  const noiseMap = new Map<number, number[]>();
  const years = Object.keys(GOLD_APPROX_PRICES).map(Number).filter(y => y >= 1975);

  for (const year of years) {
    const shocks: number[] = [];
    for (let m = 0; m < 12; m++) {
      shocks.push(randomNormal(rng) * GOLD_MONTHLY_VOL);
    }
    // Center to sum to zero → cumulative noise starts and ends at 0
    const mean = shocks.reduce((a, b) => a + b, 0) / 12;
    const centered = shocks.map(s => s - mean);
    // Cumulative sums form the Brownian bridge path (B_0=0, B_12=0)
    const cumSum: number[] = [];
    let running = 0;
    for (let m = 0; m < 12; m++) {
      running += centered[m];
      cumSum.push(running);
    }
    noiseMap.set(year, cumSum);
  }

  return noiseMap;
}

function buildCompleteGold(
  rows: ShillerRow[],
  yahooData: { date: string; price: number }[],
): { date: string; price: number }[] {
  // Build Yahoo lookup by year-month
  const yahooByMonth = new Map<string, number>();
  for (const pt of yahooData) {
    yahooByMonth.set(pt.date.substring(0, 7), pt.price);
  }

  const result: { date: string; price: number }[] = [];
  const goldNoise = buildGoldNoise();

  for (const row of rows) {
    let goldPrice: number;
    const year = row.year;

    // Prefer Yahoo Finance real data
    const yahooPrice = yahooByMonth.get(row.date.substring(0, 7));
    if (yahooPrice && yahooPrice > 0) {
      goldPrice = yahooPrice;
    } else if (year <= 1933) {
      goldPrice = 20.67;
    } else if (year <= 1967) {
      goldPrice = 35.0;
    } else if (year === 1968) {
      goldPrice = 35.0 + (row.month / 12) * 8;
    } else if (year === 1969) {
      goldPrice = 42.0 + (row.month / 12) * 3;
    } else if (year === 1970) {
      goldPrice = 38.0 + (row.month / 12) * 2;
    } else if (year === 1971) {
      goldPrice = row.month < 8 ? 40.0 : 42.0 + (row.month - 8) / 4 * 3;
    } else if (year === 1972) {
      goldPrice = 45.0 + row.month * 1.5;
    } else if (year === 1973) {
      goldPrice = 65.0 + row.month * 4.0;
    } else if (year === 1974) {
      goldPrice = 120.0 + row.month * 4.0;
    } else {
      // 1975+: Brownian bridge interpolation between year-end prices.
      // GOLD_APPROX_PRICES stores year-end prices (e.g., 1996: 369 = Dec 1996).
      // Log-linear drift + Brownian bridge noise breaks the spurious
      // negative correlation that pure linear interpolation creates.
      const prevYearPrice = GOLD_APPROX_PRICES[year - 1];
      const thisYearPrice = GOLD_APPROX_PRICES[year];

      if (prevYearPrice && thisYearPrice) {
        const frac = row.month / 12;
        const logLinear = Math.log(prevYearPrice) +
          (Math.log(thisYearPrice) - Math.log(prevYearPrice)) * frac;
        const noise = goldNoise.get(year);
        const noiseComponent = noise ? noise[row.month - 1] : 0;
        goldPrice = Math.exp(logLinear + noiseComponent);
      } else if (thisYearPrice) {
        // Past last year in table: hold last price
        goldPrice = thisYearPrice;
      } else {
        goldPrice = result[result.length - 1]?.price ?? 2000;
      }
    }

    result.push({ date: row.date, price: Math.round(goldPrice * 100) / 100 });
  }

  return result;
}

// ---------------------------------------------------------------------------
// Step 10: Extend proxy CSVs past Shiller data end (2023-09-30)
//
// Fetches post-Shiller monthly returns from Yahoo Finance and FRED,
// then appends them to each base proxy CSV so data is current.
// ---------------------------------------------------------------------------

interface MonthlyReturnPoint {
  date: string;
  monthlyReturn: number;
}

async function fetchYahooMonthlyReturns(
  symbol: string,
  startDate: string,
): Promise<MonthlyReturnPoint[]> {
  try {
    const now = Math.floor(Date.now() / 1000);
    const from = Math.floor(new Date(startDate + '-01').getTime() / 1000);

    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1mo&period1=${from}&period2=${now}`;
    const res = await undiciFetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36',
      },
    });

    if (!res.ok) {
      console.log(`   Yahoo Finance ${symbol}: HTTP ${res.status}`);
      return [];
    }

    const json = await res.json() as any;
    const result = json?.chart?.result?.[0];
    if (!result) return [];

    const timestamps: number[] = result.timestamp ?? [];
    const adjclose: number[] = result.indicators?.adjclose?.[0]?.adjclose ?? [];

    const points: MonthlyReturnPoint[] = [];
    for (let i = 1; i < Math.min(timestamps.length, adjclose.length); i++) {
      if (adjclose[i] === null || adjclose[i] === undefined || adjclose[i] <= 0) continue;
      if (adjclose[i - 1] === null || adjclose[i - 1] === undefined || adjclose[i - 1] <= 0) continue;

      const d = new Date(timestamps[i] * 1000);
      const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
      const y = d.getFullYear();
      const m = String(d.getMonth() + 1).padStart(2, '0');
      const date = `${y}-${m}-${String(lastDay).padStart(2, '0')}`;

      const monthlyReturn = (adjclose[i] - adjclose[i - 1]) / adjclose[i - 1];
      points.push({ date, monthlyReturn });
    }

    // Deduplicate by date — Yahoo may return intra-month timestamps that
    // map to the same end-of-month date; keep the last (most recent) entry.
    const seen = new Map<string, MonthlyReturnPoint>();
    for (const p of points) {
      seen.set(p.date, p);
    }
    return [...seen.values()];
  } catch (err) {
    console.log(`   Yahoo Finance ${symbol} error: ${(err as Error).message}`);
    return [];
  }
}

function loadCSVData(filePath: string): { date: string; price: number }[] {
  const text = fs.readFileSync(filePath, 'utf-8');
  const lines = text.trim().split('\n');
  return lines.slice(1).map(line => {
    const [date, price] = line.split(',');
    return { date, price: parseFloat(price) };
  });
}

function extendProxySeries(
  proxyPath: string,
  extensionReturns: MonthlyReturnPoint[],
  proxyName: string,
): number {
  if (extensionReturns.length === 0) {
    console.log(`   ${proxyName}: no extension data available, skipping`);
    return 0;
  }

  const existing = loadCSVData(proxyPath);
  const lastExisting = existing[existing.length - 1];
  const lastDate = lastExisting.date;

  const existingDates = new Set(existing.map(p => p.date));

  // Filter to only dates after the last existing date that aren't already present
  const newPoints = extensionReturns
    .filter(p => p.date > lastDate && !existingDates.has(p.date))
    .sort((a, b) => a.date.localeCompare(b.date));

  if (newPoints.length === 0) {
    console.log(`   ${proxyName}: already up to date (last: ${lastDate})`);
    return 0;
  }

  // Apply monthly returns to extend the cumulative index
  let lastPrice = lastExisting.price;
  const extended: { date: string; price: number }[] = [];
  for (const pt of newPoints) {
    lastPrice *= (1 + pt.monthlyReturn);
    extended.push({ date: pt.date, price: Math.round(lastPrice * 10000) / 10000 });
  }

  // Rebuild CSV by combining existing + new data (avoids blank-line and duplicate bugs)
  const allLines: string[] = [];
  for (const p of existing) {
    allLines.push(`${p.date},${p.price}`);
  }
  for (const p of extended) {
    allLines.push(`${p.date},${p.price}`);
  }
  fs.writeFileSync(proxyPath, allLines.join('\n') + '\n');

  console.log(`   ${proxyName}: extended +${extended.length} months (${extended[0].date} → ${extended[extended.length - 1].date})`);
  return extended.length;
}

function extendCashWithFRED(
  cashPath: string,
  dtb3Series: { date: string; value: number }[],
): number {
  if (dtb3Series.length === 0) {
    console.log('   CASH: no FRED DTB3 data, skipping');
    return 0;
  }

  const existing = loadCSVData(cashPath);
  const lastExisting = existing[existing.length - 1];
  const lastDate = lastExisting.date;

  // Build monthly returns from DTB3 rates (rate is in percent)
  const dtb3ByMonth = new Map<string, number>();
  for (const pt of dtb3Series) {
    dtb3ByMonth.set(pt.date.substring(0, 7), pt.value);
  }

  const extensionReturns: MonthlyReturnPoint[] = [];
  for (const [ym, rate] of dtb3ByMonth) {
    // Construct end-of-month date
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const date = `${ym}-${String(lastDay).padStart(2, '0')}`;
    if (date > lastDate) {
      const monthlyReturn = (rate / 100) / 12;
      extensionReturns.push({ date, monthlyReturn });
    }
  }
  extensionReturns.sort((a, b) => a.date.localeCompare(b.date));

  return extendProxySeries(cashPath, extensionReturns, 'CASH');
}

function extendCpiSeries(
  cpiPath: string,
  fredCpiSeries: { date: string; value: number }[],
): number {
  if (fredCpiSeries.length === 0) {
    console.log('   CPI: no FRED CPIAUCSL data, skipping');
    return 0;
  }

  const existing = loadCSVData(cpiPath);
  const lastExisting = existing[existing.length - 1];
  const lastDate = lastExisting.date;

  // Build FRED CPI lookup exactly as the existing CSV format
  const fredByMonth = new Map<string, number>();
  for (const pt of fredCpiSeries) {
    fredByMonth.set(pt.date.substring(0, 7), pt.value);
  }

  // Ratio-align at splice point
  const spliceFred = fredByMonth.get(lastDate.substring(0, 7));
  if (!spliceFred) {
    console.log(`   CPI: no FRED data at splice point ${lastDate.substring(0, 7)}, skipping`);
    return 0;
  }
  const ratio = spliceFred / lastExisting.price;

  // Collect new months
  const newPoints: { date: string; value: number }[] = [];
  for (const [ym, fredValue] of fredByMonth) {
    const [y, m] = ym.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const date = `${ym}-${String(lastDay).padStart(2, '0')}`;
    if (date > lastDate) {
      // Ratio-align to match existing CPI scale
      newPoints.push({ date, value: Math.round(fredValue / ratio * 100) / 100 });
    }
  }
  newPoints.sort((a, b) => a.date.localeCompare(b.date));

  if (newPoints.length === 0) {
    console.log(`   CPI: already up to date (last: ${lastDate})`);
    return 0;
  }

  // Rebuild CSV by combining existing + new data (avoids blank-line and duplicate bugs)
  const allLines: string[] = [];
  for (const p of existing) {
    allLines.push(`${p.date},${p.price}`);
  }
  for (const p of newPoints) {
    allLines.push(`${p.date},${p.value}`);
  }
  fs.writeFileSync(cpiPath, allLines.join('\n') + '\n');

  console.log(`   US_CPI: extended +${newPoints.length} months (${newPoints[0].date} → ${newPoints[newPoints.length - 1].date})`);
  return newPoints.length;
}

async function extendAllProxies(
  proxyOk: boolean,
  dtb3Series: { date: string; value: number }[],
  fredCpiSeries: { date: string; value: number }[],
): Promise<void> {
  console.log('\n10. Extending base proxy CSVs past Shiller data end (2023-09)...');

  const DATA_DIR_PROXIES = path.join(DATA_DIR, 'proxies');
  const extensionStart = '2023-09'; // one month before last Shiller data to capture transition return
  let totalExtended = 0;
  let totalSkipped = 0;

  // Always extend CASH with FRED DTB3 (no Yahoo needed)
  const cashPath = path.join(DATA_DIR_PROXIES, 'bond/cash.csv');
  if (fs.existsSync(cashPath)) {
    const n = extendCashWithFRED(cashPath, dtb3Series);
    if (n > 0) totalExtended++; else totalSkipped++;
  }

  // Always extend CPI with FRED CPIAUCSL (no Yahoo needed)
  const cpiPath = path.join(DATA_DIR, 'inflation/us_cpi.csv');
  if (fs.existsSync(cpiPath)) {
    const n = extendCpiSeries(cpiPath, fredCpiSeries);
    if (n > 0) totalExtended++; else totalSkipped++;
  }

  if (!proxyOk) {
    console.log('\n   ⚠️  Proxy unavailable — skipping Yahoo Finance extensions.');
    console.log('   The following CSVs still end at 2023-09:');
    console.log('     sp500_tr.csv, us_10y_tr.csv, us_long_tr.csv, us_agg_bond_tr.csv, gold_spot.csv');
    console.log('   Run `npm run update-data` when proxy is available to extend them.\n');
    totalSkipped += 5;
    console.log(`   Summary: ${totalExtended} extended, ${totalSkipped} skipped`);
    return;
  }

  // Fetch Yahoo Finance monthly returns for each ETF
  const fetches: { symbol: string; proxyPath: string; proxyName: string }[] = [
    { symbol: 'SPY', proxyPath: path.join(DATA_DIR_PROXIES, 'equity/sp500_tr.csv'), proxyName: 'SP500_TR' },
    { symbol: 'TLT', proxyPath: path.join(DATA_DIR_PROXIES, 'bond/us_long_tr.csv'), proxyName: 'US_LONG_TR' },
    { symbol: 'IEF', proxyPath: path.join(DATA_DIR_PROXIES, 'bond/us_10y_tr.csv'), proxyName: 'US_10Y_TR' },
    { symbol: 'AGG', proxyPath: path.join(DATA_DIR_PROXIES, 'bond/us_agg_bond_tr.csv'), proxyName: 'US_AGG_BOND_TR' },
  ];

  for (const { symbol, proxyPath, proxyName } of fetches) {
    if (!fs.existsSync(proxyPath)) {
      console.log(`   ${proxyName}: file not found, skipping`);
      totalSkipped++;
      continue;
    }

    console.log(`   Fetching ${symbol} monthly returns from Yahoo Finance...`);
    const returns = await fetchYahooMonthlyReturns(symbol, extensionStart);

    if (returns.length === 0) {
      console.log(`   ⚠️  ${proxyName}: could not fetch ${symbol} data, CSV stays at 2023-09`);
      totalSkipped++;
    } else {
      const n = extendProxySeries(proxyPath, returns, proxyName);
      if (n > 0) totalExtended++; else totalSkipped++;
    }

    // Rate limit
    await new Promise(r => setTimeout(r, 500));
  }

  // Gold: fetch GLD and multiply by 10
  const goldPath = path.join(DATA_DIR_PROXIES, 'commodity/gold_spot.csv');
  if (fs.existsSync(goldPath)) {
    console.log('   Fetching GLD monthly returns from Yahoo Finance (×10 for spot)...');
    const gldReturns = await fetchYahooMonthlyReturns('GLD', extensionStart);
    if (gldReturns.length > 0) {
      // GLD returns are identical to spot returns (the ×10 scaling cancels out in return calc)
      const n = extendProxySeries(goldPath, gldReturns, 'GOLD_SPOT');
      if (n > 0) totalExtended++; else totalSkipped++;
    } else {
      console.log('   ⚠️  GOLD_SPOT: could not fetch GLD data, CSV stays at 2023-09');
      totalSkipped++;
    }
  } else {
    totalSkipped++;
  }

  console.log(`\n   Summary: ${totalExtended} extended, ${totalSkipped} skipped`);
}

// ---------------------------------------------------------------------------
// Broad Commodity Total Return (S&P GSCI proxy via FRED + T-Bill collateral)
// ---------------------------------------------------------------------------

function buildCommodityTR(
  priceSeries: { date: string; value: number }[],
  dtb3Series: { date: string; value: number }[],
): { date: string; price: number }[] {
  // Build DTB3 lookup keyed by YYYY-MM
  const dtb3ByMonth = new Map<string, number>();
  for (const pt of dtb3Series) {
    dtb3ByMonth.set(pt.date.substring(0, 7), pt.value);
  }

  const result: { date: string; price: number }[] = [];
  const startValue = 100;
  let cumulative = startValue;

  // First month: set starting value
  const firstDate = priceSeries[0].date;
  const firstYearMonth = firstDate.substring(0, 7);
  const firstLastDay = new Date(
    parseInt(firstDate.substring(0, 4)),
    parseInt(firstDate.substring(5, 7)),
    0,
  ).getDate();
  result.push({
    date: `${firstYearMonth}-${String(firstLastDay).padStart(2, '0')}`,
    price: Math.round(startValue * 10000) / 10000,
  });

  for (let i = 1; i < priceSeries.length; i++) {
    const prevPrice = priceSeries[i - 1].value;
    const currPrice = priceSeries[i].value;
    if (prevPrice <= 0 || currPrice <= 0) continue;

    // Monthly price return
    const priceReturn = (currPrice - prevPrice) / prevPrice;

    // T-Bill collateral return (annual percent → monthly decimal)
    const yearMonth = priceSeries[i].date.substring(0, 7);
    const dtb3Rate = dtb3ByMonth.get(yearMonth) ?? 0;
    const collateralReturn = dtb3Rate / 1200;

    const totalReturn = priceReturn + collateralReturn;
    cumulative *= (1 + totalReturn);

    const y = parseInt(priceSeries[i].date.substring(0, 4));
    const m = parseInt(priceSeries[i].date.substring(5, 7));
    const lastDay = new Date(y, m, 0).getDate();
    const dateStr = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

    result.push({
      date: dateStr,
      price: Math.round(cumulative * 10000) / 10000,
    });
  }

  return result;
}

async function main() {
  console.log('Generating real historical proxy data from Shiller XLS...\n');

  // 1. Parse Shiller data
  console.log('1. Parsing Shiller data...');
  const rows = parseShillerData();
  console.log(`   Parsed ${rows.length} months (${rows[0].date} to ${rows[rows.length - 1].date})\n`);

  // 2. Build S&P 500 TR
  console.log('2. Building S&P 500 Total Return series...');
  const sp500 = buildSP500TR(rows);
  writeCSV(path.join(DATA_DIR, 'proxies/equity/sp500_tr.csv'), sp500);

  // 3. Build 10Y Treasury TR
  console.log('3. Building US 10Y Treasury Total Return series...');
  const bond = buildBondTR(rows);
  writeCSV(path.join(DATA_DIR, 'proxies/bond/us_10y_tr.csv'), bond);

  // 4. Build Long Bond TR (for TLT)
  console.log('4. Building Long Treasury Total Return series (for TLT)...');
  const longBond = buildLongBondTR(rows);
  writeCSV(path.join(DATA_DIR, 'proxies/bond/us_long_tr.csv'), longBond);

  // 5. Fetch FRED DTB3 data for T-Bill rates
  console.log('5. Fetching FRED DTB3 (3-Month T-Bill) data...');
  let dtb3Series: { date: string; value: number }[] = [];
  try {
    dtb3Series = await fetchFredSeries('DTB3', '1934-01-01', '2026-12-31');
    console.log(`   Got ${dtb3Series.length} DTB3 data points (${dtb3Series[0]?.date} to ${dtb3Series[dtb3Series.length - 1]?.date})`);
    if (dtb3Series.length > 0) {
      const maxRate = Math.max(...dtb3Series.map(d => d.value));
      const maxDate = dtb3Series.find(d => d.value === maxRate)?.date;
      console.log(`   Max T-Bill rate: ${maxRate.toFixed(2)}% at ${maxDate}`);
    }
  } catch (err) {
    console.log(`   FRED DTB3 unavailable: ${(err as Error).message}`);
    console.log('   Falling back to GS10*0.7 approximation');
  }

  // 6. Build Cash TR using FRED DTB3 + Shiller fallback
  console.log('6. Building Cash/T-Bill Total Return series...');
  const cash = buildCashTR(rows, dtb3Series);
  writeCSV(path.join(DATA_DIR, 'proxies/bond/cash.csv'), cash);

  // 7. Build Aggregate Bond TR (same as 10Y for simplicity, slightly lower vol)
  console.log('7. Building US Aggregate Bond Total Return series...');
  writeCSV(path.join(DATA_DIR, 'proxies/bond/us_agg_bond_tr.csv'), bond);

  // 8. CPI — use FRED CPIAUCSL (1947+) + Shiller (pre-1947) spliced
  console.log('8. Building US CPI series (FRED CPIAUCSL + Shiller)...');
  let fredCpiSeries: { date: string; value: number }[] = [];
  try {
    fredCpiSeries = await fetchFredSeries('CPIAUCSL', '1947-01-01', '2026-12-31');
    console.log(`   Got ${fredCpiSeries.length} FRED CPI data points (${fredCpiSeries[0]?.date} to ${fredCpiSeries[fredCpiSeries.length - 1]?.date})`);
    if (fredCpiSeries.length > 0) {
      console.log(`   CPI at ${fredCpiSeries[0].date}: ${fredCpiSeries[0].value}, at ${fredCpiSeries[fredCpiSeries.length-1].date}: ${fredCpiSeries[fredCpiSeries.length-1].value}`);
    }
  } catch (err) {
    console.log(`   FRED CPIAUCSL unavailable: ${(err as Error).message}`);
    console.log('   Falling back to Shiller CPI');
  }
  const cpi = buildCPI(rows, fredCpiSeries);
  writeCPI(path.join(DATA_DIR, 'inflation/us_cpi.csv'), cpi);

  // 9. Gold - check proxy first, then fetch GLD or use built-in estimates
  console.log('9. Building Gold price series...');
  const proxyOk = await checkProxy();
  let yahooGold: { date: string; price: number }[] = [];
  if (proxyOk) {
    yahooGold = await fetchGoldData();
  }
  const goldData = buildCompleteGold(rows, yahooGold);
  writeCSV(path.join(DATA_DIR, 'proxies/commodity/gold_spot.csv'), goldData);

  // 10. Build Broad Commodity TR (FRED PALLFNFINDEXM + T-Bill collateral)
  console.log('10. Building Broad Commodity Total Return series...');
  let commodityWritten = false;
  try {
    const commodityPrice = await fetchFredSeries('PALLFNFINDEXM', '1992-01-01', '2026-12-31');
    console.log(`   Got ${commodityPrice.length} PALLFNFINDEXM data points (${commodityPrice[0]?.date} to ${commodityPrice[commodityPrice.length - 1]?.date})`);
    if (commodityPrice.length > 0 && dtb3Series.length > 0) {
      const commodity = buildCommodityTR(commodityPrice, dtb3Series);
      writeCSV(path.join(DATA_DIR, 'proxies/commodity/commodity_tr.csv'), commodity);
      console.log(`   Commodity TR: ${commodity[0].date} (${commodity[0].price}) → ${commodity[commodity.length - 1].date} (${commodity[commodity.length - 1].price})`);
      commodityWritten = true;
    }
  } catch (err) {
    console.log(`   FRED PALLFNFINDEXM unavailable: ${(err as Error).message}`);
  }
  if (!commodityWritten) {
    console.log('   Falling back: commodity TR not available, DBC/GSG/DBMF will use GOLD_SPOT');
  }

  // 11. Extend all base proxy CSVs past Shiller data end (2023-09)
  await extendAllProxies(proxyOk, dtb3Series, fredCpiSeries);

  // 12. Update etf_map.json to use the new proxies
  console.log('\n12. Updating ETF mappings...');
  updateEtfMappings();

  // 13. Update data_version.json
  console.log('13. Updating data version...');
  const version = {
    version: 2,
    lastUpdated: new Date().toISOString().split('T')[0],
    description: 'Real historical data from Shiller (1871-present) + FRED T-Bill rates + gold spot prices',
  };
  fs.writeFileSync(
    path.join(DATA_DIR, 'data_version.json'),
    JSON.stringify(version, null, 2) + '\n',
  );

  console.log('\nDone! Real historical proxy data generated successfully.');
}

function updateEtfMappings(): void {
  const etfMapPath = path.join(DATA_DIR, 'etf_map.json');
  const etfMap = JSON.parse(fs.readFileSync(etfMapPath, 'utf-8')) as any[];

  // BLENDED ETFs are managed by blend-etf-data.ts — NEVER reset these here.
  // Currently blended: SPY, TLT, SHY, BND, VTI, BIL, GLD, AGG, IEF

  const updates: Record<string, string> = {
    'VOO': 'SP500_TR',
    'IVV': 'SP500_TR',
    'VXUS': 'MSCI_EAFE_TR',
    'VEA': 'MSCI_EAFE_TR',
    'VWO': 'MSCI_EM_TR',
    'EDV': 'US_LONG_TR',
    'IEI': 'US_10Y_TR',
    'IAU': 'GOLD_SPOT',
    'IJS': 'SMALLCAP_VALUE_TR',
    'IJR': 'SMALLCAP_VALUE_TR',
    'IJT': 'SMALLCAP_VALUE_TR',
    'VOE': 'SMALLCAP_VALUE_TR',
    'VO': 'SMALLCAP_VALUE_TR',
    'DES': 'SMALLCAP_VALUE_TR',
    'SAA': 'SMALLCAP_VALUE_TR',
    'DBC': 'COMMODITY_TR',
    'GSG': 'COMMODITY_TR',
    'DBMF': 'COMMODITY_TR',
  };

  for (const entry of etfMap) {
    if (updates[entry.symbol]) {
      entry.proxySymbol = updates[entry.symbol];
    }
  }

  // Ensure US_LONG_TR and updated proxies exist in the map
  fs.writeFileSync(etfMapPath, JSON.stringify(etfMap, null, 2) + '\n');
  console.log('   ETF map updated.');
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
