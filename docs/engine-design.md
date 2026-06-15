# 引擎层详细设计文档

本文档对 `src/engine/` 下的每一个模块、每一个函数进行逐行解释，说明其数学原理、数据流和设计意图。

---

## 1. `types.ts` — 类型系统

引擎的类型定义分为五大领域：

### 1.1 资产类型

```typescript
type AssetClass = 'us_total_market' | 'us_large_cap' | ... | 'commodities';
type Region = 'US' | 'CN' | 'JP' | 'EU' | 'UK' | 'CA' | 'AU' | 'BR' | 'IN' | 'GLOBAL';
type DisplayCurrency = 'USD' | 'CNY' | 'EUR' | 'JPY' | 'GBP';
```

`AssetClass` 是一个有穷联合类型，覆盖了引擎支持的全部资产类别（美股/国债/黄金/商品等）。

`AssetIdentifier` 描述一只 ETF 的元数据：

| 字段 | 说明 |
|------|------|
| `symbol` | 代码，如 `VTI` |
| `assetClass` | 资产类别 |
| `region` | 所属地区 |
| `currency` | 计价货币，如 `"USD"` |
| `expenseRatio` | 费率，如 `0.0003` 表示 0.03% |
| `inceptionDate` | ETF 成立日期 |
| `proxySymbol` | 代理指数代码，用于回填 ETF 成立前的历史数据 |

### 1.2 组合类型

```typescript
interface PortfolioHolding {
  asset: AssetIdentifier;
  targetWeight: number; // 0.0–1.0，注意不是百分比
}

interface PortfolioDefinition {
  id: string;
  name: string;
  holdings: PortfolioHolding[];
  tags: string[];
}
```

权重是 **小数** 而非百分比（60% 写作 `0.6`），这是引擎所有计算的约定。

### 1.3 数据点类型

```typescript
interface MonthlyPricePoint   { date: string; price: number; }
interface MonthlyReturnPoint  { date: string; totalReturn: number; }  // e.g. 0.01 = 1%
interface MonthlyFxRatePoint  { date: string; rate: number; }         // e.g. 7.0 USDCNY
```

- `MonthlyPricePoint`：月末价格，是原始数据格式。
- `MonthlyReturnPoint`：月度总收益（含分红），由价格序列计算得到。
- `MonthlyFxRatePoint`：月末汇率**水平值**（不是变化率），如 `USDCNY=7.0`。日期对齐到月网格后再计算汇率变化。

### 1.4 回测参数与结果

```typescript
interface BacktestParameters {
  portfolio: PortfolioDefinition;
  startDate / endDate: string;     // "YYYY-MM" 格式
  initialCapital: number;
  displayCurrency: DisplayCurrency;
  inflationRegion: Region;
  inflationAdjusted: boolean;
  rebalancing: RebalancingStrategy;
  cashflows: CashflowEvent[];
}
```

```typescript
interface MonthlyTimeSeriesPoint {
  portfolioValue: number;        // 名义组合价值
  portfolioValueReal: number;    // 通胀调整后的实际值
  monthlyReturn: number;         // TWR 月度收益
  drawdown: number;              // 0.0 ~ -1.0
  cumulativeReturn: number;      // 相对于 initialCapital 的累计收益
  cashflowImpact: number;        // 实际应用的现金流（受限于可用资本）
  cashflowRequested: number;     // 计划现金流
}
```

**关键设计**：`cashflowImpact` vs `cashflowRequested` 的区别。当提款超过组合价值时，`cashflowImpact` 最多取到将组合清零，而 `cashflowRequested` 保留原始请求值。这使 SWR 分析能检测到"提款不足"=退休失败。

### 1.5 提款分析类型

```typescript
interface SinglePeriodResult {
  success: boolean;              // 组合在退休期内是否存活
  finalBalance / minBalance;
  depletionDate: string | null;  // 组合归零的日期
  annualResults: {               // 每年的详细结果
    withdrawalAmount;            // 实际提款
    withdrawalRequested;         // 计划提款（CPI 调整后）
    portfolioValue; portfolioReturn;
  }[];
}
```

`SWRResult.sweepResults` 是一个二维网格：`startDate × rate → {success, finalBalance}`，用于热力图展示。

---

## 2. `returns.ts` — 收益计算与网格对齐

### 2.1 `computeMonthlyReturns(pricePoints) → MonthlyReturnPoint[]`

**功能**：从月末价格序列计算月度总收益。

**数学公式**：
$$return_t = \frac{price_t - price_{t-1}}{price_{t-1}}$$

**流程**：
1. 如果价格点 < 2 个，返回空数组（至少需要一对价格才能算一个收益）
2. 按日期升序排序（输入可能是乱序的）
3. 对每对相邻价格点 $(prev, curr)$，计算收益并输出 `{ date: curr.date, totalReturn }`

> 注意：返回的收益序列比价格序列少 1 个元素。收益的日期是当前月的月末日期。

### 2.2 `alignReturnsToGrid(returns, months) → (number | null)[]`

**功能**：将不定长的收益序列对齐到统一的月度网格。每个网格月对应一个收益值或 `null`。

**缺失值处理策略**：

```
if 该月有数据 → 使用该月收益
else if 是第一个月且无数据 → null（等待有效起始日判定）
else if 距上一个已知数据 ≤ 3 个月 → 前向填充（last known return）
else → null（gap 太长，视为数据缺失）
```

**为什么要前向填充 3 个月？** 某些数据源可能有偶发的数据缺失（如假期导致的月度数据推迟），短 gap 用上一次已知收益填充比填 0 更合理。**3 个月**是一个经验阈值，超过这个长度说明数据确实有问题。

**与 `backtest.ts` 的协作**：
- 网格开头的 `null` 会被 `findEffectiveStartIndex()` 跳过，因此回测的有效起始日会自动后移
- 网格中间出现 `null` 会被 `assertNoMissingReturnsAfterStart()` 报错

---

## 3. `currency.ts` — 外汇转换

### 3.1 `convertReturn(nativeReturn, fxCurrent, fxPrevious) → number`

**功能**：将一期的本币收益转换为目标货币收益。

**数学公式**：
$$return_{target} = (1 + return_{native}) \times \frac{fx_t}{fx_{t-1}} - 1$$

**推导**：假设 1 单位本币在 $t-1$ 时值 $fx_{t-1}$ 目标货币，在 $t$ 时值 $fx_t$ 目标货币。资产在本币下从 1 增长到 $1+r_{native}$，则：
$$value_{t-1}^{target} = fx_{t-1}$$
$$value_t^{target} = (1 + r_{native}) \cdot fx_t$$
$$return_{target} = \frac{value_t^{target} - value_{t-1}^{target}}{value_{t-1}^{target}} = (1 + r_{native}) \cdot \frac{fx_t}{fx_{t-1}} - 1$$

**防御**：如果 $fx_{prev}$ 或 $fx_{cur} \leq 0$（无效数据），回退到原生收益（不做转换）。

### 3.2 `convertReturnSeries(nativeReturns, fxRates) → (number | null)[]`

**功能**：对整个收益序列做货币转换。

**第一月特殊处理**：`return[0]` 对应的是月网格的第 0 个月。转换它需要第 -1 个月的 FX 率，但我们没有。所以：
- 如果 `nativeReturns[0]` 和 `fxRates[0]` 都存在 → 保持原值（无法转换，但保留数据）
- 否则 → `null`（让 `findEffectiveStartIndex` 跳过）

**后续月份**：对每个 $i \ge 1$，取 $fx[i-1]$ 为前值，$fx[i]$ 为当前值做转换。如果 $native$、$fx_{prev}$、$fx_{cur}$ 任一个为 `null`，输出 `null`。

### 3.3 `alignFxRatesToGrid(fxRates, months) → (number | null)[]`

**功能**：将带日期的汇率水平值对齐到月度网格。

与 `alignReturnsToGrid` 类似，但处理的是**汇率水平**（不是收益）。同样前向填充最多 3 个月。

**为什么需要对齐？** 汇率数据可能有不同的时间戳格式（某些月缺少、某些月有多条），对齐确保后续 `convertReturnSeries` 使用的 FX 序列与收益序列长度和日期完全对应。

---

## 4. `compounding.ts` — 复利计算与现金流展开

### 4.1 `compoundPortfolio(...) → { values, cashflowImpacts, cashflowRequests, effectiveWeights }`

这是除 backtest 管线外最核心的函数。逐月模拟组合的复利增长。

**输入**：

| 参数 | 类型 | 说明 |
|------|------|------|
| `targetWeights` | `number[]` | 目标配置权重 |
| `monthlyReturns` | `(number\|null)[][]` | `[assetIdx][monthIdx]` 收益矩阵 |
| `initialCapital` | `number` | 初始本金 |
| `cashflowSchedule` | `Map<string, number>` | 日期→现金流（正=存入，负=取出） |
| `months` | `string[]` | 月度网格 |
| `strategy` | `RebalancingStrategy` | 再平衡策略 |

**每月处理步骤**：

```
进入第 m 月:
  ┌─ totalBefore = Σ assetCapital
  
  ├─ 再平衡？(m > 0 且 checkRebalanceTrigger 返回 true)
  │   └→ 每个资产重置为 totalBefore × targetWeight[a]
  │
  ├─ 记录 effectiveWeights[m] = assetCapital / total  (月初权重)
  │
  ├─ 应用收益: assetCapital[a] *= 1 + monthlyReturns[a][m]
  │
  ├─ 应用现金流 (按目标权重分配):
  │   if cf > 0: 存入 → 按 targetWeights 比例分配
  │   if cf < 0: 取出 → 按 targetWeights 比例提取，但总量不超过可用资本
  │
  └─ values[m] = Σ assetCapital
```

**现金流按目标权重分配的意义**：如果某人每月存入 $1000，这笔钱应该按 60/40 的比例买入股票和债券，而不是按当前漂移后的权重。这保证了定投不改变目标配置意图。

**提款上限保护**：`actualCf = cf < 0 ? Math.max(cf, -totalAfterReturns) : cf`。这确保提款不会让组合价值变成负数——最多提光。

**返回值**：

| 字段 | 说明 |
|------|------|
| `values` | 每月末组合总价值 |
| `cashflowImpacts` | 实际应用的现金流（含上限保护） |
| `cashflowRequests` | 计划现金流（原始值，用于检测"提款不足"） |
| `effectiveWeights` | 每月**月初**各资产的实际权重（用于 TWR 计算） |

### 4.2 `expandCashflows(events) → Map<string, number>`

**功能**：将 `CashflowEvent[]`（可能含定期重复）展开为扁平的 `日期 → 金额` Map。

**定期事件展开**：

```
对于每个 event:
  1. 直接添加 event.date 的单次金额
  2. 如果 event.recurring:
     从 event.date 开始，按 frequency 步进，直到 endDate
     每次将金额累加到对应日期的 Map 项中
```

**辅助函数**：

- `parseLocalDate("2020-01-31")` → 用 `new Date(y, m-1, d)` 避免 UTC 时区偏移
- `addMonths(date, n)` → 加 n 个月，处理月末溢出（Jan 31 + 1 month → Feb 28，不是 Mar 2）
- `toEndOfMonth(date)` → 将日期标准化为月末格式
- `frequencyToMonths(f)` → `'monthly' → 1, 'quarterly' → 3, 'annual' → 12`

---

## 5. `rebalancing.ts` — 再平衡触发逻辑

### 5.1 `checkRebalanceTrigger(strategy, monthIdx, months, currentValues, targetWeights) → boolean`

**功能**：判断当前月是否应触发再平衡。支持两种策略：

| 策略 | 触发条件 |
|------|----------|
| `calendar` + `monthly` | 每月都触发 |
| `calendar` + `quarterly` | 3/6/9/12 月 (month % 3 === 2) |
| `calendar` + `annual` | 每年 1 月 (month === 0 且 monthIdx > 0) |
| `tolerance_band` | 任一资产的实际权重偏离目标超过 threshold |

**日历再平衡的 'month === 0 && monthIdx > 0' 含义**：每年 1 月触发再平衡，但跳过回测的第一个月（那时已经是目标权重，再平衡无意义）。

### 5.2 `isToleranceTrigger(currentValues, targetWeights, threshold) → boolean`

**容差带策略**：

$$actualWeight_a = \frac{currentValue_a}{\sum currentValue}$$
$$if\ |actualWeight_a - targetWeight_a| > threshold\ for\ any\ a: trigger$$

- `threshold` 通常设为 0.05（5% 绝对偏差）
- 如果 `totalValue <= 0`（组合已被提光），也返回 true（虽然此时已无资产可再平衡）

### 5.3 `computeEffectiveWeights(holdings, monthlyReturns, strategy, months) → number[][]`

**功能**：计算每个月月初各资产的实际权重矩阵。虽然 `compoundPortfolio` 也计算权重，但此函数可独立用于权重漂移分析。

**与 `compoundPortfolio` 的关系**：两个函数都计算月初权重，但 `compoundPortfolio` 同时做实际的价值复利；`computeEffectiveWeights` 更轻量，仅关注权重漂移。

---

## 6. `inflation.ts` — 通胀调整

### 6.1 `adjustForInflation(timeSeries, cpiSeries) → MonthlyTimeSeriesPoint[]`

**功能**：将名义组合价值缩减为实际（经通胀调整的）价值。

**数学公式**：

$$realValue_t = nominalValue_t \times \frac{CPI_{base}}{CPI_t}$$

其中 $CPI_{base}$ 是回测起始日的 CPI。

**两遍处理**：

```
第一遍：计算所有时点的实际价值
  对于每个时点 t:
    从 cpiSeries 查找 CPI_t
    如果有数据 → 更新 lastKnownCpi; 用实际 CPI 缩减
    如果没有 → 用 lastKnownCpi 缩减（前向填充）
    realValue[t] = nominalValue[t] × (baseCpi / lastKnownCpi)

第二遍：从实际价值反推实际月度收益
  month 0: realReturn = nominalReturn（因为 realValue = nominalValue）
  month i: realReturn[i] = realValue[i] / realValue[i-1] - 1
```

**为什么用相邻实际价值比反推收益？** 直接套用 $(1 + r_{nominal}) \times \frac{CPI_{t-1}}{CPI_t} - 1$ 在 CPI 存在前向填充时是不准确的——填充的 CPI 代表的是同一个值，不应该产生外汇效应。用实际价值比更准确。

**CPI 前向填充**：如果某个月 CPI 数据尚未公布（如当前月），用上一次已知 CPI 代替。这确保最后一期仍能得到有意义的通胀调整。

### 6.2 与 `backtest.ts` 的协作

通胀调整后，`backtest.ts` 会交换 `nominal ↔ real` 字段（因为用户需要看到的是实际值），然后用 `recomputePathDerivedFields()` 基于新的实际价值重新计算回撤和累计收益。

---

## 7. `metrics.ts` — 指标计算

### 7.1 `computeMetrics(timeSeries, initialCapital) → BacktestMetrics`

从月度时间序列计算约 30 个汇总指标。

#### TWR (Time-Weighted Return) 与 CAGR

$$TWR = \prod_{i=1}^{n} (1 + r_i) - 1$$

$$CAGR = (1 + TWR)^{12/n} - 1$$

**为什么用 TWR 而不是 MWR？** MWR（资金加权收益 = `(finalCapital - initialCapital - contributions + withdrawals) / initialCapital`）会因大额存取款而产生偏差。TWR 只关注月度收益的复合效果，不受现金流影响。

#### 最大回撤 (Maximum Drawdown)

```
遍历每月组合价值:
  维护当前峰值 peak
  计算 DD = (value - peak) / peak
  记录最深 DD 及其对应的峰/谷日期

查找恢复日期: 谷底之后第一个 value ≥ 峰值的月份
```

#### Sharpe Ratio

$$Sharpe = \frac{\bar{r}_{monthly}}{\sigma_{monthly}} \times \sqrt{12}$$

假设无风险利率 = 0。如果月度标准差为 0，Sharpe = 0。

#### Sortino Ratio

$$Sortino = \frac{\bar{r}_{monthly}}{\sigma_{downside}} \times \sqrt{12}$$

$\sigma_{downside}$ 仅用负收益月计算。Sortino 惩罚下行波动而不惩罚上行波动，反映了投资者"不怕涨、只怕跌"的心理。

### 7.2 `computeAnnualReturns(timeSeries) → { year, return }[]`

将月度收益按年份分组，每年收益 = $\prod_{m \in year} (1 + r_m) - 1$。

### 7.3 `computeRollingReturns(timeSeries) → { three, five, ten }`

对每个可能的窗口（3 年/5 年/10 年）：
1. 取出窗口内的月度收益
2. 计算窗口 TWR：$\prod (1 + r) - 1$
3. 年化：$(1 + TWR)^{12/windowMonths} - 1$
4. 取所有窗口的最优/最差值

### 7.4 `computeDistributionStats(returns) → { skewness, kurtosis }`

**偏度 (Skewness)**：
$$S = \frac{1}{n} \sum_{i=1}^n \left(\frac{r_i - \bar{r}}{\sigma}\right)^3$$

- $S > 0$：右偏，正收益多但极端正收益少
- $S < 0$：左偏，正收益多但偶尔有大的负收益（"黑天鹅"风险）

**超值峰度 (Excess Kurtosis)**：
$$K = \frac{1}{n} \sum_{i=1}^n \left(\frac{r_i - \bar{r}}{\sigma}\right)^4 - 3$$

- $K > 0$：厚尾，极端事件比正态分布更频繁
- $K < 0$：薄尾，收益更集中

---

## 8. `monte-carlo.ts` — 蒙特卡洛模拟

### 8.1 `runMonteCarlo(params) → MonteCarloResult`

**功能**：基于历史月度收益分布，模拟未来 N 年的组合增长路径。

**算法**：

```
1. 从历史时间序列中提取 TWR 月度收益样本（跳过第 0 个点，因为它不是真实的跨月收益）
2. 运行 simulations 次模拟:
   对于每次模拟:
     capital = initialCapital
     for m in 0..(years*12):
       - 随机抽取一个历史月度收益（有放回）
       - capital = capital * (1 + sampledReturn) + monthlyContribution
       - if capital < 0: capital = 0
     记录 sampledPath（每年存一个点，减少内存）
3. 对 finals 排序，计算各分位数路径
4. 计算正收益概率和跑赢通胀概率
```

**为什么从 `monthlyReturn` 而非 `(value[t]-value[t-1])/value[t-1]` 采样？** 后者包含了现金流存取的影响——如果某月有一笔大额存入，组合价值的月变化会异常大，但这不代表投资回报，会污染采样分布。

**概率计算**：
- `probabilityPositive`：终值 > 初始资本 + 总定投
- `probabilityBeatInflation`：终值 > $initialCapital \times 1.02^{years}$（2% 年通胀假设）

### 8.2 `getPercentile(finalValues, p) → number`

在已排序的终值数组中取第 p 分位数。

---

## 9. `withdrawal.ts` — 安全提款率分析 (SWR)

### 9.1 整体架构

SWR 分析回答："如果每年从组合中提款 X%，在历史上所有可能的退休起始点，有多少个能坚持到退休结束？"

```
computeSWR
  ├── getStartDates → 枚举所有可能的退休起始月
  ├── for each rate × startDate:
  │     └── simulateSinglePeriod → 运行一次完整退休回测
  │           ├── generateWithdrawalCashflows → 生成 CPI 调整的年度提款方案
  │           └── runBacktest → 复用回测引擎
  └── 汇总 sweepResults → 成功率、安全提款率、中位数/最差终值
```

### 9.2 `getStartDates(assetReturns, retirementYears) → string[]`

**功能**：找出所有可以进行完整退休模拟的起始月份。

**逻辑**：
1. 收集所有资产共有数据的月份
2. 排序
3. 只保留那些 `起始月 + retirementYears × 12` 之后仍有数据覆盖的月份

### 9.3 `getCPI(cpiSeries, date) → number | null`

**功能**：获取某个日期的 CPI 值。三级查找：
1. 精确匹配完整日期（如 `"2020-01-31"`）
2. 匹配同月（如输入 `"2020-01"`，找到 `"2020-01-31"`）
3. 回溯最近的历史值（如查 `"2020-01"` 只有 `"1999-12-31"` 的数据 → 用后者）

### 9.4 `generateWithdrawalCashflows(startDate, retirementYears, initialCapital, withdrawalRate, cpiSeries) → CashflowEvent[]`

**功能**：生成退休期间的年度提款方案。

**固定百分比策略 (4% 规则)**：
- 第一年提款 = `initialCapital × withdrawalRate`
- 第 N 年提款 = 第一年提款 × `CPI_yearN / CPI_year1`

提款发生在每年 12 月 31 日。

### 9.5 `simulateSinglePeriod(...) → SinglePeriodResult`

**功能**：模拟一个退休起始点的一次完整退休。

**流程**：
1. 生成 CPI 调整的提款方案
2. 构造 `BacktestParameters` 并运行 `runBacktest()`
3. 分析结果：
   - **成功条件**：组合在退休期内从未归零，且所有计划的提款都完全执行
   - **耗尽日期**：第一个 `portfolioValue ≤ 0` 或提款不足的日期
   - **年度结果**：逐年汇总实际提款 vs 计划提款、年终组合价值、年收益

### 9.6 `computeSWR(holdings, assetReturns, cpiSeries, options) → SWRResult`

**功能**：计算完整 SWR 分析。

**参数**：
- `retirementYears`：退休年限（通常 30）
- `ratesToTest`：默认 2%~10%，步长 0.5%
- `fxRates`：如果组合包含非显示货币资产，必须提供

**输出含义**：

| 字段 | 说明 |
|------|------|
| `successRate` | 4% 规则的生存概率 |
| `safeWithdrawalRate` | 100% 成功率的最高提款率 |
| `medianFinalBalance` | 4% 规则下各起始点的中位终值 |
| `worstCaseFinalBalance` | 最差起始点的终值 |
| `sweepResults` | `startDate × rate` 完整网格，用于热力图 |

**内存优化**：详细年度结果 (`allPeriodResults`) 仅对 4% 率存储，避免 $N_{periods} \times N_{rates}$ 的内存膨胀。

---

## 10. `backtest.ts` — 回测管线编排

### 10.1 `runBacktest(params, assetReturnSeries, fxRates, cpiSeries) → BacktestResult`

这是引擎的入口函数，将前 9 个模块串联起来。完整管线：

```
 1. buildMonthGrid(start, end)         → 生成月度网格
 2. 对每个持仓:
      alignReturnsToGrid                → 将收益对齐到网格
      alignFxRatesToGrid                → 将 FX 对齐到网格 (如果币种不同)
      convertReturnSeries               → 转换收益货币 (如果币种不同)
 3. findEffectiveStartIndex             → 找到所有持仓都有数据的第一个月
    切掉前面的 null 月份（有效起始日后移）
 4. assertNoMissingReturnsAfterStart    → 起始日后还有 null = 数据错误 → 报错
 5. expandCashflows                     → 展开定期现金流
 6. compoundPortfolio                   → 逐月复利
 7. buildTimeSeries                     → 构建 MonthlyTimeSeriesPoint[]
 8. adjustForInflation (optional)       → CPI 缩减 + 交换 nominal/real
    recomputePathDerivedFields          → 基于实际值重新算回撤/累计收益
 9. computeMetrics                      → 汇总指标
10. computeAnnualReturns                → 年度收益
11. computeReturnDistribution           → 月度收益分布直方图
```

### 10.2 `buildMonthGrid(startDate, endDate) → string[]`

**输入格式**：`"YYYY-MM"`（如 `"2020-01"`），内部补 `-01` 解析为当月 1 号。

**输出**：从 start 到 end 的每月最后一天，如 `["2020-01-31", "2020-02-29", "2020-03-31"]`。

### 10.3 `buildTimeSeries(...) → MonthlyTimeSeriesPoint[]`

将 `compoundPortfolio` 的输出组合成完整的 `MonthlyTimeSeriesPoint` 结构。

**月度收益计算**：TWR = 加权各资产收益
$$monthlyReturn_m = \frac{\sum w_{a,m} \cdot r_{a,m}}{\sum w_{a,m}}$$

使用资产级收益而非组合价值变化，确保现金流注入/提款不影响收益数字。

**回撤**：维护历史峰值，$DD = \frac{value - peak}{peak}$。

### 10.4 `findEffectiveStartIndex(alignedReturns) → number`

找到第一个所有持仓都有非 null 收益的月份索引。如果完全没有 → 返回 -1 → 抛出 `'No overlapping return data'`。

### 10.5 `assertNoMissingReturnsAfterStart(alignedReturns, monthGrid, holdings)`

在有效起始日之后，如果还有 `null`，说明数据真实缺失（不是"尚未开始"），抛出带资产名称的报错。

### 10.6 `recomputePathDerivedFields(timeSeries, initialCapital) → MonthlyTimeSeriesPoint[]`

通胀调整后重新计算回撤和累计收益。因为调整后的实际价值序列的峰值/回撤与名义序列不同。

### 10.7 `computeReturnDistribution(timeSeries) → { bucket, count }[]`

将月度收益分入 7 个桶：`<-5%`, `-5%~-3%`, `-3%~-1%`, `-1%~1%`, `1%~3%`, `3%~5%`, `>5%`。用于收益分布直方图。

---

## 附录：数据流全景

```
原始 CSV (价格)
  │
  ├── computeMonthlyReturns()  ──→  MonthlyReturnPoint[] (本币月度收益)
  │
  ├── alignReturnsToGrid()     ──→  (number|null)[] (对齐到月网格)
  │
  ├── convertReturn()          ──→  货币转换 (通过 FX 比率变化)
  │     └── alignFxRatesToGrid()      FX 水平值对齐到月网格
  │
  ├── compoundPortfolio()      ──→  { values, cashflowImpacts, ... }
  │     ├── expandCashflows()         定期现金流 → 日期 Map
  │     └── checkRebalanceTrigger()   判断是否触发再平衡
  │
  ├── buildTimeSeries()        ──→  MonthlyTimeSeriesPoint[] (名义)
  │
  ├── adjustForInflation()     ──→  MonthlyTimeSeriesPoint[] (实际)
  │
  ├── computeMetrics()         ──→  BacktestMetrics (30+ 指标)
  │     ├── computeAnnualReturns()     年度收益
  │     ├── computeMaxDrawdown()       最大回撤
  │     ├── computeRollingReturns()    滚动收益
  │     └── computeDistributionStats() 偏度/峰度
  │
  ├── runMonteCarlo()          ──→  MonteCarloResult (未来模拟)
  │
  └── computeSWR()             ──→  SWRResult (退休分析)
        └── simulateSinglePeriod() × N_periods × N_rates
              └── runBacktest()  ← 复用回测管线
```
