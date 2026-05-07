/**
 * FRED API helper — shared module for fetching data from the Federal Reserve
 * Economic Data (FRED) API.
 *
 * Usage: const data = await fetchFredSeries('DTB3', '1934-01-01', '2024-12-31');
 *
 * Requires FRED_API_KEY in .env (free from https://fred.stlouisfed.org/docs/api/api_key.html)
 */

import { readFileSync, existsSync } from 'node:fs';

const FRED_API_KEY = loadApiKey();

function loadApiKey(): string | undefined {
  // tsx doesn't auto-load .env, so load it manually
  const envPath = '.env';
  if (existsSync(envPath)) {
    const content = readFileSync(envPath, 'utf-8');
    for (const line of content.split('\n')) {
      const eq = line.indexOf('=');
      if (eq > 0) {
        const key = line.slice(0, eq).trim();
        const val = line.slice(eq + 1).trim();
        if (key && val && !process.env[key]) {
          process.env[key] = val;
        }
      }
    }
  }
  return process.env.FRED_API_KEY;
}
const FRED_BASE = 'https://api.stlouisfed.org/fred/series/observations';

export interface FredObservation {
  date: string;   // "YYYY-MM-DD"
  value: number;
}

/**
 * Fetch a FRED series as monthly observations.
 *
 * Handles FRED's "." (missing) sentinel by forward-filling.
 * Uses aggregation_method=avg for daily→monthly conversion.
 */
export async function fetchFredSeries(
  seriesId: string,
  startDate: string,
  endDate: string,
): Promise<FredObservation[]> {
  if (!FRED_API_KEY) {
    throw new Error(
      'FRED_API_KEY not set. Get a free key at https://fred.stlouisfed.org/docs/api/api_key.html\n' +
      'Then add FRED_API_KEY=your_key to .env'
    );
  }

  const url = new URL(FRED_BASE);
  url.searchParams.set('series_id', seriesId);
  url.searchParams.set('api_key', FRED_API_KEY);
  url.searchParams.set('file_type', 'json');
  url.searchParams.set('observation_start', startDate);
  url.searchParams.set('observation_end', endDate);
  url.searchParams.set('frequency', 'm');
  url.searchParams.set('aggregation_method', 'avg');
  url.searchParams.set('sort_order', 'asc');

  const res = await fetch(url.toString());

  if (!res.ok) {
    throw new Error(`FRED API error: ${res.status} ${res.statusText} for series ${seriesId}`);
  }

  const json = await res.json() as {
    observations: { date: string; value: string }[];
  };

  const observations = json.observations ?? [];
  const result: FredObservation[] = [];
  let lastValue = 0;

  for (const obs of observations) {
    if (obs.value === '.' || obs.value === '') {
      // FRED missing sentinel → forward-fill
      if (result.length > 0) {
        result.push({ date: obs.date, value: lastValue });
      }
      continue;
    }

    const value = parseFloat(obs.value);
    if (isNaN(value)) {
      if (result.length > 0) {
        result.push({ date: obs.date, value: lastValue });
      }
      continue;
    }

    lastValue = value;
    result.push({ date: obs.date, value });
  }

  return result;
}

/**
 * Check if FRED API key is configured (for graceful degradation).
 */
export function isFredAvailable(): boolean {
  return !!FRED_API_KEY;
}
