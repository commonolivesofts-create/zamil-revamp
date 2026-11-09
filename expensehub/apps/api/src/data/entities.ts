// Row types for every DRD §3–4 table (camelCase of the Oracle columns).
// Money: Halalas (integer). Rates / unit rates: DecimalString (exact, e.g. "3.75000000").
// Business dates: IsoDate "YYYY-MM-DD". Event times: IsoTimestamp (ISO-8601 with offset).
import type {
  AdvanceStatus,
  ApprovalChain,
  ApproverSource,
  AssignableRole,
  AuditOutcome,
  AuditRuleCode,
  BusinessUnit,
  CardTxnStatus,
  CoaSegment,
  ConditionType,
  ExpenseCategory,
  ExpenseSource,
  ExpenseUnit,
  Halalas,
  HistoryEntityType,
  IntegrationLogStatus,
  InterfaceCode,
  JobRunStatus,
  LimitAction,
  NotificationChannel,
  NotificationStatus,
  OptionValueType,
  PolicyLevel,
  QuickPayInvoiceStatus,
  ReceiptSource,
  ReportSource,
  ReportStatus,
  StepStatus,
  ViolationLevel,
} from '@expensehub/shared';

export type IsoDate = string;
export type IsoTimestamp = string;
export type DecimalString = string;
export type PersonId = number;
export type YN = 'Y' | 'N';

/** Audit columns on every ExpenseHub-owned table (DRD §1). */
export interface AuditCols {
  createdAt: IsoTimestamp;
  createdBy: PersonId | null;
  updatedAt: IsoTimestamp;
  updatedBy: PersonId | null;
  version: number;
}
export type AuditKey = keyof AuditCols;

/** Mirror tables (refreshed from Fusion by the sync jobs). */
export interface MirrorCols {
  syncedAt: IsoTimestamp;
}

// ─── Fusion mirrors (DRD §3) ────────────────────────────────────────────────

export interface EmployeeRow extends MirrorCols {
  personId: PersonId;
  personNumber: string;
  fullName: string;
  fullNameAr: string | null;
  email: string | null;
  mobile: string | null;
  assignmentId: number | null;
  businessUnit: BusinessUnit;
  jobName: string | null;
  locationCode: string | null;
  costCenter: string | null;
  supervisorId: PersonId | null;
  defaultExpenseAccount: string | null;
  payeeOk: YN;
  supplierNumber: string | null;
  supplierSite: string | null;
  active: YN;
}

export interface CoaValueRow extends MirrorCols {
  segment: CoaSegment;
  value: string;
  description: string;
  enabled: YN;
  startDate: IsoDate | null;
  endDate: IsoDate | null;
}

export interface BusinessTripRow extends MirrorCols {
  tripId: number;
  personId: PersonId;
  absenceType: string;
  startDate: IsoDate;
  endDate: IsoDate;
  days: number;
  destination: string | null;
  approvalStatus: string;
}

export interface QuickPayRow extends MirrorCols {
  quickPayId: number;
  payrollActionId: number;
  runResultId: number;
  personId: PersonId;
  elementName: string;
  amountSar: Halalas;
  effectiveDate: IsoDate;
  businessUnit: BusinessUnit;
}

export interface RateRow extends MirrorCols {
  fromCcy: string;
  toCcy: string;
  rateType: string;
  rateDate: IsoDate;
  rate: DecimalString;
}

// ─── Setup and security (DRD §4) ────────────────────────────────────────────

export interface UserRow extends AuditCols {
  userId: number;
  personId: PersonId;
  passwordHash: string | null;
  failedAttempts: number;
  lockedUntil: IsoTimestamp | null;
  lastLoginAt: IsoTimestamp | null;
  resetTokenHash: string | null;
  resetExpiresAt: IsoTimestamp | null;
  active: YN;
}

export interface RoleAssignmentRow extends AuditCols {
  assignmentId: number;
  personId: PersonId;
  roleCode: AssignableRole;
  /** null = all business units. */
  businessUnit: BusinessUnit | null;
  isBackup: YN;
  startDate: IsoDate;
  endDate: IsoDate | null;
}

export interface ExpenseTypeRow extends AuditCols {
  typeId: number;
  typeCode: string;
  name: string;
  nameAr: string | null;
  category: ExpenseCategory;
  naturalAccount: string;
  defaultLimitSar: Halalas | null;
  limitAction: LimitAction;
  /** Receipt required above this amount; 0 = always; null = never. */
  receiptOverSar: Halalas | null;
  justificationReq: YN;
  attendeesReq: YN;
  vatEligible: YN;
  unit: ExpenseUnit | null;
  unitRateSar: DecimalString | null;
  icon: string;
  sortOrder: number;
  isPlaceholder: YN;
  active: YN;
}

export interface SystemOptionRow extends AuditCols {
  optionKey: string;
  /** '*' = all business units. */
  businessUnit: BusinessUnit | '*';
  optionValue: string;
  valueType: OptionValueType;
  description: string | null;
}

export interface ApprovalRuleRow extends AuditCols {
  ruleId: number;
  chainCode: ApprovalChain;
  seq: number;
  stepName: string;
  approverSource: ApproverSource;
  roleCode: AssignableRole | null;
  conditionType: ConditionType;
  /** TOTAL_GT only; null = use option CEO_THRESHOLD_SAR (FR-APR-02). */
  conditionAmountSar: Halalas | null;
  isAuditStep: YN;
  active: YN;
}

export interface AuditRuleRow extends AuditCols {
  ruleCode: AuditRuleCode;
  paramNumber: number | null;
  active: YN;
}

export interface DelegationRow extends AuditCols {
  delegationId: number;
  fromPersonId: PersonId;
  toPersonId: PersonId;
  startDate: IsoDate;
  endDate: IsoDate;
  active: YN;
}

// ─── Claims ─────────────────────────────────────────────────────────────────

export interface ReportRow extends AuditCols {
  reportId: number;
  /** Assigned at first submit (OQ-19). */
  reportNumber: string | null;
  personId: PersonId;
  businessUnit: BusinessUnit;
  purpose: string;
  reportDate: IsoDate;
  status: ReportStatus;
  infoRequested: YN;
  totalSar: Halalas;
  cashSar: Halalas;
  cardSar: Halalas;
  vatSar: Halalas;
  advanceAppliedSar: Halalas;
  netPayableSar: Halalas;
  auditSelected: YN;
  submittedAt: IsoTimestamp | null;
  approvedAt: IsoTimestamp | null;
  releasedAt: IsoTimestamp | null;
  fusionInvoiceId: number | null;
  fusionInvoiceNum: string | null;
  fusionStatus: string | null;
  paymentRef: string | null;
  paidAt: IsoTimestamp | null;
  syncError: string | null;
  source: ReportSource;
}

export interface ExpenseRow extends AuditCols {
  expenseId: number;
  personId: PersonId;
  reportId: number | null;
  lineNo: number | null;
  expenseDate: IsoDate;
  typeId: number;
  merchant: string | null;
  description: string | null;
  attendees: string | null;
  justification: string | null;
  quantity: number | null;
  unitRateSar: DecimalString | null;
  amount: Halalas;
  currency: string;
  fxRate: DecimalString;
  fxRateDate: IsoDate | null;
  amountSar: Halalas;
  vatSar: Halalas;
  netSar: Halalas;
  approvedAmountSar: Halalas;
  adjustmentReason: string | null;
  taxInvoice: YN;
  receiptRequired: YN;
  receiptAttached: YN;
  chargeAccount: string;
  costCenter: string | null;
  tripId: number | null;
  quickPayId: number | null;
  source: ExpenseSource;
  cardTxnId: number | null;
  receiptHash: string | null;
  policyLevel: PolicyLevel;
}

export interface PolicyViolationRow {
  violationId: number;
  expenseId: number;
  ruleCode: string;
  level: ViolationLevel;
  message: string;
  createdAt: IsoTimestamp;
}

export interface ReceiptRow extends AuditCols {
  receiptId: number;
  expenseId: number | null;
  personId: PersonId;
  filePath: string;
  originalName: string;
  mime: string;
  sizeBytes: number;
  sha256: string;
  ocrJson: unknown;
  qrJson: unknown;
  qrValid: YN | null;
  qrErrors: string | null;
  verifiedByAuditor: YN;
  source: ReceiptSource;
}

export interface ApprovalStepRow extends AuditCols {
  stepId: number;
  reportId: number;
  seq: number;
  stepName: string;
  ruleId: number | null;
  isAuditStep: YN;
  assignedTo: PersonId;
  originalAssignee: PersonId | null;
  status: StepStatus;
  actedBy: PersonId | null;
  actedAt: IsoTimestamp | null;
  commentText: string | null;
  pendingSince: IsoTimestamp | null;
  remindedAt: IsoTimestamp | null;
  escalatedAt: IsoTimestamp | null;
  cycleNo: number;
}

export interface AuditRecordRow extends AuditCols {
  auditId: number;
  reportId: number;
  reasons: AuditRuleCode[];
  auditorId: PersonId | null;
  outcome: AuditOutcome | null;
  notes: string | null;
  actedAt: IsoTimestamp | null;
}

// ─── Finance ────────────────────────────────────────────────────────────────

export interface QuickPayInvoiceRow extends AuditCols {
  qpInvoiceId: number;
  quickPayId: number;
  status: QuickPayInvoiceStatus;
  invoiceNumber: string | null;
  fusionInvoiceId: number | null;
  fusionStatus: string | null;
  paymentRef: string | null;
  paidAt: IsoTimestamp | null;
  syncError: string | null;
  excludedReason: string | null;
  requestedBy: PersonId | null;
}

export interface AdvanceRow extends AuditCols {
  advanceId: number;
  advanceNumber: string | null;
  personId: PersonId;
  businessUnit: BusinessUnit;
  purpose: string;
  amountSar: Halalas;
  appliedSar: Halalas;
  refundedSar: Halalas;
  status: AdvanceStatus;
  approverId: PersonId | null;
  approvedAt: IsoTimestamp | null;
  disbursedBy: PersonId | null;
  disbursedAt: IsoTimestamp | null;
  voucherNo: string | null;
  fusionRef: string | null;
}

export interface AdvanceApplicationRow {
  applicationId: number;
  advanceId: number;
  reportId: number;
  amountSar: Halalas;
  appliedAt: IsoTimestamp;
}

/** Phase 3. Never stores a full card number. */
export interface CardTransactionRow {
  txnId: number;
  cardLast4: string;
  personId: PersonId | null;
  txnDate: IsoDate;
  postingDate: IsoDate | null;
  merchant: string;
  mcc: string | null;
  amount: Halalas;
  currency: string;
  amountSar: Halalas;
  status: CardTxnStatus;
  fileName: string;
  fileLine: number;
}

// ─── History and operations ─────────────────────────────────────────────────

/** Append-only (DB-05). */
export interface HistoryRow {
  historyId: number;
  entityType: HistoryEntityType;
  entityId: number;
  at: IsoTimestamp;
  actorId: PersonId | null;
  action: string;
  fromStatus: string | null;
  toStatus: string | null;
  detail: unknown;
}

/** Append-only (DB-05, FR-SET-05). */
export interface SetupHistoryRow {
  id: number;
  tableName: string;
  rowKey: string;
  at: IsoTimestamp;
  actorId: PersonId | null;
  oldJson: unknown;
  newJson: unknown;
}

export interface IntegrationLogRow {
  logId: number;
  interface: InterfaceCode;
  direction: 'IN' | 'OUT';
  refType: string | null;
  refId: string | null;
  httpMethod: string | null;
  url: string | null;
  request: unknown;
  response: string | null;
  httpStatus: number | null;
  status: IntegrationLogStatus;
  retries: number;
  durationMs: number | null;
  at: IsoTimestamp;
}

export interface JobRunRow {
  runId: number;
  jobName: string;
  startedAt: IsoTimestamp;
  endedAt: IsoTimestamp | null;
  status: JobRunStatus;
  rowsRead: number | null;
  rowsChanged: number | null;
  errorText: string | null;
}

export interface NotificationRow {
  notificationId: number;
  channel: NotificationChannel;
  recipientId: PersonId;
  templateCode: string;
  payload: unknown;
  status: NotificationStatus;
  attempts: number;
  sentAt: IsoTimestamp | null;
  errorText: string | null;
  createdAt: IsoTimestamp;
}
