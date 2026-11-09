// npm run env:from-expensehub [-- ../path/to/expensehub]
// Builds TrainingHub's .env from .env.example plus the shared credentials in ExpenseHub's .env
// (test ADW XXZP and the Fusion test pod), with DATA_MODE=oracle and FUSION_MODE=live.
// Prints key names only — never values. Refuses to overwrite an existing .env.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { parseEnv } from 'node:util';

const root = path.resolve(import.meta.dirname, '..');
const target = path.join(root, '.env');
const source = path.resolve(root, process.argv[2] ?? '../expensehub', '.env');
if (existsSync(target)) {
  console.error('[env] .env already exists — delete it first if you want to rebuild it.');
  process.exit(1);
}
if (!existsSync(source)) {
  console.error(`[env] ${source} not found. Pass the ExpenseHub folder: npm run env:from-expensehub -- C:\\path\\to\\expensehub`);
  process.exit(1);
}
const eh = parseEnv(readFileSync(source, 'utf8'));
const SHARED = ['DB_USER', 'DB_PASSWORD', 'DB_CONNECT_STRING', 'DB_WALLET_PASSWORD', 'FUSION_BASE_URL', 'FUSION_USER', 'FUSION_PASSWORD', 'FUSION_BI_USER', 'FUSION_BI_PASSWORD', 'BOOTSTRAP_ADMINS'];
const OPTIONAL_SHARED = ['ZAMIL_AUTH_API_BASE_URL', 'ZAMIL_AUTH_SESSION_COOKIE_NAME', 'ZAMIL_AUTH_COOKIE_SECURE', 'ZAMIL_AUTH_COOKIE_SAMESITE'];
const values = {
  SESSION_SECRET: randomBytes(36).toString('base64url'),
  DATA_MODE: 'oracle',
  FUSION_MODE: 'live',
  DB_WALLET_DIR: './secrets/wallet',
};
const copied = [];
for (const k of SHARED) if (eh[k]) { values[k] = eh[k]; copied.push(k); }
for (const k of OPTIONAL_SHARED) if (eh[k]) { values[k] = eh[k]; copied.push(k); }
let out = readFileSync(path.join(root, '.env.example'), 'utf8');
for (const [k, v] of Object.entries(values)) {
  // Quote only when needed, with a quote character the value does not contain (dotenv has no escapes).
  const q = !/[\s#'"`]/.test(v) ? '' : !v.includes("'") ? "'" : !v.includes('"') ? '"' : '`';
  const line = `${k}=${q}${v}${q}`;
  const re = new RegExp(`^#?\\s*${k}=.*$`, 'm');
  out = re.test(out) ? out.replace(re, () => line) : `${out}\n${line}\n`;
}
writeFileSync(target, out, 'utf8');
console.log(`[env] .env written. Copied from ExpenseHub: ${copied.join(', ')}`);
const missing = SHARED.filter((k) => !eh[k]);
if (missing.length) console.log(`[env] Not in ExpenseHub's .env (fill in if needed): ${missing.join(', ')}`);
if (!existsSync(path.join(root, 'secrets', 'wallet', 'tnsnames.ora'))) console.log('[env] Copy the ADW wallet into secrets\\wallet');
