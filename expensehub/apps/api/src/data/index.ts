// Picks the data implementation from DATA_MODE (D-33). Nothing else imports a concrete store.
import type { Logger } from 'pino';
import type { AppConfig } from '../config';
import { loadState } from './memory/persist';
import { MemoryDataLayer } from './memory/store';
import { hashPassword } from '../auth/password';
import type { DataLayer } from './ports';
import { seedDatabase } from './seed';
import { DEV_PASSWORD } from './seed/demo-users';
import { seedLiveSetup } from './seed/live';

export type { DataLayer, Repos } from './ports';

export async function createDataLayer(config: AppConfig, logger: Logger): Promise<DataLayer> {
  if (config.data.mode === 'oracle') {
    throw new Error('DATA_MODE=oracle is built in milestone M8 (D-33). Use DATA_MODE=memory.');
  }

  const existing = loadState(config.data.file);
  const data = new MemoryDataLayer({ file: config.data.file, initialState: existing });

  if (existing) {
    logger.info({ file: config.data.file }, 'Memory store loaded from dev data file');
  } else if (config.fusion.mode === 'live') {
    // D-50: real people come from Fusion (server.ts runs bootstrapLive once services exist).
    await seedLiveSetup(data);
    logger.info({ file: config.data.file }, 'Memory store set up for live Fusion (first start)');
  } else {
    const passwordHash = await hashPassword(DEV_PASSWORD, config.auth.bcryptCost);
    const summary = await seedDatabase(data, { passwordHash });
    logger.info({ file: config.data.file, ...summary }, 'Memory store seeded (first start)');
  }
  return data;
}
