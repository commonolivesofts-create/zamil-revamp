// Bootstrap: load .env, validate config, open pools lazily, listen, shut down gracefully.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApp } from './app';
import { oracleIdentityRepository } from './auth/identity';
import { SessionService } from './auth/session';
import { ConfigError, loadConfig } from './config';
import { OracleDb } from './db/oracle';
import { createLogger } from './lib/logger';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..');

const envFile = path.join(ROOT, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

let config;
try {
  config = loadConfig(process.env, ROOT);
} catch (error) {
  if (error instanceof ConfigError) {
    console.error(error.message);
    process.exit(1);
  }
  throw error;
}

const logger = createLogger(config.logLevel, config.env === 'development');
const db = new OracleDb({ adw: config.adw, ebs: config.ebs });
const sessions = new SessionService(config.session.secret, config.session.secure, () => new Date());
const app = createApp({ config, logger, db, sessions, identities: oracleIdentityRepository(db) });

const server = app.listen(config.api.port, config.api.host, () => {
  logger.info(`Attendance API on http://${config.api.host}:${config.api.port}`);
});

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  logger.info({ signal }, 'shutting down');
  server.close();
  await db.close();
  process.exit(0);
}
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));
