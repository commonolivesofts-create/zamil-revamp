// Dashboard (CI3 /): GET /dashboard -> the overview figures.
import { Router } from 'express';
import { requireAuth } from '../../auth/middleware';
import type { DashboardRepository } from './repository';

export function dashboardRoutes(deps: { dashboard: DashboardRepository }): Router {
  const router = Router();
  router.get('/dashboard', requireAuth, async (_req, res) => {
    res.json(await deps.dashboard.load());
  });
  return router;
}
