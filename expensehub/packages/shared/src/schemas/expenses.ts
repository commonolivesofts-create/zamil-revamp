// Implements: API §4 expenses and receipts (FR-CAP, FR-POL). The schema file is the contract.
import { z } from 'zod';
import { POLICY_RULES } from '../policy/engine';
import { COA_SEGMENTS, EXPENSE_CATEGORIES, EXPENSE_SOURCES } from '../reference';
import { POLICY_LEVELS, VIOLATION_LEVELS } from '../status';
import { isoDateSchema, listOf, timestampSchema, versionSchema } from './common';

const text = (max: number) =>
  z
    .string()
    .trim()
    .max(max)
    .nullable()
    .transform((v) => (v === '' ? null : v));

/** Original-currency amount, ≤ 2 decimals ("1840", "1840.5"). */
export const expenseAmountSchema = z
  .string()
  .trim()
  .regex(/^\d{1,12}(\.\d{1,2})?$/, 'Enter an amount like 150 or 150.00');

/** What the employee enters (FR-CAP-01). Category-specific rules live in the policy engine. */
export const expenseInputSchema = z.object({
  typeId: z.number().int().positive(),
  expenseDate: isoDateSchema,
  merchant: text(240),
  description: text(500),
  attendees: text(500),
  justification: text(1000),
  amount: expenseAmountSchema.nullable(),
  currency: z.string().regex(/^[A-Z]{3}$/, 'Choose a currency'),
  /** Mileage km (≤ 2 decimals). */
  quantity: z
    .string()
    .trim()
    .regex(/^\d{1,6}(\.\d{1,2})?$/, 'Enter the kilometres')
    .nullable(),
  tripId: z.number().int().positive().nullable(),
  quickPayId: z.number().int().positive().nullable(),
  costCenter: z.string().trim().max(30).nullable(),
  taxInvoice: z.boolean(),
  receiptId: z.number().int().positive().nullable(),
});
export type ExpenseInput = z.input<typeof expenseInputSchema>;

export const expenseUpdateSchema = expenseInputSchema.extend({ version: versionSchema });
export type ExpenseUpdate = z.input<typeof expenseUpdateSchema>;

/** Dry-run validation (POST /expenses/validate): the live checklist. */
export const expenseValidateSchema = expenseInputSchema.extend({
  /** The expense being edited (excluded from duplicate search). */
  expenseId: z.number().int().positive().nullable().optional(),
});

export const ruleResultSchema = z.object({
  rule: z.enum(POLICY_RULES),
  level: z.enum(POLICY_LEVELS),
  message: z.string(),
});
export type RuleResultDto = z.infer<typeof ruleResultSchema>;

export const expenseEvaluationSchema = z.object({
  amountSar: z.string().nullable(),
  vatSar: z.string(),
  netSar: z.string().nullable(),
  /** D-41: false → no VAT is recovered; the form hides the tax-invoice switch and VAT figures. */
  vatRecovery: z.boolean(),
  fxRate: z.string().nullable(),
  fxRateDate: isoDateSchema.nullable(),
  quantity: z.string().nullable(),
  unitRateSar: z.string().nullable(),
  receiptRequired: z.boolean(),
  chargeAccount: z.string().nullable(),
  segments: z.array(
    z.object({
      segment: z.enum(COA_SEGMENTS),
      value: z.string(),
      description: z.string().nullable(),
      ok: z.boolean(),
    }),
  ),
  results: z.array(ruleResultSchema),
  level: z.enum(POLICY_LEVELS),
});
export type ExpenseEvaluation = z.infer<typeof expenseEvaluationSchema>;

export const expenseReceiptSchema = z.object({
  receiptId: z.number().int(),
  originalName: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  qrValid: z.boolean().nullable(),
  /** Marked verified by the auditor (FR-AUD-03). */
  verified: z.boolean(),
  url: z.string(),
});

export const expenseSchema = z.object({
  expenseId: z.number().int(),
  reportId: z.number().int().nullable(),
  expenseDate: isoDateSchema,
  typeId: z.number().int(),
  typeCode: z.string(),
  typeName: z.string(),
  typeIcon: z.string(),
  category: z.enum(EXPENSE_CATEGORIES),
  merchant: z.string().nullable(),
  description: z.string().nullable(),
  attendees: z.string().nullable(),
  justification: z.string().nullable(),
  quantity: z.string().nullable(),
  unitRateSar: z.string().nullable(),
  amount: z.string(),
  currency: z.string(),
  fxRate: z.string(),
  fxRateDate: isoDateSchema.nullable(),
  amountSar: z.string(),
  vatSar: z.string(),
  netSar: z.string(),
  approvedAmountSar: z.string(),
  /** Set when the auditor reduced or disallowed the line (FR-AUD-04). */
  adjustmentReason: z.string().nullable(),
  taxInvoice: z.boolean(),
  receiptRequired: z.boolean(),
  receiptAttached: z.boolean(),
  chargeAccount: z.string(),
  costCenter: z.string().nullable(),
  tripId: z.number().int().nullable(),
  quickPayId: z.number().int().nullable(),
  source: z.enum(EXPENSE_SOURCES),
  policyLevel: z.enum(POLICY_LEVELS),
  violations: z.array(
    z.object({ ruleCode: z.string(), level: z.enum(VIOLATION_LEVELS), message: z.string() }),
  ),
  receipt: expenseReceiptSchema.nullable(),
  /**
   * FULL = unreported or on a DRAFT report · LIMITED = info requested (OQ-06): purpose,
   * justification, attendees and receipt only · NONE = on a submitted report.
   */
  editMode: z.enum(['FULL', 'LIMITED', 'NONE']),
  version: versionSchema,
  createdAt: timestampSchema,
});
export type ExpenseDto = z.infer<typeof expenseSchema>;
export const expenseListSchema = listOf(expenseSchema);

// ─── Receipts (FR-CAP-02/03/04) ─────────────────────────────────────────────

export const receiptUploadResponseSchema = z.object({
  receiptId: z.number().int(),
  originalName: z.string(),
  mime: z.string(),
  sizeBytes: z.number().int(),
  url: z.string(),
  qr: z.object({
    found: z.boolean(),
    valid: z.boolean(),
    fields: z
      .object({
        sellerName: z.string().optional(),
        vatNumber: z.string().optional(),
        timestamp: z.string().optional(),
        total: z.string().optional(),
        vat: z.string().optional(),
      })
      .nullable(),
    errors: z.array(z.string()),
  }),
  ocr: z.object({
    engine: z.string(),
    fields: z.object({
      merchant: z.string().nullable(),
      date: isoDateSchema.nullable(),
      total: z.string().nullable(),
      vat: z.string().nullable(),
    }),
  }),
  /** Same image already on one of your expenses (D-23). */
  duplicate: z.boolean(),
});
export type ReceiptUploadResponse = z.infer<typeof receiptUploadResponseSchema>;

// ─── Reference data used by the capture form (API §3) ───────────────────────

export const tripRefSchema = z.object({
  tripId: z.number().int(),
  absenceType: z.string(),
  startDate: isoDateSchema,
  endDate: isoDateSchema,
  days: z.number(),
  destination: z.string().nullable(),
});
export type TripRef = z.infer<typeof tripRefSchema>;
export const tripRefListSchema = listOf(tripRefSchema);

export const quickPayRefSchema = z.object({
  quickPayId: z.number().int(),
  elementName: z.string(),
  amountSar: z.string(),
  effectiveDate: isoDateSchema,
});
export const quickPayRefListSchema = listOf(quickPayRefSchema);

export const currencyListSchema = z.object({ items: z.array(z.string()) });
