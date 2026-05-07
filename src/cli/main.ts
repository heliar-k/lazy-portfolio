import * as prompts from '@clack/prompts';
import { runSingleBacktest } from './runner';
import { runComparison } from './compare-runner';

async function main() {
  prompts.intro('Lazy Portfolio Backtest');

  const mode = await prompts.select({
    message: 'What would you like to do?',
    options: [
      { value: 'backtest', label: 'Run a backtest' },
      { value: 'compare', label: 'Compare portfolios' },
    ],
  });

  if (prompts.isCancel(mode)) {
    prompts.outro('Bye!');
    return;
  }

  switch (mode) {
    case 'backtest':
      await runSingleBacktest();
      break;
    case 'compare':
      await runComparison();
      break;
  }

  prompts.outro('Done!');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
