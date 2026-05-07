import * as prompts from '@clack/prompts';
import type { CashflowEvent } from '../../engine/types';

export async function collectCashflows(startDate: string): Promise<CashflowEvent[]> {
  const add = await prompts.confirm({
    message: 'Add recurring contributions/withdrawals?',
    initialValue: false,
  });

  if (prompts.isCancel(add) || !add) return [];

  const events: CashflowEvent[] = [];

  while (true) {
    const type = await prompts.select({
      message: 'Cashflow type',
      options: [
        { value: 'deposit' as const, label: 'Deposit (contribution)' },
        { value: 'withdrawal' as const, label: 'Withdrawal' },
      ],
    });

    if (prompts.isCancel(type)) break;

    const amountStr = await prompts.text({
      message: 'Amount ($)',
      validate: (v) => {
        const n = parseFloat(v ?? '');
        return isNaN(n) || n <= 0 ? 'Enter a positive number' : undefined;
      },
    });

    if (prompts.isCancel(amountStr)) break;

    const frequency = await prompts.select({
      message: 'Frequency',
      options: [
        { value: 'monthly' as const, label: 'Monthly' },
        { value: 'quarterly' as const, label: 'Quarterly' },
        { value: 'annual' as const, label: 'Annual' },
      ],
    });

    if (prompts.isCancel(frequency)) break;

    const amount = parseFloat(amountStr);
    const signedAmount = type === 'withdrawal' ? -amount : amount;

    const [y, m] = startDate.split('-').map(Number);
    const lastDay = new Date(y, m, 0).getDate();
    const date = `${startDate}-${String(lastDay).padStart(2, '0')}`;

    events.push({
      date,
      amount: signedAmount,
      type,
      recurring: { frequency },
    });

    const more = await prompts.confirm({ message: 'Add another cashflow?' });
    if (prompts.isCancel(more) || !more) break;
  }

  return events;
}
