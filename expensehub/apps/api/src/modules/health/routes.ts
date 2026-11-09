// Implements: API §12 health — no auth, no secrets.
import { Router } from 'express';
import type { HealthResponse } from '@expensehub/shared';
import type { AppConfig } from '../../config';
import { APP_VERSION } from '../../version';

export interface HealthDeps {
  config: AppConfig;
  /** Data-store ping; the repository layer provides the real one from M1. */
  checkDataStore: () => Promise<boolean>;
  startedAt: number;
}

export function healthRoutes({ config, checkDataStore, startedAt }: HealthDeps): Router {
  const router = Router();

  router.get('/health', async (_req, res) => {
    const dbOk = await checkDataStore().catch(() => false);
    const body: HealthResponse = {
      status: dbOk ? 'ok' : 'degraded',
      db: dbOk ? 'ok' : 'error',
      dataMode: config.data.mode,
      fusionMode: config.fusion.mode,
      notifyTransport: config.notify.transport,
      env: config.env,
      version: APP_VERSION,
      time: new Date().toISOString(),
      uptimeSeconds: Math.floor((Date.now() - startedAt) / 1000),
    };
    res
      .set('Cache-Control', 'no-store')
      .status(dbOk ? 200 : 503)
      .json(body);
  });

  return router;
}
