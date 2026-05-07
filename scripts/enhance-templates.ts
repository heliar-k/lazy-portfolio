/**
 * Regenerate portfolio registry.ts from cached scrape data,
 * with proper descriptions and Chinese translations.
 *
 * Usage: npx tsx scripts/enhance-templates.ts
 */

import * as fs from 'fs';

const CACHE_FILE = '/tmp/lazy_portfolio_scrape_cache.json';
const OUTPUT_FILE = 'src/portfolios/registry.ts';

interface ScrapedPortfolio {
  code: string;
  name: string;
  author: string;
  slug: string;
  description: string;
  holdings: Record<string, number>;
  stocks: number;
  bonds: number;
  commodities: number;
}

const DESCRIPTIONS: Record<string, string> = {
  'ray-dalio-all-weather': 'Risk-parity portfolio designed for all economic seasons with stocks, long bonds, intermediate bonds, commodities, and gold.',
  'harry-browne-permanent': 'Equal split across stocks, long bonds, gold, and cash for capital preservation in any market.',
  'mebane-faber-ivy': 'Equal-weight 5-asset portfolio: US stocks, international stocks, REITs, bonds, and commodities.',
  'scott-burns-couch': 'Simple two-fund portfolio: half US stocks, half inflation-protected bonds.',
  'fundadvice-ultimate-buy-hold': 'Highly diversified 12-fund portfolio with US, international, REIT, and bond allocations.',
  'bill-bernstein-no-brainer': 'Equal-weight 4-fund portfolio: large cap, small cap, international, and short-term bonds.',
  'stocks-bonds-60-40': 'The classic 60/40 balanced portfolio: 60% US stocks, 40% US bonds.',
  'stocks-bonds-40-60': 'Conservative 40/60 portfolio: 40% US stocks, 60% US bonds for lower volatility.',
  'rick-ferri-core-four': 'Core four-fund portfolio with US stocks, international stocks, REITs, and total bonds.',
  'bill-schultheis-coffee-house': 'Diversified 7-fund slice-and-dice portfolio with value, small-cap, REIT, international, and bonds.',
  'bogleheads-three-funds': 'Simple three-fund portfolio: US stocks, international stocks, and total bonds.',
  'bogleheads-four-funds': 'Four-fund Bogleheads portfolio adding TIPS to the classic three-fund.',
  'david-swensen-lazy': 'Swensen-inspired lazy portfolio with diversified equity, REIT, and bond allocation.',
  'david-swensen-yale-endowment': 'The Yale model adapted for individual investors with heavy equity and alternative assets.',
  'warren-buffett': '90% S&P 500 and 10% short-term government bonds, as recommended by Warren Buffett.',
  'simple-path-to-wealth': 'Simple two-fund portfolio of US stocks and bonds for financial independence.',
  'golden-butterfly': 'Modified permanent portfolio with equal 20% splits across total market, small-cap value, long bonds, short bonds, and gold.',
  'larry-portfolio': 'Low-risk portfolio with heavy tilt toward small-cap value and bonds, by Larry Swedroe.',
  'pinwheel': 'Diversified 8-fund portfolio with multiple equity factors, bonds, REITs, gold, and cash.',
  'second-graders-starter': 'Simple three-fund starter portfolio recommended by Allan Roth.',
  'talmud-portfolio': 'One-third each in stocks, REITs, and bonds based on ancient Talmudic wisdom.',
  'sandwich-portfolio': 'Diversified 8-fund portfolio with broad equity, bond, REIT, and commodity exposure.',
  '7twelve-portfolio': 'Multi-asset portfolio with 12 asset classes across stocks, bonds, real assets, and alternatives.',
  'desert-portfolio': 'Simple three-fund portfolio: 60% US stocks, 30% bonds, 10% gold.',
  'gone-fishin-portfolio': 'Set-and-forget 10-fund portfolio with global diversification.',
  'global-market-portfolio': 'Market-cap weighted global portfolio across all major asset classes.',
  'simplified-permanent-portfolio': 'Streamlined permanent portfolio: stocks, long bonds, and gold only.',
  'all-weather-2x-leveraged': 'Leveraged All Weather portfolio using 2x ETFs for higher risk-adjusted returns.',
  'golden-butterfly-2x-leveraged': 'Leveraged Golden Butterfly portfolio using 2x ETFs.',
  'stocks-bonds-60-40-esg': 'The classic 60/40 with ESG-screened ETFs for sustainable investing.',
  'stocks-bonds-40-60-esg': 'Conservative 40/60 with ESG-screened ETFs.',
  'marc-faber-portfolio': 'Diversified portfolio with global stocks, bonds, REITs, gold, and commodities.',
  'lifeStrategy-income-fund': 'Vanguard LifeStrategy Income: 20% stocks, 80% bonds for conservative income.',
  'lifeStrategy-conservative-growth': 'Vanguard LifeStrategy Conservative Growth: 40% stocks, 60% bonds.',
  'lifeStrategy-moderate-growth': 'Vanguard LifeStrategy Moderate Growth: 60% stocks, 40% bonds.',
  'lifeStrategy-growth-fund': 'Vanguard LifeStrategy Growth: 80% stocks, 20% bonds for long-term growth.',
  'nano-portfolio': 'Ultra-simple 5-fund portfolio capturing the global market with minimal holdings.',
  'one-decision-portfolio': 'Simple 5-fund set-and-forget portfolio for lifelong investing.',
  'weird-portfolio': 'Unconventional portfolio with global equities, REITs, gold, long bonds, and small-cap value.',
  'cockroach-portfolio': 'Resilient portfolio designed to survive any market environment.',
  'ulcer-free-strategy': 'Low-volatility strategy focused on minimizing drawdowns and providing smooth returns.',
  'ark-tech-portfolio': 'High-growth tech-focused portfolio using ARK innovation ETFs.',
  'zefiro-portfolio': 'Balanced multi-asset portfolio with global diversification.',
  'dedalo-three': 'Simple two-fund portfolio mixing stocks and bonds.',
  'dedalo-four': 'Three-fund portfolio adding gold to the classic stock/bond mix.',
  'dedalo-eleven': 'Comprehensive 9-fund portfolio with extensive global diversification.',
  'aim-bold-strategy': 'Aggressive multi-asset strategy with heavy equity and commodity exposure.',
  'shield-strategy': 'Defensive strategy focused on capital preservation with bonds and gold.',
  'aim-comfortable-trip': 'Moderate growth strategy balancing equities with bonds and commodities.',
  'in-saecula-saeculorum': 'Long-term multi-asset portfolio designed to last for generations.',
  'four-seasons-portfolio': 'All-weather portfolio with seven diverse asset classes for year-round performance.',
  'margherita-portfolio': 'Classic Italian-named portfolio with broad global diversification.',
  'capricciosa-portfolio': 'Rich Italian-named portfolio with extensive multi-asset allocation.',
  'pepperoni-portfolio': 'Spicy Italian-named portfolio with commodities and aggressive allocation.',
  'diavola-portfolio': 'Bold Italian-named portfolio with a devilish risk appetite.',
  'gold-pivot-ptf': 'Tactical gold-focused portfolio that pivots based on market conditions.',
  'odd-stats-strategy': 'Statistical arbitrage-inspired multi-asset strategy.',
  'pisi-portfolio': 'Balanced four-fund portfolio for steady growth.',
  'golden-ratio-portfolio': 'Fibonacci-inspired allocation across six asset classes.',
  'jp-morgan-balanced-portfolio': 'Institution-grade balanced portfolio with 9 ETFs across stocks and bonds.',
  'new-talmud': 'Modern take on the Talmud portfolio with updated ETFs.',
  'berkshire-hathaway': '100% Berkshire Hathaway as a proxy for concentrated value investing.',
  'six-ways-from-sunday': 'Six-fund portfolio with comprehensive diversification across all major assets.',
  'long-term-portfolio': 'Long-term oriented 6-fund portfolio for patient investors.',
  'four-square': 'Simple four-fund portfolio with balanced allocation.',
  'five-fold': 'Five-fund portfolio with global stock and bond diversification.',
  'seven-value': 'Value-tilted 7-fund portfolio with factor exposure.',
  'eliminate-fat-tails': 'Portfolio designed to reduce extreme outcomes with broad diversification.',
  'simple-and-cheap': 'Low-cost 5-fund portfolio using the most affordable ETFs.',
  'tilt-toward-value': 'Value-factor tilted 7-fund portfolio for long-term factor premium.',
  'gretchen-tai-portfolio': 'Multi-asset portfolio with global stocks, bonds, and alternatives.',
  'robust': 'Highly diversified portfolio across US, international, emerging, REITs, bonds, TIPS, and commodities.',
  'ideal-index': 'Multi-asset index portfolio with US and international stocks, bonds, TIPS, and REITs.',
  'merrill-lynch-edge-select-aggressive': 'Aggressive model portfolio with 12 ETFs tilted toward growth.',
  'merrill-lynch-edge-select-moderately-aggressive': 'Moderately aggressive 12-ETF model with growth tilt.',
  'merrill-lynch-edge-select-moderate': 'Moderate 12-ETF model portfolio with balanced growth and income.',
  'merrill-lynch-edge-select-moderately-conservative': 'Moderately conservative 12-ETF model with income focus.',
  'merrill-lynch-edge-select-conservative': 'Conservative 12-ETF model portfolio focused on capital preservation.',
  'rob-arnott-portfolio': 'Fundamental index portfolio with factor tilts by Rob Arnott of Research Affiliates.',
  'cowards-portfolio': 'Highly diversified 9-fund portfolio for risk-averse investors.',
  'margaritaville': 'Relaxed three-fund portfolio inspired by Jimmy Buffett.',
  'ultimate-buy-and-hold-strategy': 'Comprehensive buy-and-hold portfolio with 10 ETFs.',
  'jane-bryant-quinn-portfolio': 'Straightforward 5-fund portfolio by personal finance columnist Jane Bryant Quinn.',
  'perfect-portfolio': '7-fund portfolio designed for optimal risk-adjusted returns.',
  'sheltered-sam-100-0': 'Aggressive 100/0 equity portfolio for maximum growth.',
  'sheltered-sam-90-10': 'Growth-oriented 90/10 portfolio with minimal bond exposure.',
  'sheltered-sam-80-20': 'Growth 80/20 portfolio with 80% equities.',
  'sheltered-sam-70-30': 'Moderately aggressive 70/30 portfolio.',
  'sheltered-sam-60-40': 'Balanced 60/40 Sheltered Sam portfolio.',
  'sheltered-sam-50-50': 'Evenly split 50/50 Sheltered Sam portfolio.',
  'sheltered-sam-40-60': 'Conservative 40/60 Sheltered Sam portfolio.',
  'sheltered-sam-30-70': 'Income-oriented 30/70 Sheltered Sam portfolio.',
  'sheltered-sam-20-80': 'Conservative 20/80 Sheltered Sam portfolio.',
  'sheltered-sam-10-90': 'Very conservative 10/90 Sheltered Sam portfolio.',
  'sheltered-sam-0-100': '100% bonds Sheltered Sam portfolio for maximum safety.',
};

const ZH_NAMES: Record<string, string> = {
  'us-stocks': '美国股票',
  'gold': '黄金',
  '10-year-treasury': '10年期国债',
  'short-term-treasury': '短期国债',
  'emerging-markets': '新兴市场股票',
  'european-stocks': '欧洲股票',
  'world-stocks': '全球发达市场股票',
  'all-country-world-stocks': '全球全市场股票',
  'us-stocks-esg': 'ESG美国股票',
  'us-stocks-momentum': '动量美国股票',
  'us-stocks-minimum-volatility': '低波动美国股票',
  'us-stocks-value': '价值美国股票',
  'us-stocks-quality': '质量美国股票',
  'us-stocks-equal-weight': '等权美国股票',
  'technology': '科技股',
  'total-bond-us': '美国全债市',
  'total-bond-developed-world-ex-us': '发达市场全债市',
  'us-inflation-protection': '美国通胀保护',
  'us-cash': '美国现金',
  'ray-dalio-all-weather': '全天候组合',
  'harry-browne-permanent': '永久组合',
  'mebane-faber-ivy': '常春藤组合',
  'scott-burns-couch': '懒人沙发组合',
  'fundadvice-ultimate-buy-hold': '终极买入持有组合',
  'bill-bernstein-no-brainer': '无脑组合',
  'stocks-bonds-60-40': '60/40股债组合',
  'stocks-bonds-40-60': '40/60保守组合',
  'rick-ferri-core-four': '核心四基金',
  'bill-schultheis-coffee-house': '咖啡馆组合',
  'bogleheads-three-funds': '三基金组合',
  'bogleheads-four-funds': '四基金组合',
  'david-swensen-lazy': '斯文森懒人组合',
  'david-swensen-yale-endowment': '耶鲁捐赠基金模型',
  'warren-buffett': '巴菲特组合',
  'simple-path-to-wealth': '简单致富之路',
  'golden-butterfly': '金蝴蝶组合',
  'larry-portfolio': '拉里组合',
  'pinwheel': '风车组合',
  'second-graders-starter': '二年级生入门组合',
  'talmud-portfolio': '塔木德组合',
  'sandwich-portfolio': '三明治组合',
  '7twelve-portfolio': '7-12组合',
  'desert-portfolio': '沙漠组合',
  'gone-fishin-portfolio': '钓鱼去组合',
  'global-market-portfolio': '全球市场组合',
  'simplified-permanent-portfolio': '简化永久组合',
  'all-weather-2x-leveraged': '2倍杠杆全天候',
  'stocks-bonds-60-40-esg': 'ESG 60/40组合',
  'marc-faber-portfolio': '麦嘉华组合',
  'nano-portfolio': '纳米组合',
  'one-decision-portfolio': '一决定组合',
  'lifeStrategy-income-fund': '生命策略收入基金',
  'lifeStrategy-conservative-growth': '生命策略保守成长',
  'lifeStrategy-moderate-growth': '生命策略适度成长',
  'lifeStrategy-growth-fund': '生命策略成长基金',
  'ark-tech-portfolio': 'ARK科技组合',
  'weird-portfolio': '怪异组合',
  'cockroach-portfolio': '蟑螂组合',
  'ulcer-free-strategy': '无忧策略',
  'berkshire-hathaway': '伯克希尔哈撒韦',
  'four-seasons-portfolio': '四季组合',
  'golden-ratio-portfolio': '黄金比例组合',
  'jp-morgan-balanced-portfolio': '摩根大通平衡组合',
  'new-talmud': '新塔木德组合',
  'six-ways-from-sunday': '六路组合',
  'rob-arnott-portfolio': 'Rob Arnott组合',
  'robust': '稳健多元组合',
};

function generateDesc(holdings: Record<string, number>): string {
  const entries = Object.entries(holdings).filter(([, w]) => w > 0);
  if (entries.length === 0) return 'Broad asset class benchmark.';
  if (entries.length === 1) return `100% ${entries[0][0]}.`;
  if (entries.length === 2) {
    const [a, b] = entries;
    return `${a[1].toFixed(0)}% ${a[0]}, ${b[1].toFixed(0)}% ${b[0]}.`;
  }
  // For 3+ holdings, just describe the allocation profile
  const stocks = entries.filter(([s]) =>
    ['VTI','VOO','SPY','VV','VTV','VUG','VO','VOE','IJS','IJR','IJT','VIG','VYM','MTUM','USMV','QUAL','RSP','IUSV','ESGV','QQQ','SSO','XLE','XLV','XLP','XLU','DES','DIG','EUSA','ARKK','ARKG','ARKW','ARKQ','VEA','EFA','EFV','VGK','VPL','SCZ','DLS','EWJ','EWL','EWU','IMTM','VEU','VWO','EEM','AAXJ','VT','URE','SAA','DFUSX','DFEOX','DFALX','DFIEX','DFCEX','CAPE'].includes(s)
  ).reduce((sum, [, w]) => sum + w, 0);
  const bonds = entries.filter(([s]) =>
    ['BND','TLT','IEF','IEI','SHY','BSV','UST','BIL','TIP','LQD','HYG','MBB','CWB','PFF','JNK','SPLB','BNDX','EMB','NUBD','WIP','DFIHX','DIPSX','UBT'].includes(s)
  ).reduce((sum, [, w]) => sum + w, 0);
  const alts = entries.filter(([s]) =>
    ['GLD','GLTR','UGL','VNQ','REET','DBC','GSG','DBMF'].includes(s)
  ).reduce((sum, [, w]) => sum + w, 0);

  const parts: string[] = [];
  if (stocks > 0) parts.push(`${stocks.toFixed(0)}% stocks`);
  if (bonds > 0) parts.push(`${bonds.toFixed(0)}% bonds`);
  if (alts > 0) parts.push(`${alts.toFixed(0)}% alternatives`);
  return `${entries.length}-fund portfolio: ${parts.join(', ')}.`;
}

function determineCategory(p: ScrapedPortfolio): string {
  const s = p.stocks;
  const b = p.bonds;
  const c = p.commodities;
  if (s >= 80) return 'Aggressive';
  if (b >= 70) return 'Conservative';
  if (c >= 50) return 'Commodities';
  if (s >= 50 && b >= 30) return 'Classic';
  if (s >= 40 && b >= 30 && c >= 10) return 'Risk Parity';
  if (s >= 40 && b >= 40) return 'Balanced';
  if (s >= 50) return 'Growth';
  if (b >= 40) return 'Income';
  return 'Other';
}

function determineRiskLevel(p: ScrapedPortfolio): 'low' | 'medium' | 'high' {
  const s = p.stocks;
  if (s <= 30) return 'low';
  if (s >= 80) return 'high';
  return 'medium';
}

function escapeStr(s: string): string {
  return s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
}

// Main
const cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8')) as Record<string, ScrapedPortfolio>;
const entries = Object.values(cache);

// Merge benchmark entries (not in cache)
const benchmarkSlugs = ['us-stocks', 'gold', '10-year-treasury', 'short-term-treasury', 'emerging-markets'];
for (const slug of benchmarkSlugs) {
  if (!entries.find(e => e.slug === slug)) {
    entries.push({
      code: '',
      name: slug.split('-').map(w => w[0].toUpperCase() + w.slice(1)).join(' '),
      author: '',
      slug,
      description: '',
      holdings: {},
      stocks: slug.includes('stocks') || slug.includes('emerging') ? 100 : 0,
      bonds: slug.includes('treasury') || slug.includes('bond') ? 100 : 0,
      commodities: slug === 'gold' ? 100 : 0,
    });
  }
}

// Sort by category then name
const byCategory = new Map<string, ScrapedPortfolio[]>();
for (const p of entries) {
  const cat = determineCategory(p);
  if (!byCategory.has(cat)) byCategory.set(cat, []);
  byCategory.get(cat)!.push(p);
}

// Generate output
const lines: string[] = [
  '// Auto-generated from lazyportfolioetf.com API',
  `// Generated: ${new Date().toISOString()}`,
  `// Total portfolios: ${entries.length}`,
  '',
  "import type { PortfolioDefinition } from '../engine/types';",
  '',
  'interface TemplateEntry {',
  '  id: string;',
  '  name: string;',
  '  nameZh: string;',
  '  description: string;',
  '  descriptionZh: string;',
  '  category: string;',
  "  riskLevel: 'low' | 'medium' | 'high';",
  '  holdings: { symbol: string; weight: number }[];',
  '}',
  '',
  'const RAW_TEMPLATES: TemplateEntry[] = [',
];

let totalWritten = 0;
for (const [category, portfolios] of byCategory) {
  lines.push(`  // ---- ${category} ----`);
  for (const p of portfolios) {
    const holdings = Object.entries(p.holdings)
      .filter(([, w]) => w > 0)
      .map(([symbol, weight]) => ({ symbol, weight: weight / 100 }));

    const holdingStr = holdings.length > 0
      ? holdings.map(h => `{ symbol: '${h.symbol}', weight: ${h.weight} }`).join(', ')
      : '';

    const desc = DESCRIPTIONS[p.slug] || generateDesc(p.holdings);
    const zhName = ZH_NAMES[p.slug] || '';
    const risk = determineRiskLevel(p);

    lines.push('  {');
    lines.push(`    id: '${p.slug || p.code.toLowerCase()}',`);
    lines.push(`    name: '${escapeStr(p.name)}',`);
    lines.push(`    nameZh: '${zhName}',`);
    lines.push(`    description: '${escapeStr(desc)}',`);
    lines.push(`    descriptionZh: '',`);
    lines.push(`    category: '${category}',`);
    lines.push(`    riskLevel: '${risk}',`);
    lines.push(`    holdings: [${holdingStr}],`);
    lines.push('  },');
    totalWritten++;
  }
}

lines.push('];');
lines.push('');
lines.push('export function getPortfolioTemplates(');
lines.push('  getAssetBySymbol: (symbol: string) => { symbol: string; name: string; nameZh?: string; assetClass: string; region: string; currency: string; provider: string; expenseRatio: number; inceptionDate: string } | null,');
lines.push('): PortfolioDefinition[] {');
lines.push('  return RAW_TEMPLATES.map((t) => ({');
lines.push('    id: t.id,');
lines.push('    name: t.name,');
lines.push('    description: t.description,');
lines.push('    holdings: t.holdings');
lines.push('      .map((h) => {');
lines.push('        const asset = getAssetBySymbol(h.symbol);');
lines.push('        if (!asset) return null;');
lines.push('        return {');
lines.push('          asset: {');
lines.push('            symbol: asset.symbol,');
lines.push('            name: asset.name,');
lines.push('            nameZh: asset.nameZh,');
lines.push("            assetClass: asset.assetClass as PortfolioDefinition['holdings'][0]['asset']['assetClass'],");
lines.push("            region: asset.region as PortfolioDefinition['holdings'][0]['asset']['region'],");
lines.push('            currency: asset.currency,');
lines.push('            provider: asset.provider,');
lines.push('            expenseRatio: asset.expenseRatio,');
lines.push('            inceptionDate: asset.inceptionDate,');
lines.push('          },');
lines.push('          targetWeight: h.weight,');
lines.push('        };');
lines.push('      })');
lines.push('      .filter((h): h is NonNullable<typeof h> => h !== null),');
lines.push('    tags: [t.category.toLowerCase(), t.riskLevel],');
lines.push('  }));');
lines.push('}');
lines.push('');
lines.push('export function getTemplateMetadata(): (TemplateEntry & { holdingCount: number })[] {');
lines.push('  return RAW_TEMPLATES.map((t) => ({');
lines.push('    ...t,');
lines.push('    holdingCount: t.holdings.length,');
lines.push('  }));');
lines.push('}');
lines.push('');
lines.push('export type { TemplateEntry };');
lines.push('');

fs.writeFileSync(OUTPUT_FILE, lines.join('\n'));
console.log(`Wrote ${OUTPUT_FILE} (${totalWritten} portfolios in ${byCategory.size} categories)`);

// Stats
let withDesc = 0, withZh = 0, autoDesc = 0;
for (const p of entries) {
  if (DESCRIPTIONS[p.slug]) withDesc++;
  else if (Object.keys(p.holdings).length > 0) autoDesc++;
  if (ZH_NAMES[p.slug]) withZh++;
}
console.log(`Manual descriptions: ${withDesc}, Auto-generated: ${autoDesc}, Chinese names: ${withZh}`);
