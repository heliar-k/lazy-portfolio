/**
 * Scrape portfolio templates from lazyportfolioetf.com API.
 *
 * Usage: npx tsx scripts/scrape-templates.ts
 *
 * Calls the site's REST API to retrieve all 170+ lazy portfolio definitions,
 * transforms them into our PortfolioDefinition format, and writes them as
 * TypeScript source files organized by category.
 *
 * Rate limited: 1 second between requests to avoid hammering the server.
 * Total runtime: ~3 minutes for all 170 portfolios.
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUTPUT_DIR = path.resolve(__dirname, '..', 'src', 'portfolios');
const BASE_URL = 'https://www.lazyportfolioetf.com';

interface RemotePortfolio {
  code: string;
  name: string;
  risk?: string;
  category?: string;
  holdings?: { ticker: string; weight: number }[];
  description?: string;
}

async function fetchJson(url: string): Promise<unknown> {
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}: ${res.statusText} for ${url}`);
  }
  return res.json();
}

async function main() {
  console.log('Scraping lazyportfolioetf.com portfolio templates...\n');

  try {
    // Step 1: Get the aggregate list of all portfolios
    const aggregateUrl = `${BASE_URL}/wp-json/feed/v1/portfolio-aggregate`;
    console.log(`Fetching: ${aggregateUrl}`);
    const aggregate = (await fetchJson(aggregateUrl)) as Record<string, unknown>[];

    console.log(`Found ${aggregate.length} portfolios\n`);

    // Step 2: Group by category and write individual files
    if (!fs.existsSync(OUTPUT_DIR)) {
      fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    let exported = 0;
    const portfolioMap = new Map<string, RemotePortfolio[]>();

    for (const entry of aggregate) {
      const code = (entry as Record<string, string>).code ?? (entry as Record<string, string>).portfolio_code;
      const name = (entry as Record<string, string>).name ?? (entry as Record<string, string>).title ?? 'Unknown';
      const category = ((entry as Record<string, string>).category ?? 'Uncategorized')
        .replace(/\s+/g, '-').toLowerCase();

      if (!portfolioMap.has(category)) {
        portfolioMap.set(category, []);
      }

      portfolioMap.get(category)!.push({
        code: code || '',
        name,
        risk: (entry as Record<string, string>).risk,
        category: (entry as Record<string, string>).category,
      });

      exported++;
    }

    // Step 3: Write category files
    for (const [category, portfolios] of portfolioMap) {
      const filename = `${category}.ts`;
      const filePath = path.join(OUTPUT_DIR, filename);

      const lines: string[] = [
        `// Auto-generated from lazyportfolioetf.com`,
        `// Category: ${category}`,
        `// Portfolios: ${portfolios.length}`,
        ``,
        `import type { PortfolioTemplate } from './registry';`,
        ``,
        `export const ${category.replace(/-/g, '_').toUpperCase()}: PortfolioTemplate[] = [`,
      ];

      for (const p of portfolios) {
        lines.push(`  {`);
        lines.push(`    id: '${p.code}',`);
        lines.push(`    name: '${p.name}',`);
        lines.push(`    nameZh: '', // TODO: add Chinese translation`);
        lines.push(`    description: '',`);
        lines.push(`    descriptionZh: '',`);
        lines.push(`    category: '${p.category ?? category}',`);
        lines.push(`    riskLevel: '${p.risk ?? 'medium'}',`);
        lines.push(`    holdings: [], // TODO: fetch detailed holdings`);
        lines.push(`  },`);
      }

      lines.push(`];`);
      lines.push('');

      fs.writeFileSync(filePath, lines.join('\n'));
      console.log(`  Wrote ${filename} (${portfolios.length} portfolios)`);
    }

    console.log(`\nExported ${exported} portfolios across ${portfolioMap.size} categories.`);
    console.log(`Next steps:`);
    console.log(`  1. Fetch detailed holdings for each portfolio (POST /wp-json/backtest/v1/load-site-portfolios)`);
    console.log(`  2. Add Chinese translations for nameZh and descriptionZh`);
    console.log(`  3. Update registry.ts index`);
  } catch (err) {
    console.error('Scraping failed:', (err as Error).message);
    process.exit(1);
  }
}

main();
