// Implements: API §11 dashboards.
import { BUSINESS_UNITS } from '@expensehub/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireApprover, requireAuth, requireCapability } from '../../auth/rbac';
import type { DashboardService } from './service';

const financeQuery = z.object({ bu: z.enum(BUSINESS_UNITS).optional() });

export function dashboardRoutes({ dashboards }: { dashboards: DashboardService }): Router {
  const router = Router();

  router.get('/dashboards/employee', requireAuth, async (req, res) => {
    res.json(await dashboards.employee(authOf(req).personId));
  });

  router.get('/dashboards/approver', requireApprover, async (req, res) => {
    res.json(await dashboards.approver(authOf(req).personId));
  });

  router.get(
    '/dashboards/finance',
    requireCapability('FINANCE_AP', 'ACCOUNTANT'),
    async (req, res) => {
      const { bu } = financeQuery.parse(req.query);
      res.json(await dashboards.finance(authOf(req), bu));
    },
  );

  return router;
}
