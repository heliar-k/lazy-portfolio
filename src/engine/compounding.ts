import type TimeScale from 'echarts/types/src/scale/Time.js';
import { checkRebalanceTrigger } from './rebalancing';
import type { CashflowEvent, MonthlyTimeSeriesPoint, RebalancingStrategy } from './types';

/**
 * Compound a portfolio forward in time, tracking per-asset capital.
 *
 * Rebalancing is applied according to the strategy. Cashflows are invested
 * at target weights so deposits/withdrawals don't distort the allocation.
 */
export function compoundPortfolio(
  targetWeights: number[],         // [assetIdx] target allocation
  monthlyReturns: (number | null)[][], // [assetIdx][monthIdx]
  initialCapital: number,
  cashflowSchedule: Map<string, number>, // date → net cashflow
  months: string[],
  strategy: RebalancingStrategy,
  cashflowTriggersRebalance = false,
  cpiSeries: Map<string, number>, // date → CPI index
  noRiskSeries: Map<string, number>,
): MonthlyTimeSeriesPoint[]
//{
//  values: number[]; // 每个月底的总资产价值
//  cashflowImpacts: number[]; // 实际的现金流影响（考虑了取款时的资金不足情况）
//  cashflowRequests: number[]; // 设计的现金流
//  effectiveWeights: number[][]; // [assetIdx] 月初实际的权重
//  timeSeries: MonthlyTimeSeriesPoint[]; // 每个月的时间序列数据
//} 
{
  const nAssets = targetWeights.length;
  const nMonths = months.length;

  if (nMonths === 0 || nAssets === 0) {
    return  [] ;
  }

  // Per-asset capital — starts at target weights
  // 初始资产按权重分配后，每个标的的投资金额，按照标的顺序
  const assetCapital = targetWeights.map((w) => w * initialCapital);

  const values: number[] = [];
  const cashflowImpacts: number[] = [];
  const cashflowRequests: number[] = [];
  let effectiveWeights: number[] = [];
  const timeSeries: MonthlyTimeSeriesPoint[] = [];  

  const baseCpi = cpiSeries.get(months[0]);
  let cumNet = 1; // 单位净值
  let totalPeak = 1;
  let totalPeakReal = 1;

  for (let m = 0; m < nMonths; m++) {
    // 本轮次开始时候的总金额
    let total = assetCapital.reduce((s, v) => s + v, 0);
    
    // Record start-of-month weights for TWR calculation
    effectiveWeights = total > 0 ? assetCapital.map((v) => v / total) : targetWeights;

    // 到月底了 , 加上当月回报
    // Apply monthly returns to each asset
    const rets = [];
    let monthTwr = 0;
    for (let a = 0; a < nAssets; a++) {
      rets.push(monthlyReturns[a]?.[m] ?? 0);
      assetCapital[a] *= 1 + rets[a];
      monthTwr += effectiveWeights[a]*rets[a];
    }
    cumNet *= (1+monthTwr)
    

    // Rebalance if the strategy triggers, OR if this month has a cashflow
    // and cashflowTriggersRebalance is enabled (skip month 0 — already at target).
    // 判断当月是否有现金流操作
    const hasCashflow = (cashflowSchedule.get(months[m]) ?? 0) !== 0;
    // 是否需要再平衡（首月不需要）
    // strategy是再平衡策略，type类型（频率or阈值），threshold是具体阈值，frequency是频率 
    const shouldRebalance =
      (m > 0 && checkRebalanceTrigger(strategy, m, months, assetCapital, targetWeights)) ||
      (m > 0 && cashflowTriggersRebalance && hasCashflow);

    total = assetCapital.reduce((s, v) => s + v, 0);
    // 需要再平衡的话，进行再平衡。
    if (shouldRebalance) {
      for (let a = 0; a < nAssets; a++) {
        assetCapital[a] = total * targetWeights[a];
      }
    }

    // Apply cashflow at target weights so deposits/withdrawals are split
    // proportionally rather than going into whichever assets have drifted highest.
    // 现金流， 按照目标权重分配到各个资产上
    const cf = cashflowSchedule.get(months[m]) ?? 0;
    let actualCf = cf;
    if (cf !== 0) {
      // Cap withdrawal to available capital so values don't go negative
      actualCf = cf < 0 ? Math.max(cf, -total) : cf;
      for (let a = 0; a < nAssets; a++) {
        assetCapital[a] += actualCf * targetWeights[a];
      }
    }
    // 月底总金额，收益+现金流后
    total = assetCapital.reduce((s, v) => s + v, 0);
    
    // 通货膨胀
    const cpiRatio = baseCpi && baseCpi > 0 ? baseCpi / (cpiSeries.get(months[m]) ?? cpiSeries.get(months[m-1]) ?? baseCpi)  : 1;
    let lastCpiRatio = baseCpi && baseCpi > 0 && m>0 ? baseCpi / (cpiSeries.get(months[m-1]) ?? baseCpi)  : 1;

    // 基于 TWR 计算回撤
    if (totalPeak < cumNet) totalPeak = cumNet ;
    if (totalPeakReal < cumNet * cpiRatio) totalPeakReal = cumNet * cpiRatio;

    // 更新返回值
    values.push(total);
    cashflowImpacts.push(actualCf);
    cashflowRequests.push(cf);

    timeSeries.push({
      date: months[m],
      portfolioValue: total,
      portfolioValueReal: total * cpiRatio,
      assetValues: [...assetCapital],
      assetValuesReal: assetCapital.map((v) => v * cpiRatio),
      monthlyReturn : monthTwr,
      monthlyReturnReal: (1+monthTwr)*cpiRatio/lastCpiRatio-1,
      assetmonthlyReturns: rets,
      assetmonthlyReturnsReal: rets.map((v)=>(1+v)/lastCpiRatio-1),
      //monthlyReturn: m === 0 ? 0 : (values[m] - values[m - 1] - actualCf) / values[m - 1],
      //monthlyReturnReal: m === 0 ? 0 : (values[m] * cpiRatio - values[m - 1] * cpiRatio - actualCf * cpiRatio) / (values[m - 1] * cpiRatio),
      //assetmonthlyReturns: assetValues[m].map((v,i) => m === 0 ? 0 : (v - assetValues[m - 1][i] - actualCf * targetWeights[i]) / assetValues[m - 1][i]),
      //assetmonthlyReturnsReal: assetValues[m].map((v,i) => m === 0 ? 0 : (v * cpiRatio - assetValues[m - 1][i] * lastCpiRatio - actualCf * targetWeights[i] * cpiRatio) / (assetValues[m - 1][i] * lastCpiRatio)),
      drawdownRate: (cumNet - totalPeak) / totalPeak, 
      drawdownRateReal : (cumNet * cpiRatio - totalPeakReal) / totalPeakReal,
      twr: cumNet - 1, // 累积收益率需要每个月的月度收益率，后续再补充
      twrReal: cumNet * cpiRatio - 1, // 同样的，通胀调整后的累积收益率也需要每个月的月度真实收益率
      cashflowImpact: actualCf,
      cashflowRequested: cf,
      effectiveWeightsStart: effectiveWeights,
      effectiveWeightsEnd: total > 0 ? assetCapital.map((v) => v / total) : [...targetWeights],
      cpiRatio: cpiRatio, // 和基准相比
      noRiskBenefit: noRiskSeries.get(months[m].substring(0,7)) ?? 0,
      noRiskBenefitReal: (noRiskSeries.get(months[m].substring(0,7)) ?? 0 ) * cpiRatio,

    });
  }

  return timeSeries ;
}

/**
 * Expand recurring cashflow events into a flat map of date → amount.
 */
export function expandCashflows(
  events: CashflowEvent[],
): Map<string, number> {
  const schedule = new Map<string, number>();

  for (const event of events) {
    // Add the single event
    const current = schedule.get(event.date) ?? 0;
    schedule.set(event.date, current + event.amount);

    // Expand recurring
    if (event.recurring) {
      const startDate = parseLocalDate(event.date);
      const endDate = event.recurring.endDate
        ? parseLocalDate(event.recurring.endDate)
        : new Date(2099, 11, 31); // local time

      let currentDate = addMonths(startDate, frequencyToMonths(event.recurring.frequency));
      while (currentDate <= endDate) {
        const dateStr = toEndOfMonth(currentDate);
        const existing = schedule.get(dateStr) ?? 0;
        schedule.set(dateStr, existing + event.amount);
        currentDate = addMonths(
          currentDate,
          frequencyToMonths(event.recurring.frequency),
        );
      }
    }
  }

  return schedule;
}

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function addMonths(date: Date, months: number): Date {
  const d = new Date(date);
  const targetMonth = d.getMonth() + months;
  d.setMonth(targetMonth);
  // Handle month overflow (e.g. Jan 31 + 1 month → Mar 2 instead of Feb 28)
  if (d.getMonth() !== ((targetMonth % 12) + 12) % 12) {
    d.setDate(0); // clamp to last day of target month
  }
  return d;
}

function toEndOfMonth(date: Date): string {
  const y = date.getFullYear();
  const m = date.getMonth(); // 0-based
  const lastDay = new Date(y, m + 1, 0).getDate(); // day 0 of next month = last day of this month
  return `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
}

function frequencyToMonths(f: 'monthly' | 'quarterly' | 'annual'): number {
  switch (f) {
    case 'monthly':
      return 1;
    case 'quarterly':
      return 3;
    case 'annual':
      return 12;
  }
}
