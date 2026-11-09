// Runs after `vite build` (apps/web postbuild). D-33: dev-only code — the quick-login picker,
// dev endpoints, the demo password, the dev Mail page — must never ship in a production build.
import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const assets = path.join(root, 'apps', 'web', 'dist', 'assets');

const FORBIDDEN = [
  'dev-quick-login',
  '/auth/dev-users',
  '/auth/dev-login',
  '/dev/mail',
  '/dev/fusion', // D-36 Fusion simulator
  'ExpenseHub2026',
  'lineNumber:', // React development JSX = built in dev mode
];

const failures = [];
for (const file of readdirSync(assets).filter((f) => f.endsWith('.js'))) {
  const text = readFileSync(path.join(assets, file), 'utf8');
  for (const marker of FORBIDDEN) {
    if (text.includes(marker)) failures.push(`${file}: contains "${marker}"`);
  }
}

if (failures.length > 0) {
  console.error('[check-prod-bundle] Dev-only code found in the production build:');
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log('[check-prod-bundle] OK — no dev-only code in the production build.');
