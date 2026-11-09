// Implements: FR-DSH-01/02/03 (API §11) — figures computed from the repositories on request.
// At D-20 volumes (~25 claims / month) a full read is milliseconds; no caching layer.
import {
  BUSINESS_UNITS,
  formatSar,
  parseSar,
  sumSar,
  type ApproverDashboard,
  type BusinessUnit,
  type EmployeeDashboard,
  type Figure,
  type FinanceDashboard,
  type Halalas,
  type ReportStatus,
} from '@expensehub/shared';
import type { AuthContext } from '../../auth/context';
import { financeBusinessUnits } from '../../auth/rbac';
import type { PersonId } from '../../data/entities';
import type { DataLayer } from '../../data/ports';
import { JOBS } from '../../jobs/registry';
import { addDays, riyadhDate, type Clock } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import type { ApprovalService } from '../approvals/service';

const figure = (amounts: readonly number[]): Figure => ({
  count: amounts.length,
  amountSar: formatSar(sumSar(amounts as Halalas[])),
});

/** Statuses whose lines count as spend (submitted, not sent back). */
const SPENT: ReportStatus[] = [
  'PENDING_APPROVAL',
  'PENDING_AUDIT',
  'READY_FOR_PAYMENT',
  'INVOICED',
  'PAID',
  'SETTLED',
];

export class DashboardService {
  constructor(
    private readonly deps: { data: DataLayer; clock: Clock; approvals: ApprovalService },
  ) {}

  /** Start of the current month in Riyadh, as an instant. */
  private monthStart(): string {
    return new Date(`${riyadhDate(this.deps.clock()).slice(0, 7)}-01T00:00:00+03:00`).toISOString();
  }

  /** FR-DSH-01. */
  employee(personId: PersonId): Promise<EmployeeDashboard> {
    const now = this.deps.clock();
    const today = riyadhDate(now);
    const since90 = addDays(today, -90);
    const since90At = new Date(now.getTime() - 90 * 86_400_000).toISOString();
    return this.deps.data.read(async (r) => {
      const reports = await r.reports.listByPerson(personId);
      const types = new Map((await r.expenseTypes.list()).map((t) => [t.typeId, t]));

      const qpPending: number[] = [];
      for (const qp of await r.quickPays.listByPerson(personId)) {
        const row = await r.quickPayInvoices.getByQuickPay(qp.quickPayId);
        if (!row || ['INVOICE_REQUESTED', 'INVOICED', 'ERROR'].includes(row.status))
          qpPending.push(qp.amountSar);
      }

      // Spend = approved amounts of lines on submitted reports, by expense date.
      const months = Array.from({ length: 12 }, (_, i) => {
        const d = new Date(`${today.slice(0, 7)}-01T00:00:00Z`);
        d.setUTCMonth(d.getUTCMonth() - (11 - i));
        return d.toISOString().slice(0, 7);
      });
      const byMonth = new Map(months.map((m) => [m, 0]));
      const byType = new Map<number, number>();
      for (const report of reports.filter((x) => SPENT.includes(x.status))) {
        for (const line of await r.expenses.listByReport(report.reportId)) {
          const month = line.expenseDate.slice(0, 7);
          if (byMonth.has(month)) byMonth.set(month, byMonth.get(month)! + line.approvedAmountSar);
          if (line.expenseDate >= since90)
            byType.set(line.typeId, (byType.get(line.typeId) ?? 0) + line.approvedAmountSar);
        }
      }

      return {
        onItsWay: figure(
          reports
            .filter((x) => x.status === 'READY_FOR_PAYMENT' || x.status === 'INVOICED')
            .map((x) => x.netPayableSar),
        ),
        unreported: figure((await r.expenses.listUnreported(personId)).map((e) => e.amountSar)),
        drafts: figure(reports.filter((x) => x.status === 'DRAFT').map((x) => x.totalSar)),
        openAdvance: null,
        quickPaysPending: figure(qpPending),
        paidLast90Days: figure(
          reports
            .filter((x) => x.status === 'PAID' && (x.paidAt ?? '') >= since90At)
            .map((x) => x.netPayableSar),
        ),
        spendByCategory: [...byType]
          .filter(([, amount]) => amount > 0)
          .sort(([, a], [, b]) => b - a)
          .map(([typeId, amount]) => ({
            typeName: types.get(typeId)?.name ?? 'Other',
            icon: types.get(typeId)?.icon ?? 'receipt',
            amountSar: formatSar(amount as Halalas),
          })),
        monthlyTrend: months.map((month) => ({
          month,
          amountSar: formatSar(byMonth.get(month)! as Halalas),
        })),
      };
    });
  }

  /** FR-DSH-02 — built on the inbox so flags match the approval screen. */
  async approver(personId: PersonId): Promise<ApproverDashboard> {
    const inbox = await this.deps.approvals.inbox(personId);
    const approvals = inbox.filter((i) => i.kind === 'APPROVAL');
    const audits = inbox.filter((i) => i.kind === 'AUDIT');
    const amount = (s: string) => parseSar(s); // exact: the inbox carries 2-decimal strings
    const monthStart = this.monthStart();
    const decided = await this.deps.data.read(
      async (r) =>
        (await r.approvalSteps.list()).filter(
          (s) =>
            s.actedBy === personId &&
            (s.status === 'APPROVED' || s.status === 'REJECTED') &&
            (s.actedAt ?? '') >= monthStart,
        ).length,
    );
    return {
      pending: figure(approvals.map((i) => amount(i.totalSar))),
      oldestSince: approvals[0]?.pendingSince ?? null,
      flagged: approvals.filter((i) => i.flags.some((f) => f !== 'INFO_REQUESTED')).length,
      infoRequested: approvals.filter((i) => i.flags.includes('INFO_REQUESTED')).length,
      audit: figure(audits.map((i) => amount(i.totalSar))),
      decidedThisMonth: decided,
    };
  }

  /** FR-DSH-03 for the BUs the user holds a Finance role for (optionally one BU). */
  finance(auth: AuthContext, bu?: BusinessUnit): Promise<FinanceDashboard> {
    const allowed = financeBusinessUnits(auth);
    if (bu && !allowed.includes(bu))
      throw new AppError('FORBIDDEN', `You do not have Finance access to ${bu}.`);
    const units = bu ? [bu] : allowed;
    const now = this.deps.clock();
    const monthStart = this.monthStart();
    const dayAgo = new Date(now.getTime() - 86_400_000).toISOString();
    return this.deps.data.read(async (r) => {
      const reports = (
        await r.reports.listByStatus([
          'PENDING_APPROVAL',
          'PENDING_AUDIT',
          'READY_FOR_PAYMENT',
          'INVOICED',
          'PAID',
        ])
      ).filter((x) => units.includes(x.businessUnit));
      const paidThisMonth = reports.filter(
        (x) => x.status === 'PAID' && (x.paidAt ?? '') >= monthStart,
      );
      const by = (status: ReportStatus) => reports.filter((x) => x.status === status);

      const qpPending: number[] = [];
      for (const qp of await r.quickPays.list()) {
        if (!units.includes(qp.businessUnit)) continue;
        const row = await r.quickPayInvoices.getByQuickPay(qp.quickPayId);
        if (!row || row.status === 'INVOICE_REQUESTED' || row.status === 'ERROR')
          qpPending.push(qp.amountSar);
      }

      const failingJobs = [];
      for (const job of JOBS) {
        const last = await r.jobRuns.latest(job.name);
        if (last?.status === 'ERROR')
          failingJobs.push({ jobName: job.name, at: last.startedAt, error: last.errorText });
      }

      return {
        businessUnits: BUSINESS_UNITS.filter((u) => units.includes(u)),
        readyForPayment: figure(by('READY_FOR_PAYMENT').map((x) => x.netPayableSar)),
        invoicedUnpaid: figure(by('INVOICED').map((x) => x.netPayableSar)),
        paidThisMonth: figure(paidThisMonth.map((x) => x.netPayableSar)),
        quickPaysPending: figure(qpPending),
        sendErrors: reports.filter((x) => x.syncError !== null && x.status !== 'PAID').length,
        pipeline: (
          ['PENDING_APPROVAL', 'PENDING_AUDIT', 'READY_FOR_PAYMENT', 'INVOICED', 'PAID'] as const
        ).map((status) => {
          const rows = status === 'PAID' ? paidThisMonth : by(status);
          return { status, ...figure(rows.map((x) => x.netPayableSar)) };
        }),
        integrationErrors: {
          last24h: (await r.integrationLog.list({ status: 'ERROR', limit: 500 })).filter(
            (l) => l.at >= dayAgo,
          ).length,
          failingJobs,
        },
      };
    });
  }
}
