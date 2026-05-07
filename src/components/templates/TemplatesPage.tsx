import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useDataStore } from '@/stores/data-store';
import { getPortfolioTemplates, getTemplateMetadata } from '@/portfolios/registry';
import type { PortfolioHolding } from '@/engine/types';

type RiskFilter = 'all' | 'low' | 'medium' | 'high';

export function TemplatesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const loadFromDefinition = usePortfolioStore((s) => s.loadFromDefinition);
  const availableEtfs = useDataStore((s) => s.availableEtfs);
  const dataStatus = useDataStore((s) => s.status);
  const isZh = i18n.language === 'zh';

  const [search, setSearch] = useState('');
  const [riskFilter, setRiskFilter] = useState<RiskFilter>('all');

  const getAsset = (symbol: string): PortfolioHolding['asset'] | null => {
    const found = availableEtfs.find((e) => e.symbol === symbol);
    if (!found) return null;
    return found as PortfolioHolding['asset'];
  };

  const templates = getPortfolioTemplates(getAsset);
  const allMetadata = getTemplateMetadata();

  const metadata = useMemo(() => {
    let list = allMetadata;
    if (riskFilter !== 'all') {
      list = list.filter((m) => m.riskLevel === riskFilter);
    }
    if (search.trim()) {
      const q = search.toLowerCase().trim();
      list = list.filter(
        (m) =>
          m.name.toLowerCase().includes(q) ||
          m.nameZh.toLowerCase().includes(q) ||
          m.id.includes(q) ||
          m.holdings.some((h) => h.symbol.toLowerCase().includes(q)),
      );
    }
    return list;
  }, [allMetadata, riskFilter, search]);

  const categories = useMemo(
    () => [...new Set(metadata.map((m) => m.category))],
    [metadata],
  );

  const handleCardClick = (templateId: string) => {
    navigate(`/templates/${templateId}`);
  };

  const handleLoad = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    const template = templates.find((t) => t.id === templateId);
    if (template && template.holdings.length > 0) {
      loadFromDefinition(template);
      navigate('/');
    }
  };

  const handleBacktest = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    const template = templates.find((t) => t.id === templateId);
    if (template && template.holdings.length > 0) {
      loadFromDefinition(template);
      navigate('/backtest');
    }
  };

  const riskBadge = (risk: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-red-100 text-red-700',
    };
    return colors[risk] || 'bg-gray-100 text-gray-600';
  };

  const riskFilters: { value: RiskFilter; label: string; labelZh: string }[] = [
    { value: 'all', label: 'All', labelZh: '全部' },
    { value: 'low', label: 'Low Risk', labelZh: '低风险' },
    { value: 'medium', label: 'Medium Risk', labelZh: '中风险' },
    { value: 'high', label: 'High Risk', labelZh: '高风险' },
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <h1 className="text-2xl font-bold text-gray-900">{t('templates.title')}</h1>
        <span className="text-sm text-gray-400">{metadata.length} portfolios</span>
      </div>

      {/* Search + Filter */}
      <div className="flex flex-col sm:flex-row gap-3 mb-6">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={isZh ? '按名称或代码搜索...' : 'Search by name or symbol...'}
          className="flex-1 px-4 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        />
        <div className="flex gap-1.5">
          {riskFilters.map((f) => (
            <button
              key={f.value}
              onClick={() => setRiskFilter(f.value)}
              className={`px-3 py-2 text-xs font-medium rounded-lg transition-colors ${
                riskFilter === f.value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {isZh ? f.labelZh : f.label}
            </button>
          ))}
        </div>
      </div>

      {metadata.length === 0 && (
        <div className="text-center py-16 text-gray-400">
          {isZh ? '没有匹配的组合模板' : 'No matching portfolio templates'}
        </div>
      )}

      {categories.map((category) => {
        const categoryTemplates = metadata.filter((m) => m.category === category);
        return (
          <div key={category} className="mb-8">
            <h2 className="text-lg font-semibold text-gray-800 mb-3">{category}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {categoryTemplates.map((tmpl) => (
                <div
                  key={tmpl.id}
                  onClick={() => handleCardClick(tmpl.id)}
                  className="bg-white rounded-xl border border-gray-200 p-5 hover:border-blue-300
                    hover:shadow-sm transition-all cursor-pointer"
                >
                  <div className="flex items-start justify-between mb-2">
                    <h3 className="font-semibold text-gray-900">
                      {isZh && tmpl.nameZh ? tmpl.nameZh : tmpl.name}
                      {isZh && tmpl.nameZh && <span className="block text-xs font-normal text-gray-400">{tmpl.name}</span>}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${riskBadge(tmpl.riskLevel)}`}
                    >
                      {tmpl.riskLevel === 'low' ? t('common.low') : tmpl.riskLevel === 'high' ? t('common.high') : t('common.medium')}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-3 line-clamp-2">
                    {isZh && tmpl.descriptionZh ? tmpl.descriptionZh : tmpl.description}
                  </p>
                  <div className="text-xs text-gray-400 mb-3 truncate">
                    {tmpl.holdings.map((h) => h.symbol).join(', ')}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={(e) => handleLoad(e, tmpl.id)}
                      disabled={dataStatus !== 'ready'}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50
                        rounded-lg hover:bg-blue-100 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('common.save')}
                    </button>
                    <button
                      onClick={(e) => handleBacktest(e, tmpl.id)}
                      disabled={dataStatus !== 'ready'}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600
                        rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      {t('templates.loadAndBacktest')}
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
