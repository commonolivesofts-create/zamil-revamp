// Row ↔ API mapping for setup tables: money as 2-decimal strings (API §1), flags as booleans.
import {
  formatSar,
  parseSar,
  type ApprovalRuleDto,
  type AuditRuleDto,
  type ExpenseTypeDto,
  type Halalas,
  type RoleAssignmentDto,
  type SystemOptionDto,
} from '@expensehub/shared';
import type {
  ApprovalRuleRow,
  AuditRuleRow,
  EmployeeRow,
  ExpenseTypeRow,
  RoleAssignmentRow,
  SystemOptionRow,
  YN,
} from '../../data/entities';

export const yn = (value: boolean): YN => (value ? 'Y' : 'N');
export const bool = (value: YN): boolean => value === 'Y';
export const sarOut = (value: Halalas | null): string | null =>
  value === null ? null : formatSar(value);
export const sarIn = (value: string | null): Halalas | null =>
  value === null ? null : parseSar(value);

export function expenseTypeDto(row: ExpenseTypeRow): ExpenseTypeDto {
  return {
    typeId: row.typeId,
    typeCode: row.typeCode,
    name: row.name,
    nameAr: row.nameAr,
    category: row.category,
    naturalAccount: row.naturalAccount,
    defaultLimitSar: sarOut(row.defaultLimitSar),
    limitAction: row.limitAction,
    receiptOverSar: sarOut(row.receiptOverSar),
    justificationReq: bool(row.justificationReq),
    attendeesReq: bool(row.attendeesReq),
    vatEligible: bool(row.vatEligible),
    unit: row.unit,
    unitRateSar: row.unitRateSar,
    icon: row.icon as ExpenseTypeDto['icon'],
    sortOrder: row.sortOrder,
    isPlaceholder: bool(row.isPlaceholder),
    active: bool(row.active),
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export function systemOptionDto(row: SystemOptionRow): SystemOptionDto {
  return {
    optionKey: row.optionKey,
    businessUnit: row.businessUnit,
    optionValue: row.optionValue,
    valueType: row.valueType,
    description: row.description,
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export function approvalRuleDto(row: ApprovalRuleRow): ApprovalRuleDto {
  return {
    ruleId: row.ruleId,
    chainCode: row.chainCode,
    seq: row.seq,
    stepName: row.stepName,
    approverSource: row.approverSource,
    roleCode: row.roleCode as ApprovalRuleDto['roleCode'],
    conditionType: row.conditionType,
    conditionAmountSar: sarOut(row.conditionAmountSar),
    isAuditStep: bool(row.isAuditStep),
    active: bool(row.active),
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export function auditRuleDto(row: AuditRuleRow): AuditRuleDto {
  return {
    ruleCode: row.ruleCode,
    paramNumber: row.paramNumber,
    active: bool(row.active),
    version: row.version,
    updatedAt: row.updatedAt,
  };
}

export function isCurrent(
  row: Pick<RoleAssignmentRow, 'startDate' | 'endDate'>,
  today: string,
): boolean {
  return row.startDate <= today && (row.endDate === null || row.endDate >= today);
}

export function roleAssignmentDto(
  row: RoleAssignmentRow,
  employee: EmployeeRow | undefined,
  today: string,
): RoleAssignmentDto {
  return {
    assignmentId: row.assignmentId,
    personId: row.personId,
    personNumber: employee?.personNumber ?? '?',
    fullName: employee?.fullName ?? `Person ${row.personId}`,
    roleCode: row.roleCode,
    businessUnit: row.businessUnit,
    isBackup: bool(row.isBackup),
    startDate: row.startDate,
    endDate: row.endDate,
    current: isCurrent(row, today),
    version: row.version,
  };
}
