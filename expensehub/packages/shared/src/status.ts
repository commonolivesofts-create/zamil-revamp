// Implements: PRD §4 status lifecycles, FR-REP-02, TRD §4.3.
// Single source for every status list; the DDL CHECK constraints must match (status-ddl test).

export const REPORT_STATUSES = [
  'DRAFT',
  'PENDING_APPROVAL',
  'PENDING_AUDIT',
  'READY_FOR_PAYMENT',
  'INVOICED',
  'PAID',
  'REJECTED',
  'SETTLED',
] as const;
export type ReportStatus = (typeof REPORT_STATUSES)[number];

/** PRD §4.1. PENDING_AUDIT = Accountant step open on a selected report (OQ-03 proposal). */
export const REPORT_TRANSITIONS = {
  DRAFT: ['PENDING_APPROVAL'],
  PENDING_APPROVAL: ['DRAFT', 'PENDING_AUDIT', 'READY_FOR_PAYMENT', 'REJECTED'],
  PENDING_AUDIT: ['READY_FOR_PAYMENT', 'REJECTED'],
  READY_FOR_PAYMENT: ['INVOICED', 'SETTLED'],
  // Cancelled in Fusion → back to READY_FOR_PAYMENT (OQ-18 proposal).
  INVOICED: ['PAID', 'READY_FOR_PAYMENT'],
  // Payment voided in Fusion → back to INVOICED (INTEGRATION §6).
  PAID: ['INVOICED'],
  REJECTED: ['DRAFT'],
  SETTLED: [],
} as const satisfies Record<ReportStatus, readonly ReportStatus[]>;

export const STEP_STATUSES = [
  'WAITING',
  'PENDING',
  'APPROVED',
  'REJECTED',
  'SKIPPED',
  'CANCELLED',
] as const;
export type StepStatus = (typeof STEP_STATUSES)[number];

export const STEP_TRANSITIONS = {
  WAITING: ['PENDING', 'SKIPPED', 'CANCELLED'],
  PENDING: ['APPROVED', 'REJECTED', 'SKIPPED', 'CANCELLED'],
  APPROVED: [],
  REJECTED: [],
  SKIPPED: [],
  CANCELLED: [],
} as const satisfies Record<StepStatus, readonly StepStatus[]>;

/** PRD §4.2. "NEW" = synced Quick Pay with no invoice row yet. */
export const QUICK_PAY_INVOICE_STATUSES = [
  'INVOICE_REQUESTED',
  'INVOICED',
  'PAID',
  'EXCLUDED',
  'ERROR',
] as const;
export type QuickPayInvoiceStatus = (typeof QUICK_PAY_INVOICE_STATUSES)[number];

export const QUICK_PAY_INVOICE_TRANSITIONS = {
  INVOICE_REQUESTED: ['INVOICED', 'ERROR'],
  ERROR: ['INVOICE_REQUESTED', 'INVOICED', 'EXCLUDED'],
  INVOICED: ['PAID', 'INVOICE_REQUESTED'],
  PAID: ['INVOICED'],
  EXCLUDED: [],
} as const satisfies Record<QuickPayInvoiceStatus, readonly QuickPayInvoiceStatus[]>;

/** PRD §4.3 (phase 2). */
export const ADVANCE_STATUSES = [
  'PENDING_APPROVAL',
  'APPROVED',
  'DISBURSED',
  'PARTIALLY_APPLIED',
  'FULLY_APPLIED',
  'REJECTED',
  'REFUNDED',
] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export const ADVANCE_TRANSITIONS = {
  PENDING_APPROVAL: ['APPROVED', 'REJECTED'],
  APPROVED: ['DISBURSED'],
  DISBURSED: ['PARTIALLY_APPLIED', 'FULLY_APPLIED', 'REFUNDED'],
  PARTIALLY_APPLIED: ['FULLY_APPLIED', 'REFUNDED'],
  FULLY_APPLIED: [],
  REJECTED: [],
  REFUNDED: [],
} as const satisfies Record<AdvanceStatus, readonly AdvanceStatus[]>;

export const STATUS_MACHINES = {
  REPORT: REPORT_TRANSITIONS,
  APPROVAL_STEP: STEP_TRANSITIONS,
  QUICK_PAY_INVOICE: QUICK_PAY_INVOICE_TRANSITIONS,
  ADVANCE: ADVANCE_TRANSITIONS,
} as const;
export type MachineKind = keyof typeof STATUS_MACHINES;
export type StatusOf<K extends MachineKind> = keyof (typeof STATUS_MACHINES)[K] & string;

export function canTransition<K extends MachineKind>(
  kind: K,
  from: StatusOf<K>,
  to: StatusOf<K>,
): boolean {
  const machine = STATUS_MACHINES[kind] as Record<string, readonly string[]>;
  return machine[from]?.includes(to) ?? false;
}

export function isTerminal<K extends MachineKind>(kind: K, status: StatusOf<K>): boolean {
  const machine = STATUS_MACHINES[kind] as Record<string, readonly string[]>;
  return (machine[status]?.length ?? 0) === 0;
}

// Status lists without a transition machine.
export const NOTIFICATION_STATUSES = ['QUEUED', 'SENT', 'FAILED'] as const;
export type NotificationStatus = (typeof NOTIFICATION_STATUSES)[number];

export const JOB_RUN_STATUSES = ['RUNNING', 'OK', 'ERROR', 'SKIPPED'] as const;
export type JobRunStatus = (typeof JOB_RUN_STATUSES)[number];

export const INTEGRATION_LOG_STATUSES = ['OK', 'ERROR', 'RETRYING'] as const;
export type IntegrationLogStatus = (typeof INTEGRATION_LOG_STATUSES)[number];

export const CARD_TXN_STATUSES = ['UNMATCHED', 'MATCHED', 'ITEMIZED'] as const;
export type CardTxnStatus = (typeof CARD_TXN_STATUSES)[number];

export const AUDIT_OUTCOMES = ['RELEASED', 'REJECTED'] as const;
export type AuditOutcome = (typeof AUDIT_OUTCOMES)[number];

export const POLICY_LEVELS = ['PASS', 'WARN', 'BLOCK'] as const;
export type PolicyLevel = (typeof POLICY_LEVELS)[number];

export const VIOLATION_LEVELS = ['WARN', 'BLOCK'] as const;
export type ViolationLevel = (typeof VIOLATION_LEVELS)[number];
