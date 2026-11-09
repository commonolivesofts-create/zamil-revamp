// Memory implementations of every repository in ports.ts, bound to one transaction context.
import type {
  ApprovalChain,
  AssignableRole,
  AuditRuleCode,
  BusinessUnit,
  CoaSegment,
  HistoryEntityType,
  IntegrationLogStatus,
  InterfaceCode,
  JobRunStatus,
  NotificationStatus,
  ReportStatus,
} from '@expensehub/shared';
import { AppError } from '../../lib/errors';
import type {
  AdvanceApplicationRow,
  AdvanceRow,
  ApprovalRuleRow,
  ApprovalStepRow,
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
  JobRunRow,
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
} from '../entities';
import type {
  AdvanceApplicationRepo,
  AdvanceRepo,
  ApprovalRuleRepo,
  ApprovalStepRepo,
  AuditRecordRepo,
  AuditRuleRepo,
  BusinessTripRepo,
  CardTransactionRepo,
  CoaKey,
  CoaValueRepo,
  DelegationRepo,
  DuplicateQuery,
  EmployeeRepo,
  ExpenseRepo,
  ExpenseTypeRepo,
  IntegrationLogRepo,
  JobRunRepo,
  NewAdvance,
  NewAdvanceApplication,
  NewApprovalRule,
  NewApprovalStep,
  NewAuditRecord,
  NewAuditRule,
  NewCardTransaction,
  NewDelegation,
  NewExpense,
  NewExpenseType,
  NewHistory,
  NewIntegrationLog,
  NewJobRun,
  NewNotification,
  NewQuickPay,
  NewQuickPayInvoice,
  NewReceipt,
  NewReport,
  NewRoleAssignment,
  NewSetupHistory,
  NewSystemOption,
  NewUser,
  NewViolation,
  NotificationRepo,
  OptionKey,
  PolicyViolationRepo,
  QuickPayInvoiceRepo,
  QuickPayRepo,
  RateKey,
  RateRepo,
  ReceiptRepo,
  ReportHistoryRepo,
  ReportRepo,
  Repos,
  RoleAssignmentRepo,
  SequenceRepo,
  SetupHistoryRepo,
  SystemOptionRepo,
  UserRepo,
} from '../ports';
import { MemoryEntityRepo, MemoryMirrorRepo, withoutUndefined } from './base';
import { MemoryTable, key, nextSequence, type TxContext } from './table';

const byNumber =
  <T>(pick: (row: T) => number) =>
  (a: T, b: T) =>
    pick(a) - pick(b);

const inDateRange = (on: IsoDate, from: IsoDate | null, to: IsoDate | null) =>
  (from === null || from <= on) && (to === null || on <= to);

// ─── Mirrors ────────────────────────────────────────────────────────────────

class Employees extends MemoryMirrorRepo<EmployeeRow, PersonId> implements EmployeeRepo {
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'employees',
        key: (r) => key(r.personId),
        unique: [{ name: 'eh_employees_number_uk', key: (r) => r.personNumber }],
        checks: [
          {
            name: 'eh_employees_bu_ck',
            test: (r) => ['IPP', 'FPP', 'APP'].includes(r.businessUnit),
          },
        ],
      },
      (id) => key(id),
    );
  }
  async getByPersonNumber(personNumber: string) {
    return this.table.find((r) => r.personNumber === personNumber);
  }
  async listBySupervisor(supervisorId: PersonId) {
    return this.table.filter((r) => r.supervisorId === supervisorId);
  }
}

class CoaValues extends MemoryMirrorRepo<CoaValueRow, CoaKey> implements CoaValueRepo {
  constructor(ctx: TxContext) {
    super(ctx, { name: 'coaValues', key: (r) => key(r.segment, r.value) }, (k) =>
      key(k.segment, k.value),
    );
  }
  async listBySegment(segment: CoaSegment) {
    return this.table
      .filter((r) => r.segment === segment)
      .sort((a, b) => a.value.localeCompare(b.value));
  }
}

class BusinessTrips extends MemoryMirrorRepo<BusinessTripRow, number> implements BusinessTripRepo {
  constructor(ctx: TxContext) {
    super(ctx, { name: 'businessTrips', key: (r) => key(r.tripId) }, (id) => key(id));
  }
  async listByPerson(personId: PersonId) {
    return this.table
      .filter((r) => r.personId === personId)
      .sort((a, b) => b.startDate.localeCompare(a.startDate));
  }
}

class QuickPays implements QuickPayRepo {
  private readonly table: MemoryTable<QuickPayRow>;
  constructor(ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'quickPays',
      key: (r) => key(r.quickPayId),
      identity: 'quickPayId',
      unique: [
        { name: 'eh_quick_pays_fusion_uk', key: (r) => key(r.payrollActionId, r.runResultId) },
      ],
    });
  }
  async get(quickPayId: number) {
    return this.table.get(key(quickPayId));
  }
  async list() {
    return this.table.all();
  }
  async count() {
    return this.table.count();
  }
  async listByPerson(personId: PersonId) {
    return this.table.filter((r) => r.personId === personId);
  }
  async getByFusionKey(payrollActionId: number, runResultId: number) {
    return this.table.find(
      (r) => r.payrollActionId === payrollActionId && r.runResultId === runResultId,
    );
  }
  async upsertByFusionKey(row: NewQuickPay) {
    const existing = await this.getByFusionKey(row.payrollActionId, row.runResultId);
    if (!existing) return this.table.insert(row as QuickPayRow);
    return this.table.replace(key(existing.quickPayId), {
      ...row,
      quickPayId: existing.quickPayId,
    });
  }
}

class Rates extends MemoryMirrorRepo<RateRow, RateKey> implements RateRepo {
  constructor(ctx: TxContext) {
    super(
      ctx,
      { name: 'rates', key: (r) => key(r.fromCcy, r.toCcy, r.rateType, r.rateDate) },
      (k) => key(k.fromCcy, k.toCcy, k.rateType, k.rateDate),
    );
  }
  async findLatest(fromCcy: string, rateType: string, onOrBefore: IsoDate) {
    return this.table
      .filter(
        (r) =>
          r.fromCcy === fromCcy &&
          r.toCcy === 'SAR' &&
          r.rateType === rateType &&
          r.rateDate <= onOrBefore,
      )
      .sort((a, b) => b.rateDate.localeCompare(a.rateDate))[0];
  }
}

// ─── Setup and security ─────────────────────────────────────────────────────

class Users extends MemoryEntityRepo<UserRow, number, NewUser> implements UserRepo {
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'users',
        key: (r) => key(r.userId),
        identity: 'userId',
        unique: [{ name: 'eh_users_person_uk', key: (r) => key(r.personId) }],
      },
      (id) => key(id),
      'User',
    );
  }
  async getByPersonId(personId: PersonId) {
    return this.table.find((r) => r.personId === personId);
  }
  async getByResetTokenHash(tokenHash: string) {
    return this.table.find((r) => r.resetTokenHash === tokenHash);
  }
}

class RoleAssignments
  extends MemoryEntityRepo<RoleAssignmentRow, number, NewRoleAssignment>
  implements RoleAssignmentRepo
{
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'roleAssignments',
        key: (r) => key(r.assignmentId),
        identity: 'assignmentId',
        unique: [
          {
            name: 'eh_role_assignments_uk',
            key: (r) => key(r.personId, r.roleCode, r.businessUnit ?? '*'),
          },
        ],
      },
      (id) => key(id),
      'Role assignment',
    );
  }
  async listByPerson(personId: PersonId) {
    return this.table.filter((r) => r.personId === personId);
  }
  async listByRole(roleCode: AssignableRole) {
    return this.table.filter((r) => r.roleCode === roleCode);
  }
}

class ExpenseTypes
  extends MemoryEntityRepo<ExpenseTypeRow, number, NewExpenseType>
  implements ExpenseTypeRepo
{
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'expenseTypes',
        key: (r) => key(r.typeId),
        identity: 'typeId',
        unique: [{ name: 'eh_expense_types_code_uk', key: (r) => r.typeCode }],
      },
      (id) => key(id),
      'Expense type',
    );
  }
  override async list() {
    return (await super.list()).sort(byNumber((r) => r.sortOrder));
  }
  async getByCode(typeCode: string) {
    return this.table.find((r) => r.typeCode === typeCode);
  }
}

class SystemOptions
  extends MemoryEntityRepo<SystemOptionRow, OptionKey, NewSystemOption>
  implements SystemOptionRepo
{
  constructor(ctx: TxContext) {
    super(
      ctx,
      { name: 'systemOptions', key: (r) => key(r.optionKey, r.businessUnit) },
      (k) => key(k.optionKey, k.businessUnit),
      'System option',
    );
  }
  async resolve(optionKey: string, businessUnit: BusinessUnit) {
    return this.table.get(key(optionKey, businessUnit)) ?? this.table.get(key(optionKey, '*'));
  }
}

class ApprovalRules
  extends MemoryEntityRepo<ApprovalRuleRow, number, NewApprovalRule>
  implements ApprovalRuleRepo
{
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'approvalRules',
        key: (r) => key(r.ruleId),
        identity: 'ruleId',
        unique: [{ name: 'eh_approval_rules_seq_uk', key: (r) => key(r.chainCode, r.seq) }],
        checks: [
          {
            name: 'eh_approval_rules_role_ck',
            test: (r) => (r.approverSource === 'ROLE') === (r.roleCode !== null),
          },
        ],
      },
      (id) => key(id),
      'Approval rule',
    );
  }
  async listActive(chainCode: ApprovalChain) {
    return this.table
      .filter((r) => r.chainCode === chainCode && r.active === 'Y')
      .sort(byNumber((r) => r.seq));
  }
}

class AuditRules
  extends MemoryEntityRepo<AuditRuleRow, AuditRuleCode, NewAuditRule>
  implements AuditRuleRepo
{
  constructor(ctx: TxContext) {
    super(ctx, { name: 'auditRules', key: (r) => r.ruleCode }, (code) => code, 'Audit rule');
  }
}

class Delegations
  extends MemoryEntityRepo<DelegationRow, number, NewDelegation>
  implements DelegationRepo
{
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'delegations',
        key: (r) => key(r.delegationId),
        identity: 'delegationId',
        checks: [
          { name: 'eh_delegations_self_ck', test: (r) => r.fromPersonId !== r.toPersonId },
          { name: 'eh_delegations_dates_ck', test: (r) => r.startDate <= r.endDate },
        ],
      },
      (id) => key(id),
      'Delegation',
    );
  }
  async findActive(fromPersonId: PersonId, onDate: IsoDate) {
    return this.table.find(
      (r) =>
        r.fromPersonId === fromPersonId &&
        r.active === 'Y' &&
        inDateRange(onDate, r.startDate, r.endDate),
    );
  }
}

// ─── Claims ─────────────────────────────────────────────────────────────────

class Reports extends MemoryEntityRepo<ReportRow, number, NewReport> implements ReportRepo {
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'reports',
        key: (r) => key(r.reportId),
        identity: 'reportId',
        unique: [
          { name: 'eh_reports_number_uk', key: (r) => r.reportNumber },
          // DB-07: one invoice per report.
          { name: 'eh_reports_invoice_num_uk', key: (r) => r.fusionInvoiceNum },
        ],
        checks: [{ name: 'eh_reports_net_ck', test: (r) => r.netPayableSar >= 0 }],
      },
      (id) => key(id),
      'Report',
    );
  }
  async getByNumber(reportNumber: string) {
    return this.table.find((r) => r.reportNumber === reportNumber);
  }
  async delete(reportId: number) {
    this.table.remove(key(reportId));
  }
  async listByPerson(personId: PersonId, statuses?: ReportStatus[]) {
    return this.table
      .filter((r) => r.personId === personId && (!statuses || statuses.includes(r.status)))
      .sort(byNumber((r) => -r.reportId));
  }
  async listByStatus(statuses: ReportStatus[], businessUnit?: BusinessUnit) {
    return this.table
      .filter(
        (r) => statuses.includes(r.status) && (!businessUnit || r.businessUnit === businessUnit),
      )
      .sort(byNumber((r) => r.reportId));
  }
}

class Expenses extends MemoryEntityRepo<ExpenseRow, number, NewExpense> implements ExpenseRepo {
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'expenses',
        key: (r) => key(r.expenseId),
        identity: 'expenseId',
        checks: [
          {
            name: 'eh_expenses_approved_ck',
            test: (r) => r.approvedAmountSar >= 0 && r.approvedAmountSar <= r.amountSar,
          },
        ],
      },
      (id) => key(id),
      'Expense',
    );
  }
  async listByReport(reportId: number) {
    return this.table
      .filter((r) => r.reportId === reportId)
      .sort(byNumber((r) => r.lineNo ?? r.expenseId));
  }
  async listUnreported(personId: PersonId) {
    return this.table
      .filter((r) => r.personId === personId && r.reportId === null)
      .sort((a, b) => b.expenseDate.localeCompare(a.expenseDate));
  }
  async findPossibleDuplicates(q: DuplicateQuery) {
    const merchant = q.merchant.trim().toLowerCase();
    return this.table.filter(
      (r) =>
        r.personId === q.personId &&
        r.expenseId !== q.excludeExpenseId &&
        (r.merchant ?? '').trim().toLowerCase() === merchant &&
        r.amountSar === q.amountSar &&
        r.expenseDate === q.expenseDate,
    );
  }
  async findByReceiptHash(sha256: string) {
    return this.table.filter((r) => r.receiptHash === sha256);
  }
  async delete(expenseId: number) {
    this.table.remove(key(expenseId));
  }
}

class PolicyViolations implements PolicyViolationRepo {
  private readonly table: MemoryTable<PolicyViolationRow>;
  constructor(private readonly ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'policyViolations',
      key: (r) => key(r.violationId),
      identity: 'violationId',
    });
  }
  async listByExpense(expenseId: number) {
    return this.table.filter((r) => r.expenseId === expenseId).sort(byNumber((r) => r.violationId));
  }
  async replaceForExpense(expenseId: number, rows: NewViolation[]) {
    for (const old of this.table.filter((r) => r.expenseId === expenseId)) {
      this.table.remove(key(old.violationId));
    }
    const createdAt = this.ctx.now();
    return rows.map((row) =>
      this.table.insert({ ...row, expenseId, createdAt } as PolicyViolationRow),
    );
  }
}

class Receipts extends MemoryEntityRepo<ReceiptRow, number, NewReceipt> implements ReceiptRepo {
  constructor(ctx: TxContext) {
    super(
      ctx,
      { name: 'receipts', key: (r) => key(r.receiptId), identity: 'receiptId' },
      (id) => key(id),
      'Receipt',
    );
  }
  async listByExpense(expenseId: number) {
    return this.table.filter((r) => r.expenseId === expenseId);
  }
  async findBySha256(sha256: string) {
    return this.table.filter((r) => r.sha256 === sha256);
  }
  async listUnattached(personId: PersonId) {
    return this.table.filter((r) => r.personId === personId && r.expenseId === null);
  }
  async delete(receiptId: number) {
    this.table.remove(key(receiptId));
  }
}

class ApprovalSteps
  extends MemoryEntityRepo<ApprovalStepRow, number, NewApprovalStep>
  implements ApprovalStepRepo
{
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'approvalSteps',
        key: (r) => key(r.stepId),
        identity: 'stepId',
        unique: [
          { name: 'eh_approval_steps_seq_uk', key: (r) => key(r.reportId, r.cycleNo, r.seq) },
        ],
        checks: [
          {
            name: 'eh_approval_steps_reason_ck',
            test: (r) => r.status !== 'REJECTED' || r.commentText !== null,
          },
        ],
      },
      (id) => key(id),
      'Approval step',
    );
  }
  async listByReport(reportId: number) {
    return this.table
      .filter((r) => r.reportId === reportId)
      .sort((a, b) => a.cycleNo - b.cycleNo || a.seq - b.seq);
  }
  async listPendingFor(personId: PersonId) {
    return this.table
      .filter((r) => r.assignedTo === personId && r.status === 'PENDING')
      .sort((a, b) => (a.pendingSince ?? '').localeCompare(b.pendingSince ?? ''));
  }
}

class Audits
  extends MemoryEntityRepo<AuditRecordRow, number, NewAuditRecord>
  implements AuditRecordRepo
{
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'audits',
        key: (r) => key(r.auditId),
        identity: 'auditId',
        unique: [{ name: 'eh_audit_report_uk', key: (r) => key(r.reportId) }],
      },
      (id) => key(id),
      'Audit',
    );
  }
  async getByReport(reportId: number) {
    return this.table.find((r) => r.reportId === reportId);
  }
}

// ─── Finance ────────────────────────────────────────────────────────────────

class QuickPayInvoices
  extends MemoryEntityRepo<QuickPayInvoiceRow, number, NewQuickPayInvoice>
  implements QuickPayInvoiceRepo
{
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'quickPayInvoices',
        key: (r) => key(r.qpInvoiceId),
        identity: 'qpInvoiceId',
        unique: [
          // DB-09: a Quick Pay is invoiced once.
          { name: 'eh_qp_invoices_qp_uk', key: (r) => key(r.quickPayId) },
          { name: 'eh_qp_invoices_number_uk', key: (r) => r.invoiceNumber },
        ],
        checks: [
          {
            name: 'eh_qp_invoices_reason_ck',
            test: (r) => r.status !== 'EXCLUDED' || r.excludedReason !== null,
          },
        ],
      },
      (id) => key(id),
      'Quick Pay invoice',
    );
  }
  async getByQuickPay(quickPayId: number) {
    return this.table.find((r) => r.quickPayId === quickPayId);
  }
}

class Advances extends MemoryEntityRepo<AdvanceRow, number, NewAdvance> implements AdvanceRepo {
  constructor(ctx: TxContext) {
    super(
      ctx,
      {
        name: 'advances',
        key: (r) => key(r.advanceId),
        identity: 'advanceId',
        unique: [{ name: 'eh_advances_number_uk', key: (r) => r.advanceNumber }],
        // DB-08: applied + refunded never exceeds the advance.
        checks: [
          {
            name: 'eh_advances_balance_ck',
            test: (r) => r.appliedSar + r.refundedSar <= r.amountSar,
          },
          { name: 'eh_advances_amount_ck', test: (r) => r.amountSar > 0 },
        ],
      },
      (id) => key(id),
      'Advance',
    );
  }
  async listByPerson(personId: PersonId) {
    return this.table.filter((r) => r.personId === personId).sort(byNumber((r) => r.advanceId));
  }
}

class AdvanceApplications implements AdvanceApplicationRepo {
  private readonly table: MemoryTable<AdvanceApplicationRow>;
  constructor(private readonly ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'advanceApplications',
      key: (r) => key(r.applicationId),
      identity: 'applicationId',
      checks: [{ name: 'eh_adv_app_amount_ck', test: (r) => r.amountSar > 0 }],
    });
  }
  async insert(row: NewAdvanceApplication) {
    return this.table.insert({ ...row, appliedAt: this.ctx.now() } as AdvanceApplicationRow);
  }
  async listByAdvance(advanceId: number) {
    return this.table.filter((r) => r.advanceId === advanceId);
  }
  async listByReport(reportId: number) {
    return this.table.filter((r) => r.reportId === reportId);
  }
}

class CardTransactions implements CardTransactionRepo {
  private readonly table: MemoryTable<CardTransactionRow>;
  constructor(ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'cardTransactions',
      key: (r) => key(r.txnId),
      identity: 'txnId',
      unique: [{ name: 'eh_card_txn_file_uk', key: (r) => key(r.fileName, r.fileLine) }],
      checks: [{ name: 'eh_card_txn_last4_ck', test: (r) => /^\d{4}$/.test(r.cardLast4) }],
    });
  }
  async get(txnId: number) {
    return this.table.get(key(txnId));
  }
  async insert(row: NewCardTransaction) {
    return this.table.insert(row as CardTransactionRow);
  }
  async listByPerson(personId: PersonId) {
    return this.table.filter((r) => r.personId === personId);
  }
}

// ─── History (append-only) ──────────────────────────────────────────────────

class ReportHistory implements ReportHistoryRepo {
  private readonly table: MemoryTable<HistoryRow>;
  constructor(private readonly ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'reportHistory',
      key: (r) => key(r.historyId),
      identity: 'historyId',
    });
  }
  async append(entry: NewHistory) {
    return this.table.insert({ ...entry, at: entry.at ?? this.ctx.now() } as HistoryRow);
  }
  async listFor(entityType: HistoryEntityType, entityId: number) {
    return this.table
      .filter((r) => r.entityType === entityType && r.entityId === entityId)
      .sort(byNumber((r) => r.historyId));
  }
}

class SetupHistory implements SetupHistoryRepo {
  private readonly table: MemoryTable<SetupHistoryRow>;
  constructor(private readonly ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'setupHistory',
      key: (r) => key(r.id),
      identity: 'id',
    });
  }
  async append(entry: NewSetupHistory) {
    return this.table.insert({ ...entry, at: this.ctx.now() } as SetupHistoryRow);
  }
  async list(filter: { tableName?: string; rowKey?: string; limit?: number } = {}) {
    return this.table
      .filter(
        (r) =>
          (!filter.tableName || r.tableName === filter.tableName) &&
          (!filter.rowKey || r.rowKey === filter.rowKey),
      )
      .sort(byNumber((r) => -r.id))
      .slice(0, filter.limit ?? 200);
  }
}

// ─── Operations ─────────────────────────────────────────────────────────────

class IntegrationLog implements IntegrationLogRepo {
  private readonly table: MemoryTable<IntegrationLogRow>;
  constructor(private readonly ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'integrationLog',
      key: (r) => key(r.logId),
      identity: 'logId',
    });
  }
  async insert(row: NewIntegrationLog) {
    return this.table.insert({ ...row, at: this.ctx.now() } as IntegrationLogRow);
  }
  async update(logId: number, patch: Partial<NewIntegrationLog>) {
    const current = this.table.get(key(logId));
    if (!current) throw new AppError('NOT_FOUND', 'Integration log entry not found');
    return this.table.replace(key(logId), { ...current, ...withoutUndefined(patch) });
  }
  async latest(iface: InterfaceCode) {
    return this.table.filter((r) => r.interface === iface).sort(byNumber((r) => -r.logId))[0];
  }
  async list(
    filter: { interface?: InterfaceCode; status?: IntegrationLogStatus; limit?: number } = {},
  ) {
    return this.table
      .filter(
        (r) =>
          (!filter.interface || r.interface === filter.interface) &&
          (!filter.status || r.status === filter.status),
      )
      .sort(byNumber((r) => -r.logId))
      .slice(0, filter.limit ?? 200);
  }
}

class JobRuns implements JobRunRepo {
  private readonly table: MemoryTable<JobRunRow>;
  constructor(ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'jobRuns',
      key: (r) => key(r.runId),
      identity: 'runId',
    });
  }
  async insert(row: NewJobRun) {
    return this.table.insert(row as JobRunRow);
  }
  async update(runId: number, patch: Partial<NewJobRun>) {
    const current = this.table.get(key(runId));
    if (!current) throw new AppError('NOT_FOUND', 'Job run not found');
    return this.table.replace(key(runId), { ...current, ...withoutUndefined(patch) });
  }
  async latest(jobName: string) {
    return this.table.filter((r) => r.jobName === jobName).sort(byNumber((r) => -r.runId))[0];
  }
  async latestWithStatus(jobName: string, status: JobRunStatus) {
    return this.table
      .filter((r) => r.jobName === jobName && r.status === status)
      .sort(byNumber((r) => -r.runId))[0];
  }
  async list(limit = 100) {
    return this.table
      .all()
      .sort(byNumber((r) => -r.runId))
      .slice(0, limit);
  }
}

class Notifications implements NotificationRepo {
  private readonly table: MemoryTable<NotificationRow>;
  constructor(private readonly ctx: TxContext) {
    this.table = new MemoryTable(ctx, {
      name: 'notifications',
      key: (r) => key(r.notificationId),
      identity: 'notificationId',
    });
  }
  async insert(row: NewNotification) {
    return this.table.insert({ ...row, createdAt: this.ctx.now() } as NotificationRow);
  }
  async update(notificationId: number, patch: Partial<NewNotification>) {
    const current = this.table.get(key(notificationId));
    if (!current) throw new AppError('NOT_FOUND', 'Notification not found');
    return this.table.replace(key(notificationId), { ...current, ...withoutUndefined(patch) });
  }
  async listByStatus(status: NotificationStatus, limit = 50) {
    return this.table
      .filter((r) => r.status === status)
      .sort(byNumber((r) => r.notificationId))
      .slice(0, limit);
  }
  async listRecent(limit = 100) {
    return this.table
      .all()
      .sort(byNumber((r) => -r.notificationId))
      .slice(0, limit);
  }
}

class Sequences implements SequenceRepo {
  constructor(private readonly ctx: TxContext) {}
  async next(name: string) {
    return nextSequence(this.ctx, `doc:${name}`);
  }
}

export function createMemoryRepos(ctx: TxContext): Repos {
  return {
    employees: new Employees(ctx),
    coaValues: new CoaValues(ctx),
    businessTrips: new BusinessTrips(ctx),
    quickPays: new QuickPays(ctx),
    rates: new Rates(ctx),
    users: new Users(ctx),
    roleAssignments: new RoleAssignments(ctx),
    expenseTypes: new ExpenseTypes(ctx),
    systemOptions: new SystemOptions(ctx),
    approvalRules: new ApprovalRules(ctx),
    auditRules: new AuditRules(ctx),
    delegations: new Delegations(ctx),
    reports: new Reports(ctx),
    expenses: new Expenses(ctx),
    policyViolations: new PolicyViolations(ctx),
    receipts: new Receipts(ctx),
    approvalSteps: new ApprovalSteps(ctx),
    audits: new Audits(ctx),
    quickPayInvoices: new QuickPayInvoices(ctx),
    advances: new Advances(ctx),
    advanceApplications: new AdvanceApplications(ctx),
    cardTransactions: new CardTransactions(ctx),
    reportHistory: new ReportHistory(ctx),
    setupHistory: new SetupHistory(ctx),
    integrationLog: new IntegrationLog(ctx),
    jobRuns: new JobRuns(ctx),
    notifications: new Notifications(ctx),
    sequences: new Sequences(ctx),
  };
}
