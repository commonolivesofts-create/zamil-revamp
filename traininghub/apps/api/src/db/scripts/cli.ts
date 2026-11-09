// Shared bootstrap for the db:* scripts.
import { loadConfig, loadEnvFile, type AppConfig } from '../../config';
import { OracleStore } from '../oracle';

export function cliConfig(overrides: Record<string, string> = {}): AppConfig {
  loadEnvFile();
  return loadConfig({ ...process.env, ...overrides });
}

/** An Oracle store from DB_* settings, whatever DATA_MODE says. */
export function oracleFromEnv(): { config: AppConfig; store: OracleStore } {
  const config = cliConfig({ DATA_MODE: 'oracle' });
  return { config, store: new OracleStore(config.data.oracle!, config.data.prefix) };
}

export async function main(fn: () => Promise<void>) {
  try {
    await fn();
    process.exit(0);
  } catch (err) {
    const e = err as Error & { errorNum?: number };
    console.error(`\n✖ ${e.message}${e.errorNum ? ` (ORA-${String(e.errorNum).padStart(5, '0')})` : ''}`);
    process.exit(1);
  }
}
