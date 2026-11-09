// Implements: API §5 reports and §6 approvals (FR-REP, FR-APR). The schema file is the contract.
import { z } from 'zod';
import { JOURNAL_KINDS } from '../accounting';
import { AUDIT_RULE_CODES, BUSINESS_UNITS } from '../reference';
import { AUDIT_OUTCOMES, REPORT_STATUSES, STEP_STATUSES } from '../status';
import { expenseSchema } from './expenses';
import { isoDateSchema, listOf, sarAmountSchema, timestampSchema, versionSchema } from './common';

const purposeSchema = z
  .string()
  .trim()
  .min(3, 'Enter the business purpose (at least 3 characters)')
  .max(500);

const expenseIdsSchema = z
  .array(z.number().int().positive())
  .min(1, 'Choose at least one expense')
  .max(200);

export const reportCreateSchema = z.object({
  purpose: purposeSchema,
  expenseIds: expenseIdsSchema,
});
export type ReportCreate = z.input<typeof reportCreateSchema>;

/** DRAFT: purpose and the full set of lines. Info requested (OQ-06): purpose only. */
export const reportUpdateSchema = z.object({
  purpose: purposeSchema,
  expenseIds: expenseIdsSchema.optional(),
  version: versionSchema,
});
export type ReportUpdate = z.input<typeof reportUpdateSchema>;

export const reportVersionSchema = z.object({ version: versionSchema });

/** Approve: optional comment. */
export const approveSchema = z.object({ comment: z.string().trim().max(1000).optional() });

/** Reject / request info / reply: a comment is mandatory (FR-APR-04). */
export const reasonSchema = z.object({
  comment: z.string().trim().min(1, 'Enter a reason').max(1000),
});

export const reportListQuerySchema = z.object({
  status: z.enum(REPORT_STATUSES).optional(),
});

// ─── Responses ──────────────────────────────────────────────────────────────

/** Who holds a report now and since when (FR-REP-07). */
export const currentStepSchema = z.object({
  stepName: z.string(),
  assigneeName: z.string(),
  since: timestampSchema,
});

export const reportSummarySchema = z.object({
  reportId: z.number().int(),
  reportNumber: z.string().nullable(),
  purpose: z.string(),
  status: z.enum(REPORT_STATUSES),
  infoRequested: z.boolean(),
  claimantName: z.string(),
  businessUnit: z.enum(BUSINESS_UNITS),
  reportDate: isoDateSchema,
  totalSar: z.string(),
  netPayableSar: z.string(),
  lineCount: z.number().int(),
  submittedAt: timestampSchema.nullable(),
  currentStep: currentStepSchema.nullable(),
  version: versionSchema,
  updatedAt: timestampSchema,
});
export type ReportSummary = z.infer<typeof reportSummarySchema>;
export const reportListSchema = listOf(reportSummarySchema);

export const STEP_NOTES = ['BELOW_THRESHOLD', 'SELF_APPROVAL'] as const;
export type StepNote = (typeof STEP_NOTES)[number];

export const approvalStepSchema = z.object({
  stepId: z.number().int(),
  cycleNo: z.number().int(),
  seq: z.number().int(),
  stepName: z.string(),
  status: z.enum(STEP_STATUSES),
  isAuditStep: z.boolean(),
  assigneeName: z.string(),
  actedByName: z.string().nullable(),
  actedAt: timestampSchema.nullable(),
  pendingSince: timestampSchema.nullable(),
  comment: z.string().nullable(),
  /** Why the step was skipped or re-routed (FR-APR-02, D-34). */
  note: z.enum(STEP_NOTES).nullable(),
});
export type ApprovalStepDto = z.infer<typeof approvalStepSchema>;

export const reportHistorySchema = z.object({
  historyId: z.number().int(),
  at: timestampSchema,
  actorName: z.string().nullable(),
  action: z.string(),
  fromStatus: z.string().nullable(),
  toStatus: z.string().nullable(),
  comment: z.string().nullable(),
  stepName: z.string().nullable(),
});
export type ReportHistoryDto = z.infer<typeof reportHistorySchema>;

export const reportPermissionsSchema = z.object({
  canEdit: z.boolean(),
  canEditPurpose: z.boolean(),
  canSubmit: z.boolean(),
  canDelete: z.boolean(),
  canWithdraw: z.boolean(),
  canCorrect: z.boolean(),
  canReplyInfo: z.boolean(),
  /** The PENDING step the signed-in user may approve / reject (null = none). */
  actionableStepId: z.number().int().nullable(),
  /** PENDING_AUDIT and the open audit step is the signed-in user's (FR-AUD-03). */
  canAudit: z.boolean(),
});
export type ReportPermissions = z.infer<typeof reportPermissionsSchema>;

export const reportDetailSchema = reportSummarySchema.extend({
  claimant: z.object({
    personId: z.number().int(),
    personNumber: z.string(),
    fullName: z.string(),
    jobName: z.string().nullable(),
  }),
  vatSar: z.string(),
  cashSar: z.string(),
  approvedAt: timestampSchema.nullable(),
  lines: z.array(expenseSchema),
  /** Present once the report was selected for audit (FR-AUD-01). */
  audit: z
    .object({
      reasons: z.array(z.enum(AUDIT_RULE_CODES)),
      outcome: z.enum(AUDIT_OUTCOMES).nullable(),
      notes: z.string().nullable(),
      auditorName: z.string().nullable(),
      actedAt: timestampSchema.nullable(),
    })
    .nullable(),
  steps: z.array(approvalStepSchema),
  /** Once sent to Payables (FR-REP-01: Fusion invoice no., payment ref). */
  fusion: z
    .object({
      invoiceNumber: z.string().nullable(),
      status: z.string().nullable(),
      paymentRef: z.string().nullable(),
      paidAt: timestampSchema.nullable(),
      syncError: z.string().nullable(),
    })
    .nullable(),
  history: z.array(reportHistorySchema),
  permissions: reportPermissionsSchema,
});
export type ReportDetail = z.infer<typeof reportDetailSchema>;

// ─── Approval inbox (UI-UX §5.4) ────────────────────────────────────────────

export const INBOX_FLAGS = [
  'OVER_LIMIT',
  'MISSING_RECEIPT',
  'DUPLICATE',
  'FOREIGN_CURRENCY',
  'QR_INVALID',
  'INFO_REQUESTED',
] as const;
export type InboxFlag = (typeof INBOX_FLAGS)[number];

export const inboxItemSchema = z.object({
  stepId: z.number().int(),
  /** AUDIT = a selected report waiting in audit (opens the audit workspace). */
  kind: z.enum(['APPROVAL', 'AUDIT']),
  stepName: z.string(),
  reportId: z.number().int(),
  reportNumber: z.string().nullable(),
  purpose: z.string(),
  claimantName: z.string(),
  businessUnit: z.enum(BUSINESS_UNITS),
  totalSar: z.string(),
  lineCount: z.number().int(),
  pendingSince: timestampSchema,
  flags: z.array(z.enum(INBOX_FLAGS)),
  version: versionSchema,
});
export type InboxItem = z.infer<typeof inboxItemSchema>;
export const inboxListSchema = listOf(inboxItemSchema);

// ─── Audit (API §7, FR-AUD) ─────────────────────────────────────────────────

export const auditQueueItemSchema = z.object({
  reportId: z.number().int(),
  reportNumber: z.string().nullable(),
  purpose: z.string(),
  claimantName: z.string(),
  businessUnit: z.enum(BUSINESS_UNITS),
  totalSar: z.string(),
  lineCount: z.number().int(),
  receipts: z.number().int(),
  receiptsVerified: z.number().int(),
  reasons: z.array(z.enum(AUDIT_RULE_CODES)),
  pendingSince: timestampSchema,
});
export type AuditQueueItem = z.infer<typeof auditQueueItemSchema>;
export const auditQueueSchema = listOf(auditQueueItemSchema);

/** FR-AUD-04: 0 = disallow; never above the claimed amount; a reason is mandatory. */
export const lineAdjustSchema = z.object({
  approvedAmount: sarAmountSchema,
  reason: z.string().trim().min(1, 'Enter a reason').max(500),
});
export type LineAdjust = z.input<typeof lineAdjustSchema>;

// ─── Accounting preview (FR-ACC-01) ─────────────────────────────────────────

export const accountingPreviewSchema = z.object({
  lines: z.array(
    z.object({
      side: z.enum(['DR', 'CR']),
      kind: z.enum(JOURNAL_KINDS),
      account: z.string(),
      accountName: z.string().nullable(),
      amountSar: z.string(),
    }),
  ),
  totalDr: z.string(),
  totalCr: z.string(),
  balanced: z.boolean(),
});
export type AccountingPreviewDto = z.infer<typeof accountingPreviewSchema>;
