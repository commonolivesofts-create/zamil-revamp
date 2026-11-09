// Implements: FR-SET-01 (types, rules, options), FR-SET-04 (role assignment), FR-SET-05
// (history). Every change: validate → write → history row, in one transaction.
import {
  BUSINESS_UNITS,
  type ApprovalChain,
  type ApprovalRuleCreate,
  type ApprovalRuleUpdate,
  type AuditRuleCode,
  type BusinessUnit,
  type ExpenseTypeCreate,
  type ExpenseTypeUpdate,
  type RoleAssignmentCreate,
} from '@expensehub/shared';
import type { ApprovalRuleRow, PersonId, SystemOptionRow } from '../../data/entities';
import type { DataLayer, NewExpenseType, Repos } from '../../data/ports';
import { recordSetupChange } from '../../domain/setup-history';
import { addDays, riyadhDate, type Clock } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { isCurrent, sarIn, yn } from './dto';

/** VALIDATION error shaped like a Zod failure, so the web shows it on the field. */
function fieldError(path: string, message: string): AppError {
  return new AppError('VALIDATION', message, { issues: [{ path, message }] });
}

/** A unique-key clash from the store, as a field error. */
async function friendlyUnique<T>(
  work: () => Promise<T>,
  constraint: string,
  path: string,
  message: string,
): Promise<T> {
  try {
    return await work();
  } catch (err) {
    const details =
      err instanceof AppError ? (err.details as { constraint?: string } | undefined) : undefined;
    if (details?.constraint === constraint) throw fieldError(path, message);
    throw err;
  }
}

export class SetupService {
  constructor(private readonly deps: { data: DataLayer; clock: Clock }) {}

  private today(): string {
    return riyadhDate(this.deps.clock());
  }

  // ─── Expense types ────────────────────────────────────────────────────────

  private async assertAccount(r: Repos, naturalAccount: string): Promise<void> {
    const value = await r.coaValues.get({ segment: 'ACCOUNT', value: naturalAccount });
    if (!value || value.enabled !== 'Y') {
      throw fieldError(
        'naturalAccount',
        `Account ${naturalAccount} is not an enabled value in the Fusion chart of accounts`,
      );
    }
  }

  private typeFields(
    input: ExpenseTypeUpdate | ExpenseTypeCreate,
  ): Omit<NewExpenseType, 'typeCode'> {
    return {
      name: input.name,
      nameAr: input.nameAr || null,
      category: input.category,
      naturalAccount: input.naturalAccount,
      defaultLimitSar: sarIn(input.defaultLimitSar),
      limitAction: input.limitAction,
      receiptOverSar: sarIn(input.receiptOverSar),
      justificationReq: yn(input.justificationReq),
      attendeesReq: yn(input.attendeesReq),
      vatEligible: yn(input.vatEligible),
      unit: input.unit,
      unitRateSar: input.unitRateSar === null ? null : Number(input.unitRateSar).toFixed(4),
      icon: input.icon,
      sortOrder: input.sortOrder,
      isPlaceholder: yn(input.isPlaceholder),
      active: yn(input.active),
    };
  }

  createExpenseType(input: ExpenseTypeCreate, actorId: PersonId) {
    return this.deps.data.withTransaction(async (r) => {
      await this.assertAccount(r, input.naturalAccount);
      const row = await friendlyUnique(
        () =>
          r.expenseTypes.insert(
            { typeCode: input.typeCode, ...this.typeFields(input) },
            { actorId },
          ),
        'eh_expense_types_code_uk',
        'typeCode',
        `The code ${input.typeCode} is already used`,
      );
      await recordSetupChange(r, 'EH_EXPENSE_TYPES', row.typeCode, actorId, null, row);
      return row;
    });
  }

  updateExpenseType(typeId: number, input: ExpenseTypeUpdate, actorId: PersonId) {
    return this.deps.data.withTransaction(async (r) => {
      const before = await r.expenseTypes.getOrThrow(typeId);
      await this.assertAccount(r, input.naturalAccount);
      const row = await r.expenseTypes.update(typeId, this.typeFields(input), {
        actorId,
        expectedVersion: input.version,
      });
      await recordSetupChange(r, 'EH_EXPENSE_TYPES', row.typeCode, actorId, before, row);
      return row;
    });
  }

  // ─── System options ───────────────────────────────────────────────────────

  updateOption(
    key: { optionKey: string; businessUnit: BusinessUnit | '*' },
    optionValue: string,
    version: number,
    actorId: PersonId,
  ) {
    return this.deps.data.withTransaction(async (r) => {
      const before = await r.systemOptions.getOrThrow(key);
      const problem = validateOption(before, optionValue);
      if (problem) throw fieldError('optionValue', problem);
      const row = await r.systemOptions.update(
        key,
        { optionValue },
        { actorId, expectedVersion: version },
      );
      await recordSetupChange(
        r,
        'EH_SYSTEM_OPTIONS',
        `${key.optionKey}|${key.businessUnit}`,
        actorId,
        before,
        row,
      );
      return row;
    });
  }

  // ─── Approval rules ───────────────────────────────────────────────────────

  private ruleFields(input: ApprovalRuleUpdate | ApprovalRuleCreate) {
    return {
      seq: input.seq,
      stepName: input.stepName,
      approverSource: input.approverSource,
      roleCode: input.roleCode,
      conditionType: input.conditionType,
      conditionAmountSar:
        input.conditionType === 'TOTAL_GT' ? sarIn(input.conditionAmountSar) : null,
      isAuditStep: yn(input.isAuditStep),
      active: yn(input.active),
    };
  }

  /** A chain must keep at least one step; the audit step (OQ-03) is unique and last. */
  private async assertChain(r: Repos, chainCode: ApprovalChain): Promise<void> {
    const steps: ApprovalRuleRow[] = await r.approvalRules.listActive(chainCode);
    if (steps.length === 0) throw fieldError('active', 'A chain needs at least one active step');
    const audit = steps.filter((s) => s.isAuditStep === 'Y');
    if (audit.length > 1) throw fieldError('isAuditStep', 'A chain can have only one audit step');
    if (audit.length === 1 && steps.at(-1)?.ruleId !== audit[0]?.ruleId) {
      throw fieldError('isAuditStep', 'The audit step must be the last step of the chain');
    }
  }

  createApprovalRule(input: ApprovalRuleCreate, actorId: PersonId) {
    return this.deps.data.withTransaction(async (r) => {
      const row = await friendlyUnique(
        () =>
          r.approvalRules.insert(
            { chainCode: input.chainCode, ...this.ruleFields(input) },
            { actorId },
          ),
        'eh_approval_rules_seq_uk',
        'seq',
        `Step ${input.seq} already exists in this chain`,
      );
      await this.assertChain(r, row.chainCode);
      await recordSetupChange(
        r,
        'EH_APPROVAL_RULES',
        `${row.chainCode}|${row.ruleId}`,
        actorId,
        null,
        row,
      );
      return row;
    });
  }

  updateApprovalRule(ruleId: number, input: ApprovalRuleUpdate, actorId: PersonId) {
    return this.deps.data.withTransaction(async (r) => {
      const before = await r.approvalRules.getOrThrow(ruleId);
      const row = await friendlyUnique(
        () =>
          r.approvalRules.update(ruleId, this.ruleFields(input), {
            actorId,
            expectedVersion: input.version,
          }),
        'eh_approval_rules_seq_uk',
        'seq',
        `Step ${input.seq} already exists in this chain`,
      );
      await this.assertChain(r, row.chainCode);
      await recordSetupChange(
        r,
        'EH_APPROVAL_RULES',
        `${row.chainCode}|${row.ruleId}`,
        actorId,
        before,
        row,
      );
      return row;
    });
  }

  // ─── Audit rules ──────────────────────────────────────────────────────────

  updateAuditRule(
    code: AuditRuleCode,
    input: { paramNumber: number | null; active: boolean; version: number },
    actorId: PersonId,
  ) {
    return this.deps.data.withTransaction(async (r) => {
      const before = await r.auditRules.getOrThrow(code);
      if (code === 'TOTAL_GT' && (input.paramNumber === null || input.paramNumber < 0)) {
        throw fieldError('paramNumber', 'Enter the report total above which a report is audited');
      }
      if (code === 'RANDOM_PCT' && (input.paramNumber === null || input.paramNumber > 100)) {
        throw fieldError('paramNumber', 'Enter a percentage between 0 and 100');
      }
      if (code !== 'TOTAL_GT' && code !== 'RANDOM_PCT' && input.paramNumber !== null) {
        throw fieldError('paramNumber', 'This rule has no parameter');
      }
      // Amounts and percentages keep at most 2 decimals (NUMBER(14,2)).
      const paramNumber =
        input.paramNumber === null ? null : Math.round(input.paramNumber * 100) / 100;
      const row = await r.auditRules.update(
        code,
        { paramNumber, active: yn(input.active) },
        { actorId, expectedVersion: input.version },
      );
      await recordSetupChange(r, 'EH_AUDIT_RULES', code, actorId, before, row);
      return row;
    });
  }

  // ─── Role assignments (FR-SET-04, OQ-02 proposal) ─────────────────────────

  /** SoD: nobody grants or removes their own roles. */
  private assertNotSelf(actorId: PersonId, personId: PersonId): void {
    if (actorId === personId) {
      throw new AppError(
        'SOD_VIOLATION',
        'You cannot change your own roles. Ask another administrator.',
      );
    }
  }

  createRoleAssignment(input: RoleAssignmentCreate, actorId: PersonId) {
    this.assertNotSelf(actorId, input.personId);
    return this.deps.data.withTransaction(async (r) => {
      const employee = await r.employees.get(input.personId);
      if (!employee || employee.active !== 'Y')
        throw fieldError('personId', 'Choose an active employee');

      const existing = (await r.roleAssignments.listByPerson(input.personId)).find(
        (a) => a.roleCode === input.roleCode && a.businessUnit === input.businessUnit,
      );
      const fields = {
        isBackup: yn(input.isBackup),
        startDate: input.startDate,
        endDate: input.endDate,
      };
      if (existing) {
        if (existing.endDate === null || existing.endDate >= this.today()) {
          throw fieldError(
            'roleCode',
            `${employee.fullName} already holds this role for ${input.businessUnit ?? 'all BUs'}`,
          );
        }
        // An ended assignment is re-opened (unique key person + role + BU).
        const row = await r.roleAssignments.update(existing.assignmentId, fields, {
          actorId,
          expectedVersion: existing.version,
        });
        await recordSetupChange(
          r,
          'EH_ROLE_ASSIGNMENTS',
          String(row.assignmentId),
          actorId,
          existing,
          row,
        );
        return row;
      }
      const row = await r.roleAssignments.insert(
        {
          personId: input.personId,
          roleCode: input.roleCode,
          businessUnit: input.businessUnit,
          ...fields,
        },
        { actorId },
      );
      await recordSetupChange(
        r,
        'EH_ROLE_ASSIGNMENTS',
        String(row.assignmentId),
        actorId,
        null,
        row,
      );
      return row;
    });
  }

  /** Soft delete (DRD §1): the assignment ends yesterday, so it no longer applies today. */
  endRoleAssignment(assignmentId: number, actorId: PersonId) {
    return this.deps.data.withTransaction(async (r) => {
      const before = await r.roleAssignments.getOrThrow(assignmentId);
      this.assertNotSelf(actorId, before.personId);
      const today = this.today();
      if (!isCurrent(before, today) && before.startDate <= today) {
        throw new AppError('INVALID_STATE', 'This assignment has already ended.');
      }
      // No "last administrator" check needed: the SoD rule above means the person ending an
      // admin role is always another current administrator.
      const yesterday = addDays(today, -1);
      const row = await r.roleAssignments.update(
        assignmentId,
        {
          endDate: yesterday,
          // Never in force yet → it simply never applies.
          startDate: before.startDate > yesterday ? yesterday : before.startDate,
        },
        { actorId, expectedVersion: before.version },
      );
      await recordSetupChange(r, 'EH_ROLE_ASSIGNMENTS', String(assignmentId), actorId, before, row);
      return row;
    });
  }
}

// ─── Option validation (FR-SET-01) ──────────────────────────────────────────

const ACCOUNT_COMBINATION = /^[A-Z]{3}\.\d{3}\.\d{3}\.\d{5}\.\d{3}\.\d{6}$/;

function wholeNumber(value: string, min: number, max: number): string | null {
  const n = Number(value);
  return /^\d+$/.test(value) && n >= min && n <= max
    ? null
    : `Enter a whole number from ${min} to ${max}`;
}

/** Per-key rules first, then the generic check for the value type. */
export function validateOption(row: SystemOptionRow, value: string): string | null {
  switch (row.optionKey) {
    case 'VAT_RATE':
      return /^\d{1,2}(\.\d{1,2})?$/.test(value) ? null : 'Enter a percentage such as 15';
    case 'CEO_THRESHOLD_SAR':
      return /^\d{1,12}(\.\d{1,2})?$/.test(value) ? null : 'Enter an amount in SAR such as 5000';
    case 'RATE_STALE_DAYS':
      return wholeNumber(value, 0, 60);
    case 'REMINDER_DAYS':
    case 'ESCALATION_DAYS':
      return wholeNumber(value, 1, 30);
    case 'TRIP_DATE_TOLERANCE_DAYS':
      return wholeNumber(value, 0, 14);
    case 'FUSION_INVOICE_DFF': {
      try {
        const parsed: unknown = JSON.parse(value);
        return parsed &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed) &&
          Object.values(parsed).every((v) => typeof v === 'string')
          ? null
          : 'Enter field names and texts, e.g. {"rirNumber":"{invoiceNumber}"}';
      } catch {
        return 'Enter field names and texts, e.g. {"rirNumber":"{invoiceNumber}"}';
      }
    }
    case 'APPROVAL_MAX_LEVELS':
      return wholeNumber(value, 0, 15);
    case 'TRIP_DESTINATION_FIELD':
      // D-46: one or more columns of EH_HCM_BUSINESS_TRIPS, e.g. ATTRIBUTE3,ATTRIBUTE2.
      return /^[A-Za-z][A-Za-z0-9_]{0,29}(\s*,\s*[A-Za-z][A-Za-z0-9_]{0,29})*$/.test(value)
        ? null
        : 'Enter report column names such as ATTRIBUTE3,ATTRIBUTE2';
    case 'INVOICE_SEND_MODE':
      return value === 'MANUAL' || value === 'AUTO' ? null : 'Choose MANUAL or AUTO';
    case 'TRIP_ABSENCE_TYPES':
    case 'QUICKPAY_ELEMENTS': {
      try {
        const parsed: unknown = JSON.parse(value);
        return Array.isArray(parsed) && parsed.every((v) => typeof v === 'string' && v.trim())
          ? null
          : 'Enter a list of names, e.g. ["Business Trip"]';
      } catch {
        return 'Enter a list of names, e.g. ["Business Trip"]';
      }
    }
  }
  if (row.optionKey.startsWith('ACCT_')) {
    if (!ACCOUNT_COMBINATION.test(value))
      return 'Enter a 6-segment account, e.g. IPP.001.110.21510.000.000000';
    if (row.businessUnit !== '*' && !value.startsWith(`${row.businessUnit}.`)) {
      return `The company segment must be ${row.businessUnit} for this business unit`;
    }
    if (!BUSINESS_UNITS.includes(value.slice(0, 3) as BusinessUnit))
      return 'Unknown company segment';
    return null;
  }
  switch (row.valueType) {
    case 'NUMBER':
      return value !== '' && Number.isFinite(Number(value)) ? null : 'Enter a number';
    case 'BOOL':
      return value === 'Y' || value === 'N' ? null : 'Choose Y or N';
    case 'JSON':
      try {
        JSON.parse(value);
        return null;
      } catch {
        return 'Enter valid JSON';
      }
    default:
      return value.trim() === '' ? 'Enter a value' : null;
  }
}
