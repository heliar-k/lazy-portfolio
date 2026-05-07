import { useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useDataStore } from '@/stores/data-store';
import { getPortfolioTemplates, getTemplateMetadata } from '@/portfolios/registry';
import type { PortfolioHolding } from '@/engine/types';
import ReactEChartsCore from 'echarts-for-react/lib/core';
import { PieChart } from 'echarts/charts';
import { TooltipComponent, LegendComponent } from 'echarts/components';
import { LabelLayout } from 'echarts/features';
import { CanvasRenderer } from 'echarts/renderers';
import * as echarts from 'echarts/core';

echarts.use([PieChart, TooltipComponent, LegendComponent, LabelLayout, CanvasRenderer]);

function classify(ac: string): 'stock' | 'bond' | 'alt' {
  if (ac.includes('stock') || ac.includes('equity') || ac.includes('large_cap') || ac.includes('small_cap') || ac.includes('mid_cap') || ac.includes('value') || ac.includes('growth') || ac.includes('developed') || ac.includes('emerging') || ac.includes('reit') || ac.includes('europe') || ac.includes('japan') || ac.includes('uk_equity') || ac.includes('china')) return 'stock';
  if (ac.includes('bond') || ac.includes('treasury') || ac.includes('cash') || ac.includes('tips') || ac.includes('high_yield') || ac.includes('corporate')) return 'bond';
  return 'alt';
}

const REGION_NAMES: Record<string, string> = {
  US: '美国', EU: '欧洲', JP: '日本', UK: '英国', CN: '中国',
  CA: '加拿大', AU: '澳大利亚', BR: '巴西', IN: '印度', GLOBAL: '全球',
};

export function TemplateDetail() {
  const { id } = useParams<{ id: string }>();
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const loadFromDefinition = usePortfolioStore((s) => s.loadFromDefinition);
  const availableEtfs = useDataStore((s) => s.availableEtfs);
  const dataStatus = useDataStore((s) => s.status);
  const isZh = i18n.language === 'zh';

  const getAsset = (symbol: string): PortfolioHolding['asset'] | null => {
    const found = availableEtfs.find((e) => e.symbol === symbol);
    return found ? (found as PortfolioHolding['asset']) : null;
  };

  const templates = getPortfolioTemplates(getAsset);
  const metadata = getTemplateMetadata();

  const template = useMemo(() => templates.find((t) => t.id === id), [templates, id]);
  const meta = useMemo(() => metadata.find((m) => m.id === id), [metadata, id]);

  if (!template || !meta) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <p className="text-gray-500 text-lg">Template not found</p>
        <button onClick={() => navigate('/templates')} className="mt-4 text-blue-600 hover:underline">
          ← Back to templates
        </button>
      </div>
    );
  }

  const holdings = template.holdings;

  // Compute weighted expense ratio
  const weightedEr = holdings.reduce((sum, h) => sum + h.targetWeight * h.asset.expenseRatio, 0);

  // Classify holdings
  const stockPct = holdings.filter(h => classify(h.asset.assetClass) === 'stock').reduce((s, h) => s + h.targetWeight, 0);
  const bondPct = holdings.filter(h => classify(h.asset.assetClass) === 'bond').reduce((s, h) => s + h.targetWeight, 0);
  const altPct = holdings.filter(h => classify(h.asset.assetClass) === 'alt').reduce((s, h) => s + h.targetWeight, 0);

  // Region distribution
  const regionMap = new Map<string, number>();
  for (const h of holdings) {
    const r = h.asset.region;
    regionMap.set(r, (regionMap.get(r) ?? 0) + h.targetWeight);
  }

  // Pie chart data
  const pieData = holdings.map((h) => ({
    name: h.asset.symbol,
    value: Math.round(h.targetWeight * 10000) / 100,
    itemStyle: { color: PIE_COLORS[holdings.indexOf(h) % PIE_COLORS.length] },
  }));

  const handleLoad = () => {
    if (template.holdings.length === 0) return;
    loadFromDefinition(template);
    navigate('/');
  };

  const handleBacktest = () => {
    if (template.holdings.length === 0) return;
    loadFromDefinition(template);
    navigate('/backtest');
  };

  const handleCompare = () => {
    if (template.holdings.length === 0) return;
    loadFromDefinition(template);
    navigate('/compare');
  };

  const riskBadge = (risk: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-red-100 text-red-700',
    };
    return colors[risk] || 'bg-gray-100 text-gray-600';
  };

  const formatPct = (v: number) => `${(v * 100).toFixed(0)}%`;
  const formatEr = (v: number) => `${(v * 100).toFixed(2)}%`;

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      {/* Header */}
      <button onClick={() => navigate('/templates')} className="text-sm text-gray-500 hover:text-blue-600 mb-3 inline-block">
        ← {t('templates.title')}
      </button>

      <div className="flex items-start justify-between mb-2">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {isZh && meta.nameZh ? meta.nameZh : meta.name}
          </h1>
          {isZh && meta.nameZh && (
            <p className="text-sm text-gray-400 mt-0.5">{meta.name}</p>
          )}
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2.5 py-1 rounded-full font-medium ${riskBadge(meta.riskLevel)}`}>
            {meta.riskLevel === 'low' ? t('common.low') : meta.riskLevel === 'high' ? t('common.high') : t('common.medium')}
          </span>
          <span className="text-xs px-2.5 py-1 rounded-full bg-blue-50 text-blue-600 font-medium">
            {meta.category}
          </span>
        </div>
      </div>

      <p className="text-gray-600 mb-6 max-w-3xl">
        {isZh && meta.descriptionZh ? meta.descriptionZh : meta.description}
      </p>

      {/* Action buttons */}
      <div className="flex gap-3 mb-8">
        <button onClick={handleLoad} disabled={dataStatus !== 'ready'} className="px-5 py-2 text-sm font-medium text-blue-700 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {t('common.save')}
        </button>
        <button onClick={handleBacktest} disabled={dataStatus !== 'ready'} className="px-5 py-2 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {t('templates.loadAndBacktest')}
        </button>
        <button onClick={handleCompare} disabled={dataStatus !== 'ready'} className="px-5 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors disabled:opacity-40 disabled:cursor-not-allowed">
          {t('common.compare')}
        </button>
      </div>

      {/* Content: table + charts */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Holdings table */}
        <div className="lg:col-span-2">
          <h2 className="text-lg font-semibold text-gray-800 mb-3">
            {t('builder.holdings')} ({holdings.length})
          </h2>
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            {dataStatus === 'loading' ? (
              <div className="px-4 py-8 text-center text-sm text-gray-400 animate-pulse">
                Loading holdings...
              </div>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    <th className="text-left px-4 py-3 font-medium text-gray-500">ETF</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">{t('builder.name')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">{t('builder.weight')}</th>
                    <th className="text-right px-4 py-3 font-medium text-gray-500">{t('common.expenseRatio')}</th>
                    <th className="text-left px-4 py-3 font-medium text-gray-500">{t('common.region')}</th>
                  </tr>
                </thead>
                <tbody>
                  {holdings.map((h) => (
                    <tr key={h.asset.symbol} className="border-b border-gray-50 hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3 font-medium text-gray-900">{h.asset.symbol}</td>
                      <td className="px-4 py-3 text-gray-600">{isZh && h.asset.nameZh ? h.asset.nameZh : h.asset.name}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-700">{formatPct(h.targetWeight)}</td>
                      <td className="px-4 py-3 text-right font-mono text-gray-500">{formatEr(h.asset.expenseRatio)}</td>
                      <td className="px-4 py-3 text-gray-500">{REGION_NAMES[h.asset.region] || h.asset.region}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="bg-gray-50">
                    <td colSpan={2} className="px-4 py-3 text-sm text-gray-500">
                      {t('common.weightedExpenseRatio')}
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700 font-medium">100%</td>
                    <td className="px-4 py-3 text-right font-mono text-gray-700 font-medium">{formatEr(weightedEr)}</td>
                    <td />
                  </tr>
                </tfoot>
              </table>
            )}
          </div>
        </div>

        {/* Charts */}
        <div className="space-y-5">
          {/* Allocation pie */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {t('common.allocation')}
            </h3>
            <ReactEChartsCore
              echarts={echarts}
              option={{
                series: [{
                  type: 'pie',
                  radius: ['45%', '75%'],
                  center: ['50%', '50%'],
                  avoidLabelOverlap: false,
                  label: { show: true, position: 'outside', formatter: '{b}\n{d}%', fontSize: 11 },
                  data: pieData,
                }],
              }}
              style={{ height: 220 }}
              opts={{ renderer: 'canvas' }}
            />
          </div>

          {/* Asset class breakdown */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {t('common.assetClass')}
            </h3>
            <div className="space-y-2">
              {stockPct > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{t('common.stocks')}</span>
                    <span className="font-mono text-gray-700">{formatPct(stockPct)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-blue-500 rounded-full" style={{ width: `${stockPct * 100}%` }} />
                  </div>
                </div>
              )}
              {bondPct > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{t('common.bonds')}</span>
                    <span className="font-mono text-gray-700">{formatPct(bondPct)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-green-500 rounded-full" style={{ width: `${bondPct * 100}%` }} />
                  </div>
                </div>
              )}
              {altPct > 0 && (
                <div>
                  <div className="flex justify-between text-xs mb-1">
                    <span className="text-gray-600">{t('common.alternatives')}</span>
                    <span className="font-mono text-gray-700">{formatPct(altPct)}</span>
                  </div>
                  <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                    <div className="h-full bg-amber-500 rounded-full" style={{ width: `${altPct * 100}%` }} />
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Region distribution */}
          <div className="bg-white rounded-xl border border-gray-200 p-4">
            <h3 className="text-sm font-semibold text-gray-700 mb-3">
              {t('common.region')}
            </h3>
            <div className="space-y-2">
              {[...regionMap.entries()]
                .sort(([, a], [, b]) => b - a)
                .map(([region, weight]) => (
                  <div key={region}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="text-gray-600">{REGION_NAMES[region] || region}</span>
                      <span className="font-mono text-gray-700">{formatPct(weight)}</span>
                    </div>
                    <div className="w-full h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div className="h-full bg-purple-500 rounded-full" style={{ width: `${weight * 100}%` }} />
                    </div>
                  </div>
                ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

const PIE_COLORS = [
  '#3b82f6', '#f97316', '#22c55e', '#8b5cf6', '#ef4444',
  '#06b6d4', '#e11d48', '#84cc16', '#f59e0b', '#6366f1',
  '#14b8a6', '#ec4899', '#0ea5e9', '#a855f7', '#10b981',
  '#f43f5e', '#64748b', '#d946ef', '#2563eb', '#65a30d',
];
