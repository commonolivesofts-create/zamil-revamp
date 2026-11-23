// Copies the main Zamil client's design assets into apps/web/public (git-ignored), so the
// attendance app renders with exactly the same Orvexa CSS, icons and theme bootstrap.
// ../client/public stays the single source of truth; run automatically before dev and build.
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.resolve(root, '..', 'client', 'public');
const target = path.join(root, 'apps', 'web', 'public');

const items = [
  ['orvexa/assets/css', 'orvexa/assets/css'],
  ['orvexa/assets/vendor/lucide.min.js', 'orvexa/assets/vendor/lucide.min.js'],
  ['theme-init.js', 'theme-init.js'],
  ['favicon.svg', 'favicon.svg'],
];

if (!existsSync(source)) {
  console.error(`[sync-orvexa] ${source} not found; the attendance UI needs the main client.`);
  process.exit(1);
}

rmSync(path.join(target, 'orvexa'), { recursive: true, force: true });
for (const [from, to] of items) {
  const src = path.join(source, from);
  if (!existsSync(src)) {
    console.error(`[sync-orvexa] Missing ${src}`);
    process.exit(1);
  }
  const dest = path.join(target, to);
  mkdirSync(path.dirname(dest), { recursive: true });
  cpSync(src, dest, { recursive: true });
}
console.log(
  '[sync-orvexa] Copied Orvexa CSS, Lucide icons and theme-init.js from ../client/public.',
);
