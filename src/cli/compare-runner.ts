import * as prompts from '@clack/prompts';
import { selectMultiplePortfolios } from './prompts/portfolio';
import { collectParameters } from './prompts/parameters';
import { resolvePortfolioData } from './data-resolver';
import { runBacktest } from '../engine/backtest';
import { renderComparisonTable } from './display/comparison';
import { renderEquityCurve } from './display/equity-curve';
import type { BacktestParameters, BacktestResult } from '../engine/types';

export async function runComparison(): Promise<void> {
  prompts.log.info('Select 2-4 portfolios to compare');

  const portfolios = await selectMultiplePortfolios();
  if (portfolios.length < 2) {
    prompts.log.warn('Need at least 2 portfolios to compare');
    return;
  }

  const params = await collectParameters();
  if (!params) return;

  const s = prompts.spinner();
  const results: { name: string; result: BacktestResult }[] = [];

  for (const portfolio of portfolios) {
    s.start(`Running ${portfolio.name}...`);

    const { assetReturns, fxRates, cpiSeries } = resolvePortfolioData(
      portfolio.holdings,
      params.displayCurrency,
      params.inflationRegion,
      params.inflationAdjusted,
    );

    const backtestParams: BacktestParameters = {
      portfolio,
      startDate: params.startDate,
      endDate: params.endDate,
      initialCapital: params.initialCapital,
      displayCurrency: params.displayCurrency,
      inflationRegion: params.inflationRegion as BacktestParameters['inflationRegion'],
      inflationAdjusted: params.inflationAdjusted,
      rebalancing: params.rebalancing,
      cashflows: [],
    };

    const result = runBacktest(backtestParams, assetReturns, fxRates, cpiSeries);
    results.push({ name: portfolio.name, result });
  }

  s.stop(`${results.length} backtests complete`);

  console.log();
  console.log(renderComparisonTable(results, params.displayCurrency));

  for (const { name, result } of results) {
    console.log();
    console.log(renderEquityCurve(result.timeSeries, name));
  }
}
