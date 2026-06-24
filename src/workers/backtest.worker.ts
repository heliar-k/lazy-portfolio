import { runBacktest } from '../engine/backtest';
import type {
  BacktestParameters,
  BacktestResult,
  MonthlyFxRatePoint,
  MonthlyReturnPoint,
} from '../engine/types';

interface WorkerRequest {
  id: number;
  params: BacktestParameters;
  assetReturns: [string, MonthlyReturnPoint[]][];
  fxRates: [string, MonthlyFxRatePoint[]][];
  cpiSeries: [string, number][];
  noRiskSeries: [string, number][];
}

interface WorkerResponse {
  id: number;
  result?: BacktestResult;
  error?: string;
}

self.onmessage = (e: MessageEvent<WorkerRequest>) => {
  const { id, params, assetReturns, fxRates, cpiSeries, noRiskSeries } = e.data;

  try {
    const assetReturnMap = new Map(assetReturns);
    const fxRatesMap = new Map(fxRates);
    const cpiMap = new Map(cpiSeries);
    const noRiskMap = new Map(noRiskSeries);

    const result = runBacktest(params, assetReturnMap, fxRatesMap, cpiMap, noRiskMap);

    const response: WorkerResponse = { id, result };
    self.postMessage(response);
  } catch (err) {
    const response: WorkerResponse = {
      id,
      error: (err as Error).message || 'Backtest failed',
    };
    self.postMessage(response);
  }
};
