// Implements: API §10 setup contracts (FR-SET-01/02/04/05). The schema file is the contract.
import { z } from 'zod';
import { APPROVER_ROLES } from '../access';
import {
  APPROVAL_CHAINS,
  APPROVER_SOURCES,
  ASSIGNABLE_ROLES,
  AUDIT_RULE_CODES,
  BUSINESS_UNITS,
  CONDITION_TYPES,
  EXPENSE_CATEGORIES,
  EXPENSE_UNITS,
  LIMIT_ACTIONS,
  OPTION_VALUE_TYPES,
} from '../reference';
import { prerequisiteCheckSchema } from './auth';
import {
  isoDateSchema,
  listOf,
  sarAmountSchema,
  timestampSchema,
  unitRateSchema,
  versionSchema,
} from './common';

// ─── Prerequisites (FR-SET-02) ──────────────────────────────────────────────

/** GET /setup/prerequisites?bu=&failingOnly=true */
export const prerequisitesQuerySchema = z.object({
  bu: z.enum(BUSINESS_UNITS).optional(),
  failingOnly: z.stringbool().optional(),
});

export const prerequisitesResponseSchema = z.object({
  items: z.array(
    z.object({
      personId: z.number().int(),
      personNumber: z.string(),
      fullName: z.string(),
      businessUnit: z.enum(BUSINESS_UNITS),
      jobName: z.string().nullable(),
      ok: z.boolean(),
      checks: z.array(prerequisiteCheckSchema),
    }),
  ),
});
export type PrerequisitesResponse = z.infer<typeof prerequisitesResponseSchema>;

// ─── Expense types (FR-POL-01) ──────────────────────────────────────────────

/** Lucide icon names offered for expense-type tiles (UI-UX §5.2). */
export const EXPENSE_TYPE_ICONS = [
  'utensils',
  'coffee',
  'bed-double',
  'plane',
  'train-front',
  'car-taxi-front',
  'car',
  'fuel',
  'parking-meter',
  'gauge',
  'calendar-days',
  'smartphone',
  'wifi',
  'graduation-cap',
  'briefcase',
  'gift',
  'package',
  'receipt',
] as const;

const expenseTypeFields = z.object({
  name: z.string().trim().min(1, 'Enter a name').max(80),
  nameAr: z.string().trim().max(80).nullable(),
  category: z.enum(EXPENSE_CATEGORIES),
  naturalAccount: z
    .string()
    .trim()
    .regex(/^\d{5}$/, 'Enter the 5-digit natural account'),
  defaultLimitSar: sarAmountSchema.nullable(),
  limitAction: z.enum(LIMIT_ACTIONS),
  receiptOverSar: sarAmountSchema.nullable(),
  justificationReq: z.boolean(),
  attendeesReq: z.boolean(),
  vatEligible: z.boolean(),
  unit: z.enum(EXPENSE_UNITS).nullable(),
  unitRateSar: unitRateSchema.nullable(),
  icon: z.enum(EXPENSE_TYPE_ICONS),
  sortOrder: z.number().int().min(0).max(9999),
  isPlaceholder: z.boolean(),
  active: z.boolean(),
});
type ExpenseTypeFields = z.infer<typeof expenseTypeFields>;

/** The form decides by category (FR-CAP-05): mileage = km × rate (D-45: no per diem). */
function checkCategory(v: ExpenseTypeFields, ctx: z.RefinementCtx) {
  const issue = (path: keyof ExpenseTypeFields, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  if (v.category === 'MILEAGE') {
    if (v.unit !== 'KM') issue('unit', 'Mileage is counted in km');
    if (!v.unitRateSar) issue('unitRateSar', 'Enter the rate per km');
  } else {
    if (v.unit !== null) issue('unit', 'Standard types have no unit');
    if (v.unitRateSar) issue('unitRateSar', 'Standard types have no unit rate');
  }
}

export const expenseTypeCreateSchema = expenseTypeFields
  .extend({
    typeCode: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z][A-Z0-9_]{1,29}$/, 'Use capitals, digits and _ (e.g. MEALS)'),
  })
  .superRefine(checkCategory);
export type ExpenseTypeCreate = z.infer<typeof expenseTypeCreateSchema>;

export const expenseTypeUpdateSchema = expenseTypeFields
  .extend({ version: versionSchema })
  .superRefine(checkCategory);
export type ExpenseTypeUpdate = z.infer<typeof expenseTypeUpdateSchema>;

export const expenseTypeSchema = expenseTypeFields.extend({
  typeId: z.number().int(),
  typeCode: z.string(),
  version: versionSchema,
  updatedAt: timestampSchema,
});
export type ExpenseTypeDto = z.infer<typeof expenseTypeSchema>;
export const expenseTypeListSchema = listOf(expenseTypeSchema);

// ─── System options (FR-SET-01) ─────────────────────────────────────────────

export const systemOptionSchema = z.object({
  optionKey: z.string(),
  businessUnit: z.union([z.literal('*'), z.enum(BUSINESS_UNITS)]),
  optionValue: z.string(),
  valueType: z.enum(OPTION_VALUE_TYPES),
  description: z.string().nullable(),
  version: versionSchema,
  updatedAt: timestampSchema,
});
export type SystemOptionDto = z.infer<typeof systemOptionSchema>;
export const systemOptionListSchema = listOf(systemOptionSchema);

export const systemOptionUpdateSchema = z.object({
  optionValue: z.string().trim().max(400),
  version: versionSchema,
});

// ─── Approval rules (FR-APR-01, OQ-01, D-37) ────────────────────────────────

const approvalRuleFields = z.object({
  seq: z.number().int().min(1).max(99),
  stepName: z.string().trim().min(1, 'Enter a step name').max(60),
  approverSource: z.enum(APPROVER_SOURCES),
  roleCode: z.enum(APPROVER_ROLES).nullable(),
  conditionType: z.enum(CONDITION_TYPES),
  /** TOTAL_GT only; null = system option CEO_THRESHOLD_SAR (FR-APR-02). */
  conditionAmountSar: sarAmountSchema.nullable(),
  isAuditStep: z.boolean(),
  active: z.boolean(),
});
type ApprovalRuleFields = z.infer<typeof approvalRuleFields>;

function checkRule(v: ApprovalRuleFields, ctx: z.RefinementCtx) {
  const issue = (path: keyof ApprovalRuleFields, message: string) =>
    ctx.addIssue({ code: 'custom', path: [path], message });
  if (v.approverSource === 'ROLE' && !v.roleCode)
    issue('roleCode', 'Choose the role that approves');
  if (v.approverSource !== 'ROLE' && v.roleCode)
    issue('roleCode', 'Line-manager steps have no role');
  if (v.conditionType === 'ALWAYS' && v.conditionAmountSar) {
    issue('conditionAmountSar', 'Only "total above" steps have an amount');
  }
  // OQ-03 proposal: the audit is the Accountant's step.
  if (v.isAuditStep && v.roleCode !== 'ACCOUNTANT')
    issue('isAuditStep', 'Only the Accountant step can be the audit');
}

export const approvalRuleCreateSchema = approvalRuleFields
  .extend({ chainCode: z.enum(APPROVAL_CHAINS) })
  .superRefine(checkRule);
export type ApprovalRuleCreate = z.infer<typeof approvalRuleCreateSchema>;

export const approvalRuleUpdateSchema = approvalRuleFields
  .extend({ version: versionSchema })
  .superRefine(checkRule);
export type ApprovalRuleUpdate = z.infer<typeof approvalRuleUpdateSchema>;

export const approvalRuleSchema = approvalRuleFields.extend({
  ruleId: z.number().int(),
  chainCode: z.enum(APPROVAL_CHAINS),
  version: versionSchema,
  updatedAt: timestampSchema,
});
export type ApprovalRuleDto = z.infer<typeof approvalRuleSchema>;
export const approvalRuleListSchema = listOf(approvalRuleSchema);

// ─── Audit rules (FR-AUD-01, OQ-33) ─────────────────────────────────────────

export const auditRuleSchema = z.object({
  ruleCode: z.enum(AUDIT_RULE_CODES),
  paramNumber: z.number().nullable(),
  active: z.boolean(),
  version: versionSchema,
  updatedAt: timestampSchema,
});
export type AuditRuleDto = z.infer<typeof auditRuleSchema>;
export const auditRuleListSchema = listOf(auditRuleSchema);

export const auditRuleUpdateSchema = z.object({
  paramNumber: z.number().min(0).max(1_000_000).nullable(),
  active: z.boolean(),
  version: versionSchema,
});

// ─── Role assignments (FR-SET-04, OQ-02) ────────────────────────────────────

export const roleAssignmentSchema = z.object({
  assignmentId: z.number().int(),
  personId: z.number().int(),
  personNumber: z.string(),
  fullName: z.string(),
  roleCode: z.enum(ASSIGNABLE_ROLES),
  businessUnit: z.enum(BUSINESS_UNITS).nullable(),
  isBackup: z.boolean(),
  startDate: isoDateSchema,
  endDate: isoDateSchema.nullable(),
  /** In force today (Riyadh). */
  current: z.boolean(),
  version: versionSchema,
});
export type RoleAssignmentDto = z.infer<typeof roleAssignmentSchema>;
export const roleAssignmentListSchema = listOf(roleAssignmentSchema);

export const roleAssignmentCreateSchema = z
  .object({
    personId: z.number().int().positive(),
    roleCode: z.enum(ASSIGNABLE_ROLES),
    businessUnit: z.enum(BUSINESS_UNITS).nullable(),
    isBackup: z.boolean(),
    startDate: isoDateSchema,
    endDate: isoDateSchema.nullable(),
  })
  .refine((v) => v.endDate === null || v.startDate <= v.endDate, {
    path: ['endDate'],
    message: 'The end date is before the start date',
  });
export type RoleAssignmentCreate = z.infer<typeof roleAssignmentCreateSchema>;

// ─── Setup history (FR-SET-05) ──────────────────────────────────────────────

export const SETUP_TABLES = [
  'EH_EXPENSE_TYPES',
  'EH_SYSTEM_OPTIONS',
  'EH_APPROVAL_RULES',
  'EH_AUDIT_RULES',
  'EH_ROLE_ASSIGNMENTS',
] as const;
export type SetupTable = (typeof SETUP_TABLES)[number];

export const setupHistoryQuerySchema = z.object({
  table: z.enum(SETUP_TABLES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const setupHistoryItemSchema = z.object({
  id: z.number().int(),
  tableName: z.string(),
  rowKey: z.string(),
  at: timestampSchema,
  actor: z.object({ personId: z.number().int(), fullName: z.string() }).nullable(),
  oldJson: z.unknown(),
  newJson: z.unknown(),
});
export type SetupHistoryItem = z.infer<typeof setupHistoryItemSchema>;
export const setupHistoryListSchema = listOf(setupHistoryItemSchema);
