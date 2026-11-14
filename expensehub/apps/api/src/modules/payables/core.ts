// Implements: INT-08 (INTEGRATION §5) and INT-09 (§6) for expense reports and Quick Pays —
// FR-PAY-01…06, FR-QP-03. Shared by the Finance screens and the hourly jobs. Fusion is called
// outside any transaction (the gateway logs every call in its own); EH state changes are short
// transactions before and after.
import { readFile } from 'node:fs/promises';
import type { BusinessUnit, QuickPayInvoiceStatus } from '@expensehub/shared';
import type { PersonId, QuickPayInvoiceRow, ReportRow } from '../../data/entities';
import type { DataLayer, Repos } from '../../data/ports';
import { assertTransition, transitionReport } from '../../domain/integrity';
import { FusionError } from '../../integrations/fusion/client';
import { invoicePaymentCsv, parseRows } from '../../integrations/fusion/contracts';
import type { FusionGateway, InvoiceRef } from '../../integrations/fusion/gateway';
import {
  buildQuickPayInvoice,
  buildReportInvoice,
  mapInvoiceStatus,
  type FusionInvoice,
  type FusionInvoicePayload,
  type FusionPayment,
  type InvoiceOptions,
} from '../../integrations/fusion/invoices';
import { riyadhDate, type Clock } from '../../lib/dates';
import type { ReceiptFiles } from '../../receipts/files';
import { notifyClaim } from '../reports/workflow';

export interface PayablesDeps {
  data: DataLayer;
  fusion: FusionGateway;
  clock: Clock;
  files: ReceiptFiles;
  appBaseUrl: string;
}

export type SendResult =
  | { id: number; ok: true; invoiceNumber: string | null; reused: boolean; warnings: string[] }
  | { id: number; ok: false; error: string };

/** One send per report / Quick Pay at a time in this process (double-click, job + Finance). */
const inFlight = new Set<string>();

async function option(r: Repos, key: string, bu: BusinessUnit, fallback: string): Promise<string> {
  return (await r.systemOptions.resolve(key, bu))?.optionValue || fallback;
}

/** D-57: a JSON object of strings; anything else counts as {}. */
function jsonObject(value: string): Record<string, string> {
  try {
    const parsed: unknown = JSON.parse(value);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return Object.fromEntries(
        Object.entries(parsed).filter((e): e is [string, string] => typeof e[1] === 'string'),
      );
    }
  } catch {
    // invalid JSON: no flexfield values
  }
  return {};
}

/** D-40 / D-42 — system options, [VERIFY] values in the test pod. */
async function invoiceOptions(r: Repos, bu: BusinessUnit): Promise<InvoiceOptions> {
  return {
    businessUnit: await option(r, 'FUSION_BU_NAME', bu, bu),
    invoiceType: await option(r, 'FUSION_INVOICE_TYPE', bu, 'Standard'),
    invoiceSource: await option(r, 'FUSION_INVOICE_SOURCE', bu, 'EXPENSEHUB'),
    paymentMethod: await option(r, 'FUSION_PAYMENT_METHOD', bu, 'EFT'),
    payGroup: await option(r, 'FUSION_PAY_GROUP', bu, 'EMPLOYEES'),
    // D-57 default when the option row is missing (stores created before it existed).
    invoiceDff: jsonObject(
      await option(r, 'FUSION_INVOICE_DFF', bu, '{"rirNumber":"{invoiceNumber}"}'),
    ),
    paymentTerms: await option(r, 'FUSION_PAYMENT_TERMS', bu, 'Immediate'),
    taxClassificationCode: await option(r, 'TAX_CLASSIFICATION_CODE', bu, 'VAT 15% STANDARD'),
  };
}

const message = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 1000);

/**
 * INT-08 steps 1–2: reuse an open invoice with this number for this supplier (idempotency,
 * FR-PAY-05) or create one. A cancelled invoice is not reused (OQ-18 proposal).
 */
async function findOrCreate(
  fusion: FusionGateway,
  payload: FusionInvoicePayload,
  ref: InvoiceRef,
): Promise<{ invoice: FusionInvoice; reused: boolean }> {
  const existing = (
    await fusion.findInvoices(payload.InvoiceNumber, payload.SupplierNumber, ref)
  ).find((i) => !i.CanceledFlag);
  if (existing) return { invoice: existing, reused: true };
  return { invoice: await fusion.createInvoice(payload, ref), reused: false };
}

// ─── Expense reports ────────────────────────────────────────────────────────

async function reportFailed(
  deps: PayablesDeps,
  reportId: number,
  error: string,
  actorId: PersonId | null,
) {
  await deps.data.withTransaction(async (r) => {
    await r.reports.update(reportId, { syncError: error }, { actorId });
    await r.reportHistory.append({
      entityType: 'REPORT',
      entityId: reportId,
      at: deps.clock().toISOString(),
      actorId,
      action: 'SEND_FAILED',
      fromStatus: null,
      toStatus: null,
      detail: { comment: error },
    });
  });
}

/** FR-PAY-01: one READY_FOR_PAYMENT report → one Fusion Payables invoice. */
export async function sendReportInvoice(
  deps: PayablesDeps,
  reportId: number,
  actorId: PersonId | null,
): Promise<SendResult> {
  const lock = `REPORT:${reportId}`;
  if (inFlight.has(lock))
    return { id: reportId, ok: false, error: 'This report is already being sent.' };
  inFlight.add(lock);
  try {
    const prepared = await deps.data.read(async (r) => {
      const report = await r.reports.get(reportId);
      if (!report) return { kind: 'error' as const, error: 'Report not found.' };
      // Sending twice creates one invoice (FR-PAY-05).
      if (report.status === 'INVOICED' || report.status === 'PAID') {
        return { kind: 'done' as const, report };
      }
      if (report.status !== 'READY_FOR_PAYMENT') {
        return {
          kind: 'error' as const,
          error: `The report is ${report.status}, not ready for payment.`,
        };
      }
      if (report.netPayableSar === 0) return { kind: 'settle' as const, report };
      const employee = await r.employees.get(report.personId);
      if (!employee?.supplierNumber || employee.payeeOk !== 'Y') {
        return {
          kind: 'fail' as const,
          error:
            'The employee is not set up as a supplier with an active site and bank account in Oracle Payables (INT-07).',
        };
      }
      const lines = await r.expenses.listByReport(reportId);
      const types = new Map((await r.expenseTypes.list()).map((t) => [t.typeId, t.name]));
      let payload: FusionInvoicePayload;
      try {
        payload = buildReportInvoice({
          reportNumber: report.reportNumber!,
          purpose: report.purpose,
          invoiceDate: riyadhDate(deps.clock()),
          netPayableSar: report.netPayableSar,
          advanceAppliedSar: report.advanceAppliedSar,
          lines: lines
            .sort((a, b) => (a.lineNo ?? 0) - (b.lineNo ?? 0))
            .map((l) => ({
              expenseDate: l.expenseDate,
              typeName: types.get(l.typeId) ?? 'Expense',
              merchant: l.merchant,
              chargeAccount: l.chargeAccount,
              claimedSar: l.amountSar,
              approvedSar: l.approvedAmountSar,
              vatSar: l.vatSar,
              source: l.source,
            })),
          supplier: {
            name: employee.fullName,
            number: employee.supplierNumber,
            site: employee.supplierSite,
          },
          options: await invoiceOptions(r, report.businessUnit),
        });
      } catch (err) {
        return { kind: 'fail' as const, error: message(err) };
      }
      const attach =
        (await option(r, 'ATTACH_RECEIPTS_TO_INVOICE', report.businessUnit, 'Y')) === 'Y';
      const receipts = attach
        ? (
            await Promise.all(
              lines
                .filter((l) => l.approvedAmountSar > 0)
                .map((l) => r.receipts.listByExpense(l.expenseId)),
            )
          ).flat()
        : [];
      return { kind: 'send' as const, report, payload, receipts };
    });

    switch (prepared.kind) {
      case 'error':
        return { id: reportId, ok: false, error: prepared.error };
      case 'done':
        return {
          id: reportId,
          ok: true,
          invoiceNumber: prepared.report.fusionInvoiceNum,
          reused: true,
          warnings: [],
        };
      case 'fail':
        await reportFailed(deps, reportId, prepared.error, actorId);
        return { id: reportId, ok: false, error: prepared.error };
      case 'settle':
        // OQ-13: nothing to pay (advance covered it) → SETTLED, no invoice.
        await deps.data.withTransaction((r) =>
          transitionReport(r, reportId, 'SETTLED', actorId, {
            action: 'SETTLED',
            at: deps.clock().toISOString(),
          }),
        );
        return { id: reportId, ok: true, invoiceNumber: null, reused: false, warnings: [] };
    }

    const ref: InvoiceRef = { refType: 'REPORT', refId: String(reportId) };
    let sent: { invoice: FusionInvoice; reused: boolean };
    try {
      sent = await findOrCreate(deps.fusion, prepared.payload, ref);
    } catch (err) {
      const error =
        err instanceof FusionError && err.httpStatus
          ? `Fusion HTTP ${err.httpStatus}: ${err.message}`
          : message(err);
      await reportFailed(deps, reportId, error, actorId);
      return { id: reportId, ok: false, error };
    }

    // INT-08 step 4 (OQ-17): receipts are attached to a new invoice; a failure is a warning.
    const warnings: string[] = [];
    if (!sent.reused) {
      for (const receipt of prepared.receipts) {
        try {
          const content = await readFile(deps.files.resolve(receipt.filePath));
          await deps.fusion.addInvoiceAttachment(
            sent.invoice.InvoiceId,
            {
              fileName: receipt.originalName,
              title: receipt.originalName,
              contentBase64: content.toString('base64'),
            },
            ref,
          );
        } catch (err) {
          warnings.push(`Receipt ${receipt.originalName} not attached: ${message(err)}`);
        }
      }
    }

    await deps.data.withTransaction(async (r) => {
      const current = await r.reports.getOrThrow(reportId);
      if (current.status !== 'READY_FOR_PAYMENT') return;
      const invoiced = await transitionReport(r, reportId, 'INVOICED', actorId, {
        action: 'SENT_TO_PAYABLES',
        at: deps.clock().toISOString(),
        patch: {
          fusionInvoiceId: sent.invoice.InvoiceId,
          fusionInvoiceNum: sent.invoice.InvoiceNumber,
          fusionStatus: sent.invoice.ValidationStatus,
          syncError: null,
        },
        detail: {
          invoiceId: sent.invoice.InvoiceId,
          reused: sent.reused,
          attachments: prepared.receipts.length - warnings.length,
          comment: warnings.length ? warnings.join('; ') : null,
        },
      });
      // FR-NTF-01 "invoiced" (employee).
      await notifyClaim(r, current.personId, 'REPORT_INVOICED', invoiced, {
        comment: sent.invoice.InvoiceNumber,
        link: `${deps.appBaseUrl}/reports/${reportId}`,
      });
    });
    return {
      id: reportId,
      ok: true,
      invoiceNumber: sent.invoice.InvoiceNumber,
      reused: sent.reused,
      warnings,
    };
  } finally {
    inFlight.delete(lock);
  }
}

// ─── Quick Pays (FR-QP-02/03/04) ────────────────────────────────────────────

async function qpHistory(
  r: Repos,
  row: QuickPayInvoiceRow,
  action: string,
  from: QuickPayInvoiceStatus | null,
  actorId: PersonId | null,
  at: string,
  detail: unknown = null,
) {
  await r.reportHistory.append({
    entityType: 'QUICK_PAY',
    entityId: row.quickPayId,
    at,
    actorId,
    action,
    fromStatus: from,
    toStatus: row.status,
    detail,
  });
}

async function setQpStatus(
  r: Repos,
  row: QuickPayInvoiceRow,
  to: QuickPayInvoiceStatus,
  patch: Partial<QuickPayInvoiceRow>,
  actorId: PersonId | null,
  at: string,
  action: string,
  detail?: unknown,
): Promise<QuickPayInvoiceRow> {
  if (row.status !== to) assertTransition('QUICK_PAY_INVOICE', row.status, to);
  const updated = await r.quickPayInvoices.update(
    row.qpInvoiceId,
    { ...patch, status: to },
    { actorId },
  );
  await qpHistory(r, updated, action, row.status, actorId, at, detail);
  return updated;
}

/** "Create invoice" for one Quick Pay: requests it (QP number) and sends it through INT-08. */
export async function sendQuickPayInvoice(
  deps: PayablesDeps,
  quickPayId: number,
  actorId: PersonId | null,
): Promise<SendResult> {
  const lock = `QUICK_PAY:${quickPayId}`;
  if (inFlight.has(lock))
    return { id: quickPayId, ok: false, error: 'This Quick Pay is already being sent.' };
  inFlight.add(lock);
  const at = () => deps.clock().toISOString();
  try {
    const prepared = await deps.data.withTransaction(async (r) => {
      const qp = await r.quickPays.get(quickPayId);
      if (!qp) return { kind: 'error' as const, error: 'Quick Pay not found.' };
      let row = await r.quickPayInvoices.getByQuickPay(quickPayId);
      if (row?.status === 'INVOICED' || row?.status === 'PAID')
        return { kind: 'done' as const, row };
      if (row?.status === 'EXCLUDED')
        return { kind: 'error' as const, error: 'This Quick Pay was excluded.' };
      if (!row) {
        // OQ-19 proposal: QP-<BU>-<YYYY>-<6 digits>, gap-free.
        const prefix = `QP-${qp.businessUnit}-${riyadhDate(deps.clock()).slice(0, 4)}`;
        const invoiceNumber = `${prefix}-${String(await r.sequences.next(prefix)).padStart(6, '0')}`;
        row = await r.quickPayInvoices.insert(
          {
            quickPayId,
            status: 'INVOICE_REQUESTED',
            invoiceNumber,
            fusionInvoiceId: null,
            fusionStatus: null,
            paymentRef: null,
            paidAt: null,
            syncError: null,
            excludedReason: null,
            requestedBy: actorId,
          },
          { actorId },
        );
        await qpHistory(r, row, 'INVOICE_REQUESTED', null, actorId, at());
      } else if (row.status === 'ERROR') {
        row = await setQpStatus(
          r,
          row,
          'INVOICE_REQUESTED',
          { syncError: null },
          actorId,
          at(),
          'RETRY',
        );
      }
      const employee = await r.employees.get(qp.personId);
      if (!employee?.supplierNumber || employee.payeeOk !== 'Y') {
        return {
          kind: 'fail' as const,
          row,
          error:
            'The employee is not set up as a supplier with an active site and bank account in Oracle Payables (INT-07).',
        };
      }
      const payload = buildQuickPayInvoice({
        invoiceNumber: row.invoiceNumber!,
        invoiceDate: riyadhDate(deps.clock()),
        elementName: qp.elementName,
        effectiveDate: qp.effectiveDate,
        amountSar: qp.amountSar,
        // OQ-07 proposal: one account per BU (ACCT_QUICKPAY), else the employee's default account.
        account: await option(
          r,
          'ACCT_QUICKPAY',
          qp.businessUnit,
          employee.defaultExpenseAccount ?? '',
        ),
        supplier: {
          name: employee.fullName,
          number: employee.supplierNumber,
          site: employee.supplierSite,
        },
        options: await invoiceOptions(r, qp.businessUnit),
      });
      return { kind: 'send' as const, row, payload };
    });

    if (prepared.kind === 'error') return { id: quickPayId, ok: false, error: prepared.error };
    if (prepared.kind === 'done') {
      return {
        id: quickPayId,
        ok: true,
        invoiceNumber: prepared.row.invoiceNumber,
        reused: true,
        warnings: [],
      };
    }
    const fail = async (error: string) => {
      await deps.data.withTransaction(async (r) => {
        const row = await r.quickPayInvoices.getOrThrow(prepared.row.qpInvoiceId);
        await setQpStatus(r, row, 'ERROR', { syncError: error }, actorId, at(), 'SEND_FAILED', {
          comment: error,
        });
      });
      return { id: quickPayId, ok: false as const, error };
    };
    if (prepared.kind === 'fail') return fail(prepared.error);

    let sent: { invoice: FusionInvoice; reused: boolean };
    try {
      sent = await findOrCreate(deps.fusion, prepared.payload, {
        refType: 'QUICK_PAY',
        refId: String(quickPayId),
      });
    } catch (err) {
      return fail(
        err instanceof FusionError && err.httpStatus
          ? `Fusion HTTP ${err.httpStatus}: ${err.message}`
          : message(err),
      );
    }
    await deps.data.withTransaction(async (r) => {
      const row = await r.quickPayInvoices.getOrThrow(prepared.row.qpInvoiceId);
      await setQpStatus(
        r,
        row,
        'INVOICED',
        {
          fusionInvoiceId: sent.invoice.InvoiceId,
          fusionStatus: sent.invoice.ValidationStatus,
          syncError: null,
        },
        actorId,
        at(),
        'SENT_TO_PAYABLES',
        { invoiceId: sent.invoice.InvoiceId, reused: sent.reused },
      );
    });
    return {
      id: quickPayId,
      ok: true,
      invoiceNumber: sent.invoice.InvoiceNumber,
      reused: sent.reused,
      warnings: [],
    };
  } finally {
    inFlight.delete(lock);
  }
}

// ─── INT-09 poll (INTEGRATION §6) ───────────────────────────────────────────

const PAID_WATCH_DAYS = 30;

/** Payment date (business date) → timestamp at noon Riyadh. */
const paidTimestamp = (date: string) => new Date(`${date}T12:00:00+03:00`).toISOString();

export async function pollInvoiceStatus(
  deps: PayablesDeps,
): Promise<{ rowsRead: number; rowsChanged: number }> {
  const now = deps.clock();
  const watchFrom = new Date(now.getTime() - PAID_WATCH_DAYS * 86_400_000).toISOString();
  const targets = await deps.data.read(async (r) => {
    const reports = (await r.reports.listByStatus(['INVOICED', 'PAID'])).filter(
      (x) =>
        x.fusionInvoiceId !== null && (x.status === 'INVOICED' || (x.paidAt ?? '') >= watchFrom),
    );
    const quickPays: QuickPayInvoiceRow[] = [];
    for (const qp of await r.quickPays.list()) {
      const row = await r.quickPayInvoices.getByQuickPay(qp.quickPayId);
      if (
        row?.fusionInvoiceId &&
        (row.status === 'INVOICED' || (row.status === 'PAID' && (row.paidAt ?? '') >= watchFrom))
      ) {
        quickPays.push(row);
      }
    }
    return { reports, quickPays };
  });

  const invoices = new Map<number, FusionInvoice>();
  const failures: string[] = [];
  const fetch = async (invoiceId: number, ref: InvoiceRef) => {
    try {
      invoices.set(invoiceId, await deps.fusion.getInvoice(invoiceId, ref));
    } catch (err) {
      failures.push(`${ref.refType} ${ref.refId}: ${message(err)}`);
    }
  };
  for (const report of targets.reports)
    await fetch(report.fusionInvoiceId!, { refType: 'REPORT', refId: String(report.reportId) });
  for (const row of targets.quickPays)
    await fetch(row.fusionInvoiceId!, { refType: 'QUICK_PAY', refId: String(row.quickPayId) });

  let payments: FusionPayment[] = [];
  if (invoices.size > 0) {
    const rows = await deps.fusion.bip('INT-09', 'EH_AP_INVOICE_PAYMENTS', {
      P_INVOICE_IDS: [...invoices.keys()].join(','),
    });
    payments = parseRows(invoicePaymentCsv, rows, 'EH_AP_INVOICE_PAYMENTS').map((p) => ({
      invoiceId: p.INVOICE_ID,
      paymentNumber: p.PAYMENT_NUMBER,
      paymentDate: p.PAYMENT_DATE,
      status: p.STATUS,
    }));
  }
  const paymentsOf = (id: number) => payments.filter((p) => p.invoiceId === id);
  const at = now.toISOString();
  let changed = 0;

  for (const target of targets.reports) {
    const invoice = invoices.get(target.fusionInvoiceId!);
    if (!invoice) continue;
    const outcome = mapInvoiceStatus(
      invoice,
      paymentsOf(invoice.InvoiceId),
      target.status === 'PAID',
    );
    const did = await deps.data.withTransaction(async (r) => {
      const report = await r.reports.getOrThrow(target.reportId);
      if (report.status !== target.status) return false;
      return applyReportOutcome(r, deps, report, outcome, at);
    });
    if (did) changed++;
  }
  for (const target of targets.quickPays) {
    const invoice = invoices.get(target.fusionInvoiceId!);
    if (!invoice) continue;
    const outcome = mapInvoiceStatus(
      invoice,
      paymentsOf(invoice.InvoiceId),
      target.status === 'PAID',
    );
    const did = await deps.data.withTransaction(async (r) => {
      const row = await r.quickPayInvoices.getOrThrow(target.qpInvoiceId);
      if (row.status !== target.status) return false;
      return applyQuickPayOutcome(r, row, outcome, at);
    });
    if (did) changed++;
  }

  if (failures.length)
    throw new Error(`INT-09 could not read ${failures.length} invoice(s): ${failures.join('; ')}`);
  return { rowsRead: invoices.size, rowsChanged: changed };
}

async function applyReportOutcome(
  r: Repos,
  deps: PayablesDeps,
  report: ReportRow,
  outcome: ReturnType<typeof mapInvoiceStatus>,
  at: string,
): Promise<boolean> {
  switch (outcome.action) {
    case 'UPDATE':
    case 'PARTIALLY_PAID': {
      const syncError =
        outcome.action === 'PARTIALLY_PAID'
          ? 'Partially paid in Fusion — check the payment.'
          : report.syncError;
      if (report.fusionStatus === outcome.fusionStatus && report.syncError === syncError)
        return false;
      await r.reports.update(
        report.reportId,
        { fusionStatus: outcome.fusionStatus, syncError },
        { actorId: null },
      );
      return true;
    }
    case 'PAID': {
      if (report.status === 'PAID') return false;
      const paid = await transitionReport(r, report.reportId, 'PAID', null, {
        action: 'PAID',
        at,
        patch: {
          fusionStatus: outcome.fusionStatus,
          paymentRef: outcome.paymentRef,
          paidAt: paidTimestamp(outcome.paidAt),
          syncError: null,
        },
        detail: { comment: outcome.paymentRef },
      });
      await notifyClaim(r, report.personId, 'REPORT_PAID', paid, {
        comment: outcome.paymentRef,
        link: `${deps.appBaseUrl}/reports/${report.reportId}`,
      });
      return true;
    }
    case 'CANCELLED':
      if (report.status !== 'INVOICED') return false;
      // OQ-18 proposal: back to Finance, who can send it again.
      await transitionReport(r, report.reportId, 'READY_FOR_PAYMENT', null, {
        action: 'FUSION_CANCELLED',
        at,
        patch: {
          fusionInvoiceId: null,
          fusionStatus: 'CANCELLED',
          syncError: 'Cancelled in Fusion',
        },
        detail: { comment: 'Invoice cancelled in Oracle Fusion' },
      });
      return true;
    case 'VOIDED':
      if (report.status !== 'PAID') return false;
      await transitionReport(r, report.reportId, 'INVOICED', null, {
        action: 'PAYMENT_VOIDED',
        at,
        patch: {
          paymentRef: null,
          paidAt: null,
          fusionStatus: outcome.fusionStatus,
          syncError: 'Payment voided in Fusion',
        },
        detail: { comment: `Payment ${report.paymentRef ?? ''} voided in Oracle Fusion` },
      });
      return true;
  }
}

async function applyQuickPayOutcome(
  r: Repos,
  row: QuickPayInvoiceRow,
  outcome: ReturnType<typeof mapInvoiceStatus>,
  at: string,
): Promise<boolean> {
  switch (outcome.action) {
    case 'UPDATE':
    case 'PARTIALLY_PAID': {
      const syncError =
        outcome.action === 'PARTIALLY_PAID'
          ? 'Partially paid in Fusion — check the payment.'
          : row.syncError;
      if (row.fusionStatus === outcome.fusionStatus && row.syncError === syncError) return false;
      await r.quickPayInvoices.update(
        row.qpInvoiceId,
        { fusionStatus: outcome.fusionStatus, syncError },
        { actorId: null },
      );
      return true;
    }
    case 'PAID':
      if (row.status === 'PAID') return false;
      await setQpStatus(
        r,
        row,
        'PAID',
        {
          fusionStatus: outcome.fusionStatus,
          paymentRef: outcome.paymentRef,
          paidAt: paidTimestamp(outcome.paidAt),
          syncError: null,
        },
        null,
        at,
        'PAID',
        { comment: outcome.paymentRef },
      );
      return true;
    case 'CANCELLED':
      if (row.status !== 'INVOICED') return false;
      await setQpStatus(
        r,
        row,
        'INVOICE_REQUESTED',
        { fusionInvoiceId: null, fusionStatus: 'CANCELLED', syncError: 'Cancelled in Fusion' },
        null,
        at,
        'FUSION_CANCELLED',
      );
      return true;
    case 'VOIDED':
      if (row.status !== 'PAID') return false;
      await setQpStatus(
        r,
        row,
        'INVOICED',
        { paymentRef: null, paidAt: null, syncError: 'Payment voided in Fusion' },
        null,
        at,
        'PAYMENT_VOIDED',
      );
      return true;
  }
}
