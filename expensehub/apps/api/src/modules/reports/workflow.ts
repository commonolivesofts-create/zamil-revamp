// Implements: FR-REP / FR-APR building blocks shared by the report and approval services.
// Every function runs inside the caller's transaction.
import {
  effectiveVat,
  formatSarLabel,
  sumSar,
  type AssignableRole,
  type BusinessUnit,
  type Halalas,
} from '@expensehub/shared';
import type { ApprovalStepRow, IsoDate, PersonId, ReportRow } from '../../data/entities';
import type { Repos } from '../../data/ports';
import { selectForAudit } from '../../domain/audit';
import { assertTransition, transitionReport } from '../../domain/integrity';
import { enqueueEmail } from '../notifications/outbox';
import type { ClaimPayload } from '../notifications/templates';

/** Report totals from its lines (FR-REP-01). Card and advances arrive in phases 2–3. */
export async function recalcTotals(
  r: Repos,
  reportId: number,
  actorId: PersonId | null,
): Promise<ReportRow> {
  const report = await r.reports.getOrThrow(reportId);
  const lines = await r.expenses.listByReport(reportId);
  const cash = lines.filter((l) => l.source === 'CASH');
  const card = lines.filter((l) => l.source === 'CARD');
  const cashSar = sumSar(cash.map((l) => l.approvedAmountSar));
  const totals = {
    totalSar: sumSar(lines.map((l) => l.amountSar)),
    // FR-AUD-04: VAT follows the approved amount of an adjusted line.
    vatSar: sumSar(lines.map((l) => effectiveVat(l.vatSar, l.approvedAmountSar, l.amountSar))),
    cashSar,
    cardSar: sumSar(card.map((l) => l.approvedAmountSar)),
    netPayableSar: (cashSar - report.advanceAppliedSar) as Halalas,
  };
  const changed = (Object.keys(totals) as (keyof typeof totals)[]).some(
    (k) => totals[k] !== report[k],
  );
  return changed ? r.reports.update(reportId, totals, { actorId }) : report;
}

/** Renumbers lines by date (line_no within the report). */
export async function renumberLines(r: Repos, reportId: number, actorId: PersonId) {
  const lines = (await r.expenses.listByReport(reportId)).sort(
    (a, b) => a.expenseDate.localeCompare(b.expenseDate) || a.expenseId - b.expenseId,
  );
  for (const [i, line] of lines.entries()) {
    if (line.lineNo !== i + 1)
      await r.expenses.update(line.expenseId, { lineNo: i + 1 }, { actorId });
  }
}

/**
 * OQ-02 proposal: the role holder for a BU — the primary holder, else the backup (absence
 * cover). A grant without a BU covers all BUs. Only active grants of active employees.
 */
export async function resolveRoleHolder(
  r: Repos,
  role: AssignableRole,
  businessUnit: BusinessUnit,
  today: IsoDate,
): Promise<PersonId | null> {
  const grants = (await r.roleAssignments.listByRole(role))
    .filter((a) => a.startDate <= today && (a.endDate === null || a.endDate >= today))
    .filter((a) => a.businessUnit === null || a.businessUnit === businessUnit)
    .sort(
      (a, b) =>
        (a.isBackup === 'Y' ? 1 : 0) - (b.isBackup === 'Y' ? 1 : 0) ||
        // A BU-specific grant is more precise than an all-BU one.
        (a.businessUnit === null ? 1 : 0) - (b.businessUnit === null ? 1 : 0) ||
        a.assignmentId - b.assignmentId,
    );
  for (const grant of grants) {
    const employee = await r.employees.get(grant.personId);
    if (employee?.active === 'Y') return grant.personId;
  }
  return null;
}

export async function holdsRole(
  r: Repos,
  personId: PersonId,
  role: AssignableRole,
  today: IsoDate,
) {
  return (await r.roleAssignments.listByPerson(personId)).some(
    (a) =>
      a.roleCode === role && a.startDate <= today && (a.endDate === null || a.endDate >= today),
  );
}

/** Steps of the latest submission cycle, by seq. */
export async function currentCycle(r: Repos, reportId: number): Promise<ApprovalStepRow[]> {
  const steps = await r.approvalSteps.listByReport(reportId);
  const cycle = Math.max(0, ...steps.map((s) => s.cycleNo));
  return steps.filter((s) => s.cycleNo === cycle).sort((a, b) => a.seq - b.seq);
}

export async function setStepStatus(
  r: Repos,
  step: ApprovalStepRow,
  status: 'PENDING' | 'CANCELLED',
  actorId: PersonId | null,
  at: string,
): Promise<ApprovalStepRow> {
  assertTransition('APPROVAL_STEP', step.status, status);
  return r.approvalSteps.update(
    step.stepId,
    status === 'PENDING' ? { status, pendingSince: at } : { status },
    { actorId },
  );
}

/** Opens the next WAITING step of the current cycle; null when none is left. */
export async function activateNext(
  r: Repos,
  reportId: number,
  actorId: PersonId | null,
  at: string,
): Promise<ApprovalStepRow | null> {
  const next = (await currentCycle(r, reportId)).find((s) => s.status === 'WAITING');
  return next ? setStepStatus(r, next, 'PENDING', actorId, at) : null;
}

/** Cancels the open (PENDING / WAITING) steps of the current cycle. */
export async function cancelOpenSteps(
  r: Repos,
  reportId: number,
  actorId: PersonId | null,
  at: string,
): Promise<ApprovalStepRow[]> {
  const open = (await currentCycle(r, reportId)).filter(
    (s) => s.status === 'PENDING' || s.status === 'WAITING',
  );
  for (const step of open) await setStepStatus(r, step, 'CANCELLED', actorId, at);
  return open;
}

export async function personName(r: Repos, personId: PersonId | null): Promise<string | null> {
  if (personId === null) return null;
  return (await r.employees.get(personId))?.fullName ?? `#${personId}`;
}

/**
 * FR-AUD-01 / OQ-03 proposal: when the Accountant (audit) step opens, the audit rules decide
 * whether this is a full audit (report → PENDING_AUDIT, reasons stored in EH_AUDIT) or a quick
 * release (stays PENDING_APPROVAL; FR-AUD-02). Returns the reasons (empty = not selected).
 */
export async function auditIfSelected(
  r: Repos,
  reportId: number,
  step: ApprovalStepRow,
  actorId: PersonId | null,
  at: string,
): Promise<string[]> {
  if (step.isAuditStep !== 'Y') return [];
  const report = await r.reports.getOrThrow(reportId);
  const lines = await r.expenses.listByReport(reportId);
  const reasons = selectForAudit({
    lines: await Promise.all(
      lines.map(async (l) => ({
        receiptRequired: l.receiptRequired === 'Y',
        receiptAttached: l.receiptAttached === 'Y',
        violations: await r.policyViolations.listByExpense(l.expenseId),
      })),
    ),
    totalSar: report.totalSar,
    sampleKey: report.reportNumber ?? String(reportId),
    rules: (await r.auditRules.list()).map((rule) => ({
      ruleCode: rule.ruleCode,
      paramNumber: rule.paramNumber,
      active: rule.active === 'Y',
    })),
  });
  if (reasons.length === 0) return [];

  // EH_AUDIT is one row per report: a resubmission re-opens it with the new reasons.
  const existing = await r.audits.getByReport(reportId);
  const fresh = { reasons, auditorId: null, outcome: null, notes: null, actedAt: null };
  if (existing) await r.audits.update(existing.auditId, fresh, { actorId });
  else await r.audits.insert({ reportId, ...fresh }, { actorId });

  await transitionReport(r, reportId, 'PENDING_AUDIT', actorId, {
    action: 'AUDIT_SELECTED',
    at,
    patch: { auditSelected: 'Y' },
    detail: { reasons, stepName: step.stepName },
  });
  return reasons;
}

/**
 * A step was just opened: run audit selection, then email the assignee — an audit request for
 * a selected report, an approval request otherwise.
 */
export async function announceStep(
  r: Repos,
  reportId: number,
  step: ApprovalStepRow,
  actorId: PersonId | null,
  at: string,
  link: (path: string) => string,
): Promise<ReportRow> {
  const reasons = await auditIfSelected(r, reportId, step, actorId, at);
  const report = await r.reports.getOrThrow(reportId);
  await notifyClaim(
    r,
    step.assignedTo,
    reasons.length ? 'AUDIT_REQUEST' : 'APPROVAL_REQUEST',
    report,
    {
      stepName: step.stepName,
      comment: reasons.length ? reasons.join(', ') : null,
      link: link(reasons.length ? `/audit/${reportId}` : `/approvals?report=${reportId}`),
    },
  );
  return report;
}

type ClaimTemplate =
  | 'AUDIT_REQUEST'
  | 'LINE_ADJUSTED'
  | 'APPROVAL_REQUEST'
  | 'REPORT_APPROVED'
  | 'REPORT_PAID'
  | 'REPORT_INVOICED'
  | 'REPORT_REJECTED'
  | 'INFO_REQUESTED'
  | 'INFO_REPLIED'
  | 'REPORT_WITHDRAWN';

/** Queues one claim email (FR-NTF-01) in the caller's transaction. */
export async function notifyClaim(
  r: Repos,
  recipientId: PersonId,
  template: ClaimTemplate,
  report: ReportRow,
  extra: {
    stepName?: string | null;
    actorId?: PersonId | null;
    comment?: string | null;
    link: string;
  },
) {
  const payload: ClaimPayload = {
    reportNumber: report.reportNumber ?? `#${report.reportId}`,
    purpose: report.purpose,
    claimantName: (await personName(r, report.personId))!,
    total: formatSarLabel(report.totalSar),
    stepName: extra.stepName ?? null,
    actorName: await personName(r, extra.actorId ?? null),
    comment: extra.comment ?? null,
    link: extra.link,
  };
  await enqueueEmail(r, recipientId, template, payload);
}
