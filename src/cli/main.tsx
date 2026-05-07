import { render } from 'ink';
import App from './App.js';

if (!process.stdin.isTTY) {
  console.error('Error: This tool requires an interactive terminal (TTY).');
  console.error('Run it directly: npx tsx src/cli/main.tsx');
  process.exit(1);
}

render(<App />, { exitOnCtrlC: true });
