// Expense entry form ↔ API input (FR-CAP-01) and receipt prefill (FR-CAP-03/04).
// Kept out of component files for fast refresh.
import {
  expenseInputSchema,
  type ExpenseCategory,
  type ExpenseDto,
  type ExpenseInput,
  type ReceiptUploadResponse,
} from '@expensehub/shared';
import { riyadhDate } from '../../lib/format';

export interface ExpenseFormValues {
  typeId: number | null;
  expenseDate: string;
  merchant: string;
  description: string;
  attendees: string;
  justification: string;
  amount: string;
  currency: string;
  quantity: string;
  /** '' = none. Select values are strings. */
  tripId: string;
  quickPayId: string;
  /** '' = the default from Oracle HCM (OQ-14 proposal). */
  costCenter: string;
  taxInvoice: boolean;
}

/** Fields a receipt can fill; they keep a brand tint until the user edits them. */
export type PrefillField = 'merchant' | 'expenseDate' | 'amount';

/** What the receipt pane shows — from an upload, or from a saved line. */
export interface AttachedReceipt {
  receiptId: number;
  url: string;
  mime: string;
  originalName: string;
  /** null = no QR found. */
  qrValid: boolean | null;
  qr: ReceiptUploadResponse['qr'] | null;
  ocrUsed: boolean;
  duplicate: boolean;
}

export const FORM_FIELDS = [
  'typeId',
  'expenseDate',
  'merchant',
  'description',
  'attendees',
  'justification',
  'amount',
  'currency',
  'quantity',
  'tripId',
  'quickPayId',
  'costCenter',
  'taxInvoice',
] as const;

export function emptyForm(today: string = riyadhDate()): ExpenseFormValues {
  return {
    typeId: null,
    expenseDate: today,
    merchant: '',
    description: '',
    attendees: '',
    justification: '',
    amount: '',
    currency: 'SAR',
    quantity: '',
    tripId: '',
    quickPayId: '',
    costCenter: '',
    taxInvoice: true,
  };
}

export function formFromExpense(e: ExpenseDto): ExpenseFormValues {
  return {
    typeId: e.typeId,
    expenseDate: e.expenseDate,
    merchant: e.merchant ?? '',
    description: e.description ?? '',
    attendees: e.attendees ?? '',
    justification: e.justification ?? '',
    amount: e.category === 'STANDARD' ? e.amount : '',
    currency: e.currency,
    quantity: e.category === 'MILEAGE' ? (e.quantity ?? '') : '',
    tripId: e.tripId ? String(e.tripId) : '',
    quickPayId: e.quickPayId ? String(e.quickPayId) : '',
    costCenter: e.costCenter ?? '',
    taxInvoice: e.taxInvoice,
  };
}

export function receiptFromExpense(e: ExpenseDto): AttachedReceipt | null {
  if (!e.receipt) return null;
  return {
    receiptId: e.receipt.receiptId,
    url: e.receipt.url,
    mime: e.receipt.mime,
    originalName: e.receipt.originalName,
    qrValid: e.receipt.qrValid,
    qr: null,
    ocrUsed: false,
    duplicate: false,
  };
}

export function receiptFromUpload(r: ReceiptUploadResponse): AttachedReceipt {
  return {
    receiptId: r.receiptId,
    url: r.url,
    mime: r.mime,
    originalName: r.originalName,
    qrValid: r.qr.found ? r.qr.valid : null,
    qr: r.qr,
    ocrUsed: r.ocr.engine !== 'none' && !r.qr.valid,
    duplicate: r.duplicate,
  };
}

/** Unit rates carry 4 decimals ("0.7500"); show at least 2 ("0.75", "400.00", "0.125"). */
export function trimRate(rate: string): string {
  return rate.replace(/(\.\d{2}\d*?)0+$/, '$1');
}

const blank = (v: string) => (v.trim() === '' ? null : v.trim());

/**
 * The API input for the current form, or null while it cannot be evaluated (no type yet, or a
 * field fails the shared contract — that field shows its own error).
 */
export function toExpenseInput(
  v: ExpenseFormValues,
  category: ExpenseCategory | undefined,
  receiptId: number | null,
): { input: ExpenseInput | null; issues: { path: string; message: string }[] } {
  if (v.typeId === null || !category) return { input: null, issues: [] };
  const candidate: ExpenseInput = {
    typeId: v.typeId,
    expenseDate: v.expenseDate,
    merchant: category === 'STANDARD' ? blank(v.merchant) : null,
    description: blank(v.description),
    attendees: blank(v.attendees),
    justification: blank(v.justification),
    amount: category === 'STANDARD' ? (blank(v.amount)?.replace(/,/g, '') ?? null) : null,
    currency: category === 'STANDARD' ? v.currency : 'SAR',
    quantity: category === 'MILEAGE' ? blank(v.quantity) : null,
    tripId: v.tripId ? Number(v.tripId) : null,
    quickPayId: v.quickPayId ? Number(v.quickPayId) : null,
    costCenter: blank(v.costCenter),
    taxInvoice: category === 'STANDARD' ? v.taxInvoice : false,
    receiptId,
  };
  const parsed = expenseInputSchema.safeParse(candidate);
  if (parsed.success) return { input: candidate, issues: [] };
  return {
    input: null,
    issues: parsed.error.issues.map((i) => ({ path: String(i.path[0] ?? ''), message: i.message })),
  };
}

/**
 * QR values win over OCR (FR-CAP-03). Only fills fields the user has not typed into, and
 * returns which fields were filled so the form can tint them.
 */
export function prefillFromReceipt(
  current: ExpenseFormValues,
  upload: ReceiptUploadResponse,
): { values: Partial<ExpenseFormValues>; filled: PrefillField[] } {
  const qr = upload.qr.found && upload.qr.fields ? upload.qr.fields : null;
  const ocr = upload.ocr.fields;
  const merchant = qr?.sellerName ?? ocr.merchant;
  const date = qr?.timestamp ? riyadhDate(qr.timestamp) : ocr.date;
  const total = qr?.total ?? ocr.total;

  const values: Partial<ExpenseFormValues> = {};
  const filled: PrefillField[] = [];
  if (merchant && !current.merchant.trim()) {
    values.merchant = merchant;
    filled.push('merchant');
  }
  if (date && date <= riyadhDate()) {
    values.expenseDate = date;
    filled.push('expenseDate');
  }
  if (total && !current.amount.trim()) {
    values.amount = total;
    filled.push('amount');
    // A ZATCA QR is a Saudi tax invoice, always in SAR.
    if (qr) values.currency = 'SAR';
  }
  if (qr && upload.qr.valid) values.taxInvoice = true;
  return { values, filled };
}
