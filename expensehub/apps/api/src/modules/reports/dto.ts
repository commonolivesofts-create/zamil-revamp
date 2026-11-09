// Row ↔ API mapping for reports and approval steps (API §5–6; money as 2-decimal strings).
import {
  formatSar,
  type ApprovalStepDto,
  type ReportDetail,
  type ReportHistoryDto,
  type ReportPermissions,
  type ReportSummary,
} from '@expensehub/shared';
import type { AuthContext } from '../../auth/context';
import type { ApprovalStepRow, HistoryRow, ReportRow } from '../../data/entities';
import type { Repos } from '../../data/ports';
import { toExpenseDto } from '../expenses/dto';
import { currentCycle, personName } from './workflow';

export async function reportSummary(r: Repos, report: ReportRow): Promise<ReportSummary> {
  const lines = await r.expenses.listByReport(report.reportId);
  const pending =
    report.status === 'PENDING_APPROVAL' || report.status === 'PENDING_AUDIT'
      ? (await currentCycle(r, report.reportId)).find((s) => s.status === 'PENDING')
      : undefined;
  return {
    reportId: report.reportId,
    reportNumber: report.reportNumber,
    purpose: report.purpose,
    status: report.status,
    infoRequested: report.infoRequested === 'Y',
    claimantName: (await personName(r, report.personId))!,
    businessUnit: report.businessUnit,
    reportDate: report.reportDate,
    totalSar: formatSar(report.totalSar),
    netPayableSar: formatSar(report.netPayableSar),
    lineCount: lines.length,
    submittedAt: report.submittedAt,
    currentStep:
      pending && pending.pendingSince
        ? {
            stepName: pending.stepName,
            assigneeName: (await personName(r, pending.assignedTo))!,
            since: pending.pendingSince,
          }
        : null,
    version: report.version,
    updatedAt: report.updatedAt,
  };
}

export async function stepDto(
  r: Repos,
  step: ApprovalStepRow,
  claimantId: number,
): Promise<ApprovalStepDto> {
  return {
    stepId: step.stepId,
    cycleNo: step.cycleNo,
    seq: step.seq,
    stepName: step.stepName,
    status: step.status,
    isAuditStep: step.isAuditStep === 'Y',
    assigneeName: (await personName(r, step.assignedTo))!,
    actedByName: await personName(r, step.actedBy),
    actedAt: step.actedAt,
    pendingSince: step.pendingSince,
    comment: step.commentText,
    // Stored as: SKIPPED by condition; original assignee = claimant when re-routed (D-34).
    note:
      step.status === 'SKIPPED'
        ? 'BELOW_THRESHOLD'
        : step.originalAssignee === claimantId
          ? 'SELF_APPROVAL'
          : null,
  };
}

function historyText(detail: unknown, key: 'comment' | 'stepName'): string | null {
  if (detail && typeof detail === 'object' && key in detail) {
    const value = (detail as Record<string, unknown>)[key];
    return typeof value === 'string' ? value : null;
  }
  return null;
}

async function historyDto(r: Repos, h: HistoryRow): Promise<ReportHistoryDto> {
  return {
    historyId: h.historyId,
    at: h.at,
    actorName: await personName(r, h.actorId),
    action: h.action,
    fromStatus: h.fromStatus,
    toStatus: h.toStatus,
    comment: historyText(h.detail, 'comment'),
    stepName: historyText(h.detail, 'stepName'),
  };
}

export function permissionsFor(
  auth: Pick<AuthContext, 'personId'>,
  report: ReportRow,
  cycle: ApprovalStepRow[],
  lineCount: number,
): ReportPermissions {
  const own = report.personId === auth.personId;
  const draft = report.status === 'DRAFT';
  const pendingApproval = report.status === 'PENDING_APPROVAL';
  const infoOpen = pendingApproval && report.infoRequested === 'Y';
  const actionable = pendingApproval
    ? cycle.find((s) => s.status === 'PENDING' && s.assignedTo === auth.personId)
    : undefined;
  return {
    canEdit: own && draft,
    canEditPurpose: own && (draft || infoOpen),
    canSubmit: own && draft && lineCount > 0,
    canDelete: own && draft && report.reportNumber === null,
    // FR-REP-05: only while no step of this submission is approved yet.
    canWithdraw: own && pendingApproval && !cycle.some((s) => s.status === 'APPROVED'),
    canCorrect: own && report.status === 'REJECTED',
    canReplyInfo: own && infoOpen,
    actionableStepId: actionable && !own ? actionable.stepId : null,
    canAudit:
      !own &&
      report.status === 'PENDING_AUDIT' &&
      cycle.some(
        (s) => s.status === 'PENDING' && s.isAuditStep === 'Y' && s.assignedTo === auth.personId,
      ),
  };
}

async function auditDto(r: Repos, report: ReportRow): Promise<ReportDetail['audit']> {
  if (report.auditSelected !== 'Y') return null;
  const audit = await r.audits.getByReport(report.reportId);
  if (!audit) return null;
  return {
    reasons: audit.reasons,
    outcome: audit.outcome,
    notes: audit.notes,
    auditorName: await personName(r, audit.auditorId),
    actedAt: audit.actedAt,
  };
}

export async function reportDetail(
  r: Repos,
  report: ReportRow,
  auth: Pick<AuthContext, 'personId'>,
): Promise<ReportDetail> {
  const lineRows = (await r.expenses.listByReport(report.reportId)).sort(
    (a, b) => (a.lineNo ?? 0) - (b.lineNo ?? 0),
  );
  const cycle = await currentCycle(r, report.reportId);
  const claimant = await r.employees.get(report.personId);
  const history = (await r.reportHistory.listFor('REPORT', report.reportId)).sort(
    (a, b) => b.at.localeCompare(a.at) || b.historyId - a.historyId,
  );
  return {
    ...(await reportSummary(r, report)),
    claimant: {
      personId: report.personId,
      personNumber: claimant?.personNumber ?? '',
      fullName: claimant?.fullName ?? `#${report.personId}`,
      jobName: claimant?.jobName ?? null,
    },
    vatSar: formatSar(report.vatSar),
    cashSar: formatSar(report.cashSar),
    approvedAt: report.approvedAt,
    lines: await Promise.all(lineRows.map((l) => toExpenseDto(r, l))),
    audit: await auditDto(r, report),
    fusion:
      report.fusionInvoiceNum || report.syncError
        ? {
            invoiceNumber: report.fusionInvoiceNum,
            status: report.fusionStatus,
            paymentRef: report.paymentRef,
            paidAt: report.paidAt,
            syncError: report.syncError,
          }
        : null,
    // The stepper shows the latest submission; earlier cycles stay in the history.
    steps: await Promise.all(cycle.map((s) => stepDto(r, s, report.personId))),
    history: await Promise.all(history.map((h) => historyDto(r, h))),
    permissions: permissionsFor(auth, report, cycle, lineRows.length),
  };
}
