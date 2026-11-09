// Implements: D-24 / D-33 — segregation of duties, append-only history and status transitions
// enforced in the service layer. These are the service-side equivalents of DB-01…DB-08
// (DRD §5); in M8 the Oracle triggers add a second layer. Every write path in later
// milestones must go through these helpers, inside data.withTransaction().
import {
  canTransition,
  type AuditOutcome,
  type Halalas,
  type MachineKind,
  type ReportStatus,
  type StatusOf,
} from '@expensehub/shared';
import type { AdvanceRow, AuditRecordRow, ExpenseRow, PersonId, ReportRow } from '../data/entities';
import type { Repos } from '../data/ports';
import { AppError } from '../lib/errors';

// ─── Status transitions (TRD §4.3) ──────────────────────────────────────────

export function assertTransition<K extends MachineKind>(
  kind: K,
  from: StatusOf<K>,
  to: StatusOf<K>,
): void {
  if (!canTransition(kind, from, to)) {
    throw new AppError('INVALID_STATE', `Cannot move ${kind.toLowerCase()} from ${from} to ${to}`, {
      from,
      to,
    });
  }
}

/**
 * The only way a report changes status: checks the transition map, updates the report with
 * its optimistic lock and appends one history row — in the caller's transaction.
 */
export async function transitionReport(
  repos: Repos,
  reportId: number,
  to: ReportStatus,
  actorId: PersonId | null,
  options: { action?: string; detail?: unknown; patch?: Partial<ReportRow>; at?: string } = {},
): Promise<ReportRow> {
  const report = await repos.reports.getOrThrow(reportId);
  assertTransition('REPORT', report.status, to);
  const updated = await repos.reports.update(
    reportId,
    { ...options.patch, status: to },
    { actorId, expectedVersion: report.version },
  );
  await repos.reportHistory.append({
    entityType: 'REPORT',
    entityId: reportId,
    at: options.at,
    actorId,
    action: options.action ?? `STATUS_${to}`,
    fromStatus: report.status,
    toStatus: to,
    detail: options.detail ?? null,
  });
  return updated;
}

// ─── Segregation of duties ──────────────────────────────────────────────────

const SOD_MESSAGES = {
  'DB-01': 'You cannot approve or reject your own claim.',
  'DB-02': 'You cannot audit your own claim.',
  'DB-03': 'You cannot adjust the amounts on your own claim.',
  'DB-04': 'You cannot approve or pay out your own advance.',
} as const;
export type SodRule = keyof typeof SOD_MESSAGES;

export function assertNotClaimant(
  actorId: PersonId | null,
  claimantId: PersonId,
  rule: SodRule,
): void {
  if (actorId === null || actorId === claimantId) {
    throw new AppError('SOD_VIOLATION', SOD_MESSAGES[rule], { rule });
  }
}

/** DB-01: an approval step is decided by someone other than the claimant. */
export async function decideStep(
  repos: Repos,
  stepId: number,
  decision: 'APPROVED' | 'REJECTED',
  actorId: PersonId,
  comment: string | null,
  at: string = new Date().toISOString(),
) {
  const step = await repos.approvalSteps.getOrThrow(stepId);
  const report = await repos.reports.getOrThrow(step.reportId);
  assertNotClaimant(actorId, report.personId, 'DB-01');
  assertTransition('APPROVAL_STEP', step.status, decision);
  if (decision === 'REJECTED' && !comment?.trim()) {
    throw new AppError('VALIDATION', 'A reason is required to reject (FR-APR-04).');
  }
  const updated = await repos.approvalSteps.update(
    stepId,
    {
      status: decision,
      actedBy: actorId,
      actedAt: at,
      commentText: comment?.trim() || null,
    },
    { actorId, expectedVersion: step.version },
  );
  await repos.reportHistory.append({
    entityType: 'REPORT',
    entityId: report.reportId,
    at,
    actorId,
    action: decision === 'APPROVED' ? 'STEP_APPROVED' : 'STEP_REJECTED',
    fromStatus: null,
    toStatus: null,
    detail: { stepId, seq: step.seq, stepName: step.stepName, comment: updated.commentText },
  });
  return updated;
}

/** DB-02: the auditor is not the claimant. */
export async function recordAuditOutcome(
  repos: Repos,
  reportId: number,
  auditorId: PersonId,
  outcome: AuditOutcome,
  notes: string | null,
): Promise<AuditRecordRow> {
  const report = await repos.reports.getOrThrow(reportId);
  assertNotClaimant(auditorId, report.personId, 'DB-02');
  if (outcome === 'REJECTED' && !notes?.trim()) {
    throw new AppError('VALIDATION', 'A reason is required to reject.');
  }
  const audit = await repos.audits.getByReport(reportId);
  const fields = {
    auditorId,
    outcome,
    notes: notes?.trim() || null,
    actedAt: new Date().toISOString(),
  };
  return audit
    ? repos.audits.update(audit.auditId, fields, {
        actorId: auditorId,
        expectedVersion: audit.version,
      })
    : repos.audits.insert({ reportId, reasons: [], ...fields }, { actorId: auditorId });
}

/**
 * DB-03 + DB-06 exception: only an auditor who is not the claimant reduces or disallows a
 * line, only while the report is PENDING_AUDIT, never above the claimed amount, with a reason
 * (FR-AUD-04). The original amount is kept.
 */
export async function adjustLineAmount(
  repos: Repos,
  expenseId: number,
  approvedAmountSar: Halalas,
  reason: string,
  actorId: PersonId,
): Promise<ExpenseRow> {
  const line = await repos.expenses.getOrThrow(expenseId);
  assertNotClaimant(actorId, line.personId, 'DB-03');
  if (line.reportId === null)
    throw new AppError('INVALID_STATE', 'Only lines on a report can be adjusted.');
  const report = await repos.reports.getOrThrow(line.reportId);
  if (report.status !== 'PENDING_AUDIT') {
    throw new AppError('INVALID_STATE', 'Lines can only be adjusted during audit.', {
      status: report.status,
    });
  }
  if (!reason.trim()) throw new AppError('VALIDATION', 'A reason is required to adjust a line.');
  if (approvedAmountSar < 0 || approvedAmountSar > line.amountSar) {
    throw new AppError(
      'VALIDATION',
      'The approved amount must be between 0 and the claimed amount.',
    );
  }
  const updated = await repos.expenses.update(
    expenseId,
    { approvedAmountSar, adjustmentReason: reason.trim() },
    { actorId, expectedVersion: line.version },
  );
  await repos.reportHistory.append({
    entityType: 'EXPENSE',
    entityId: expenseId,
    actorId,
    action: approvedAmountSar === 0 ? 'LINE_DISALLOWED' : 'LINE_ADJUSTED',
    fromStatus: null,
    toStatus: null,
    detail: {
      reportId: report.reportId,
      from: line.approvedAmountSar,
      to: approvedAmountSar,
      reason: reason.trim(),
    },
  });
  return updated;
}

// ─── Locked lines (DB-06) ───────────────────────────────────────────────────

/** Fields fixed once a report leaves DRAFT. */
export const LOCKED_LINE_FIELDS = [
  'amount',
  'amountSar',
  'currency',
  'fxRate',
  'quantity',
  'typeId',
  'expenseDate',
  'reportId',
] as const satisfies readonly (keyof ExpenseRow)[];

/** DB-06: amount / type / date of a line on a non-DRAFT report cannot change. */
export function assertLineEditable(
  reportStatus: ReportStatus | null,
  changedFields: readonly (keyof ExpenseRow)[],
): void {
  if (reportStatus === null || reportStatus === 'DRAFT') return;
  const locked = changedFields.filter((f) => (LOCKED_LINE_FIELDS as readonly string[]).includes(f));
  if (locked.length > 0) {
    throw new AppError(
      'INVALID_STATE',
      'This line is on a submitted report; withdraw the report to change amounts, type or date.',
      { fields: locked, status: reportStatus },
    );
  }
}

// ─── Advances (phase 2) ─────────────────────────────────────────────────────

/** DB-04: the advance approver / petty cashier is not the advance owner. */
export function assertAdvanceActor(advance: AdvanceRow, actorId: PersonId): void {
  assertNotClaimant(actorId, advance.personId, 'DB-04');
}

/** DB-08: applied + refunded never exceeds the advance. */
export function assertAdvanceBalance(
  advance: Pick<AdvanceRow, 'amountSar' | 'appliedSar' | 'refundedSar'>,
): void {
  if (advance.appliedSar + advance.refundedSar > advance.amountSar) {
    throw new AppError('INVALID_STATE', 'Applied and refunded amounts exceed the advance.');
  }
}
