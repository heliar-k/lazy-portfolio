import { useState } from 'react';
import type { CashflowEvent } from '@/engine/types';

interface CashflowEditorProps {
  cashflows: CashflowEvent[];
  onChange: (cashflows: CashflowEvent[]) => void;
}

type RecurringFreq = 'monthly' | 'quarterly' | 'annual';

export function CashflowEditor({ cashflows, onChange }: CashflowEditorProps) {
  const [expanded, setExpanded] = useState(false);
  const [date, setDate] = useState('');
  const [amount, setAmount] = useState('');
  const [type, setType] = useState<'deposit' | 'withdrawal'>('deposit');
  const [isRecurring, setIsRecurring] = useState(false);
  const [frequency, setFrequency] = useState<RecurringFreq>('monthly');
  const [endDate, setEndDate] = useState('');

  const handleAdd = () => {
    if (!date || !amount) return;

    const event: CashflowEvent = {
      date,
      amount: type === 'withdrawal' ? -Math.abs(parseFloat(amount)) : Math.abs(parseFloat(amount)),
      type,
    };

    if (isRecurring) {
      event.recurring = { frequency };
      if (endDate) event.recurring.endDate = endDate;
    }

    onChange([...cashflows, event]);
    setAmount('');
    setEndDate('');
    setIsRecurring(false);
  };

  const handleRemove = (index: number) => {
    onChange(cashflows.filter((_, i) => i !== index));
  };

  const totalDeposits = cashflows
    .filter((c) => c.amount > 0)
    .reduce((s, c) => s + c.amount, 0);
  const totalWithdrawals = cashflows
    .filter((c) => c.amount < 0)
    .reduce((s, c) => s + Math.abs(c.amount), 0);

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
        Cashflows
        {cashflows.length > 0 && (
          <span className="text-xs text-gray-400 font-normal">
            ({cashflows.length} event{cashflows.length !== 1 ? 's' : ''})
          </span>
        )}
      </button>

      {expanded && (
        <div className="mt-3">
          {/* Add form */}
          <div className="flex flex-wrap gap-2 items-end p-3 bg-gray-50 rounded-lg">
            <div>
              <label className="block text-xs text-gray-500 mb-1">Date</label>
              <input
                type="month"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm w-36
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Amount</label>
              <input
                type="number"
                min={1}
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="$1,000"
                className="px-2 py-1.5 border border-gray-300 rounded text-sm w-28
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1">Type</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as 'deposit' | 'withdrawal')}
                className="px-2 py-1.5 border border-gray-300 rounded text-sm
                  focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="deposit">Deposit</option>
                <option value="withdrawal">Withdrawal</option>
              </select>
            </div>
            <div className="flex items-center gap-1 pt-4">
              <input
                type="checkbox"
                id="recurring"
                checked={isRecurring}
                onChange={(e) => setIsRecurring(e.target.checked)}
                className="h-3.5 w-3.5 text-blue-600 rounded border-gray-300"
              />
              <label htmlFor="recurring" className="text-xs text-gray-600">Recurring</label>
            </div>
            {isRecurring && (
              <>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Every</label>
                  <select
                    value={frequency}
                    onChange={(e) => setFrequency(e.target.value as RecurringFreq)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="monthly">Month</option>
                    <option value="quarterly">Quarter</option>
                    <option value="annual">Year</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs text-gray-500 mb-1">Until</label>
                  <input
                    type="month"
                    value={endDate}
                    onChange={(e) => setEndDate(e.target.value)}
                    className="px-2 py-1.5 border border-gray-300 rounded text-sm w-36
                      focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </>
            )}
            <button
              onClick={handleAdd}
              disabled={!date || !amount}
              className="px-3 py-1.5 text-sm font-medium text-white bg-blue-600 rounded
                hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Add
            </button>
          </div>

          {/* Event list */}
          {cashflows.length > 0 && (
            <div className="mt-3 space-y-1 max-h-48 overflow-y-auto">
              {cashflows.map((cf, i) => (
                <div
                  key={i}
                  className="flex items-center justify-between px-3 py-1.5 bg-gray-50 rounded text-sm"
                >
                  <span className="text-gray-700">
                    <span className="text-gray-500 text-xs">{cf.date}</span>{' '}
                    <span className={cf.amount >= 0 ? 'text-green-600' : 'text-red-500'}>
                      {cf.amount >= 0 ? '+' : '-'}${Math.abs(cf.amount).toLocaleString()}
                    </span>
                    {cf.recurring && (
                      <span className="text-gray-400 text-xs ml-1">
                        (recurring {cf.recurring.frequency}
                        {cf.recurring.endDate ? ` until ${cf.recurring.endDate}` : ''})
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => handleRemove(i)}
                    className="text-gray-400 hover:text-red-500 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}

          {/* Summary */}
          {cashflows.length > 0 && (
            <div className="mt-2 flex gap-4 text-xs text-gray-500">
              <span>Total deposits: <span className="text-green-600">+${totalDeposits.toLocaleString()}</span></span>
              <span>Total withdrawals: <span className="text-red-500">-${totalWithdrawals.toLocaleString()}</span></span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
