import type { PortfolioDefinition } from '../engine/types';

/**
 * Pre-built lazy portfolio templates.
 * Each entry maps ETF tickers to target weights (0-1).
 * More portfolios can be added via the scraping script.
 */
interface TemplateEntry {
  id: string;
  name: string;
  nameZh: string;
  description: string;
  descriptionZh: string;
  category: string;
  riskLevel: 'low' | 'medium' | 'high';
  holdings: { symbol: string; weight: number }[];
}

const RAW_TEMPLATES: TemplateEntry[] = [
  // ---- Classic ----
  {
    id: 'classic-6040',
    name: 'Classic 60/40',
    nameZh: '经典60/40组合',
    description: '60% US total stock market, 40% US aggregate bonds. The benchmark for all lazy portfolios.',
    descriptionZh: '60%美国全市场股票 + 40%美国综合债券。所有懒人组合的基准。',
    category: 'Classic',
    riskLevel: 'medium',
    holdings: [
      { symbol: 'VTI', weight: 0.60 },
      { symbol: 'BND', weight: 0.40 },
    ],
  },
  {
    id: 'three-fund',
    name: 'Three-Fund Portfolio',
    nameZh: '三基金组合',
    description: 'US total market + International total market + US aggregate bonds. Popularized by Bogleheads.',
    descriptionZh: '美国全市场 + 国际全市场 + 美国综合债券。由Bogleheads推广。',
    category: 'Classic',
    riskLevel: 'medium',
    holdings: [
      { symbol: 'VTI', weight: 0.42 },
      { symbol: 'VEA', weight: 0.18 },
      { symbol: 'BND', weight: 0.40 },
    ],
  },
  {
    id: 'all-weather',
    name: 'All Weather Portfolio',
    nameZh: '全天候组合',
    description: 'Ray Dalio\'s risk-parity inspired allocation for all economic environments.',
    descriptionZh: 'Ray Dalio的风险平价启发式配置，适用于所有经济环境。',
    category: 'Risk Parity',
    riskLevel: 'low',
    holdings: [
      { symbol: 'VTI', weight: 0.30 },
      { symbol: 'TLT', weight: 0.40 },
      { symbol: 'IEF', weight: 0.15 },
      { symbol: 'GLD', weight: 0.075 },
      { symbol: 'BIL', weight: 0.075 },
    ],
  },
  {
    id: 'permanent',
    name: 'Permanent Portfolio',
    nameZh: '永久组合',
    description: 'Harry Browne\'s 25/25/25/25 split across stocks, long bonds, gold, and cash.',
    descriptionZh: 'Harry Browne的25/25/25/25配置：股票、长期债券、黄金、现金。',
    category: 'Classic',
    riskLevel: 'low',
    holdings: [
      { symbol: 'VTI', weight: 0.25 },
      { symbol: 'TLT', weight: 0.25 },
      { symbol: 'GLD', weight: 0.25 },
      { symbol: 'BIL', weight: 0.25 },
    ],
  },
  // ---- Growth ----
  {
    id: 'aggressive-growth',
    name: 'Aggressive Growth',
    nameZh: '激进成长组合',
    description: '100% equity allocation with heavy US tilt. High risk, high potential return.',
    descriptionZh: '100%股票配置，偏向美国市场。高风险、高潜在回报。',
    category: 'Growth',
    riskLevel: 'high',
    holdings: [
      { symbol: 'VTI', weight: 0.60 },
      { symbol: 'VEA', weight: 0.25 },
      { symbol: 'VWO', weight: 0.15 },
    ],
  },
  {
    id: 'golden-butterfly',
    name: 'Golden Butterfly',
    nameZh: '金蝴蝶组合',
    description: 'A modified permanent portfolio with small-cap value tilt for higher returns.',
    descriptionZh: '改进的永久组合，加入小盘价值股以提高回报。',
    category: 'Classic',
    riskLevel: 'medium',
    holdings: [
      { symbol: 'VTI', weight: 0.20 },
      { symbol: 'VOO', weight: 0.20 },
      { symbol: 'TLT', weight: 0.20 },
      { symbol: 'BIL', weight: 0.20 },
      { symbol: 'GLD', weight: 0.20 },
    ],
  },
  // ---- Income ----
  {
    id: 'income-focused',
    name: 'Income Focused',
    nameZh: '收入导向组合',
    description: 'Heavy bond allocation with dividend stocks for regular income.',
    descriptionZh: '重仓债券配置，辅以股息股票，追求稳定收入。',
    category: 'Income',
    riskLevel: 'low',
    holdings: [
      { symbol: 'VTI', weight: 0.25 },
      { symbol: 'BND', weight: 0.40 },
      { symbol: 'IEF', weight: 0.20 },
      { symbol: 'VNQ', weight: 0.15 },
    ],
  },
  {
    id: 'no-brainer',
    name: 'No-Brainer Portfolio',
    nameZh: '无脑组合',
    description: 'Simple 4-fund portfolio for any investor. Set it and forget it.',
    descriptionZh: '适合任何投资者的简单四基金组合。设置后即可忘记。',
    category: 'Simple',
    riskLevel: 'medium',
    holdings: [
      { symbol: 'VTI', weight: 0.35 },
      { symbol: 'VEA', weight: 0.15 },
      { symbol: 'BND', weight: 0.40 },
      { symbol: 'GLD', weight: 0.10 },
    ],
  },
  // ---- Conservative ----
  {
    id: 'conservative',
    name: 'Conservative Income',
    nameZh: '保守收入组合',
    description: 'Capital preservation focus with minimal equity exposure.',
    descriptionZh: '以保本为目标，股票敞口极小。',
    category: 'Income',
    riskLevel: 'low',
    holdings: [
      { symbol: 'VTI', weight: 0.15 },
      { symbol: 'BND', weight: 0.35 },
      { symbol: 'IEF', weight: 0.20 },
      { symbol: 'BIL', weight: 0.20 },
      { symbol: 'GLD', weight: 0.10 },
    ],
  },
  {
    id: 'world-equity',
    name: 'World Equity',
    nameZh: '全球股票组合',
    description: 'Market-cap weighted global equity allocation across US, developed, and emerging markets.',
    descriptionZh: '按市值加权的全球股票配置，覆盖美国、发达市场和新兴市场。',
    category: 'Growth',
    riskLevel: 'high',
    holdings: [
      { symbol: 'VTI', weight: 0.50 },
      { symbol: 'VEA', weight: 0.35 },
      { symbol: 'VWO', weight: 0.15 },
    ],
  },
];

/**
 * Get all available portfolio templates with resolved holdings.
 */
export function getPortfolioTemplates(
  getAssetBySymbol: (symbol: string) => { symbol: string; name: string; nameZh?: string; assetClass: string; region: string; currency: string; provider: string; expenseRatio: number; inceptionDate: string } | null,
): PortfolioDefinition[] {
  return RAW_TEMPLATES.map((t) => ({
    id: t.id,
    name: t.name,
    description: t.description,
    holdings: t.holdings
      .map((h) => {
        const asset = getAssetBySymbol(h.symbol);
        if (!asset) return null;
        return {
          asset: {
            symbol: asset.symbol,
            name: asset.name,
            nameZh: asset.nameZh,
            assetClass: asset.assetClass as PortfolioDefinition['holdings'][0]['asset']['assetClass'],
            region: asset.region as PortfolioDefinition['holdings'][0]['asset']['region'],
            currency: asset.currency,
            provider: asset.provider,
            expenseRatio: asset.expenseRatio,
            inceptionDate: asset.inceptionDate,
          },
          targetWeight: h.weight,
        };
      })
      .filter((h): h is NonNullable<typeof h> => h !== null),
    tags: [t.category.toLowerCase(), t.riskLevel],
  }));
}

/**
 * Get raw template metadata for display (before ETF resolution).
 */
export function getTemplateMetadata(): (TemplateEntry & { holdingCount: number })[] {
  return RAW_TEMPLATES.map((t) => ({
    ...t,
    holdingCount: t.holdings.length,
  }));
}

export type { TemplateEntry };
