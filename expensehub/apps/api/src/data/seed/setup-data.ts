// Dev seed — ExpenseHub-owned setup data (DRD §6). Values are proposals until answered;
// each block names the open question it stands in for.
import { BUSINESS_UNITS, parseSar, type BusinessUnit } from '@expensehub/shared';
import type {
  NewApprovalRule,
  NewAuditRule,
  NewExpenseType,
  NewRoleAssignment,
  NewSystemOption,
} from '../ports';

// ─── Expense types — OQ-32 proposal: prototype placeholders, marked is_placeholder='Y' ──────

export function expenseType(
  t: Pick<NewExpenseType, 'typeCode' | 'name' | 'naturalAccount' | 'icon' | 'sortOrder'> &
    Partial<NewExpenseType>,
): NewExpenseType {
  return {
    nameAr: null,
    category: 'STANDARD',
    defaultLimitSar: null,
    limitAction: 'WARN',
    receiptOverSar: parseSar('0'),
    justificationReq: 'N',
    attendeesReq: 'N',
    vatEligible: 'Y',
    unit: null,
    unitRateSar: null,
    isPlaceholder: 'Y',
    active: 'Y',
    ...t,
  };
}

export const EXPENSE_TYPES: NewExpenseType[] = [
  expenseType({
    typeCode: 'MEALS',
    name: 'Meals & entertainment',
    naturalAccount: '55210',
    defaultLimitSar: parseSar('150'),
    receiptOverSar: parseSar('50'),
    attendeesReq: 'Y',
    icon: 'utensils',
    sortOrder: 10,
  }),
  expenseType({
    typeCode: 'HOTEL',
    name: 'Hotel',
    naturalAccount: '55220',
    defaultLimitSar: parseSar('600'),
    icon: 'bed-double',
    sortOrder: 20,
  }),
  expenseType({
    typeCode: 'AIRFARE',
    name: 'Airfare',
    naturalAccount: '55230',
    justificationReq: 'Y',
    icon: 'plane',
    sortOrder: 30,
  }),
  expenseType({
    typeCode: 'TAXI',
    name: 'Taxi & ground transport',
    naturalAccount: '55240',
    defaultLimitSar: parseSar('200'),
    receiptOverSar: parseSar('50'),
    icon: 'car-taxi-front',
    sortOrder: 40,
  }),
  expenseType({
    typeCode: 'MILEAGE',
    name: 'Mileage',
    category: 'MILEAGE',
    naturalAccount: '55250',
    receiptOverSar: null,
    vatEligible: 'N',
    unit: 'KM',
    unitRateSar: '0.7500',
    icon: 'gauge',
    sortOrder: 50,
  }),
  // D-45: no per diem type — trip allowances are calculated and paid by Quick Pay.
  expenseType({
    typeCode: 'TELECOM',
    name: 'Mobile & internet',
    naturalAccount: '55260',
    defaultLimitSar: parseSar('300'),
    limitAction: 'BLOCK',
    icon: 'smartphone',
    sortOrder: 70,
  }),
  expenseType({
    typeCode: 'TRAINING',
    name: 'Training & courses',
    naturalAccount: '55270',
    defaultLimitSar: parseSar('5000'),
    justificationReq: 'Y',
    icon: 'graduation-cap',
    sortOrder: 80,
  }),
  expenseType({
    typeCode: 'OTHER',
    name: 'Other business expense',
    naturalAccount: '55290',
    defaultLimitSar: parseSar('1000'),
    justificationReq: 'Y',
    icon: 'receipt',
    sortOrder: 90,
  }),
];

// ─── System options (DRD §4 seed keys) ─────────────────────────────────────

function option(
  optionKey: string,
  optionValue: string,
  valueType: NewSystemOption['valueType'],
  description: string,
  businessUnit: BusinessUnit | '*' = '*',
): NewSystemOption {
  return { optionKey, businessUnit, optionValue, valueType, description };
}

/** Full 6-segment combination for an account in a BU (OQ-14 proposal: Company = BU code). */
const account = (bu: BusinessUnit, natural: string) => `${bu}.001.110.${natural}.000.000000`;

export const SYSTEM_OPTIONS: NewSystemOption[] = [
  option('VAT_RATE', '15', 'NUMBER', 'VAT % (D-32)'),
  // D-41: no VAT on ExpenseHub invoices; lines go to Fusion gross.
  option('VAT_RECOVERY', 'N', 'BOOL', 'Recover input VAT from ZATCA receipts (D-41: off)'),
  // FR-APR-02 (only used by a "total above" step; D-49 has none by default).
  option('CEO_THRESHOLD_SAR', '5000', 'NUMBER', 'Report total above which the CEO approves'),
  // D-49: how many line-manager levels approve (0 = all the way to the top).
  option('APPROVAL_MAX_LEVELS', '0', 'NUMBER', 'Line-manager levels that approve (0 = to the top)'),
  option('RATE_TYPE', 'Corporate', 'STRING', 'Fusion conversion rate type (PRD §6)'),
  option('RATE_STALE_DAYS', '7', 'NUMBER', 'Warn when the rate used is older than this'),
  // OQ-16 proposal: Finance sends manually.
  option('INVOICE_SEND_MODE', 'MANUAL', 'STRING', 'MANUAL or AUTO (hourly job)'),
  // OQ-17 proposal.
  option('ATTACH_RECEIPTS_TO_INVOICE', 'Y', 'BOOL', 'Attach receipt files to the Fusion invoice'),
  // Used only when VAT_RECOVERY = Y (D-41).
  option('TAX_CLASSIFICATION_CODE', 'VAT 15% STANDARD', 'STRING', 'Fusion tax classification'),
  option('REMINDER_DAYS', '2', 'NUMBER', 'Approval reminder (D-25)'),
  option('ESCALATION_DAYS', '3', 'NUMBER', 'Approval escalation (D-25)'),
  option('TRIP_DATE_TOLERANCE_DAYS', '1', 'NUMBER', 'FR-TRP-02 tolerance'),
  // D-40 / D-42.
  option('FUSION_INVOICE_TYPE', 'Standard', 'STRING', 'Payables invoice type'),
  option('FUSION_INVOICE_SOURCE', 'EXPENSEHUB', 'STRING', 'Payables invoice source'),
  option('FUSION_PAYMENT_METHOD', 'EFT', 'STRING', 'Payables payment method'),
  option('FUSION_PAY_GROUP', 'EMPLOYEES', 'STRING', 'Payables pay group'),
  option('FUSION_PAYMENT_TERMS', 'Immediate', 'STRING', 'Payables payment terms'),
  // D-57: ZPI's mandatory invoice flexfield RIR Number carries the report / Quick Pay number.
  option(
    'FUSION_INVOICE_DFF',
    '{"rirNumber":"{invoiceNumber}"}',
    'JSON',
    'Invoice flexfield values ({invoiceNumber}, {invoiceDate} are filled in)',
  ),
  // OQ-10 proposal.
  // Absence type names in the test pod (22 Oct 2026).
  option(
    'TRIP_ABSENCE_TYPES',
    '["Business Leave","Business Leaves"]',
    'JSON',
    'Absence types read as trips',
  ),
  // D-46: Business Leave request — ATTRIBUTE3 = city, ATTRIBUTE2 = country (test pod, 22 Oct 2026).
  option(
    'TRIP_DESTINATION_FIELD',
    'ATTRIBUTE3,ATTRIBUTE2',
    'STRING',
    'Business leave request field with the trip destination',
  ),
  // OQ-07 proposal.
  option(
    'QUICKPAY_ELEMENTS',
    // D-48: [] = every QuickPay; its earnings total is the invoice amount.
    '[]',
    'JSON',
    'Payroll elements that appear as Quick Pays',
  ),
  // OQ-14 proposal: accounts per BU.
  ...BUSINESS_UNITS.flatMap((bu) => [
    option('ACCT_EMPLOYEE_LIABILITY', account(bu, '21510'), 'STRING', 'Employee liability', bu),
    option('ACCT_INPUT_VAT', account(bu, '13410'), 'STRING', 'Input VAT', bu),
    option('ACCT_ADVANCE_CLEARING', account(bu, '14210'), 'STRING', 'Advance clearing', bu),
    option('ACCT_CARD_PAYABLE', account(bu, '21520'), 'STRING', 'Card issuer payable', bu),
    // OQ-07 proposal: Quick Pay invoices charge one account per BU [VERIFY with Finance].
    option('ACCT_QUICKPAY', account(bu, '55290'), 'STRING', 'Quick Pay invoice account', bu),
    // INT-08 payload BusinessUnit — the Fusion BU names (read from the test pod, 22 Oct 2026).
    option('FUSION_BU_NAME', `${bu} BU`, 'STRING', 'Fusion Payables business unit', bu),
  ]),
];

// ─── Approval rules ─────────────────────────────────────────────────────────

function rule(
  r: Omit<NewApprovalRule, 'active' | 'isAuditStep' | 'conditionAmountSar'> &
    Partial<NewApprovalRule>,
): NewApprovalRule {
  return { active: 'Y', isAuditStep: 'N', conditionAmountSar: null, ...r };
}

export const APPROVAL_RULES: NewApprovalRule[] = [
  // D-49: line-manager hierarchy up to the last approver → Finance Manager → Accountant.
  rule({
    chainCode: 'STANDARD',
    seq: 1,
    stepName: 'Line Manager',
    approverSource: 'SUPERVISOR_HIERARCHY',
    roleCode: null,
    conditionType: 'ALWAYS',
  }),
  rule({
    chainCode: 'STANDARD',
    seq: 2,
    stepName: 'Finance Manager',
    approverSource: 'ROLE',
    roleCode: 'APPROVER_FIN_MGR',
    conditionType: 'ALWAYS',
  }),
  // OQ-03 proposal: the Accountant step is the audit.
  rule({
    chainCode: 'STANDARD',
    seq: 3,
    stepName: 'Accountant',
    approverSource: 'ROLE',
    roleCode: 'ACCOUNTANT',
    conditionType: 'ALWAYS',
    isAuditStep: 'Y',
  }),
  // D-37 / D-49: the CEO's own claims (nobody above the CEO).
  rule({
    chainCode: 'CEO_CLAIMANT',
    seq: 1,
    stepName: 'Finance Manager',
    approverSource: 'ROLE',
    roleCode: 'APPROVER_FIN_MGR',
    conditionType: 'ALWAYS',
  }),
  rule({
    chainCode: 'CEO_CLAIMANT',
    seq: 2,
    stepName: 'Accountant',
    approverSource: 'ROLE',
    roleCode: 'ACCOUNTANT',
    conditionType: 'ALWAYS',
    isAuditStep: 'Y',
  }),
];

// ─── Audit rules — OQ-33 proposal ───────────────────────────────────────────

export const AUDIT_RULES: NewAuditRule[] = [
  { ruleCode: 'ANY_WARNING', paramNumber: null, active: 'Y' },
  { ruleCode: 'MISSING_RECEIPT', paramNumber: null, active: 'Y' },
  { ruleCode: 'TOTAL_GT', paramNumber: 3000, active: 'Y' },
  { ruleCode: 'RANDOM_PCT', paramNumber: 10, active: 'Y' },
  // Duplicate detection is built (FR-CAP-10, M4); off by default as in the OQ-33 proposal —
  // switch it on in Setup → Audit rules.
  { ruleCode: 'DUPLICATE', paramNumber: null, active: 'N' },
];

// ─── Role assignments — OQ-02 proposal: assigned in ExpenseHub per BU, with backups ───────

type Assignment = [
  personNumber: string,
  role: NewRoleAssignment['roleCode'],
  bu: BusinessUnit | null,
  backup?: true,
];

export const ROLE_ASSIGNMENTS: Assignment[] = [
  ['1001', 'APPROVER_CEO', null],
  ['1002', 'APPROVER_FIN_MGR', null],
  ['1003', 'APPROVER_HR', 'IPP'],
  ['1003', 'APPROVER_HR', 'FPP'],
  ['1003', 'APPROVER_HR', 'APP', true],
  ['1004', 'APPROVER_HR', 'APP'],
  ['1004', 'APPROVER_HR', 'IPP', true],
  ['1004', 'APPROVER_HR', 'FPP', true],
  ['1005', 'ACCOUNTANT', 'IPP'],
  ['1005', 'ACCOUNTANT', 'APP'],
  ['1005', 'ACCOUNTANT', 'FPP', true],
  ['1006', 'ACCOUNTANT', 'FPP'],
  ['1006', 'ACCOUNTANT', 'IPP', true],
  ['1006', 'ACCOUNTANT', 'APP', true],
  ['1007', 'FINANCE_AP', null],
  ['1008', 'PETTY_CASHIER', null],
  ['1009', 'SYS_ADMIN', null],
];

export const ROLE_START_DATE = '2026-01-01';
