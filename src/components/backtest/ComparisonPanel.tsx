import { useState, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { usePortfolioStore } from '@/stores/portfolio-store';
import { BUILT_IN_BENCHMARKS } from '@/benchmarks/definitions';
import { getTemplateMetadata } from '@/portfolios/registry';

export interface CompSlot {
  id: string;
  name: string;
}

interface ComparisonPanelProps {
  primaryName: string;
  slots: CompSlot[];
  onChange: (slots: CompSlot[]) => void;
}

const MAX_ADDITIONAL = 3;

export function ComparisonPanel({ primaryName, slots, onChange }: ComparisonPanelProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(true);
  const { saved } = usePortfolioStore();
  const templates = useMemo(() => getTemplateMetadata(), []);

  const totalSelected = 1 + slots.length; // primary always counts as 1

  const handleSelect = (val: string) => {
    if (!val || slots.length >= MAX_ADDITIONAL) return;
    if (slots.some((s) => s.id === val)) return;

    let name = '';
    if (val.startsWith('bench:')) {
      const b = BUILT_IN_BENCHMARKS.find((b) => b.id === val.replace('bench:', ''));
      if (!b) return;
      name = b.name;
    } else if (val.startsWith('template:')) {
      const tpl = templates.find((t) => t.id === val.replace('template:', ''));
      if (!tpl) return;
      name = i18n.language === 'zh' && tpl.nameZh ? tpl.nameZh : tpl.name;
    } else {
      const p = saved.find((p) => p.id === val);
      if (!p) return;
      name = p.name || t('builder.untitled');
    }

    onChange([...slots, { id: val, name }]);
  };

  const handleRemove = (id: string) => onChange(slots.filter((s) => s.id !== id));

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-5">
      <button
        onClick={() => setExpanded(!expanded)}
        className="flex items-center gap-2 text-sm font-semibold text-gray-700 w-full text-left"
      >
        <svg
          className={`w-4 h-4 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none" viewBox="0 0 24 24" stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        {t('backtest.selectPortfolios')}
        <span className="ml-1 text-xs font-normal text-gray-400">
          {t('backtest.selectedCount', { count: totalSelected })}
        </span>
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {/* Primary portfolio — always first, not removable */}
          <div className="flex items-center justify-between px-3 py-2 bg-blue-50 border border-blue-100 rounded-lg">
            <span className="text-sm font-medium text-blue-800">{primaryName || t('builder.untitled')}</span>
            <span className="text-xs text-blue-400">{t('compare.primary')}</span>
          </div>

          {/* Additional comparison slots */}
          {slots.map((slot) => (
            <div key={slot.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">{slot.name}</span>
              <button
                onClick={() => handleRemove(slot.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors ml-3"
              >
                ✕
              </button>
            </div>
          ))}

          {/* Add more slot — hidden when at max */}
          {slots.length < MAX_ADDITIONAL && (
            <select
              value=""
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm
                text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            >
              <option value="">{t('backtest.addComparison')}</option>
              {saved.length > 0 && (
                <optgroup label={t('compare.savedPortfolios')}>
                  {saved.map((p) => (
                    <option key={p.id} value={p.id} disabled={slots.some((s) => s.id === p.id)}>
                      {p.name || t('builder.untitled')} ({p.holdings.length})
                    </option>
                  ))}
                </optgroup>
              )}
              <optgroup label={t('compare.benchmarks')}>
                {BUILT_IN_BENCHMARKS.map((b) => (
                  <option key={b.id} value={`bench:${b.id}`} disabled={slots.some((s) => s.id === `bench:${b.id}`)}>
                    {b.name}
                  </option>
                ))}
              </optgroup>
              <optgroup label={t('compare.templates')}>
                {templates.map((tpl) => (
                  <option
                    key={tpl.id}
                    value={`template:${tpl.id}`}
                    disabled={slots.some((s) => s.id === `template:${tpl.id}`)}
                  >
                    {i18n.language === 'zh' && tpl.nameZh ? tpl.nameZh : tpl.name} ({tpl.holdingCount})
                  </option>
                ))}
              </optgroup>
            </select>
          )}
        </div>
      )}
    </div>
  );
}
