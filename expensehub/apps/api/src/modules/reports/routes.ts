// Implements: API §5 reports (Own; detail also for step assignees and Finance of the BU).
import {
  reasonSchema,
  reportCreateSchema,
  reportListQuerySchema,
  reportUpdateSchema,
  reportVersionSchema,
} from '@expensehub/shared';
import { Router } from 'express';
import { z } from 'zod';
import { authOf, requireAuth } from '../../auth/rbac';
import type { AuthContext } from '../../auth/context';
import type { DataLayer } from '../../data/ports';
import { reportAccountingPreview } from './accounting';
import { reportDetail, reportSummary } from './dto';
import type { ReportService } from './service';

const idParam = z.object({ id: z.coerce.number().int().positive() });

export function reportRoutes({
  data,
  reports,
}: {
  data: DataLayer;
  reports: ReportService;
}): Router {
  const router = Router();

  const detail = (auth: AuthContext, reportId: number) =>
    data.read(async (r) => reportDetail(r, await reports.getVisible(r, auth, reportId), auth));

  router.get('/reports', requireAuth, async (req, res) => {
    const { status } = reportListQuerySchema.parse(req.query);
    const rows = await reports.listOwn(authOf(req).personId, status);
    res.json({
      items: await data.read((r) => Promise.all(rows.map((row) => reportSummary(r, row)))),
    });
  });

  router.post('/reports', requireAuth, async (req, res) => {
    const auth = authOf(req);
    const row = await reports.create(auth.personId, reportCreateSchema.parse(req.body));
    res.status(201).json(await detail(auth, row.reportId));
  });

  router.get('/reports/:id', requireAuth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    res.json(await detail(authOf(req), id));
  });

  // FR-ACC-01: Own, step assignees, Finance (same access as the report).
  router.get('/reports/:id/accounting-preview', requireAuth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    const auth = authOf(req);
    res.json(
      await data.read(async (r) =>
        reportAccountingPreview(r, await reports.getVisible(r, auth, id)),
      ),
    );
  });

  router.patch('/reports/:id', requireAuth, async (req, res) => {
    const auth = authOf(req);
    const { id } = idParam.parse(req.params);
    await reports.update(auth.personId, id, reportUpdateSchema.parse(req.body));
    res.json(await detail(auth, id));
  });

  router.delete('/reports/:id', requireAuth, async (req, res) => {
    const { id } = idParam.parse(req.params);
    await reports.delete(authOf(req).personId, id);
    res.status(204).end();
  });

  for (const action of ['submit', 'withdraw', 'correct'] as const) {
    router.post(`/reports/:id/${action}`, requireAuth, async (req, res) => {
      const auth = authOf(req);
      const { id } = idParam.parse(req.params);
      const { version } = reportVersionSchema.parse(req.body);
      await reports[action](auth.personId, id, version);
      res.json(await detail(auth, id));
    });
  }

  router.post('/reports/:id/reply-info', requireAuth, async (req, res) => {
    const auth = authOf(req);
    const { id } = idParam.parse(req.params);
    const { comment } = reasonSchema.parse(req.body);
    await reports.replyInfo(auth.personId, id, comment);
    res.json(await detail(auth, id));
  });

  return router;
}
