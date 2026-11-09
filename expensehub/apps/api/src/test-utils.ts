// Test helpers: a valid test config, an app on an empty store, and an app on the dev seed.
import { tmpdir } from 'node:os';
import path from 'node:path';
import request from 'supertest';
import { createApp, type AppDeps } from './app';
import { hashPassword } from './auth/password';
import { loadConfig, type AppConfig } from './config';
import { MemoryDataLayer } from './data/memory/store';
import { seedDatabase } from './data/seed';
import { DEV_PASSWORD } from './data/seed/demo-users';
import { MockFusionClient } from './integrations/fusion/mock/client';
import type { Clock } from './lib/dates';
import { createLogger } from './lib/logger';
import { buildServices } from './services';

export const TEST_SECRET = 'test-secret-0123456789-0123456789-abcdef';
export const H = { 'X-Requested-With': 'ExpenseHub' };

export function testConfig(overrides: NodeJS.ProcessEnv = {}): AppConfig {
  return loadConfig({
    NODE_ENV: 'test',
    SESSION_SECRET: TEST_SECRET,
    BCRYPT_COST: '4',
    FUSION_RETRY_DELAYS_MS: '0,0,0',
    // Never write test receipts into storage/; OCR only where a test asks for it.
    RECEIPTS_DIR: path.join(tmpdir(), `eh-test-receipts-${process.pid}`),
    OCR_PROVIDER: 'none',
    FUSION_MOCK_STATE: '',
    ...overrides,
  });
}

export function testApp(deps: Partial<Omit<AppDeps, 'config' | 'logger'>> = {}) {
  const config = testConfig();
  return createApp({
    config,
    logger: createLogger(config),
    data: new MemoryDataLayer(),
    ...deps,
  });
}

/** A controllable clock for session and lockout tests. */
export function testClock(start = '2026-10-18T06:00:00.000Z') {
  let now = new Date(start);
  const clock: Clock = () => new Date(now);
  return {
    clock,
    advance(ms: number) {
      now = new Date(now.getTime() + ms);
    },
  };
}

let seededHash: Promise<string> | undefined;

/** App on the 16-user dev seed (DEV_PASSWORD for everyone), with a controllable mock Fusion. */
export async function seededApp(options: { env?: NodeJS.ProcessEnv; clock?: Clock } = {}) {
  const config = testConfig(options.env);
  const logger = createLogger(config);
  const data = new MemoryDataLayer();
  seededHash ??= hashPassword(DEV_PASSWORD, 4);
  await seedDatabase(data, { passwordHash: await seededHash });
  const fusion = new MockFusionClient();
  const services = buildServices({
    config,
    data,
    logger,
    clock: options.clock,
    fusionClient: fusion,
    sleep: async () => {},
  });
  const app = createApp({ config, logger, data, services });
  return { app, data, config, services, fusion };
}

/** Signs in through the real endpoint; returns an agent that keeps the session cookie. */
export async function signedIn(app: ReturnType<typeof createApp>, personNumber: string) {
  const agent = request.agent(app);
  await agent
    .post('/api/v1/auth/login')
    .set(H)
    .send({ username: personNumber, password: DEV_PASSWORD })
    .expect(200);
  return agent;
}
