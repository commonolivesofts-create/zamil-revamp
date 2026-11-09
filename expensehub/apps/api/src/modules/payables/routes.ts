// Implements: API §8 — Payables and Quick Pays (FINANCE_AP).
import {
  QUICK_PAY_QUEUE_STATUSES,
  excludeSchema,
  sendRequestSchema,
  type PayablesResponse,
} from '@expensehub/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireCapability } from '../../auth/rbac';
import type { AppConfig } from '../../config';
import { jobRunDto } from '../admin/routes';
import type { PayablesService, QuickPayService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });
const qpQuery = z.object({ status: z.enum(QUICK_PAY_QUEUE_STATUSES).optional() });

export function payablesRoutes({
  config,
  payables,
  quickPays,
}: {
  config: AppConfig;
  payables: PayablesService;
  quickPays: QuickPayService;
}): Router {
  const router = Router();
  const finance = requireCapability('FINANCE_AP');

  router.get('/payables', finance, async (req, res) => {
    const body: PayablesResponse = {
      items: await payables.list(authOf(req)),
      fusionPodUrl: config.fusion.podUrl,
      fusionMode: config.fusion.mode,
    };
    res.json(body);
  });

  router.post('/payables/send', finance, async (req, res) => {
    const { ids } = sendRequestSchema.parse(req.body);
    res.json({ items: await payables.send(authOf(req), ids) });
  });

  router.post('/payables/:id/retry', finance, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json({ items: await payables.send(authOf(req), [id]) });
  });

  router.post('/payables/refresh-status', finance, async (_req, res) => {
    res.json(jobRunDto(await payables.refreshStatus()));
  });

  router.get('/quick-pays', finance, async (req, res) => {
    const { status } = qpQuery.parse(req.query);
    res.json({
      items: await quickPays.list(authOf(req), status),
      fusionPodUrl: config.fusion.podUrl,
    });
  });

  router.post('/quick-pays/invoice', finance, async (req, res) => {
    const { ids } = sendRequestSchema.parse(req.body);
    res.json({ items: await quickPays.invoice(authOf(req), ids) });
  });

  router.post('/quick-pays/:id/exclude', finance, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const { reason } = excludeSchema.parse(req.body);
    await quickPays.exclude(authOf(req), id, reason);
    res.status(204).end();
  });

  return router;
}
