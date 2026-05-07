import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { useDataStore } from '@/stores/data-store';
import { getPortfolioTemplates, getTemplateMetadata } from '@/portfolios/registry';
import type { PortfolioHolding } from '@/engine/types';

export function TemplatesPage() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const loadFromDefinition = usePortfolioStore((s) => s.loadFromDefinition);
  const availableEtfs = useDataStore((s) => s.availableEtfs);
  const isZh = i18n.language === 'zh';

  const getAsset = (symbol: string): PortfolioHolding['asset'] | null => {
    const found = availableEtfs.find((e) => e.symbol === symbol);
    if (!found) return null;
    return found as PortfolioHolding['asset'];
  };

  const templates = getPortfolioTemplates(getAsset);
  const metadata = getTemplateMetadata();

  const handleCardClick = (templateId: string) => {
    navigate(`/templates/${templateId}`);
  };

  const handleLoad = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      loadFromDefinition(template);
      navigate('/');
    }
  };

  const handleBacktest = (e: React.MouseEvent, templateId: string) => {
    e.stopPropagation();
    const template = templates.find((t) => t.id === templateId);
    if (template) {
      loadFromDefinition(template);
      navigate('/backtest');
    }
  };

  const categories = [...new Set(metadata.map((m) => m.category))];

  const riskBadge = (risk: string) => {
    const colors: Record<string, string> = {
      low: 'bg-green-100 text-green-700',
      medium: 'bg-yellow-100 text-yellow-700',
      high: 'bg-red-100 text-red-700',
    };
    return colors[risk] || 'bg-gray-100 text-gray-600';
  };

  return (
    <div className="max-w-6xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">{t('templates.title')}</h1>

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
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50
                        rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      {t('common.save')}
                    </button>
                    <button
                      onClick={(e) => handleBacktest(e, tmpl.id)}
                      className="flex-1 px-3 py-1.5 text-xs font-medium text-white bg-blue-600
                        rounded-lg hover:bg-blue-700 transition-colors"
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
