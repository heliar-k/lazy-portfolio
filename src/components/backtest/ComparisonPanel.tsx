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
  slots: CompSlot[];
  onChange: (slots: CompSlot[]) => void;
}

const MAX_SLOTS = 3;

export function ComparisonPanel({ slots, onChange }: ComparisonPanelProps) {
  const { t, i18n } = useTranslation();
  const [expanded, setExpanded] = useState(slots.length > 0);
  const { saved } = usePortfolioStore();
  const templates = useMemo(() => getTemplateMetadata(), []);

  const handleSelect = (val: string) => {
    if (!val || slots.length >= MAX_SLOTS) return;
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
        {t('backtest.compareWith')}
        {slots.length > 0 && (
          <span className="text-xs text-gray-400 font-normal">
            ({slots.length} / {MAX_SLOTS})
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {slots.map((slot) => (
            <div key={slot.id} className="flex items-center justify-between px-3 py-2 bg-gray-50 rounded-lg">
              <span className="text-sm text-gray-700">{slot.name}</span>
              <button
                onClick={() => handleRemove(slot.id)}
                className="text-xs text-gray-400 hover:text-red-500 transition-colors"
              >
                {t('common.cancel')}
              </button>
            </div>
          ))}

          {slots.length < MAX_SLOTS && (
            <select
              value=""
              onChange={(e) => handleSelect(e.target.value)}
              className="w-full px-3 py-2 border border-dashed border-gray-300 rounded-lg text-sm
                text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
            >
              <option value="">+ {t('backtest.addComparison')}</option>
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
