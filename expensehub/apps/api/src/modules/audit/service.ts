// Implements: FR-AUD-03/04 — the audit workspace actions on a report selected for audit
// (OQ-03 proposal: the Accountant step is the audit). Who may act = the assignee of the open
// audit step (normally the BU accountant; their supervisor for their own claim, D-34).
// DB-01/02/03 via decideStep / recordAuditOutcome / adjustLineAmount.
import {
  formatSar,
  formatSarLabel,
  parseSar,
  type AuditQueueItem,
  type LineAdjust,
} from '@expensehub/shared';
import type { AuthContext } from '../../auth/context';
import type { ApprovalStepRow, PersonId, ReportRow } from '../../data/entities';
import type { DataLayer, Repos } from '../../data/ports';
import {
  adjustLineAmount,
  decideStep,
  recordAuditOutcome,
  transitionReport,
} from '../../domain/integrity';
import type { Clock } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import {
  cancelOpenSteps,
  currentCycle,
  notifyClaim,
  personName,
  recalcTotals,
} from '../reports/workflow';

export class AuditService {
  constructor(private readonly deps: { data: DataLayer; clock: Clock; appBaseUrl: string }) {}

  private now(): string {
    return this.deps.clock().toISOString();
  }
  private link(path: string): string {
    return `${this.deps.appBaseUrl}${path}`;
  }

  /** The report in audit and its open audit step — only for that step's assignee. */
  private async auditable(
    r: Repos,
    auth: AuthContext,
    reportId: number,
  ): Promise<{ report: ReportRow; step: ApprovalStepRow }> {
    const report = await r.reports.get(reportId);
    const step = report
      ? (await currentCycle(r, reportId)).find(
          (s) => s.status === 'PENDING' && s.isAuditStep === 'Y',
        )
      : undefined;
    if (!report || !step || step.assignedTo !== auth.personId) {
      throw new AppError('NOT_FOUND', 'This report is not waiting for your audit.');
    }
    if (report.status !== 'PENDING_AUDIT') {
      throw new AppError('INVALID_STATE', 'This report is not in audit.', {
        status: report.status,
      });
    }
    return { report, step };
  }

  /** Reports waiting for my audit, oldest first (API §7). */
  queue(personId: PersonId): Promise<AuditQueueItem[]> {
    return this.deps.data.read(async (r) => {
      const items: AuditQueueItem[] = [];
      for (const step of await r.approvalSteps.listPendingFor(personId)) {
        if (step.isAuditStep !== 'Y' || !step.pendingSince) continue;
        const report = await r.reports.get(step.reportId);
        if (!report || report.status !== 'PENDING_AUDIT') continue;
        const lines = await r.expenses.listByReport(report.reportId);
        const receipts = (
          await Promise.all(lines.map((l) => r.receipts.listByExpense(l.expenseId)))
        ).flat();
        items.push({
          reportId: report.reportId,
          reportNumber: report.reportNumber,
          purpose: report.purpose,
          claimantName: (await personName(r, report.personId))!,
          businessUnit: report.businessUnit,
          totalSar: formatSar(report.totalSar),
          lineCount: lines.length,
          receipts: receipts.length,
          receiptsVerified: receipts.filter((x) => x.verifiedByAuditor === 'Y').length,
          reasons: (await r.audits.getByReport(report.reportId))?.reasons ?? [],
          pendingSince: step.pendingSince,
        });
      }
      return items.sort((a, b) => a.pendingSince.localeCompare(b.pendingSince));
    });
  }

  /** FR-AUD-03: the auditor checked the receipt against the line. */
  verifyReceipt(auth: AuthContext, reportId: number, receiptId: number) {
    return this.deps.data.withTransaction(async (r) => {
      const { report } = await this.auditable(r, auth, reportId);
      const receipt = await r.receipts.get(receiptId);
      const line = receipt?.expenseId ? await r.expenses.get(receipt.expenseId) : undefined;
      if (!receipt || !line || line.reportId !== report.reportId) {
        throw new AppError('NOT_FOUND', 'Receipt not found on this report');
      }
      if (receipt.verifiedByAuditor === 'Y') return receipt;
      const updated = await r.receipts.update(
        receiptId,
        { verifiedByAuditor: 'Y' },
        { actorId: auth.personId, expectedVersion: receipt.version },
      );
      await r.reportHistory.append({
        entityType: 'REPORT',
        entityId: reportId,
        at: this.now(),
        actorId: auth.personId,
        action: 'RECEIPT_VERIFIED',
        fromStatus: null,
        toStatus: null,
        detail: { receiptId, expenseId: line.expenseId, comment: line.merchant },
      });
      return updated;
    });
  }

  /** FR-AUD-04: reduce or disallow (0) a line with a reason; totals recalculated; claimant told. */
  adjust(auth: AuthContext, reportId: number, expenseId: number, input: LineAdjust) {
    return this.deps.data.withTransaction(async (r) => {
      const { report } = await this.auditable(r, auth, reportId);
      const line = await r.expenses.get(expenseId);
      if (!line || line.reportId !== report.reportId) {
        throw new AppError('NOT_FOUND', 'Line not found on this report');
      }
      const to = parseSar(input.approvedAmount);
      if (to > line.amountSar) {
        const message = `The approved amount cannot be more than the claimed ${formatSarLabel(line.amountSar)}.`;
        throw new AppError('VALIDATION', message, {
          issues: [{ path: 'approvedAmount', message }],
        });
      }
      const from = line.approvedAmountSar;
      if (to === from && input.reason.trim() === (line.adjustmentReason ?? '')) return line;
      // DB-03: not the claimant; PENDING_AUDIT only; original amount kept.
      const updated = await adjustLineAmount(r, expenseId, to, input.reason, auth.personId);
      const totals = await recalcTotals(r, reportId, auth.personId);
      const summary = `${line.merchant ?? 'Line'}: ${formatSarLabel(from)} → ${formatSarLabel(to)} — ${input.reason.trim()}`;
      await r.reportHistory.append({
        entityType: 'REPORT',
        entityId: reportId,
        at: this.now(),
        actorId: auth.personId,
        action: to === 0 ? 'LINE_DISALLOWED' : 'LINE_ADJUSTED',
        fromStatus: null,
        toStatus: null,
        detail: { expenseId, from, to, comment: summary },
      });
      await notifyClaim(r, report.personId, 'LINE_ADJUSTED', totals, {
        actorId: auth.personId,
        comment: summary,
        link: this.link(`/reports/${reportId}`),
      });
      return updated;
    });
  }

  /** FR-AUD-03: release → READY_FOR_PAYMENT (the audit step is approved, the outcome stored). */
  release(auth: AuthContext, reportId: number, comment: string | null) {
    return this.deps.data.withTransaction(async (r) => {
      const at = this.now();
      const { report, step } = await this.auditable(r, auth, reportId);
      await decideStep(r, step.stepId, 'APPROVED', auth.personId, comment, at);
      await recordAuditOutcome(r, reportId, auth.personId, 'RELEASED', comment);
      const done = await transitionReport(r, reportId, 'READY_FOR_PAYMENT', auth.personId, {
        action: 'AUDIT_RELEASED',
        at,
        patch: { releasedAt: at, approvedAt: report.approvedAt ?? at },
        detail: { stepName: step.stepName, comment },
      });
      await notifyClaim(r, report.personId, 'REPORT_APPROVED', done, {
        link: this.link(`/reports/${reportId}`),
      });
      return done;
    });
  }

  /** FR-AUD-03: reject with a reason → REJECTED; the claimant corrects and resubmits. */
  reject(auth: AuthContext, reportId: number, reason: string) {
    return this.deps.data.withTransaction(async (r) => {
      const at = this.now();
      const { report, step } = await this.auditable(r, auth, reportId);
      await decideStep(r, step.stepId, 'REJECTED', auth.personId, reason, at);
      await recordAuditOutcome(r, reportId, auth.personId, 'REJECTED', reason);
      await cancelOpenSteps(r, reportId, auth.personId, at);
      const rejected = await transitionReport(r, reportId, 'REJECTED', auth.personId, {
        action: 'REJECTED',
        at,
        detail: { comment: reason, stepName: step.stepName },
      });
      await notifyClaim(r, report.personId, 'REPORT_REJECTED', rejected, {
        stepName: step.stepName,
        actorId: auth.personId,
        comment: reason,
        link: this.link(`/reports/${reportId}`),
      });
      return rejected;
    });
  }
}
