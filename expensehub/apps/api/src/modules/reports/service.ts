// Implements: FR-REP-01…07 and the claimant side of FR-APR — create, edit, submit (chain build,
// FR-APR-01/02/07/08, D-34, D-37), withdraw, correct, reply to an info request (OQ-06 proposal).
// Every status change goes through transitionReport() (one history row each, TRD §4.3).
import {
  formatSar,
  parseSar,
  type ApprovalChain,
  type ExpenseInput,
  type ReportCreate,
  type ReportStatus,
  type ReportUpdate,
} from '@expensehub/shared';
import type { AuthContext } from '../../auth/context';
import { canViewReport } from '../../auth/rbac';
import type { ExpenseRow, PersonId, ReportRow } from '../../data/entities';
import type { DataLayer, Repos } from '../../data/ports';
import { planChain, type ChainProblem } from '../../domain/chain';
import { transitionReport } from '../../domain/integrity';
import { checkPrerequisites } from '../../domain/prerequisites';
import { riyadhDate, type Clock } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { evaluateExpense } from '../expenses/context';
import {
  announceStep,
  cancelOpenSteps,
  currentCycle,
  holdsRole,
  notifyClaim,
  recalcTotals,
  renumberLines,
  resolveRoleHolder,
} from './workflow';

const CHAINS: ApprovalChain[] = ['STANDARD', 'CEO_CLAIMANT'];

function problemMessage(p: ChainProblem): string {
  switch (p.code) {
    case 'NO_SUPERVISOR':
      return 'Your line manager is missing in Oracle HCM. Ask HR to set your supervisor.';
    case 'NO_ROLE_HOLDER':
      return `No ${p.stepName} is assigned for your business unit. Ask the ExpenseHub administrator to assign one.`;
    case 'NO_RULES':
      return 'No approval rules are set up. Ask the ExpenseHub administrator.';
  }
}

export class ReportService {
  constructor(private readonly deps: { data: DataLayer; clock: Clock; appBaseUrl: string }) {}

  private now(): string {
    return this.deps.clock().toISOString();
  }
  private today(): string {
    return riyadhDate(this.deps.clock());
  }
  private link(path: string): string {
    return `${this.deps.appBaseUrl}${path}`;
  }

  /** Own report or NOT_FOUND. */
  private async own(r: Repos, personId: PersonId, reportId: number): Promise<ReportRow> {
    const report = await r.reports.get(reportId);
    if (!report || report.personId !== personId)
      throw new AppError('NOT_FOUND', 'Report not found');
    return report;
  }

  private static assertVersion(report: ReportRow, version: number) {
    if (report.version !== version) {
      throw new AppError(
        'VERSION_CONFLICT',
        'This report was changed in another window. Reload to see the latest version.',
      );
    }
  }

  private static assertStatus(report: ReportRow, ...allowed: ReportStatus[]) {
    if (!allowed.includes(report.status)) {
      throw new AppError(
        'INVALID_STATE',
        `This is not possible while the report is ${report.status}.`,
        {
          status: report.status,
        },
      );
    }
  }

  /** Lines must be the claimant's own and free (unreported, or already on this report). */
  private async attachLines(r: Repos, report: ReportRow, expenseIds: number[], actorId: PersonId) {
    const wanted = new Set(expenseIds);
    for (const id of wanted) {
      const line = await r.expenses.get(id);
      if (
        !line ||
        line.personId !== actorId ||
        (line.reportId !== null && line.reportId !== report.reportId)
      ) {
        const message = 'Choose your own expenses that are not on another report';
        throw new AppError('VALIDATION', message, { issues: [{ path: 'expenseIds', message }] });
      }
    }
    for (const line of await r.expenses.listByReport(report.reportId)) {
      if (!wanted.has(line.expenseId)) {
        await r.expenses.update(line.expenseId, { reportId: null, lineNo: null }, { actorId });
      }
    }
    for (const id of wanted) {
      const line = await r.expenses.getOrThrow(id);
      if (line.reportId === null)
        await r.expenses.update(id, { reportId: report.reportId }, { actorId });
    }
    await renumberLines(r, report.reportId, actorId);
    return recalcTotals(r, report.reportId, actorId);
  }

  // ─── Reads ────────────────────────────────────────────────────────────────

  listOwn(personId: PersonId, status?: ReportStatus) {
    return this.deps.data.read((r) =>
      r.reports.listByPerson(personId, status ? [status] : undefined),
    );
  }

  /** Own · any step assignee (past or current) · Finance for the BU (API §5); else NOT_FOUND. */
  async getVisible(r: Repos, auth: AuthContext, reportId: number): Promise<ReportRow> {
    const report = await r.reports.get(reportId);
    if (!report) throw new AppError('NOT_FOUND', 'Report not found');
    const steps = await r.approvalSteps.listByReport(reportId);
    if (!canViewReport(auth, report, steps)) throw new AppError('NOT_FOUND', 'Report not found');
    return report;
  }

  // ─── Draft ────────────────────────────────────────────────────────────────

  create(personId: PersonId, input: ReportCreate) {
    return this.deps.data.withTransaction(async (r) => {
      const employee = await r.employees.get(personId);
      if (!employee || employee.active !== 'Y') {
        throw new AppError('FORBIDDEN', 'Your HCM assignment is not active.');
      }
      const report = await r.reports.insert(
        {
          reportNumber: null,
          personId,
          businessUnit: employee.businessUnit,
          purpose: input.purpose,
          reportDate: this.today(),
          status: 'DRAFT',
          infoRequested: 'N',
          totalSar: parseSar(0),
          cashSar: parseSar(0),
          cardSar: parseSar(0),
          vatSar: parseSar(0),
          advanceAppliedSar: parseSar(0),
          netPayableSar: parseSar(0),
          auditSelected: 'N',
          submittedAt: null,
          approvedAt: null,
          releasedAt: null,
          fusionInvoiceId: null,
          fusionInvoiceNum: null,
          fusionStatus: null,
          paymentRef: null,
          paidAt: null,
          syncError: null,
          source: 'APP',
        },
        { actorId: personId },
      );
      await r.reportHistory.append({
        entityType: 'REPORT',
        entityId: report.reportId,
        at: this.now(),
        actorId: personId,
        action: 'CREATED',
        fromStatus: null,
        toStatus: 'DRAFT',
        detail: { lines: input.expenseIds.length },
      });
      return this.attachLines(r, report, input.expenseIds, personId);
    });
  }

  /** DRAFT: purpose + lines. Info requested (OQ-06): the purpose only. */
  update(personId: PersonId, reportId: number, input: ReportUpdate) {
    return this.deps.data.withTransaction(async (r) => {
      const report = await this.own(r, personId, reportId);
      ReportService.assertVersion(report, input.version);
      const infoOpen = report.status === 'PENDING_APPROVAL' && report.infoRequested === 'Y';
      if (report.status !== 'DRAFT' && !infoOpen) ReportService.assertStatus(report, 'DRAFT');
      if (infoOpen && input.expenseIds) {
        throw new AppError(
          'INVALID_STATE',
          'Lines cannot be added or removed while the report is with an approver. Withdraw it first.',
        );
      }
      let row = report;
      if (input.purpose !== report.purpose) {
        row = await r.reports.update(reportId, { purpose: input.purpose }, { actorId: personId });
        await r.reportHistory.append({
          entityType: 'REPORT',
          entityId: reportId,
          at: this.now(),
          actorId: personId,
          action: 'PURPOSE_CHANGED',
          fromStatus: null,
          toStatus: null,
          detail: { from: report.purpose, to: input.purpose },
        });
      }
      if (input.expenseIds) row = await this.attachLines(r, row, input.expenseIds, personId);
      return row;
    });
  }

  /** Discard a draft that was never submitted (no number to keep); its lines become unreported. */
  delete(personId: PersonId, reportId: number) {
    return this.deps.data.withTransaction(async (r) => {
      const report = await this.own(r, personId, reportId);
      if (report.status !== 'DRAFT' || report.reportNumber !== null) {
        throw new AppError(
          'INVALID_STATE',
          'Only a draft that was never submitted can be deleted.',
        );
      }
      for (const line of await r.expenses.listByReport(reportId)) {
        await r.expenses.update(
          line.expenseId,
          { reportId: null, lineNo: null },
          { actorId: personId },
        );
      }
      await r.reports.delete(reportId);
      await r.reportHistory.append({
        entityType: 'REPORT',
        entityId: reportId,
        at: this.now(),
        actorId: personId,
        action: 'DELETED',
        fromStatus: 'DRAFT',
        toStatus: null,
        detail: null,
      });
    });
  }

  // ─── Submit (FR-REP-03, FR-APR-01) ────────────────────────────────────────

  /** Rebuilds the policy input of a saved line, to re-check it at submit. */
  private async inputOf(r: Repos, line: ExpenseRow): Promise<ExpenseInput> {
    const type = await r.expenseTypes.getOrThrow(line.typeId);
    const [receipt] = await r.receipts.listByExpense(line.expenseId);
    return {
      typeId: line.typeId,
      expenseDate: line.expenseDate,
      merchant: line.merchant,
      description: line.description,
      attendees: line.attendees,
      justification: line.justification,
      amount: type.category === 'STANDARD' ? formatSar(line.amount) : null,
      currency: line.currency,
      quantity:
        type.category === 'MILEAGE' && line.quantity !== null ? String(line.quantity) : null,
      tripId: line.tripId,
      quickPayId: line.quickPayId,
      costCenter: line.costCenter,
      taxInvoice: line.taxInvoice === 'Y',
      receiptId: receipt?.receiptId ?? null,
    };
  }

  submit(personId: PersonId, reportId: number, version: number) {
    return this.deps.data.withTransaction(async (r) => {
      const at = this.now();
      const today = this.today();
      let report = await this.own(r, personId, reportId);
      ReportService.assertVersion(report, version);
      ReportService.assertStatus(report, 'DRAFT');
      const lines = await r.expenses.listByReport(reportId);
      if (lines.length === 0) {
        throw new AppError('VALIDATION', 'Add at least one expense before submitting.');
      }

      // FR-SET-02 / FR-APR-08 — D-37: the CEO's chain has no line-manager step.
      const employee = await r.employees.get(personId);
      if (!employee) throw new AppError('FORBIDDEN', 'Your HCM assignment is not active.');
      const claimantIsCeo = await holdsRole(r, personId, 'APPROVER_CEO', today);
      const prerequisites = checkPrerequisites(employee, { needsLineManager: !claimantIsCeo });
      if (!prerequisites.ok) {
        throw new AppError('PREREQUISITE_MISSING', 'You cannot submit yet.', {
          checks: prerequisites.checks.filter((c) => !c.ok),
        });
      }

      // FR-REP-03: the server re-checks every line; any BLOCK stops the submit. Violations are
      // refreshed and then frozen (DRD EH_POLICY_VIOLATIONS).
      const blocked: { expenseId: number; merchant: string | null; results: unknown[] }[] = [];
      for (const line of lines) {
        const e = await evaluateExpense(r, personId, await this.inputOf(r, line), {
          today,
          expenseId: line.expenseId,
        });
        await r.policyViolations.replaceForExpense(
          line.expenseId,
          e.output.results
            .filter((x) => x.level !== 'PASS')
            .map((x) => ({
              ruleCode: x.rule,
              level: x.level as 'WARN' | 'BLOCK',
              message: x.message,
            })),
        );
        // A new submission is audited afresh: earlier audit adjustments are undone (FR-REP-04).
        if (e.output.level !== line.policyLevel || line.approvedAmountSar !== line.amountSar) {
          await r.expenses.update(
            line.expenseId,
            {
              policyLevel: e.output.level,
              approvedAmountSar: line.amountSar,
              adjustmentReason: null,
            },
            { actorId: personId },
          );
        }
        if (e.output.level === 'BLOCK') {
          blocked.push({
            expenseId: line.expenseId,
            merchant: line.merchant,
            results: e.output.results.filter((x) => x.level === 'BLOCK'),
          });
        }
      }
      if (blocked.length) {
        throw new AppError('POLICY_BLOCK', 'Fix the blocked expenses before submitting.', {
          lines: blocked,
        });
      }

      report = await recalcTotals(r, reportId, personId);
      const rules = Object.fromEntries(
        await Promise.all(
          CHAINS.map(async (c) => [c, await r.approvalRules.listActive(c)] as const),
        ),
      ) as Record<ApprovalChain, Awaited<ReturnType<typeof r.approvalRules.listActive>>>;
      const thresholdOption = await r.systemOptions.resolve(
        'CEO_THRESHOLD_SAR',
        report.businessUnit,
      );
      const holders = new Map<string, PersonId | null>();
      for (const role of [
        'APPROVER_CEO',
        'APPROVER_HR',
        'APPROVER_FIN_MGR',
        'ACCOUNTANT',
      ] as const) {
        holders.set(role, await resolveRoleHolder(r, role, report.businessUnit, today));
      }
      // D-49: managers above the claimant, nearest first, to the top of HCM. Stops at a missing
      // or inactive manager, a loop, or APPROVAL_MAX_LEVELS (0 = no limit; hard cap 15).
      const maxLevelsOption = Number(
        (await r.systemOptions.resolve('APPROVAL_MAX_LEVELS', report.businessUnit))?.optionValue,
      );
      const maxLevels = maxLevelsOption > 0 ? Math.min(maxLevelsOption, 15) : 15;
      const supervisorChain: PersonId[] = [];
      for (
        let managerId = employee.supervisorId;
        managerId !== null &&
        managerId !== personId &&
        !supervisorChain.includes(managerId) &&
        supervisorChain.length < maxLevels;
      ) {
        const manager = await r.employees.get(managerId);
        if (!manager || manager.active !== 'Y') break;
        supervisorChain.push(managerId);
        managerId = manager.supervisorId;
      }
      const plan = planChain({
        claimant: { personId, supervisorId: employee.supervisorId },
        supervisorChain,
        claimantIsCeo,
        totalSar: report.totalSar,
        ceoThresholdSar: parseSar(thresholdOption?.optionValue ?? '5000'),
        rules,
        roleHolder: (role) => holders.get(role) ?? null,
      });
      if (!plan.ok) {
        throw new AppError('PREREQUISITE_MISSING', problemMessage(plan.problem), {
          checks: [
            {
              code: plan.problem.code === 'NO_SUPERVISOR' ? 'LINE_MANAGER' : 'APPROVER',
              ok: false,
              message: problemMessage(plan.problem),
              contact: plan.problem.code === 'NO_SUPERVISOR' ? 'HR' : 'ADMIN',
            },
          ],
        });
      }

      // OQ-19 proposal: EH-<BU>-<YYYY>-<6 digits>, gap-free, kept on resubmission.
      let reportNumber = report.reportNumber;
      if (!reportNumber) {
        const prefix = `EH-${report.businessUnit}-${today.slice(0, 4)}`;
        reportNumber = `${prefix}-${String(await r.sequences.next(prefix)).padStart(6, '0')}`;
      }

      // FR-REP-04: a resubmission starts a new cycle from step 1.
      const cycleNo =
        Math.max(0, ...(await r.approvalSteps.listByReport(reportId)).map((s) => s.cycleNo)) + 1;
      for (const step of plan.steps) {
        await r.approvalSteps.insert(
          {
            reportId,
            seq: step.seq,
            stepName: step.stepName,
            ruleId: step.ruleId,
            isAuditStep: step.isAuditStep ? 'Y' : 'N',
            assignedTo: step.assignedTo,
            // D-34: the claimant was the resolved approver; kept to explain the re-route.
            originalAssignee: step.note === 'SELF_APPROVAL' ? personId : null,
            status: step.status,
            actedBy: null,
            actedAt: null,
            commentText: null,
            pendingSince: step.status === 'PENDING' ? at : null,
            remindedAt: null,
            escalatedAt: null,
            cycleNo,
          },
          { actorId: personId },
        );
      }

      report = await transitionReport(r, reportId, 'PENDING_APPROVAL', personId, {
        action: 'SUBMITTED',
        at,
        patch: { reportNumber, submittedAt: at, infoRequested: 'N', auditSelected: 'N' },
        detail: {
          reportNumber,
          cycleNo,
          chain: plan.chain,
          steps: plan.steps.map((s) => ({ stepName: s.stepName, status: s.status, note: s.note })),
        },
      });

      const first = (await currentCycle(r, reportId)).find((s) => s.status === 'PENDING');
      if (first) report = await announceStep(r, reportId, first, personId, at, (p) => this.link(p));
      return report;
    });
  }

  // ─── After submit ─────────────────────────────────────────────────────────

  /** FR-REP-05: back to DRAFT while no step of this submission is approved yet. */
  withdraw(personId: PersonId, reportId: number, version: number) {
    return this.deps.data.withTransaction(async (r) => {
      const at = this.now();
      const report = await this.own(r, personId, reportId);
      ReportService.assertVersion(report, version);
      ReportService.assertStatus(report, 'PENDING_APPROVAL');
      const cycle = await currentCycle(r, reportId);
      if (cycle.some((s) => s.status === 'APPROVED')) {
        throw new AppError(
          'INVALID_STATE',
          'An approver has already approved this report, so it can no longer be withdrawn.',
        );
      }
      const pending = cycle.find((s) => s.status === 'PENDING');
      await cancelOpenSteps(r, reportId, personId, at);
      const updated = await transitionReport(r, reportId, 'DRAFT', personId, {
        action: 'WITHDRAWN',
        at,
        patch: { infoRequested: 'N' },
      });
      if (pending) {
        await notifyClaim(r, pending.assignedTo, 'REPORT_WITHDRAWN', updated, {
          link: this.link(`/approvals`),
        });
      }
      return updated;
    });
  }

  /** FR-REP-04: a rejected report goes back to DRAFT; the next submit restarts the chain. */
  correct(personId: PersonId, reportId: number, version: number) {
    return this.deps.data.withTransaction(async (r) => {
      const report = await this.own(r, personId, reportId);
      ReportService.assertVersion(report, version);
      ReportService.assertStatus(report, 'REJECTED');
      return transitionReport(r, reportId, 'DRAFT', personId, {
        action: 'CORRECTED',
        at: this.now(),
      });
    });
  }

  /** OQ-06 proposal: the claimant answers; the report returns to the same approver. */
  replyInfo(personId: PersonId, reportId: number, comment: string) {
    return this.deps.data.withTransaction(async (r) => {
      const report = await this.own(r, personId, reportId);
      ReportService.assertStatus(report, 'PENDING_APPROVAL');
      if (report.infoRequested !== 'Y') {
        throw new AppError('INVALID_STATE', 'No question is waiting for your reply.');
      }
      const updated = await r.reports.update(
        reportId,
        { infoRequested: 'N' },
        { actorId: personId, expectedVersion: report.version },
      );
      const pending = (await currentCycle(r, reportId)).find((s) => s.status === 'PENDING');
      await r.reportHistory.append({
        entityType: 'REPORT',
        entityId: reportId,
        at: this.now(),
        actorId: personId,
        action: 'INFO_REPLIED',
        fromStatus: null,
        toStatus: null,
        detail: { comment, stepName: pending?.stepName ?? null },
      });
      if (pending) {
        await notifyClaim(r, pending.assignedTo, 'INFO_REPLIED', updated, {
          stepName: pending.stepName,
          actorId: personId,
          comment,
          link: this.link(`/approvals?report=${reportId}`),
        });
      }
      return updated;
    });
  }
}
