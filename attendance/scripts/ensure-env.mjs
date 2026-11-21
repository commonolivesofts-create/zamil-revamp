// First-run helper (runs before `npm run dev`): creates .env from .env.example with a random
// SESSION_SECRET, the test-ADW credentials from ../server/.env and the EBS connection from
// ../zamil-attendance/.env (when those files exist).
// Never overwrites an existing .env and never prints secret values.
import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const envPath = path.join(root, '.env');
const serverEnvPath = path.join(root, '..', 'server', '.env');
const ci3EnvPath = path.join(root, '..', 'zamil-attendance', '.env');

if (!existsSync(envPath)) {
  let content = readFileSync(path.join(root, '.env.example'), 'utf8');
  const set = (key, value) => {
    // Quote values so characters such as # or $ survive the dotenv parser; pick a quote
    // character the value does not contain.
    const text = String(value);
    const q = text.includes("'") ? (text.includes('"') ? '`' : '"') : "'";
    content = content.replace(new RegExp(`^${key}=.*$`, 'm'), () => `${key}=${q}${text}${q}`);
  };
  set('SESSION_SECRET', randomBytes(48).toString('base64url'));

  const copied = [];
  if (existsSync(serverEnvPath)) {
    const server = parseEnv(readFileSync(serverEnvPath, 'utf8'));
    for (const [from, to] of [
      ['ORACLE_USER', 'ADW_USER'],
      ['ORACLE_PASSWORD', 'ADW_PASSWORD'],
      ['ORACLE_WALLET_PASSWORD', 'ADW_WALLET_PASSWORD'],
    ]) {
      if (server[from]) {
        set(to, server[from]);
        copied.push(to);
      }
    }
  }
  // EBS: the same connection as the CI3 app (zamil-attendance/.env).
  if (existsSync(ci3EnvPath)) {
    const ci3 = parseEnv(readFileSync(ci3EnvPath, 'utf8'));
    for (const key of [
      'EBS_DB_HOST',
      'EBS_DB_PORT',
      'EBS_DB_SID',
      'EBS_DB_USERNAME',
      'EBS_DB_PASSWORD',
      'EBS_DB_CONNECT_TIMEOUT',
    ]) {
      if (ci3[key]) {
        set(key, ci3[key]);
        copied.push(key);
      }
    }
  }
  writeFileSync(envPath, content, 'utf8');
  console.log(
    `[ensure-env] Created .env with a random SESSION_SECRET${copied.length ? ` and ${copied.join(', ')} from ../server/.env` : ''}.`,
  );
}
