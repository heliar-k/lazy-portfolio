/**
 * Scrape portfolio templates from lazyportfolioetf.com API.
 *
 * Usage: npx tsx scripts/scrape-templates.ts
 *
 * 1. Fetches aggregate API for all 170 portfolio metadata
 * 2. Scrapes each /allocation/<slug>/ page for jsGlobalVars["PORTFOLIO"]["ALLOCATION"]
 * 3. Generates src/portfolios/registry.ts with all templates
 *
 * Rate limited: 500ms between page requests. Total ~2 min for 170 portfolios.
 * Intermediate results saved to /tmp so the script can be resumed.
 */

import * as fs from 'fs';

const BASE_URL = 'https://www.lazyportfolioetf.com';
const AGGREGATE_URL = `${BASE_URL}/wp-json/feed/v1/portfolio-aggregate`;
const CACHE_FILE = '/tmp/lazy_portfolio_scrape_cache.json';

interface PortfolioMeta {
  code: string;
  name: string;
  author: string;
  slug: string;
  description: string;
  numEtf: number;
  stocks: number;
  bonds: number;
  commodities: number;
  stocksForeign: number;
  bondsForeign: number;
  commoditiesForeign: number;
}

interface ScrapedPortfolio {
  code: string;
  name: string;
  author: string;
  slug: string;
  description: string;
  holdings: Record<string, number>; // ticker -> weight (0-100)
  stocks: number;
  bonds: number;
  commodities: number;
}

function parseAggregate(raw: string): PortfolioMeta[] {
  const data = JSON.parse(raw);
  const portfolios = data.portfolios as Record<string, Record<string, Record<string, Record<string, string>>>>;

  const result: PortfolioMeta[] = [];
  for (const code of Object.keys(portfolios)) {
    const dateObj = portfolios[code];
    const dateKey = Object.keys(dateObj)[0];
    const rangeObj = dateObj[dateKey];
    // Prefer 10Y range for most data, fall back to any
    const rangeKey = '10Y' in rangeObj ? '10Y' : Object.keys(rangeObj)[0];
    const entry = rangeObj[rangeKey];

    result.push({
      code,
      name: entry.PORTFOLIO_NAME || 'Unknown',
      author: entry.PORTFOLIO_AUTHOR || '',
      slug: entry.PORTFOLIO_URL_PAGE || '',
      description: entry.PORTFOLIO_DESCRIPTION || '',
      numEtf: parseInt(entry.PORTFOLIO_NUM_ETF || '0'),
      stocks: parseFloat(entry.PORTFOLIO_STOCKS || '0'),
      bonds: parseFloat(entry.PORTFOLIO_BONDS || '0'),
      commodities: parseFloat(entry.PORTFOLIO_COMMODITIES || '0'),
      stocksForeign: parseFloat(entry.PORTFOLIO_STOCKS_FOREIGN || '0'),
      bondsForeign: parseFloat(entry.PORTFOLIO_BONDS_FOREIGN || '0'),
      commoditiesForeign: parseFloat(entry.PORTFOLIO_COMMODITIES_FOREIGN || '0'),
    });
  }

  return result;
}

function extractAllocation(html: string): Record<string, number> | null {
  const match = html.match(/jsGlobalVars\["PORTFOLIO"\]\["ALLOCATION"\]\s*=\s*(\{[^}]+\})/);
  if (!match) return null;

  try {
    const raw = JSON.parse(match[1]);
    const result: Record<string, number> = {};
    for (const [ticker, weight] of Object.entries(raw as Record<string, string>)) {
      result[ticker.trim().toUpperCase()] = parseFloat(weight as string);
    }
    return result;
  } catch {
    return null;
  }
}

function extractAssetCategories(html: string): Map<string, string> {
  // Extract category info from pie chart data
  // Format: {y:25,drilldown: {categories: ['VTI<br> U.S., Large Cap'],data: [25.0]}}
  const catMap = new Map<string, string>();
  const tickerCatRegex = /'([A-Z]{2,5})<br>\s*([^']*)'/g;
  let m;
  while ((m = tickerCatRegex.exec(html)) !== null) {
    catMap.set(m[1], m[2].trim());
  }
  return catMap;
}

function determineCategory(meta: PortfolioMeta): string {
  const s = meta.stocks + meta.stocksForeign;
  const b = meta.bonds + meta.bondsForeign;
  const c = meta.commodities + meta.commoditiesForeign;

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

function determineRiskLevel(meta: PortfolioMeta): 'low' | 'medium' | 'high' {
  const s = meta.stocks + meta.stocksForeign;
  if (s <= 30) return 'low';
  if (s >= 80) return 'high';
  return 'medium';
}

async function fetchWithRetry(url: string, retries = 2): Promise<string> {
  for (let i = 0; i <= retries; i++) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.text();
    } catch (err) {
      if (i === retries) throw err;
      await new Promise((r) => setTimeout(r, 2000));
    }
  }
  throw new Error('unreachable');
}

function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log('=== Lazy Portfolio ETF Template Scraper ===\n');

  // Step 1: Fetch aggregate
  console.log('[1/3] Fetching portfolio list...');
  const aggregateRaw = await fetchWithRetry(AGGREGATE_URL);
  const allMeta = parseAggregate(aggregateRaw);
  console.log(`  Found ${allMeta.length} portfolios\n`);

  // Step 2: Check cache and scrape missing
  console.log('[2/3] Scraping individual allocations...');
  let cache: Record<string, ScrapedPortfolio> = {};
  if (fs.existsSync(CACHE_FILE)) {
    try {
      cache = JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
      console.log(`  Loaded ${Object.keys(cache).length} cached entries`);
    } catch { /* ignore corrupt cache */ }
  }

  const scraped: ScrapedPortfolio[] = [];
  let newScrapes = 0;
  let errors = 0;

  for (let i = 0; i < allMeta.length; i++) {
    const meta = allMeta[i];
    const pct = `[${i + 1}/${allMeta.length}]`;

    if (cache[meta.code]) {
      scraped.push(cache[meta.code]);
      continue;
    }

    // Only scrape portfolios with ETFs (not benchmarks that don't exist as pages)
    if (!meta.slug || meta.slug === 'us-stocks' || meta.slug === 'gold' ||
        meta.slug === '10-year-treasury' || meta.slug === 'short-term-treasury' ||
        meta.slug === 'emerging-markets' || meta.slug === 'total-bond-market' ||
        meta.slug === 'tips' || meta.slug === 'corporate-bonds') {
      // These are single-asset benchmarks, skip page scraping (use broad allocations)
      console.log(`  ${pct} ${meta.name} (benchmark, using broad allocations)`);
      scraped.push({
        code: meta.code,
        name: meta.name,
        author: meta.author,
        slug: meta.slug,
        description: meta.description,
        holdings: {}, // Will be populated from broad allocations below
        stocks: meta.stocks,
        bonds: meta.bonds,
        commodities: meta.commodities,
      });
      continue;
    }

    try {
      const url = `${BASE_URL}/allocation/${meta.slug}/`;
      const html = await fetchWithRetry(url);
      const holdings = extractAllocation(html);

      if (holdings && Object.keys(holdings).length > 0) {
        const entry: ScrapedPortfolio = {
          code: meta.code,
          name: meta.name,
          author: meta.author,
          slug: meta.slug,
          description: meta.description,
          holdings,
          stocks: meta.stocks,
          bonds: meta.bonds,
          commodities: meta.commodities,
        };
        scraped.push(entry);
        cache[meta.code] = entry;
        newScrapes++;
        console.log(`  ${pct} ${meta.name} (${Object.keys(holdings).length} ETFs)`);
      } else {
        // No ETF data, use broad allocations
        console.log(`  ${pct} ${meta.name} (no ETF data, using broad allocations)`);
        scraped.push({
          code: meta.code,
          name: meta.name,
          author: meta.author,
          slug: meta.slug,
          description: meta.description,
          holdings: {},
          stocks: meta.stocks,
          bonds: meta.bonds,
          commodities: meta.commodities,
        });
      }

      // Save cache every 10 entries
      if (newScrapes % 10 === 0) {
        fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
      }

      await delay(500);
    } catch (err) {
      errors++;
      console.log(`  ${pct} ${meta.name} ERROR: ${(err as Error).message}`);
      // Push with empty holdings so we don't lose the portfolio
      scraped.push({
        code: meta.code,
        name: meta.name,
        author: meta.author,
        slug: meta.slug,
        description: meta.description,
        holdings: {},
        stocks: meta.stocks,
        bonds: meta.bonds,
        commodities: meta.commodities,
      });
    }
  }

  // Save final cache
  fs.writeFileSync(CACHE_FILE, JSON.stringify(cache, null, 2));
  console.log(`\n  Scraped: ${newScrapes} new, ${errors} errors, ${Object.keys(cache).length} total cached`);

  // Step 3: Generate TypeScript source
  console.log('\n[3/3] Generating TypeScript source...');

  // Group by category
  const byCategory = new Map<string, ScrapedPortfolio[]>();
  for (const p of scraped) {
    const cat = determineCategory({
      code: p.code, name: p.name, author: p.author, slug: p.slug,
      description: p.description, numEtf: Object.keys(p.holdings).length,
      stocks: p.stocks, bonds: p.bonds, commodities: p.commodities,
      stocksForeign: 0, bondsForeign: 0, commoditiesForeign: 0,
    });
    if (!byCategory.has(cat)) byCategory.set(cat, []);
    byCategory.get(cat)!.push(p);
  }

  const lines: string[] = [
    `// Auto-generated from lazyportfolioetf.com API`,
    `// Generated: ${new Date().toISOString()}`,
    `// Total portfolios: ${scraped.length}`,
    ``,
    `import type { PortfolioDefinition } from '../engine/types';`,
    ``,
    `interface TemplateEntry {`,
    `  id: string;`,
    `  name: string;`,
    `  nameZh: string;`,
    `  description: string;`,
    `  descriptionZh: string;`,
    `  category: string;`,
    `  riskLevel: 'low' | 'medium' | 'high';`,
    `  holdings: { symbol: string; weight: number }[];`,
    `}`,
    ``,
    `const RAW_TEMPLATES: TemplateEntry[] = [`,
  ];

  for (const [category, portfolios] of byCategory) {
    lines.push(`  // ---- ${category} ----`);
    for (const p of portfolios) {
      const holdings = Object.entries(p.holdings)
        .filter(([, w]) => w > 0)
        .map(([symbol, weight]) => ({ symbol, weight: weight / 100 }));

      // Format holdings array
      const holdingStr = holdings.length > 0
        ? holdings.map(h => `{ symbol: '${h.symbol}', weight: ${h.weight} }`).join(', ')
        : '';

      const risk = determineRiskLevel({
        code: p.code, name: p.name, author: p.author, slug: p.slug,
        description: p.description, numEtf: holdings.length,
        stocks: p.stocks, bonds: p.bonds, commodities: p.commodities,
        stocksForeign: 0, bondsForeign: 0, commoditiesForeign: 0,
      });

      lines.push(`  {`);
      lines.push(`    id: '${p.slug || p.code.toLowerCase()}',`);
      lines.push(`    name: '${p.name.replace(/'/g, "\\'")}',`);
      lines.push(`    nameZh: '',`);
      lines.push(`    description: '${(p.description || '').replace(/'/g, "\\'")}',`);
      lines.push(`    descriptionZh: '',`);
      lines.push(`    category: '${category}',`);
      lines.push(`    riskLevel: '${risk}',`);
      lines.push(`    holdings: [${holdingStr}],`);
      lines.push(`  },`);
    }
  }

  lines.push(`];`);
  lines.push(``);
  lines.push(`export function getPortfolioTemplates(`);
  lines.push(`  getAssetBySymbol: (symbol: string) => { symbol: string; name: string; nameZh?: string; assetClass: string; region: string; currency: string; provider: string; expenseRatio: number; inceptionDate: string } | null,`);
  lines.push(`): PortfolioDefinition[] {`);
  lines.push(`  return RAW_TEMPLATES.map((t) => ({`);
  lines.push(`    id: t.id,`);
  lines.push(`    name: t.name,`);
  lines.push(`    description: t.description,`);
  lines.push(`    holdings: t.holdings`);
  lines.push(`      .map((h) => {`);
  lines.push(`        const asset = getAssetBySymbol(h.symbol);`);
  lines.push(`        if (!asset) return null;`);
  lines.push(`        return {`);
  lines.push(`          asset: {`);
  lines.push(`            symbol: asset.symbol,`);
  lines.push(`            name: asset.name,`);
  lines.push(`            nameZh: asset.nameZh,`);
  lines.push(`            assetClass: asset.assetClass as PortfolioDefinition['holdings'][0]['asset']['assetClass'],`);
  lines.push(`            region: asset.region as PortfolioDefinition['holdings'][0]['asset']['region'],`);
  lines.push(`            currency: asset.currency,`);
  lines.push(`            provider: asset.provider,`);
  lines.push(`            expenseRatio: asset.expenseRatio,`);
  lines.push(`            inceptionDate: asset.inceptionDate,`);
  lines.push(`          },`);
  lines.push(`          targetWeight: h.weight,`);
  lines.push(`        };`);
  lines.push(`      })`);
  lines.push(`      .filter((h): h is NonNullable<typeof h> => h !== null),`);
  lines.push(`    tags: [t.category.toLowerCase(), t.riskLevel],`);
  lines.push(`  }));`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export function getTemplateMetadata(): (TemplateEntry & { holdingCount: number })[] {`);
  lines.push(`  return RAW_TEMPLATES.map((t) => ({`);
  lines.push(`    ...t,`);
  lines.push(`    holdingCount: t.holdings.length,`);
  lines.push(`  }));`);
  lines.push(`}`);
  lines.push(``);
  lines.push(`export type { TemplateEntry };`);
  lines.push(``);

  const outPath = 'src/portfolios/registry.ts';
  fs.writeFileSync(outPath, lines.join('\n'));
  console.log(`  Wrote ${outPath} (${scraped.length} portfolios in ${byCategory.size} categories)`);

  // Print category breakdown
  console.log('\nCategory breakdown:');
  for (const [cat, items] of byCategory) {
    const withHoldings = items.filter(i => Object.keys(i.holdings).length > 0).length;
    console.log(`  ${cat}: ${items.length} portfolios (${withHoldings} with ETF data)`);
  }

  console.log('\nDone.');
}

main().catch((err) => {
  console.error('Fatal:', err);
  process.exit(1);
});
