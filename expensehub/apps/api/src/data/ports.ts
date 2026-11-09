// Implements: D-33, TRD §3.1 — the only data API that services and routes may use.
// Every implementation (memory now, Oracle in M8) must pass data/contract/*.contract.ts.
//
// Rules for implementations:
//  - Reads return copies; changing a returned object never changes stored data.
//  - Writes outside withTransaction() throw.
//  - Unique keys / CHECK constraints → AppError INVALID_STATE; stale version → VERSION_CONFLICT;
//    missing row on update / getOrThrow → NOT_FOUND.
import type {
  ApprovalChain,
  AssignableRole,
  AuditRuleCode,
  BusinessUnit,
  CoaSegment,
  DataMode,
  Halalas,
  HistoryEntityType,
  IntegrationLogStatus,
  InterfaceCode,
  JobRunStatus,
  NotificationStatus,
  ReportStatus,
} from '@expensehub/shared';
import type {
  AdvanceApplicationRow,
  AdvanceRow,
  ApprovalRuleRow,
  ApprovalStepRow,
  AuditCols,
  AuditKey,
  AuditRecordRow,
  AuditRuleRow,
  BusinessTripRow,
  CardTransactionRow,
  CoaValueRow,
  DelegationRow,
  EmployeeRow,
  ExpenseRow,
  ExpenseTypeRow,
  HistoryRow,
  IntegrationLogRow,
  IsoDate,
  IsoTimestamp,
  JobRunRow,
  MirrorCols,
  NotificationRow,
  PersonId,
  PolicyViolationRow,
  QuickPayInvoiceRow,
  QuickPayRow,
  RateRow,
  ReceiptRow,
  ReportRow,
  RoleAssignmentRow,
  SetupHistoryRow,
  SystemOptionRow,
  UserRow,
} from './entities';

// ─── Generic shapes ─────────────────────────────────────────────────────────

/** A new row: everything except audit columns and the identity column. */
export type NewEntity<T extends AuditCols, IdKey extends keyof T = never> = Omit<
  T,
  AuditKey | IdKey
>;

export interface WriteOptions {
  /** Person acting (null = system / job). Fills created_by / updated_by. */
  actorId: PersonId | null;
}

export interface UpdateOptions extends WriteOptions {
  /** Optimistic lock (API §1). Omit only for system updates. */
  expectedVersion?: number;
}

export interface EntityRepo<T extends AuditCols, K, New> {
  get(key: K): Promise<T | undefined>;
  getOrThrow(key: K): Promise<T>;
  list(): Promise<T[]>;
  insert(row: New, opts: WriteOptions): Promise<T>;
  /** Partial update; key and audit columns cannot change; bumps `version`. */
  update(key: K, patch: Partial<New>, opts: UpdateOptions): Promise<T>;
}

export interface MirrorRepo<T extends MirrorCols, K> {
  get(key: K): Promise<T | undefined>;
  list(): Promise<T[]>;
  count(): Promise<number>;
  /** Insert or replace by primary key (sync jobs only, D-07). */
  upsert(row: T): Promise<T>;
}

// ─── Mirrors ────────────────────────────────────────────────────────────────

export interface EmployeeRepo extends MirrorRepo<EmployeeRow, PersonId> {
  getByPersonNumber(personNumber: string): Promise<EmployeeRow | undefined>;
  listBySupervisor(supervisorId: PersonId): Promise<EmployeeRow[]>;
}

export interface CoaKey {
  segment: CoaSegment;
  value: string;
}
export interface CoaValueRepo extends MirrorRepo<CoaValueRow, CoaKey> {
  listBySegment(segment: CoaSegment): Promise<CoaValueRow[]>;
}

export interface BusinessTripRepo extends MirrorRepo<BusinessTripRow, number> {
  listByPerson(personId: PersonId): Promise<BusinessTripRow[]>;
}

export type NewQuickPay = Omit<QuickPayRow, 'quickPayId'>;
export interface QuickPayRepo {
  get(quickPayId: number): Promise<QuickPayRow | undefined>;
  list(): Promise<QuickPayRow[]>;
  count(): Promise<number>;
  listByPerson(personId: PersonId): Promise<QuickPayRow[]>;
  getByFusionKey(payrollActionId: number, runResultId: number): Promise<QuickPayRow | undefined>;
  /** Insert or update by (payroll_action_id, run_result_id); keeps the EH id. */
  upsertByFusionKey(row: NewQuickPay): Promise<QuickPayRow>;
}

export interface RateKey {
  fromCcy: string;
  toCcy: string;
  rateType: string;
  rateDate: IsoDate;
}
export interface RateRepo extends MirrorRepo<RateRow, RateKey> {
  /** Latest rate to SAR with rate_date ≤ onOrBefore (PRD §6). */
  findLatest(fromCcy: string, rateType: string, onOrBefore: IsoDate): Promise<RateRow | undefined>;
}

// ─── Setup and security ─────────────────────────────────────────────────────

export type NewUser = NewEntity<UserRow, 'userId'>;
export interface UserRepo extends EntityRepo<UserRow, number, NewUser> {
  getByPersonId(personId: PersonId): Promise<UserRow | undefined>;
  /** Password set/reset link lookup (the token itself is never stored). */
  getByResetTokenHash(tokenHash: string): Promise<UserRow | undefined>;
}

export type NewRoleAssignment = NewEntity<RoleAssignmentRow, 'assignmentId'>;
export interface RoleAssignmentRepo extends EntityRepo<
  RoleAssignmentRow,
  number,
  NewRoleAssignment
> {
  listByPerson(personId: PersonId): Promise<RoleAssignmentRow[]>;
  listByRole(roleCode: AssignableRole): Promise<RoleAssignmentRow[]>;
}

export type NewExpenseType = NewEntity<ExpenseTypeRow, 'typeId'>;
export interface ExpenseTypeRepo extends EntityRepo<ExpenseTypeRow, number, NewExpenseType> {
  getByCode(typeCode: string): Promise<ExpenseTypeRow | undefined>;
}

export interface OptionKey {
  optionKey: string;
  businessUnit: BusinessUnit | '*';
}
export type NewSystemOption = NewEntity<SystemOptionRow>;
export interface SystemOptionRepo extends EntityRepo<SystemOptionRow, OptionKey, NewSystemOption> {
  /** BU-specific value first, then the '*' default. */
  resolve(optionKey: string, businessUnit: BusinessUnit): Promise<SystemOptionRow | undefined>;
}

export type NewApprovalRule = NewEntity<ApprovalRuleRow, 'ruleId'>;
export interface ApprovalRuleRepo extends EntityRepo<ApprovalRuleRow, number, NewApprovalRule> {
  /** Active rules of one chain ordered by seq. */
  listActive(chainCode: ApprovalChain): Promise<ApprovalRuleRow[]>;
}

export type NewAuditRule = NewEntity<AuditRuleRow>;
export type AuditRuleRepo = EntityRepo<AuditRuleRow, AuditRuleCode, NewAuditRule>;

export type NewDelegation = NewEntity<DelegationRow, 'delegationId'>;
export interface DelegationRepo extends EntityRepo<DelegationRow, number, NewDelegation> {
  findActive(fromPersonId: PersonId, onDate: IsoDate): Promise<DelegationRow | undefined>;
}

// ─── Claims ─────────────────────────────────────────────────────────────────

export type NewReport = NewEntity<ReportRow, 'reportId'>;
export interface ReportRepo extends EntityRepo<ReportRow, number, NewReport> {
  getByNumber(reportNumber: string): Promise<ReportRow | undefined>;
  listByPerson(personId: PersonId, statuses?: ReportStatus[]): Promise<ReportRow[]>;
  listByStatus(statuses: ReportStatus[], businessUnit?: BusinessUnit): Promise<ReportRow[]>;
  /** Hard delete — a DRAFT that never got a number, after its lines are released (service checks). */
  delete(reportId: number): Promise<void>;
}

export interface DuplicateQuery {
  personId: PersonId;
  merchant: string;
  amountSar: Halalas;
  expenseDate: IsoDate;
  excludeExpenseId?: number;
}
export type NewExpense = NewEntity<ExpenseRow, 'expenseId'>;
export interface ExpenseRepo extends EntityRepo<ExpenseRow, number, NewExpense> {
  listByReport(reportId: number): Promise<ExpenseRow[]>;
  listUnreported(personId: PersonId): Promise<ExpenseRow[]>;
  /** D-23 / FR-CAP-10: same employee + merchant (case-insensitive) + amount + date. */
  findPossibleDuplicates(query: DuplicateQuery): Promise<ExpenseRow[]>;
  findByReceiptHash(sha256: string): Promise<ExpenseRow[]>;
  /** Hard delete — unreported expenses only (DRD §1; the service checks). */
  delete(expenseId: number): Promise<void>;
}

export type NewViolation = Pick<PolicyViolationRow, 'ruleCode' | 'level' | 'message'>;
export interface PolicyViolationRepo {
  listByExpense(expenseId: number): Promise<PolicyViolationRow[]>;
  /** Delete + insert (DRD: replaced on each validation while DRAFT). */
  replaceForExpense(expenseId: number, rows: NewViolation[]): Promise<PolicyViolationRow[]>;
}

export type NewReceipt = NewEntity<ReceiptRow, 'receiptId'>;
export interface ReceiptRepo extends EntityRepo<ReceiptRow, number, NewReceipt> {
  listByExpense(expenseId: number): Promise<ReceiptRow[]>;
  findBySha256(sha256: string): Promise<ReceiptRow[]>;
  listUnattached(personId: PersonId): Promise<ReceiptRow[]>;
  /** Only with its unreported expense (FR-CAP-09); the file moves to _deleted/ (TRD §9). */
  delete(receiptId: number): Promise<void>;
}

export type NewApprovalStep = NewEntity<ApprovalStepRow, 'stepId'>;
export interface ApprovalStepRepo extends EntityRepo<ApprovalStepRow, number, NewApprovalStep> {
  /** All cycles, ordered by cycle then seq. */
  listByReport(reportId: number): Promise<ApprovalStepRow[]>;
  listPendingFor(personId: PersonId): Promise<ApprovalStepRow[]>;
}

export type NewAuditRecord = NewEntity<AuditRecordRow, 'auditId'>;
export interface AuditRecordRepo extends EntityRepo<AuditRecordRow, number, NewAuditRecord> {
  getByReport(reportId: number): Promise<AuditRecordRow | undefined>;
}

// ─── Finance ────────────────────────────────────────────────────────────────

export type NewQuickPayInvoice = NewEntity<QuickPayInvoiceRow, 'qpInvoiceId'>;
export interface QuickPayInvoiceRepo extends EntityRepo<
  QuickPayInvoiceRow,
  number,
  NewQuickPayInvoice
> {
  getByQuickPay(quickPayId: number): Promise<QuickPayInvoiceRow | undefined>;
}

export type NewAdvance = NewEntity<AdvanceRow, 'advanceId'>;
export interface AdvanceRepo extends EntityRepo<AdvanceRow, number, NewAdvance> {
  listByPerson(personId: PersonId): Promise<AdvanceRow[]>;
}

export type NewAdvanceApplication = Omit<AdvanceApplicationRow, 'applicationId' | 'appliedAt'>;
export interface AdvanceApplicationRepo {
  insert(row: NewAdvanceApplication): Promise<AdvanceApplicationRow>;
  listByAdvance(advanceId: number): Promise<AdvanceApplicationRow[]>;
  listByReport(reportId: number): Promise<AdvanceApplicationRow[]>;
}

export type NewCardTransaction = Omit<CardTransactionRow, 'txnId'>;
export interface CardTransactionRepo {
  get(txnId: number): Promise<CardTransactionRow | undefined>;
  insert(row: NewCardTransaction): Promise<CardTransactionRow>;
  listByPerson(personId: PersonId): Promise<CardTransactionRow[]>;
}

// ─── History (append-only: no update, no delete — DB-05) ───────────────────

export type NewHistory = Omit<HistoryRow, 'historyId' | 'at'> & { at?: IsoTimestamp };
export interface ReportHistoryRepo {
  append(entry: NewHistory): Promise<HistoryRow>;
  listFor(entityType: HistoryEntityType, entityId: number): Promise<HistoryRow[]>;
}

export type NewSetupHistory = Omit<SetupHistoryRow, 'id' | 'at'>;
export interface SetupHistoryRepo {
  append(entry: NewSetupHistory): Promise<SetupHistoryRow>;
  /** Newest first. */
  list(filter?: {
    tableName?: string;
    rowKey?: string;
    limit?: number;
  }): Promise<SetupHistoryRow[]>;
}

// ─── Operations ─────────────────────────────────────────────────────────────

export type NewIntegrationLog = Omit<IntegrationLogRow, 'logId' | 'at'>;
export interface IntegrationLogRepo {
  insert(row: NewIntegrationLog): Promise<IntegrationLogRow>;
  update(logId: number, patch: Partial<NewIntegrationLog>): Promise<IntegrationLogRow>;
  latest(iface: InterfaceCode): Promise<IntegrationLogRow | undefined>;
  /** Newest first. */
  list(filter?: {
    interface?: InterfaceCode;
    status?: IntegrationLogStatus;
    limit?: number;
  }): Promise<IntegrationLogRow[]>;
}

export type NewJobRun = Omit<JobRunRow, 'runId'>;
export interface JobRunRepo {
  insert(row: NewJobRun): Promise<JobRunRow>;
  update(runId: number, patch: Partial<NewJobRun>): Promise<JobRunRow>;
  latest(jobName: string): Promise<JobRunRow | undefined>;
  latestWithStatus(jobName: string, status: JobRunStatus): Promise<JobRunRow | undefined>;
  /** Newest first. */
  list(limit?: number): Promise<JobRunRow[]>;
}

export type NewNotification = Omit<NotificationRow, 'notificationId' | 'createdAt'>;
export interface NotificationRepo {
  insert(row: NewNotification): Promise<NotificationRow>;
  update(notificationId: number, patch: Partial<NewNotification>): Promise<NotificationRow>;
  /** Oldest first (dispatch order). */
  listByStatus(status: NotificationStatus, limit?: number): Promise<NotificationRow[]>;
  /** Newest first (dev Mail page). */
  listRecent(limit?: number): Promise<NotificationRow[]>;
}

/** Gap-free document numbers (OQ-19): EH_DOC_SEQUENCES; rolls back with the transaction. */
export interface SequenceRepo {
  next(name: string): Promise<number>;
}

// ─── The data layer ─────────────────────────────────────────────────────────

export interface Repos {
  employees: EmployeeRepo;
  coaValues: CoaValueRepo;
  businessTrips: BusinessTripRepo;
  quickPays: QuickPayRepo;
  rates: RateRepo;
  users: UserRepo;
  roleAssignments: RoleAssignmentRepo;
  expenseTypes: ExpenseTypeRepo;
  systemOptions: SystemOptionRepo;
  approvalRules: ApprovalRuleRepo;
  auditRules: AuditRuleRepo;
  delegations: DelegationRepo;
  reports: ReportRepo;
  expenses: ExpenseRepo;
  policyViolations: PolicyViolationRepo;
  receipts: ReceiptRepo;
  approvalSteps: ApprovalStepRepo;
  audits: AuditRecordRepo;
  quickPayInvoices: QuickPayInvoiceRepo;
  advances: AdvanceRepo;
  advanceApplications: AdvanceApplicationRepo;
  cardTransactions: CardTransactionRepo;
  reportHistory: ReportHistoryRepo;
  setupHistory: SetupHistoryRepo;
  integrationLog: IntegrationLogRepo;
  jobRuns: JobRunRepo;
  notifications: NotificationRepo;
  sequences: SequenceRepo;
}

export interface DataLayer {
  readonly mode: DataMode;
  /**
   * Runs `fn` as one transaction: all of it commits or none of it does.
   * A call made while another transaction is active (same async flow) joins it.
   */
  withTransaction<T>(fn: (repos: Repos) => Promise<T>): Promise<T>;
  /** Read-only access to committed data (writes throw). */
  read<T>(fn: (repos: Repos) => Promise<T>): Promise<T>;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}
