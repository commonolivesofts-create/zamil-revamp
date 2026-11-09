// Implements: FR-APR-04 (approve / reject with reason / request information — OQ-06 proposal),
// FR-DSH-02 inbox with flags (UI-UX §5.4). DB-01 (no self-approval) via decideStep().
// Delegation, reminders and escalation are phase 2 (FR-APR-05).
import type { InboxFlag, InboxItem } from '@expensehub/shared';
import { formatSar } from '@expensehub/shared';
import type { AuthContext } from '../../auth/context';
import type { ApprovalStepRow, PersonId, ReportRow } from '../../data/entities';
import type { DataLayer, Repos } from '../../data/ports';
import { decideStep, transitionReport } from '../../domain/integrity';
import type { Clock } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import {
  activateNext,
  announceStep,
  cancelOpenSteps,
  notifyClaim,
  personName,
} from '../reports/workflow';

export class ApprovalService {
  constructor(private readonly deps: { data: DataLayer; clock: Clock; appBaseUrl: string }) {}

  private now(): string {
    return this.deps.clock().toISOString();
  }
  private link(path: string): string {
    return `${this.deps.appBaseUrl}${path}`;
  }

  /** A PENDING step assigned to the actor on a report in approval; others look not found. */
  private async actionable(
    r: Repos,
    auth: AuthContext,
    stepId: number,
  ): Promise<{ step: ApprovalStepRow; report: ReportRow }> {
    const step = await r.approvalSteps.get(stepId);
    if (!step || step.assignedTo !== auth.personId) {
      throw new AppError('NOT_FOUND', 'This approval is not waiting for you.');
    }
    const report = await r.reports.getOrThrow(step.reportId);
    if (step.status !== 'PENDING' || report.status !== 'PENDING_APPROVAL') {
      throw new AppError('INVALID_STATE', 'This approval has already been decided or withdrawn.', {
        stepStatus: step.status,
        reportStatus: report.status,
      });
    }
    return { step, report };
  }

  // ─── Inbox ────────────────────────────────────────────────────────────────

  private async flagsOf(r: Repos, report: ReportRow): Promise<InboxFlag[]> {
    const flags = new Set<InboxFlag>();
    if (report.infoRequested === 'Y') flags.add('INFO_REQUESTED');
    for (const line of await r.expenses.listByReport(report.reportId)) {
      if (line.currency !== 'SAR') flags.add('FOREIGN_CURRENCY');
      if (line.receiptRequired === 'Y' && line.receiptAttached === 'N')
        flags.add('MISSING_RECEIPT');
      for (const v of await r.policyViolations.listByExpense(line.expenseId)) {
        if (v.ruleCode === 'LIMIT') flags.add('OVER_LIMIT');
        if (v.ruleCode === 'DUPLICATE') flags.add('DUPLICATE');
      }
      for (const receipt of await r.receipts.listByExpense(line.expenseId)) {
        if (receipt.qrValid === 'N') flags.add('QR_INVALID');
      }
    }
    // Stable order = the order of INBOX_FLAGS in the contract.
    const order: InboxFlag[] = [
      'OVER_LIMIT',
      'MISSING_RECEIPT',
      'DUPLICATE',
      'FOREIGN_CURRENCY',
      'QR_INVALID',
      'INFO_REQUESTED',
    ];
    return order.filter((f) => flags.has(f));
  }

  /** Pending steps assigned to me, oldest first (FR-DSH-02). */
  inbox(personId: PersonId): Promise<InboxItem[]> {
    return this.deps.data.read(async (r) => {
      const items: InboxItem[] = [];
      for (const step of await r.approvalSteps.listPendingFor(personId)) {
        const report = await r.reports.get(step.reportId);
        // Selected reports wait in audit; they are listed too, so an auditor without the
        // Accountant role (D-34: their supervisor) still finds them.
        const inAudit = report?.status === 'PENDING_AUDIT' && step.isAuditStep === 'Y';
        if (!report || !step.pendingSince || (report.status !== 'PENDING_APPROVAL' && !inAudit))
          continue;
        items.push({
          stepId: step.stepId,
          kind: inAudit ? 'AUDIT' : 'APPROVAL',
          stepName: step.stepName,
          reportId: report.reportId,
          reportNumber: report.reportNumber,
          purpose: report.purpose,
          claimantName: (await personName(r, report.personId))!,
          businessUnit: report.businessUnit,
          totalSar: formatSar(report.totalSar),
          lineCount: (await r.expenses.listByReport(report.reportId)).length,
          pendingSince: step.pendingSince,
          flags: await this.flagsOf(r, report),
          version: report.version,
        });
      }
      return items.sort((a, b) => a.pendingSince.localeCompare(b.pendingSince));
    });
  }

  // ─── Decisions ────────────────────────────────────────────────────────────

  approve(auth: AuthContext, stepId: number, comment: string | null) {
    return this.deps.data.withTransaction(async (r) => {
      const at = this.now();
      const { step, report } = await this.actionable(r, auth, stepId);
      await decideStep(r, stepId, 'APPROVED', auth.personId, comment, at);
      // Approving answers an open question too (OQ-06).
      if (report.infoRequested === 'Y') {
        await r.reports.update(report.reportId, { infoRequested: 'N' }, { actorId: auth.personId });
      }

      const next = await activateNext(r, report.reportId, auth.personId, at);
      if (next) {
        // The audit step may move the report to PENDING_AUDIT (FR-AUD-01).
        const updated = await announceStep(r, report.reportId, next, auth.personId, at, (p) =>
          this.link(p),
        );
        return { report: updated, step: next };
      }

      // Last step approved. OQ-03 proposal: the Accountant step is the audit; audit selection
      // (PENDING_AUDIT) arrives with M6 — until then a fully approved report is ready to pay.
      const done = await transitionReport(r, report.reportId, 'READY_FOR_PAYMENT', auth.personId, {
        action: 'APPROVED',
        at,
        patch: { approvedAt: at },
        detail: { lastStep: step.stepName },
      });
      await notifyClaim(r, report.personId, 'REPORT_APPROVED', done, {
        link: this.link(`/reports/${report.reportId}`),
      });
      return { report: done, step: null };
    });
  }

  reject(auth: AuthContext, stepId: number, comment: string) {
    return this.deps.data.withTransaction(async (r) => {
      const at = this.now();
      const { step, report } = await this.actionable(r, auth, stepId);
      await decideStep(r, stepId, 'REJECTED', auth.personId, comment, at);
      await cancelOpenSteps(r, report.reportId, auth.personId, at);
      const rejected = await transitionReport(r, report.reportId, 'REJECTED', auth.personId, {
        action: 'REJECTED',
        at,
        patch: { infoRequested: 'N' },
        detail: { comment, stepName: step.stepName },
      });
      await notifyClaim(r, report.personId, 'REPORT_REJECTED', rejected, {
        stepName: step.stepName,
        actorId: auth.personId,
        comment,
        link: this.link(`/reports/${report.reportId}`),
      });
      return rejected;
    });
  }

  /** OQ-06 proposal: the report stays PENDING_APPROVAL with an "info requested" flag. */
  requestInfo(auth: AuthContext, stepId: number, comment: string) {
    return this.deps.data.withTransaction(async (r) => {
      const { step, report } = await this.actionable(r, auth, stepId);
      if (report.personId === auth.personId) {
        throw new AppError('SOD_VIOLATION', 'You cannot approve or reject your own claim.');
      }
      const updated = await r.reports.update(
        report.reportId,
        { infoRequested: 'Y' },
        { actorId: auth.personId, expectedVersion: report.version },
      );
      await r.reportHistory.append({
        entityType: 'REPORT',
        entityId: report.reportId,
        at: this.now(),
        actorId: auth.personId,
        action: 'INFO_REQUESTED',
        fromStatus: null,
        toStatus: null,
        detail: { comment, stepName: step.stepName, stepId },
      });
      await notifyClaim(r, report.personId, 'INFO_REQUESTED', updated, {
        stepName: step.stepName,
        actorId: auth.personId,
        comment,
        link: this.link(`/reports/${report.reportId}`),
      });
      return updated;
    });
  }
}
