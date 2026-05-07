import * as prompts from '@clack/prompts';
import { selectPortfolio } from './prompts/portfolio';
import { collectParameters } from './prompts/parameters';
import { collectCashflows } from './prompts/cashflows';
import { resolvePortfolioData } from './data-resolver';
import { runBacktest } from '../engine/backtest';
import { renderMetricsTable } from './display/metrics-table';
import { renderAnnualReturns } from './display/annual-returns';
import { renderEquityCurve } from './display/equity-curve';
import type { BacktestParameters, BacktestResult } from '../engine/types';

export async function runSingleBacktest(): Promise<BacktestResult | null> {
  const portfolio = await selectPortfolio();
  if (!portfolio) return null;

  const params = await collectParameters();
  if (!params) return null;

  const cashflows = await collectCashflows(params.startDate);

  const backtestParams: BacktestParameters = {
    portfolio,
    startDate: params.startDate,
    endDate: params.endDate,
    initialCapital: params.initialCapital,
    displayCurrency: params.displayCurrency,
    inflationRegion: params.inflationRegion as BacktestParameters['inflationRegion'],
    inflationAdjusted: params.inflationAdjusted,
    rebalancing: params.rebalancing,
    cashflows,
  };

  const s = prompts.spinner();
  s.start('Loading data...');

  const { assetReturns, fxRates, cpiSeries } = resolvePortfolioData(
    portfolio.holdings,
    params.displayCurrency,
    params.inflationRegion,
    params.inflationAdjusted,
  );

  s.message('Running backtest...');

  const result = runBacktest(backtestParams, assetReturns, fxRates, cpiSeries);

  s.stop('Backtest complete');

  console.log();
  console.log(renderMetricsTable(result.metrics, params.displayCurrency));
  console.log();
  console.log(renderEquityCurve(result.timeSeries, portfolio.name));
  console.log();
  console.log(renderAnnualReturns(result.annualReturns));

  return result;
}
