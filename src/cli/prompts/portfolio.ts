import * as prompts from '@clack/prompts';
import { getTemplateMetadata, getPortfolioTemplates } from '../../portfolios/registry';
import { loadEtfMap } from '../data-loader';
import type { PortfolioDefinition } from '../../engine/types';
import type { EtfMapEntry } from '../data-loader';

export async function selectPortfolio(dataDir?: string): Promise<PortfolioDefinition | null> {
  const mode = await prompts.select({
    message: 'Portfolio source',
    options: [
      { value: 'template', label: 'Browse templates (170 portfolios)' },
      { value: 'custom', label: 'Build custom portfolio' },
    ],
  });

  if (prompts.isCancel(mode)) return null;

  if (mode === 'template') {
    return selectTemplate(dataDir);
  }
  return buildCustomPortfolio(dataDir);
}

async function selectTemplate(dataDir?: string): Promise<PortfolioDefinition | null> {
  const metadata = getTemplateMetadata().filter((t) => t.holdingCount > 0);

  const categories = [...new Set(metadata.map((t) => t.category))];

  const category = await prompts.select({
    message: 'Category',
    options: categories.map((c) => ({
      value: c,
      label: `${c} (${metadata.filter((t) => t.category === c).length})`,
    })),
  });

  if (prompts.isCancel(category)) return null;

  const filtered = metadata.filter((t) => t.category === category);
  const templateId = await prompts.select({
    message: 'Portfolio',
    options: filtered.map((t) => ({
      value: t.id,
      label: t.nameZh ? `${t.name} (${t.nameZh})` : t.name,
      hint: `${t.holdingCount} holdings, ${t.riskLevel} risk`,
    })),
  });

  if (prompts.isCancel(templateId)) return null;

  const etfMap = loadEtfMap(dataDir);
  const etfBySymbol = new Map<string, EtfMapEntry>(etfMap.map((e) => [e.symbol, e]));

  const portfolios = getPortfolioTemplates((symbol) => {
    const entry = etfBySymbol.get(symbol);
    if (!entry) return null;
    return {
      symbol: entry.symbol,
      name: entry.name,
      nameZh: entry.nameZh,
      assetClass: entry.assetClass,
      region: entry.region,
      currency: entry.currency,
      provider: entry.provider,
      expenseRatio: entry.expenseRatio,
      inceptionDate: entry.inceptionDate,
    };
  });

  const portfolio = portfolios.find((p) => p.id === templateId);
  if (!portfolio) {
    prompts.log.error('Portfolio not found');
    return null;
  }

  prompts.log.info(formatHoldings(portfolio));

  const ok = await prompts.confirm({ message: 'Use this portfolio?' });
  if (prompts.isCancel(ok) || !ok) return null;

  return portfolio;
}

async function buildCustomPortfolio(dataDir?: string): Promise<PortfolioDefinition | null> {
  const etfMap = loadEtfMap(dataDir);
  const holdings: { symbol: string; weight: number; entry: EtfMapEntry }[] = [];
  let totalWeight = 0;

  while (totalWeight < 1) {
    const remaining = ((1 - totalWeight) * 100).toFixed(0);
    const symbol = await prompts.select({
      message: `Add ETF (${remaining}% remaining)`,
      options: etfMap
        .filter((e) => !holdings.some((h) => h.symbol === e.symbol))
        .map((e) => ({
          value: e.symbol,
          label: `${e.symbol} — ${e.name}`,
          hint: e.assetClass,
        })),
    });

    if (prompts.isCancel(symbol)) return null;

    const weightStr = await prompts.text({
      message: `Weight for ${symbol} (%)`,
      placeholder: remaining,
      validate: (v) => {
        const n = parseFloat(v ?? '');
        if (isNaN(n) || n <= 0) return 'Enter a positive number';
        if (n > (1 - totalWeight) * 100 + 0.01) return `Max ${remaining}%`;
        return undefined;
      },
    });

    if (prompts.isCancel(weightStr)) return null;

    const weight = parseFloat(weightStr as string) / 100;
    const entry = etfMap.find((e) => e.symbol === symbol)!;
    holdings.push({ symbol: symbol as string, weight, entry });
    totalWeight += weight;

    if (totalWeight < 0.999) {
      const more = await prompts.confirm({ message: 'Add another ETF?' });
      if (prompts.isCancel(more) || !more) break;
    }
  }

  if (holdings.length === 0) return null;

  return {
    id: 'custom',
    name: 'Custom Portfolio',
    holdings: holdings.map((h) => ({
      asset: {
        symbol: h.entry.symbol,
        name: h.entry.name,
        nameZh: h.entry.nameZh,
        assetClass: h.entry.assetClass as any,
        region: h.entry.region as any,
        currency: h.entry.currency,
        provider: h.entry.provider,
        expenseRatio: h.entry.expenseRatio,
        inceptionDate: h.entry.inceptionDate,
      },
      targetWeight: h.weight,
    })),
    tags: ['custom'],
  };
}

function formatHoldings(portfolio: PortfolioDefinition): string {
  const lines = portfolio.holdings.map(
    (h) => `  ${h.asset.symbol.padEnd(6)} ${(h.targetWeight * 100).toFixed(0).padStart(3)}%  ${h.asset.name}`,
  );
  return `Holdings:\n${lines.join('\n')}`;
}

export async function selectMultiplePortfolios(
  dataDir?: string,
  maxCount = 4,
): Promise<PortfolioDefinition[]> {
  const portfolios: PortfolioDefinition[] = [];

  for (let i = 0; i < maxCount; i++) {
    const label = i === 0 ? 'Select portfolio' : `Add portfolio ${i + 1} (or skip)`;

    if (i > 1) {
      const more = await prompts.confirm({ message: 'Add another portfolio to compare?' });
      if (prompts.isCancel(more) || !more) break;
    }

    prompts.log.step(label);
    const p = await selectPortfolio(dataDir);
    if (!p) {
      if (i === 0) return [];
      break;
    }
    portfolios.push(p);
  }

  return portfolios;
}
