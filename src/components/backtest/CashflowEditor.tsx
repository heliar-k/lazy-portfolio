import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import type { CashflowEvent } from '@/engine/types';

type FreqType = 'monthly' | 'quarterly' | 'annual';

interface RowState {
  amount: string;
  type: 'deposit' | 'withdrawal';
}

interface CashflowEditorProps {
  cashflows: CashflowEvent[];
  startDate: string;
  onChange: (cashflows: CashflowEvent[]) => void;
}

const FREQS: { key: FreqType; labelKey: string }[] = [
  { key: 'monthly', labelKey: 'cashflow.monthly' },
  { key: 'quarterly', labelKey: 'cashflow.quarterly' },
  { key: 'annual', labelKey: 'cashflow.annual' },
];

function toEndOfMonthDate(ym: string): string {
  // ym is "YYYY-MM" from <input type="month">; convert to "YYYY-MM-DD"
  const [y, m] = ym.split('-').map(Number);
  const lastDay = new Date(y, m, 0).getDate();
  return `${ym}-${String(lastDay).padStart(2, '0')}`;
}

function parseRow(cashflows: CashflowEvent[], freq: FreqType): RowState {
  const match = cashflows.find((c) => c.recurring?.frequency === freq);
  if (!match) return { amount: '', type: 'deposit' };
  return {
    amount: String(Math.abs(match.amount)),
    type: match.amount >= 0 ? 'deposit' : 'withdrawal',
  };
}

export function CashflowEditor({ cashflows, startDate, onChange }: CashflowEditorProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const [rows, setRows] = useState<Record<FreqType, RowState>>(() => ({
    monthly: parseRow(cashflows, 'monthly'),
    quarterly: parseRow(cashflows, 'quarterly'),
    annual: parseRow(cashflows, 'annual'),
  }));

  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;
  const startDateRef = useRef(startDate);
  startDateRef.current = startDate;

  useEffect(() => {
    const events: CashflowEvent[] = [];
    for (const freq of ['monthly', 'quarterly', 'annual'] as FreqType[]) {
      const row = rows[freq];
      const amt = parseFloat(row.amount);
      if (!isNaN(amt) && amt > 0) {
        events.push({
          date: toEndOfMonthDate(startDateRef.current),
          amount: row.type === 'withdrawal' ? -amt : amt,
          type: row.type,
          recurring: { frequency: freq },
        });
      }
    }
    onChangeRef.current(events);
  }, [rows]);

  const updateRow = (freq: FreqType, patch: Partial<RowState>) => {
    setRows((prev) => ({ ...prev, [freq]: { ...prev[freq], ...patch } }));
  };

  const activeCount = Object.values(rows).filter((r) => parseFloat(r.amount) > 0).length;

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
        {t('cashflow.title')}
        {activeCount > 0 && (
          <span className="text-xs text-gray-400 font-normal">
            ({t('cashflow.activeCount', { count: activeCount })})
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-3 space-y-2">
          {FREQS.map(({ key, labelKey }) => {
            const row = rows[key];
            const parsedAmt = parseFloat(row.amount);
            const hasAmount = !isNaN(parsedAmt) && parsedAmt > 0;
            return (
              <div key={key} className="flex items-center gap-3">
                <span className="text-xs text-gray-600 w-10 shrink-0">{t(labelKey)}</span>
                <div className="flex rounded-lg border border-gray-200 overflow-hidden text-xs shrink-0">
                  <button
                    className={`px-2.5 py-1.5 transition-colors ${
                      row.type === 'deposit'
                        ? 'bg-green-50 text-green-700 font-medium'
                        : 'bg-white text-gray-400 hover:text-gray-600'
                    }`}
                    onClick={() => updateRow(key, { type: 'deposit' })}
                  >
                    {t('cashflow.deposit')}
                  </button>
                  <button
                    className={`px-2.5 py-1.5 border-l border-gray-200 transition-colors ${
                      row.type === 'withdrawal'
                        ? 'bg-red-50 text-red-700 font-medium'
                        : 'bg-white text-gray-400 hover:text-gray-600'
                    }`}
                    onClick={() => updateRow(key, { type: 'withdrawal' })}
                  >
                    {t('cashflow.withdrawal')}
                  </button>
                </div>
                <input
                  type="number"
                  min={0}
                  value={row.amount}
                  onChange={(e) => updateRow(key, { amount: e.target.value })}
                  placeholder="0"
                  className="w-28 px-2 py-1.5 border border-gray-300 rounded text-sm
                    focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {hasAmount && (
                  <span className={`text-xs ${row.type === 'deposit' ? 'text-green-600' : 'text-red-500'}`}>
                    {row.type === 'deposit' ? '+' : '-'}${parsedAmt.toLocaleString()}/{t(labelKey)}
                  </span>
                )}
              </div>
            );
          })}
          <p className="text-xs text-gray-400 mt-1">{t('cashflow.hint')}</p>
        </div>
      )}
    </div>
  );
}
