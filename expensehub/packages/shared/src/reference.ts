// Reference value lists shared by API, web and the DDL CHECK constraints (DRD, TRD §5).

export const BUSINESS_UNITS = ['IPP', 'FPP', 'APP'] as const;
export type BusinessUnit = (typeof BUSINESS_UNITS)[number];

/** TRD §5. EMPLOYEE is implicit for every active employee and never stored. */
export const ASSIGNABLE_ROLES = [
  'APPROVER_HR',
  'APPROVER_FIN_MGR',
  'APPROVER_CEO',
  'ACCOUNTANT',
  'FINANCE_AP',
  'PETTY_CASHIER',
  'CARD_ADMIN',
  'SYS_ADMIN',
] as const;
export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];
export type RoleCode = 'EMPLOYEE' | AssignableRole;

/** D-45: no per diem category — allowances are paid by Quick Pay. */
export const EXPENSE_CATEGORIES = ['STANDARD', 'MILEAGE'] as const;
export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number];

export const EXPENSE_UNITS = ['KM'] as const;
export type ExpenseUnit = (typeof EXPENSE_UNITS)[number];

export const LIMIT_ACTIONS = ['WARN', 'BLOCK'] as const;
export type LimitAction = (typeof LIMIT_ACTIONS)[number];

/** D-12: Company.Location.CostCenter.Account.000.000000 (segment 5/6 names → OQ-14). */
export const COA_SEGMENTS = [
  'COMPANY',
  'LOCATION',
  'COST_CENTER',
  'ACCOUNT',
  'SEGMENT5',
  'SEGMENT6',
] as const;
export type CoaSegment = (typeof COA_SEGMENTS)[number];

/** D-37: the CEO's own claims use their own chain. */
export const APPROVAL_CHAINS = ['STANDARD', 'CEO_CLAIMANT'] as const;
export type ApprovalChain = (typeof APPROVAL_CHAINS)[number];

/** D-49: SUPERVISOR_HIERARCHY = the line manager, their manager, … up to the top of HCM. */
export const APPROVER_SOURCES = ['SUPERVISOR', 'SUPERVISOR_HIERARCHY', 'ROLE'] as const;
export type ApproverSource = (typeof APPROVER_SOURCES)[number];

export const CONDITION_TYPES = ['ALWAYS', 'TOTAL_GT'] as const;
export type ConditionType = (typeof CONDITION_TYPES)[number];

export const AUDIT_RULE_CODES = [
  'ANY_WARNING',
  'MISSING_RECEIPT',
  'TOTAL_GT',
  'RANDOM_PCT',
  'DUPLICATE',
] as const;
export type AuditRuleCode = (typeof AUDIT_RULE_CODES)[number];

export const HISTORY_ENTITY_TYPES = ['REPORT', 'EXPENSE', 'ADVANCE', 'QUICK_PAY'] as const;
export type HistoryEntityType = (typeof HISTORY_ENTITY_TYPES)[number];

export const RECEIPT_SOURCES = ['UPLOAD', 'EMAIL', 'MIGRATION'] as const;
export type ReceiptSource = (typeof RECEIPT_SOURCES)[number];

export const EXPENSE_SOURCES = ['CASH', 'CARD'] as const;
export type ExpenseSource = (typeof EXPENSE_SOURCES)[number];

export const REPORT_SOURCES = ['APP', 'MIGRATION'] as const;
export type ReportSource = (typeof REPORT_SOURCES)[number];

export const NOTIFICATION_CHANNELS = ['EMAIL', 'TEAMS', 'WHATSAPP'] as const;
export type NotificationChannel = (typeof NOTIFICATION_CHANNELS)[number];

export const OPTION_VALUE_TYPES = ['NUMBER', 'STRING', 'BOOL', 'JSON'] as const;
export type OptionValueType = (typeof OPTION_VALUE_TYPES)[number];

export const INTERFACE_CODES = [
  'INT-01',
  'INT-02',
  'INT-03',
  'INT-04',
  'INT-05a',
  'INT-05b',
  'INT-06',
  'INT-07',
  'INT-08',
  'INT-09',
] as const;
export type InterfaceCode = (typeof INTERFACE_CODES)[number];
