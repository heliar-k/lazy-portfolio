# AGENTS.md

This file provides guidance to coding agents when working with this repository.

## Commands

```bash
npm run dev              # Vite dev server (web UI)
npm run build            # Type-check (tsc -b) + production build
npm run test             # Vitest watch mode
npm run test:run         # Vitest single run
npx vitest run src/engine/__tests__/backtest.test.ts  # Run a single test file
npx tsc --noEmit         # Type-check only
npm run cli              # Launch the Ink terminal UI (requires TTY)
npm run update-data      # Fetch fresh proxy data from FRED/Shiller
npm run scrape-templates # Scrape portfolio templates from lazyportfolioetf.com
```

## Architecture

### Dual UI, shared engine

The project has two independent UIs — a web app (React + Vite + Tailwind) and a CLI terminal UI (Ink + React) — both consuming the same pure-functional backtest engine.

```
src/engine/        Pure computation: backtest, returns, metrics, rebalancing, Monte Carlo, SWR
src/data/          Browser-side data loading (fetch from /data/ served by Vite)
src/cli/           Ink TUI: data-loader.ts (Node fs), data-resolver.ts, App.tsx (all views), custom-store.ts
src/components/    Web React components organized by feature (builder/, backtest/, charts/, templates/)
src/stores/        Zustand stores (backtest, portfolio, comparison, data)
src/portfolios/    Auto-generated registry of ~170 portfolio templates
src/workers/       Web Worker wrapper for running backtests off the main thread
```

### Engine pipeline

`runBacktest(params, assetReturns, fxRates, cpiSeries)` is a pure function pipeline:
1. Build a monthly end-of-month date grid.
2. Align monthly returns to the grid. Initial missing data advances the effective start date; post-start gaps are treated as data errors, not 0% returns.
3. Convert to display currency using dated FX series (`MonthlyFxRatePoint[]`) aligned to the same month grid. FX gaps forward-fill for at most 3 months; longer gaps become missing data.
4. Compound portfolio with rebalancing and cashflow injection. Cashflow accounting distinguishes requested cashflows from actually applied cashflows when withdrawals exceed available capital.
5. Adjust for inflation via CPI when requested. In inflation-adjusted mode, primary time-series fields (`portfolioValue`, `monthlyReturn`, `drawdown`, `cumulativeReturn`) are real/inflation-adjusted; nominal values are preserved in the corresponding `*Real` fields due to legacy naming.
6. Compute metrics (CAGR/TWR, Sharpe, Sortino, max drawdown, rolling returns, etc.).

The engine has **no side effects** and no dependency on browser or Node APIs. All data loading happens in the data layer, which differs between web (fetch) and CLI (fs.readFileSync).

### Data flow

Proxy total-return CSV files in `public/data/proxies/` are the source of truth for historical returns. `etf_map.json` maps ETF symbols to proxy files and metadata. The web app fetches these at runtime; the CLI reads them from disk.

FX CSV files in `public/data/proxies/fx/` use `date,rate` format and are loaded as dated monthly rate points. Do not collapse FX rates to bare arrays; date alignment is required for correct cross-currency results.

For the web UI, heavy computation runs in a Web Worker (`src/workers/backtest.worker.ts`) with main-thread fallback.

### Expense ratio handling

The engine does **not** deduct expense ratios — ETF prices (Yahoo Finance adjusted close) already embed ER. For pre-inception proxy-only periods, returns are slightly overstated. The CLI data-resolver deducts ER monthly for non-blended proxy data only.

### State persistence

- **Web**: Zustand with `persist` middleware → localStorage (portfolios, backtest params). URL query string sync for shareable links. LRU cache (20 entries) for backtest results.
- **CLI**: JSON files in `~/.lazy-portfolio/` (custom portfolios, theme/scheme preferences).

## Key conventions

- All returns use **monthly granularity**. Backtest time-series dates are month-end `YYYY-MM-DD`; user-facing start/end inputs and SWR period IDs commonly use `YYYY-MM`.
- Portfolio weights are **0.0–1.0** (not percentages).
- `PortfolioDefinition` is the universal portfolio type shared across engine, web, and CLI.
- `MonthlyReturnPoint` stores dated total returns; `MonthlyFxRatePoint` stores dated FX rate levels.
- `cashflowImpact` means actual applied cashflow; `cashflowRequested` preserves the planned/original cashflow.
- Monte Carlo samples `MonthlyTimeSeriesPoint.monthlyReturn` (TWR) after skipping the initial point. Do not derive samples from portfolio value changes, because cashflows pollute value deltas.
- SWR uses monthly starting periods and requires complete retirement windows (`start + retirementYears * 12` monthly points). CPI lookup accepts `YYYY-MM`, month-end `YYYY-MM-DD`, and nearest prior CPI.
- SWR supports FX through `computeSWR(..., { fxRates })`; if a holding currency differs from `displayCurrency`, the matching FX pair must be provided or SWR throws.
- i18n: English + Chinese (`src/i18n/locales/`). Web UI uses `useTranslation()` hook.
- Tests live in `src/engine/__tests__/` and test pure functions directly — no mocks needed.
- `src/portfolios/registry.ts` is auto-generated by `scripts/scrape-templates.ts` — edit the script, not the file.
