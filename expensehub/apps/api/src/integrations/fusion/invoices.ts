// Implements: INTEGRATION §5 (INT-08 invoice payload) and §6 (INT-09 status mapping).
// Pure: no I/O. Field names follow REST 11.13.18.05 — [VERIFY] in the test pod (M8, OQ-21).
// Amounts are exact halalas until this boundary; Fusion's JSON takes numbers, so the 2-decimal
// string is converted last (a 2-decimal value round-trips exactly through a JSON number).
import { effectiveVat, formatSar, sumSar, type Halalas } from '@expensehub/shared';

// ─── Fusion shapes ──────────────────────────────────────────────────────────

export interface FusionInvoiceLine {
  LineNumber: number;
  LineType: 'Item';
  LineAmount: number;
  Description: string;
  DistributionCombination: string;
  TaxClassificationCode?: string;
}

export interface FusionInvoicePayload {
  InvoiceNumber: string;
  InvoiceCurrency: 'SAR';
  PaymentCurrency: 'SAR';
  InvoiceAmount: number;
  InvoiceDate: string;
  BusinessUnit: string;
  Supplier: string;
  SupplierNumber: string;
  SupplierSite: string | null;
  InvoiceType: string;
  InvoiceSource: string;
  Description: string;
  PaymentMethodCode: string;
  PayGroup: string;
  PaymentTerms: string;
  /** D-57: the company's invoice flexfield values (e.g. rirNumber), from FUSION_INVOICE_DFF. */
  invoiceDff?: Record<string, string>;
  invoiceLines: FusionInvoiceLine[];
}

/** D-57: fills {invoiceNumber} / {invoiceDate} in the FUSION_INVOICE_DFF templates. */
export function invoiceDffValues(
  templates: Record<string, string>,
  invoiceNumber: string,
  invoiceDate: string,
): Record<string, string> | undefined {
  const entries = Object.entries(templates).map(
    ([k, v]) =>
      [
        k,
        v.replace(/\{invoiceNumber\}/g, invoiceNumber).replace(/\{invoiceDate\}/g, invoiceDate),
      ] as const,
  );
  return entries.length ? Object.fromEntries(entries) : undefined;
}

/** INT-09 GET invoices/{id} fields (INTEGRATION §6). */
export interface FusionInvoice {
  InvoiceId: number;
  InvoiceNumber: string;
  SupplierNumber: string;
  InvoiceAmount: number;
  ValidationStatus: string;
  ApprovalStatus: string;
  PaidStatus: 'Unpaid' | 'Paid' | 'Partially paid';
  CanceledFlag: boolean;
  AmountPaid: number;
}

/** BIP EH_AP_INVOICE_PAYMENTS row (after the CSV contract). */
export interface FusionPayment {
  invoiceId: number;
  paymentNumber: string;
  paymentDate: string;
  status: string;
}

export interface InvoiceOptions {
  /** Fusion BU name for the claim's BU (option FUSION_BU_NAME) [VERIFY]. */
  businessUnit: string;
  invoiceType: string;
  invoiceSource: string;
  paymentMethod: string;
  /** D-42: pay group EMPLOYEES [VERIFY attribute name PayGroup]. */
  payGroup: string;
  /** D-42: Immediate [VERIFY attribute name PaymentTerms]. */
  paymentTerms: string;
  /**
   * Used only for lines that carry recoverable VAT, i.e. when VAT_RECOVERY = Y. D-41 turns
   * recovery off, so every line goes gross with no tax code.
   */
  taxClassificationCode: string;
  /** D-57: invoice flexfield templates, e.g. {"rirNumber":"{invoiceNumber}"}. */
  invoiceDff?: Record<string, string>;
}

export interface Supplier {
  name: string;
  number: string;
  site: string | null;
}

const amount = (h: number): number => Number(formatSar(h as Halalas));

// ─── INT-08: expense report → invoice (FR-PAY-02/05, INTEGRATION §5.3) ─────

export interface ReportInvoiceLine {
  expenseDate: string;
  typeName: string;
  merchant: string | null;
  chargeAccount: string;
  claimedSar: Halalas;
  approvedSar: Halalas;
  vatSar: Halalas;
  source: 'CASH' | 'CARD';
}

export interface ReportInvoiceInput {
  reportNumber: string;
  purpose: string;
  invoiceDate: string;
  netPayableSar: Halalas;
  advanceAppliedSar: Halalas;
  lines: readonly ReportInvoiceLine[];
  supplier: Supplier;
  options: InvoiceOptions;
}

export function buildReportInvoice(input: ReportInvoiceInput): FusionInvoicePayload {
  const lines: FusionInvoiceLine[] = [];
  let net = 0;
  let vat = 0;
  // One line per reimbursable (CASH) line still approved; card lines are never sent.
  for (const line of input.lines) {
    if (line.source !== 'CASH' || line.approvedSar <= 0) continue;
    const lineVat = effectiveVat(line.vatSar, line.approvedSar, line.claimedSar);
    const lineNet = line.approvedSar - lineVat;
    net += lineNet;
    vat += lineVat;
    lines.push({
      LineNumber: lines.length + 1,
      LineType: 'Item',
      LineAmount: amount(lineNet),
      Description:
        `${line.expenseDate} ${line.typeName}${line.merchant ? ` – ${line.merchant}` : ''}${
          lineVat > 0 ? ` (VAT recoverable ${formatSar(lineVat)})` : ''
        }`.slice(0, 240),
      DistributionCombination: line.chargeAccount,
      ...(lineVat > 0 && { TaxClassificationCode: input.options.taxClassificationCode }),
    });
  }
  // FR-PAY-02: net payable = reimbursable − advance applied. The lines must add up to it.
  const expected = net + vat - input.advanceAppliedSar;
  if (expected !== input.netPayableSar) {
    throw new Error(
      `Invoice lines (${formatSar(expected as Halalas)}) do not add up to the net payable (${formatSar(input.netPayableSar)}).`,
    );
  }
  // Phase 2: one negative line per advance application (OQ-13).
  return {
    InvoiceNumber: input.reportNumber,
    InvoiceCurrency: 'SAR',
    PaymentCurrency: 'SAR',
    InvoiceAmount: amount(input.netPayableSar),
    InvoiceDate: input.invoiceDate,
    BusinessUnit: input.options.businessUnit,
    Supplier: input.supplier.name,
    SupplierNumber: input.supplier.number,
    SupplierSite: input.supplier.site,
    InvoiceType: input.options.invoiceType,
    InvoiceSource: input.options.invoiceSource,
    Description: `Expense report ${input.reportNumber} – ${input.purpose}`.slice(0, 240),
    PaymentMethodCode: input.options.paymentMethod,
    PayGroup: input.options.payGroup,
    PaymentTerms: input.options.paymentTerms,
    invoiceDff: invoiceDffValues(
      input.options.invoiceDff ?? {},
      input.reportNumber,
      input.invoiceDate,
    ),
    invoiceLines: lines,
  };
}

// ─── INT-08: Quick Pay → invoice (FR-QP-03, INTEGRATION §5.4) ───────────────

export interface QuickPayInvoiceInput {
  invoiceNumber: string;
  invoiceDate: string;
  elementName: string;
  effectiveDate: string;
  amountSar: Halalas;
  /** OQ-07 proposal: system option ACCT_QUICKPAY for the BU [VERIFY with Finance]. */
  account: string;
  supplier: Supplier;
  options: InvoiceOptions;
}

export function buildQuickPayInvoice(input: QuickPayInvoiceInput): FusionInvoicePayload {
  const description = `${input.elementName} (Quick Pay ${input.effectiveDate})`;
  return {
    InvoiceNumber: input.invoiceNumber,
    InvoiceCurrency: 'SAR',
    PaymentCurrency: 'SAR',
    InvoiceAmount: amount(input.amountSar),
    InvoiceDate: input.invoiceDate,
    BusinessUnit: input.options.businessUnit,
    Supplier: input.supplier.name,
    SupplierNumber: input.supplier.number,
    SupplierSite: input.supplier.site,
    InvoiceType: input.options.invoiceType,
    InvoiceSource: input.options.invoiceSource,
    Description: description,
    PaymentMethodCode: input.options.paymentMethod,
    PayGroup: input.options.payGroup,
    PaymentTerms: input.options.paymentTerms,
    invoiceDff: invoiceDffValues(
      input.options.invoiceDff ?? {},
      input.invoiceNumber,
      input.invoiceDate,
    ),
    invoiceLines: [
      {
        LineNumber: 1,
        LineType: 'Item',
        LineAmount: amount(input.amountSar),
        Description: description,
        DistributionCombination: input.account,
      },
    ],
  };
}

/** Sum of the lines as halalas (tests / sanity checks). */
export function linesTotal(payload: FusionInvoicePayload): Halalas {
  return sumSar(payload.invoiceLines.map((l) => Math.round(l.LineAmount * 100) as Halalas));
}

// ─── INT-09: status mapping (INTEGRATION §6 table) ─────────────────────────

export type InvoiceOutcome =
  /** Validated / not paid: update fusion_status only. */
  | { action: 'UPDATE'; fusionStatus: string }
  /** Fully paid: payment ref + date, → PAID, notify the employee. */
  | { action: 'PAID'; fusionStatus: string; paymentRef: string; paidAt: string }
  /** Partially paid: fusion_status = PARTIALLY_PAID, Finance flag. */
  | { action: 'PARTIALLY_PAID'; fusionStatus: 'PARTIALLY_PAID' }
  /** Cancelled: → READY_FOR_PAYMENT, sync_error, Finance flag (OQ-18). */
  | { action: 'CANCELLED'; fusionStatus: 'CANCELLED' }
  /** Payment voided: → INVOICED, clear payment_ref, Finance flag. */
  | { action: 'VOIDED'; fusionStatus: string };

/**
 * `paidInEh` = ExpenseHub already shows the invoice as PAID (so an unpaid invoice with a voided
 * payment means the payment was voided).
 */
export function mapInvoiceStatus(
  invoice: FusionInvoice,
  payments: readonly FusionPayment[],
  paidInEh: boolean,
): InvoiceOutcome {
  if (invoice.CanceledFlag) return { action: 'CANCELLED', fusionStatus: 'CANCELLED' };
  const live = payments.filter((p) => p.status !== 'VOIDED');
  if (invoice.PaidStatus === 'Paid') {
    const payment = live.at(-1);
    if (payment) {
      return {
        action: 'PAID',
        fusionStatus: 'PAID',
        paymentRef: payment.paymentNumber,
        paidAt: payment.paymentDate,
      };
    }
    // Paid but the payment report has not caught up yet: try again next hour.
    return { action: 'UPDATE', fusionStatus: invoice.ValidationStatus };
  }
  if (invoice.PaidStatus === 'Partially paid') {
    return { action: 'PARTIALLY_PAID', fusionStatus: 'PARTIALLY_PAID' };
  }
  if (paidInEh) return { action: 'VOIDED', fusionStatus: invoice.ValidationStatus };
  return { action: 'UPDATE', fusionStatus: invoice.ValidationStatus };
}
