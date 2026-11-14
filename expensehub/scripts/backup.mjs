// npm run backup — replaces Git history (D-02).
// Zips the source tree (without node_modules, build output, earlier backups and secrets)
// plus storage/ (receipts + dev data, D-18) into backups/expensehub-YYYYMMDD-HHmm.zip.
import archiver from 'archiver';
import { createWriteStream, mkdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const backupsDir = path.join(root, 'backups');
mkdirSync(backupsDir, { recursive: true });

const pad = (n) => String(n).padStart(2, '0');
const now = new Date();
const stamp = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-${pad(now.getHours())}${pad(now.getMinutes())}`;
const target = path.join(backupsDir, `expensehub-${stamp}.zip`);

// Secrets (.env, secrets/) are deliberately left out so backups can be copied safely.
const ignore = [
  '**/node_modules/**',
  '**/dist/**',
  '**/coverage/**',
  '**/playwright-report/**',
  '**/test-results/**',
  'backups/**',
  'secrets/**',
  '.env',
];

const output = createWriteStream(target);
const archive = archiver('zip', { zlib: { level: 9 } });

output.on('close', () => {
  const mb = (statSync(target).size / 1024 / 1024).toFixed(2);
  console.log(`[backup] ${path.relative(root, target)} (${mb} MB)`);
  console.log('[backup] Not included: .env and secrets/ — keep those safe separately.');
});
archive.on('warning', (err) => console.warn('[backup] warning:', err.message));
archive.on('error', (err) => {
  console.error('[backup] failed:', err.message);
  process.exitCode = 1;
});

archive.pipe(output);
archive.glob('**/*', { cwd: root, dot: true, ignore });
await archive.finalize();
