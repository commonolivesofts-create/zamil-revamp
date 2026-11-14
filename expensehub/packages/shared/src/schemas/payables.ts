// Implements: API §8 Payables + Quick Pays (FR-PAY, FR-QP) and the D-36 dev Fusion simulator.
import { z } from 'zod';
import { BUSINESS_UNITS } from '../reference';
import { QUICK_PAY_INVOICE_STATUSES, REPORT_STATUSES } from '../status';
import { isoDateSchema, listOf, timestampSchema } from './common';

/** UI-UX §5.5 tabs. ERROR = a send failed, Fusion cancelled it, or a payment needs a look. */
export const PAYABLES_QUEUES = ['READY', 'INVOICED', 'PAID', 'ERROR'] as const;
export type PayablesQueue = (typeof PAYABLES_QUEUES)[number];

export const payablesItemSchema = z.object({
  reportId: z.number().int(),
  reportNumber: z.string().nullable(),
  purpose: z.string(),
  claimantName: z.string(),
  businessUnit: z.enum(BUSINESS_UNITS),
  status: z.enum(REPORT_STATUSES),
  queue: z.enum(PAYABLES_QUEUES),
  netPayableSar: z.string(),
  /** INT-07: supplier + site + bank ready — otherwise sending fails. */
  payeeReady: z.boolean(),
  approvedAt: timestampSchema.nullable(),
  fusionInvoiceId: z.number().int().nullable(),
  fusionInvoiceNum: z.string().nullable(),
  fusionStatus: z.string().nullable(),
  paymentRef: z.string().nullable(),
  paidAt: timestampSchema.nullable(),
  syncError: z.string().nullable(),
});
export type PayablesItem = z.infer<typeof payablesItemSchema>;

export const payablesResponseSchema = z.object({
  items: z.array(payablesItemSchema),
  /** D-36: "Open in Fusion test pod". */
  fusionPodUrl: z.string(),
  fusionMode: z.enum(['mock', 'live']),
});
export type PayablesResponse = z.infer<typeof payablesResponseSchema>;

export const sendRequestSchema = z.object({
  ids: z.array(z.number().int().positive()).min(1, 'Choose at least one').max(100),
});

export const sendResultSchema = z.object({
  items: z.array(
    z.discriminatedUnion('ok', [
      z.object({
        id: z.number().int(),
        ok: z.literal(true),
        invoiceNumber: z.string().nullable(),
        reused: z.boolean(),
        warnings: z.array(z.string()),
      }),
      z.object({ id: z.number().int(), ok: z.literal(false), error: z.string() }),
    ]),
  ),
});
export type SendResults = z.infer<typeof sendResultSchema>;

// ─── Quick Pays (FR-QP-02) ──────────────────────────────────────────────────

/** NEW = synced from Fusion Payroll with no invoice row yet (PRD §4.2). */
export const QUICK_PAY_QUEUE_STATUSES = ['NEW', ...QUICK_PAY_INVOICE_STATUSES] as const;
export type QuickPayQueueStatus = (typeof QUICK_PAY_QUEUE_STATUSES)[number];

export const quickPayQueueItemSchema = z.object({
  quickPayId: z.number().int(),
  employeeName: z.string(),
  personNumber: z.string(),
  businessUnit: z.enum(BUSINESS_UNITS),
  elementName: z.string(),
  effectiveDate: isoDateSchema,
  amountSar: z.string(),
  status: z.enum(QUICK_PAY_QUEUE_STATUSES),
  payeeReady: z.boolean(),
  invoiceNumber: z.string().nullable(),
  fusionInvoiceId: z.number().int().nullable(),
  fusionStatus: z.string().nullable(),
  paymentRef: z.string().nullable(),
  paidAt: timestampSchema.nullable(),
  syncError: z.string().nullable(),
  excludedReason: z.string().nullable(),
});
export type QuickPayQueueItem = z.infer<typeof quickPayQueueItemSchema>;
export const quickPayQueueSchema = listOf(quickPayQueueItemSchema).extend({
  fusionPodUrl: z.string(),
});

export const excludeSchema = z.object({
  reason: z.string().trim().min(1, 'Enter a reason').max(500),
});

// ─── Dev Fusion simulator (D-36, dev builds only) ───────────────────────────

export const SIMULATOR_ACTIONS = ['validate', 'pay', 'cancel', 'void'] as const;
export type SimulatorActionName = (typeof SIMULATOR_ACTIONS)[number];

export const devFusionStateSchema = z.object({
  autoAdvance: z.boolean(),
  fusionPodUrl: z.string(),
  pendingFailures: z.array(
    z.object({
      target: z.string(),
      httpStatus: z.number().int().nullable(),
      times: z.number().int(),
    }),
  ),
  invoices: z.array(
    z.object({
      invoiceId: z.number().int(),
      invoiceNumber: z.string(),
      supplier: z.string(),
      supplierNumber: z.string(),
      businessUnit: z.string(),
      invoiceDate: isoDateSchema,
      amount: z.string(),
      validationStatus: z.string(),
      paidStatus: z.string(),
      canceled: z.boolean(),
      attachments: z.number().int(),
      lines: z.number().int(),
      payments: z.array(
        z.object({ paymentNumber: z.string(), paymentDate: isoDateSchema, status: z.string() }),
      ),
      /** The ExpenseHub record behind the invoice. */
      ref: z
        .object({ kind: z.enum(['REPORT', 'QUICK_PAY']), id: z.number().int(), status: z.string() })
        .nullable(),
    }),
  ),
});
export type DevFusionState = z.infer<typeof devFusionStateSchema>;

export const devFailNextSchema = z.object({
  target: z.enum(['createInvoice', 'getInvoice', 'findInvoices']),
  httpStatus: z.union([z.literal(400), z.literal(500), z.literal(503)]),
});
