// GET /health: liveness plus database reachability (no authentication, no data).
import { Router } from 'express';
import type { Db } from '../../db/oracle';

const state = (value: boolean | null) => (value === null ? 'disabled' : value ? 'up' : 'down');

export function healthRoutes(db: Db): Router {
  const router = Router();
  router.get('/health', async (_req, res) => {
    const [adw, ebs] = await Promise.all([db.ping('adw'), db.ping('ebs')]);
    res
      .status(adw ? 200 : 503)
      .json({ status: adw ? 'ok' : 'degraded', adw: state(adw), ebs: state(ebs) });
  });
  return router;
}
