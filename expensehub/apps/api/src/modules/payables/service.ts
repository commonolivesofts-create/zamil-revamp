// Implements: API §8 — the Finance AP screens over INT-08/09 (FR-PAY-01/03, FR-QP-02/03/04).
// Finance sees and acts on the business units it holds FINANCE_AP for (API §1 "Fin").
import {
  formatSar,
  type PayablesItem,
  type PayablesQueue,
  type QuickPayQueueItem,
  type QuickPayQueueStatus,
} from '@expensehub/shared';
import type { AuthContext } from '../../auth/context';
import { financeBusinessUnits } from '../../auth/rbac';
import type { ReportRow } from '../../data/entities';
import { assertTransition } from '../../domain/integrity';
import type { JobRunner } from '../../jobs/runner';
import { AppError } from '../../lib/errors';
import { personName } from '../reports/workflow';
import { sendQuickPayInvoice, sendReportInvoice, type PayablesDeps, type SendResult } from './core';

const PAID_SHOWN_DAYS = 90;

function queueOf(r: ReportRow): PayablesQueue {
  if (r.status === 'PAID') return 'PAID';
  if (r.syncError) return 'ERROR';
  return r.status === 'INVOICED' ? 'INVOICED' : 'READY';
}

export class PayablesService {
  constructor(private readonly deps: PayablesDeps & { jobs: JobRunner }) {}

  /** UI-UX §5.5: ready, invoiced, recently paid and errors for my BUs. */
  list(auth: AuthContext): Promise<PayablesItem[]> {
    const units = financeBusinessUnits(auth);
    const since = new Date(
      this.deps.clock().getTime() - PAID_SHOWN_DAYS * 86_400_000,
    ).toISOString();
    return this.deps.data.read(async (r) => {
      const rows = (await r.reports.listByStatus(['READY_FOR_PAYMENT', 'INVOICED', 'PAID']))
        .filter((x) => units.includes(x.businessUnit))
        .filter((x) => x.status !== 'PAID' || (x.paidAt ?? '') >= since);
      const items: PayablesItem[] = [];
      for (const x of rows) {
        const employee = await r.employees.get(x.personId);
        items.push({
          reportId: x.reportId,
          reportNumber: x.reportNumber,
          purpose: x.purpose,
          claimantName: employee?.fullName ?? `#${x.personId}`,
          businessUnit: x.businessUnit,
          status: x.status,
          queue: queueOf(x),
          netPayableSar: formatSar(x.netPayableSar),
          payeeReady: employee?.payeeOk === 'Y' && !!employee.supplierNumber,
          approvedAt: x.approvedAt,
          fusionInvoiceId: x.fusionInvoiceId,
          fusionInvoiceNum: x.fusionInvoiceNum,
          fusionStatus: x.fusionStatus,
          paymentRef: x.paymentRef,
          paidAt: x.paidAt,
          syncError: x.syncError,
        });
      }
      return items.sort((a, b) => (a.approvedAt ?? '').localeCompare(b.approvedAt ?? ''));
    });
  }

  private async assertScope(auth: AuthContext, reportIds: number[]) {
    const units = financeBusinessUnits(auth);
    await this.deps.data.read(async (r) => {
      for (const id of reportIds) {
        const report = await r.reports.get(id);
        if (!report || !units.includes(report.businessUnit)) {
          throw new AppError('NOT_FOUND', `Report ${id} not found`);
        }
      }
    });
  }

  /** FR-PAY-01 "Send to Payables" — one invoice per report, each on its own. */
  async send(auth: AuthContext, reportIds: number[]): Promise<SendResult[]> {
    await this.assertScope(auth, reportIds);
    const results: SendResult[] = [];
    for (const id of reportIds) results.push(await sendReportInvoice(this.deps, id, auth.personId));
    return results;
  }

  /** INT-09 now (also the hourly job). */
  refreshStatus() {
    return this.deps.jobs.run('poll-invoice-status');
  }
}

export class QuickPayService {
  constructor(private readonly deps: PayablesDeps) {}

  /** FR-QP-02 queue for my BUs. */
  list(auth: AuthContext, status?: QuickPayQueueStatus): Promise<QuickPayQueueItem[]> {
    const units = financeBusinessUnits(auth);
    return this.deps.data.read(async (r) => {
      const items: QuickPayQueueItem[] = [];
      for (const qp of await r.quickPays.list()) {
        if (!units.includes(qp.businessUnit)) continue;
        const row = await r.quickPayInvoices.getByQuickPay(qp.quickPayId);
        const queueStatus: QuickPayQueueStatus = row?.status ?? 'NEW';
        if (status && queueStatus !== status) continue;
        const employee = await r.employees.get(qp.personId);
        items.push({
          quickPayId: qp.quickPayId,
          employeeName: employee?.fullName ?? `#${qp.personId}`,
          personNumber: employee?.personNumber ?? '',
          businessUnit: qp.businessUnit,
          elementName: qp.elementName,
          effectiveDate: qp.effectiveDate,
          amountSar: formatSar(qp.amountSar),
          status: queueStatus,
          payeeReady: employee?.payeeOk === 'Y' && !!employee.supplierNumber,
          invoiceNumber: row?.invoiceNumber ?? null,
          fusionInvoiceId: row?.fusionInvoiceId ?? null,
          fusionStatus: row?.fusionStatus ?? null,
          paymentRef: row?.paymentRef ?? null,
          paidAt: row?.paidAt ?? null,
          syncError: row?.syncError ?? null,
          excludedReason: row?.excludedReason ?? null,
        });
      }
      return items.sort((a, b) => b.effectiveDate.localeCompare(a.effectiveDate));
    });
  }

  private async assertScope(auth: AuthContext, quickPayIds: number[]) {
    const units = financeBusinessUnits(auth);
    await this.deps.data.read(async (r) => {
      for (const id of quickPayIds) {
        const qp = await r.quickPays.get(id);
        if (!qp || !units.includes(qp.businessUnit))
          throw new AppError('NOT_FOUND', `Quick Pay ${id} not found`);
      }
    });
  }

  /** FR-QP-02 "Create invoice" (one or many); also retries an ERROR row. */
  async invoice(auth: AuthContext, quickPayIds: number[]): Promise<SendResult[]> {
    await this.assertScope(auth, quickPayIds);
    const results: SendResult[] = [];
    for (const id of quickPayIds)
      results.push(await sendQuickPayInvoice(this.deps, id, auth.personId));
    return results;
  }

  /** FR-QP-02 "Exclude" — not payable through Payables; a reason is mandatory. */
  async exclude(auth: AuthContext, quickPayId: number, reason: string) {
    await this.assertScope(auth, [quickPayId]);
    return this.deps.data.withTransaction(async (r) => {
      const at = this.deps.clock().toISOString();
      const existing = await r.quickPayInvoices.getByQuickPay(quickPayId);
      let row;
      if (!existing) {
        row = await r.quickPayInvoices.insert(
          {
            quickPayId,
            status: 'EXCLUDED',
            invoiceNumber: null,
            fusionInvoiceId: null,
            fusionStatus: null,
            paymentRef: null,
            paidAt: null,
            syncError: null,
            excludedReason: reason,
            requestedBy: auth.personId,
          },
          { actorId: auth.personId },
        );
      } else {
        assertTransition('QUICK_PAY_INVOICE', existing.status, 'EXCLUDED');
        row = await r.quickPayInvoices.update(
          existing.qpInvoiceId,
          { status: 'EXCLUDED', excludedReason: reason },
          { actorId: auth.personId, expectedVersion: existing.version },
        );
      }
      await r.reportHistory.append({
        entityType: 'QUICK_PAY',
        entityId: quickPayId,
        at,
        actorId: auth.personId,
        action: 'EXCLUDED',
        fromStatus: existing?.status ?? 'NEW',
        toStatus: 'EXCLUDED',
        detail: { comment: reason, by: await personName(r, auth.personId) },
      });
      return row;
    });
  }
}
