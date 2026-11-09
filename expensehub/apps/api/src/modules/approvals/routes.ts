// Implements: API §6 approvals (approvers only; each decision re-checks the step assignee).
import { approveSchema, reasonSchema } from '@expensehub/shared';
import { Router } from 'express';
import { z } from 'zod';
import type { AuthContext } from '../../auth/context';
import { authOf, requireApprover } from '../../auth/rbac';
import type { DataLayer } from '../../data/ports';
import { reportDetail } from '../reports/dto';
import type { ReportService } from '../reports/service';
import type { ApprovalService } from './service';

const stepParam = z.object({ stepId: z.coerce.number().int().positive() });

export function approvalRoutes({
  data,
  approvals,
  reports,
}: {
  data: DataLayer;
  approvals: ApprovalService;
  reports: ReportService;
}): Router {
  const router = Router();

  router.get('/approvals/inbox', requireApprover, async (req, res) => {
    res.json({ items: await approvals.inbox(authOf(req).personId) });
  });

  /** The report as the approver now sees it (they stay a past step actor, so may view it). */
  const decided = (req: { auth?: AuthContext }, reportId: number) => {
    const auth = authOf(req);
    return data.read(async (r) =>
      reportDetail(r, await reports.getVisible(r, auth, reportId), auth),
    );
  };

  router.post('/approvals/:stepId/approve', requireApprover, async (req, res) => {
    const { stepId } = stepParam.parse(req.params);
    const { comment } = approveSchema.parse(req.body ?? {});
    const { report } = await approvals.approve(authOf(req), stepId, comment ?? null);
    res.json(await decided(req, report.reportId));
  });

  router.post('/approvals/:stepId/reject', requireApprover, async (req, res) => {
    const { stepId } = stepParam.parse(req.params);
    const { comment } = reasonSchema.parse(req.body);
    const report = await approvals.reject(authOf(req), stepId, comment);
    res.json(await decided(req, report.reportId));
  });

  router.post('/approvals/:stepId/request-info', requireApprover, async (req, res) => {
    const { stepId } = stepParam.parse(req.params);
    const { comment } = reasonSchema.parse(req.body);
    const report = await approvals.requestInfo(authOf(req), stepId, comment);
    res.json(await decided(req, report.reportId));
  });

  return router;
}
