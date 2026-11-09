// Row ↔ API mapping for expenses (API §1: money as 2-decimal strings).
import { formatSar, type ExpenseDto, type ExpenseEvaluation } from '@expensehub/shared';
import type {
  ExpenseRow,
  ExpenseTypeRow,
  PolicyViolationRow,
  ReceiptRow,
  ReportRow,
} from '../../data/entities';
import type { Repos } from '../../data/ports';
import { receiptUrl, storedQr } from '../receipts/service';
import type { Evaluated } from './context';

/** What the claimant may still change on a line (DB-06, OQ-06 proposal). */
export function editMode(
  report: Pick<ReportRow, 'status' | 'infoRequested'> | undefined,
): ExpenseDto['editMode'] {
  if (!report || report.status === 'DRAFT') return 'FULL';
  if (report.status === 'PENDING_APPROVAL' && report.infoRequested === 'Y') return 'LIMITED';
  return 'NONE';
}

export function expenseDto(
  row: ExpenseRow,
  type: ExpenseTypeRow,
  violations: PolicyViolationRow[],
  receipt: ReceiptRow | undefined,
  report?: Pick<ReportRow, 'status' | 'infoRequested'>,
): ExpenseDto {
  return {
    expenseId: row.expenseId,
    reportId: row.reportId,
    expenseDate: row.expenseDate,
    typeId: row.typeId,
    typeCode: type.typeCode,
    typeName: type.name,
    typeIcon: type.icon,
    category: type.category,
    merchant: row.merchant,
    description: row.description,
    attendees: row.attendees,
    justification: row.justification,
    quantity: row.quantity === null ? null : String(row.quantity),
    unitRateSar: row.unitRateSar,
    amount: formatSar(row.amount),
    currency: row.currency,
    fxRate: row.fxRate,
    fxRateDate: row.fxRateDate,
    amountSar: formatSar(row.amountSar),
    vatSar: formatSar(row.vatSar),
    netSar: formatSar(row.netSar),
    approvedAmountSar: formatSar(row.approvedAmountSar),
    adjustmentReason: row.adjustmentReason,
    taxInvoice: row.taxInvoice === 'Y',
    receiptRequired: row.receiptRequired === 'Y',
    receiptAttached: row.receiptAttached === 'Y',
    chargeAccount: row.chargeAccount,
    costCenter: row.costCenter,
    tripId: row.tripId,
    quickPayId: row.quickPayId,
    source: row.source,
    policyLevel: row.policyLevel,
    violations: violations.map((v) => ({
      ruleCode: v.ruleCode,
      level: v.level,
      message: v.message,
    })),
    receipt: receipt
      ? {
          receiptId: receipt.receiptId,
          originalName: receipt.originalName,
          mime: receipt.mime,
          sizeBytes: receipt.sizeBytes,
          qrValid: storedQr(receipt)?.result.decoded ? storedQr(receipt)!.result.valid : null,
          verified: receipt.verifiedByAuditor === 'Y',
          url: receiptUrl(receipt.receiptId),
        }
      : null,
    editMode: editMode(report),
    version: row.version,
    createdAt: row.createdAt,
  };
}

/** Loads what a line's DTO needs (type, violations, receipt, its report). */
export async function toExpenseDto(r: Repos, row: ExpenseRow): Promise<ExpenseDto> {
  const type = await r.expenseTypes.getOrThrow(row.typeId);
  const violations = await r.policyViolations.listByExpense(row.expenseId);
  const [receipt] = await r.receipts.listByExpense(row.expenseId);
  const report = row.reportId === null ? undefined : await r.reports.get(row.reportId);
  return expenseDto(row, type, violations, receipt, report);
}

export function evaluationDto(e: Evaluated): ExpenseEvaluation {
  const o = e.output;
  return {
    amountSar: o.amountSar === null ? null : formatSar(o.amountSar),
    vatSar: formatSar(o.vatSar),
    netSar: o.netSar === null ? null : formatSar(o.netSar),
    fxRate: o.fxRate,
    fxRateDate: o.fxRateDate,
    quantity: o.quantity,
    unitRateSar: o.unitRateSar,
    receiptRequired: o.receiptRequired,
    chargeAccount: e.chargeAccount,
    segments: e.segments as ExpenseEvaluation['segments'],
    vatRecovery: e.vatRecovery,
    results: o.results,
    level: o.level,
  };
}
