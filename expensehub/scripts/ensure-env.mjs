// First-run helper (runs before `npm run dev`): creates .env from .env.example
// with a random SESSION_SECRET, so a fresh checkout starts without manual steps.
// Never overwrites an existing .env.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const examplePath = path.join(root, '.env.example');

if (!existsSync(envPath)) {
  const secret = randomBytes(48).toString('base64url');
  const content = readFileSync(examplePath, 'utf8').replace(
    /^SESSION_SECRET=.*$/m,
    `SESSION_SECRET=${secret}`,
  );
  writeFileSync(envPath, content, 'utf8');
  console.log('[ensure-env] Created .env from .env.example with a random SESSION_SECRET.');
}
