import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import type { PortfolioDefinition } from '../engine/types.js';

const STORE_DIR = path.join(os.homedir(), '.lazy-portfolio');
const STORE_FILE = path.join(STORE_DIR, 'custom-portfolios.json');

export function loadCustomPortfolios(): PortfolioDefinition[] {
  try {
    if (!fs.existsSync(STORE_FILE)) return [];
    return JSON.parse(fs.readFileSync(STORE_FILE, 'utf-8'));
  } catch {
    return [];
  }
}

export function saveCustomPortfolios(portfolios: PortfolioDefinition[]): void {
  fs.mkdirSync(STORE_DIR, { recursive: true });
  fs.writeFileSync(STORE_FILE, JSON.stringify(portfolios, null, 2));
}

export function addCustomPortfolio(p: PortfolioDefinition): PortfolioDefinition[] {
  const all = loadCustomPortfolios();
  all.push(p);
  saveCustomPortfolios(all);
  return all;
}

export function updateCustomPortfolio(id: string, updated: Partial<Pick<PortfolioDefinition, 'name' | 'holdings'>>): PortfolioDefinition[] {
  const all = loadCustomPortfolios();
  const idx = all.findIndex((p) => p.id === id);
  if (idx !== -1) {
    if (updated.name !== undefined) all[idx].name = updated.name;
    if (updated.holdings !== undefined) all[idx].holdings = updated.holdings;
    saveCustomPortfolios(all);
  }
  return all;
}

export function deleteCustomPortfolio(id: string): PortfolioDefinition[] {
  const all = loadCustomPortfolios().filter((p) => p.id !== id);
  saveCustomPortfolios(all);
  return all;
}
