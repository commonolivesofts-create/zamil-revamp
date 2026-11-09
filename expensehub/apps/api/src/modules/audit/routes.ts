// Implements: API §7 audit. Guarded for approvers; every action re-checks that the caller holds
// the open audit step (normally an Accountant; their supervisor for their own claim, D-34).
import { approveSchema, lineAdjustSchema, reasonSchema } from '@expensehub/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../auth/context';
import { authOf, requireApprover } from '../../auth/rbac';
import type { DataLayer } from '../../data/ports';
import { reportDetail } from '../reports/dto';
import type { ReportService } from '../reports/service';
import type { AuditService } from './service';

const reportParam = z.object({ reportId: z.coerce.number().int().positive() });
const receiptParams = reportParam.extend({ receiptId: z.coerce.number().int().positive() });
const lineParams = reportParam.extend({ expenseId: z.coerce.number().int().positive() });

export function auditRoutes({
  data,
  audit,
  reports,
}: {
  data: DataLayer;
  audit: AuditService;
  reports: ReportService;
}): Router {
  const router = Router();

  const detail = (req: { auth?: AuthContext }, reportId: number) => {
    const auth = authOf(req);
    return data.read(async (r) =>
      reportDetail(r, await reports.getVisible(r, auth, reportId), auth),
    );
  };

  router.get('/audit/queue', requireApprover, async (req, res) => {
    res.json({ items: await audit.queue(authOf(req).personId) });
  });

  router.post('/audit/:reportId/receipts/:receiptId/verify', requireApprover, async (req, res) => {
    const { reportId, receiptId } = receiptParams.parse(req.params);
    await audit.verifyReceipt(authOf(req), reportId, receiptId);
    res.json(await detail(req, reportId));
  });

  router.post('/audit/:reportId/lines/:expenseId/adjust', requireApprover, async (req, res) => {
    const { reportId, expenseId } = lineParams.parse(req.params);
    await audit.adjust(authOf(req), reportId, expenseId, lineAdjustSchema.parse(req.body));
    res.json(await detail(req, reportId));
  });

  router.post('/audit/:reportId/release', requireApprover, async (req, res) => {
    const { reportId } = reportParam.parse(req.params);
    const { comment } = approveSchema.parse(req.body ?? {});
    await audit.release(authOf(req), reportId, comment ?? null);
    res.json(await detail(req, reportId));
  });

  router.post('/audit/:reportId/reject', requireApprover, async (req, res) => {
    const { reportId } = reportParam.parse(req.params);
    const { comment } = reasonSchema.parse(req.body);
    await audit.reject(authOf(req), reportId, comment);
    res.json(await detail(req, reportId));
  });

  return router;
}
