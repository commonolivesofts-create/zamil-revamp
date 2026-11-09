import { z } from 'zod';
import {
  APPROVER_TYPES,
  ATTENDANCE_MARKS,
  DELIVERY_MODES,
  REQUIREMENTS,
  ROLES,
  RULE_SEVERITY,
  SESSION_TYPES,
  STEP_CONDITIONS,
} from './enums';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const hhmm = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Use HH:MM');
const id = z.coerce.number().int().positive();
const level = z.coerce.number().int().min(0).max(4);
const text = (min: number, max: number) => z.string().trim().min(min).max(max);

export const loginInput = z.object({
  personNumber: text(1, 30),
  password: z.string().min(1).max(200),
});
export const changePasswordInput = z.object({
  currentPassword: z.string().min(1).max(200),
  newPassword: z
    .string()
    .min(10, 'At least 10 characters')
    .max(200)
    .regex(/[A-Za-z]/, 'Needs a letter')
    .regex(/\d/, 'Needs a digit'),
});

export const requestCreateInput = z.object({
  personId: id,
  sessionId: id,
  reason: text(1, 1000),
});
export const decisionInput = z
  .object({
    action: z.enum(['approve', 'reject', 'forward']),
    comment: z.string().trim().max(1000).default(''),
    forwardTo: id.optional(),
  })
  .superRefine((v, ctx) => {
    if (v.action === 'reject' && v.comment.length < 5)
      ctx.addIssue({ code: 'custom', path: ['comment'], message: 'Give a reason (at least 5 characters)' });
    if (v.action === 'forward' && !v.forwardTo)
      ctx.addIssue({ code: 'custom', path: ['forwardTo'], message: 'Choose who to forward to' });
  });
export const bulkApproveInput = z.object({ ids: z.array(id).min(1).max(100) });
export const withdrawInput = z.object({ comment: z.string().trim().max(500).default('') });

export const categoryInput = z.object({
  code: text(2, 20).regex(/^[A-Z0-9_]+$/, 'Upper-case letters, digits and _'),
  name: text(2, 100),
  colorIndex: z.coerce.number().int().min(1).max(8).default(1),
  sortOrder: z.coerce.number().int().min(0).max(999).default(0),
});
export const skillInput = z.object({
  code: text(2, 30).regex(/^[A-Z0-9_]+$/, 'Upper-case letters, digits and _'),
  name: text(2, 150),
  categoryId: id,
  description: z.string().trim().max(500).default(''),
  level1: z.string().trim().max(300).default(''),
  level2: z.string().trim().max(300).default(''),
  level3: z.string().trim().max(300).default(''),
  level4: z.string().trim().max(300).default(''),
  active: z.boolean().default(true),
});

export const positionInput = z.object({
  name: text(2, 150),
  grade: z.string().trim().max(20).default(''),
  department: z.string().trim().max(150).default(''),
  jobNames: z.array(text(1, 240)).max(20).default([]),
  ownerPersonId: id.nullable().default(null),
  requestLimit: z.coerce.number().int().min(1).max(50).nullable().default(null),
});
export const positionSkillInput = z.object({
  skillId: id,
  requirement: z.enum(REQUIREMENTS),
  targetLevel: level,
  critical: z.boolean().default(false),
});
export const positionSkillReplaceInput = z.object({
  fromSkillId: id,
  toSkillId: id,
  /** Keep requirement/level/critical of the replaced skill unless overridden. */
  requirement: z.enum(REQUIREMENTS).optional(),
  targetLevel: level.optional(),
});
export const positionCopyInput = z.object({ fromPositionId: id, mode: z.enum(['merge', 'replace']) });
export const positionDecisionInput = z.object({
  action: z.enum(['approve', 'return']),
  comment: z.string().trim().max(1000).default(''),
});
export const employeePositionInput = z.object({ positionId: id.nullable() });

export const sessionInput = z
  .object({
    title: text(5, 200),
    skillId: id,
    sessionType: z.enum(SESSION_TYPES),
    trainerPersonId: id.nullable().default(null),
    provider: z.string().trim().max(200).default(''),
    startDate: isoDate,
    endDate: isoDate,
    startTime: hhmm,
    endTime: hhmm,
    capacity: z.coerce.number().int().min(1).max(500),
    externalSeats: z.coerce.number().int().min(0).max(500).default(0),
    bandFrom: level,
    bandTo: level,
    costSar: z.coerce.number().min(0).max(10_000_000),
    location: text(3, 200),
    deliveryMode: z.enum(DELIVERY_MODES),
    description: z.string().trim().max(2000).default(''),
  })
  .superRefine((v, ctx) => {
    const add = (path: string, message: string) => ctx.addIssue({ code: 'custom', path: [path], message });
    if (v.endDate < v.startDate) add('endDate', 'Must be on or after the start date');
    if (v.endTime <= v.startTime) add('endTime', 'Must be after the start time');
    if (v.bandFrom > v.bandTo) add('bandTo', '"To" level cannot be below "from" level');
    if (v.externalSeats > v.capacity) add('externalSeats', 'Cannot exceed capacity');
    if (v.sessionType === 'INTERNAL' && !v.trainerPersonId) add('trainerPersonId', 'Choose an internal trainer');
    if (v.sessionType === 'EXTERNAL' && v.provider.length < 2) add('provider', 'Enter the provider name');
    if (v.sessionType === 'EXTERNAL' && v.costSar <= 0) add('costSar', 'External sessions need a cost');
  });

export const examInput = z.object({
  passTheory: z.coerce.number().int().min(0).max(100),
  passPractical: z.coerce.number().int().min(0).max(10),
  hasPractical: z.boolean().default(true),
});
export const questionInput = z
  .object({
    text: text(5, 1000),
    choices: z.array(text(1, 300)).min(2).max(6),
    correctIndex: z.coerce.number().int().min(0),
  })
  .refine((v) => v.correctIndex < v.choices.length, { path: ['correctIndex'], message: 'Pick a correct answer' })
  .refine((v) => new Set(v.choices.map((c) => c.toLowerCase())).size === v.choices.length, {
    path: ['choices'],
    message: 'Choices must be different',
  });
export const examSubmitInput = z.object({ answers: z.array(z.coerce.number().int().min(0)).max(200) });
export const attendanceInput = z.object({
  marks: z.record(z.string(), z.enum(ATTENDANCE_MARKS)),
});
export const practicalInput = z.object({
  marks: z.record(z.string(), z.coerce.number().int().min(0).max(10).nullable()),
});

export const assessmentInput = z.object({
  personId: id,
  levels: z.record(z.string(), level),
  note: z.string().trim().max(500).default(''),
});

export const workflowStepInput = z
  .object({
    label: text(2, 100),
    approverType: z.enum(APPROVER_TYPES),
    roleCode: z.enum(ROLES).nullable().default(null),
    personId: id.nullable().default(null),
    conditionType: z.enum(STEP_CONDITIONS).default('ALWAYS'),
    conditionValue: z.coerce.number().min(0).nullable().default(null),
    enabled: z.boolean().default(true),
  })
  .superRefine((v, ctx) => {
    if (v.approverType === 'ROLE' && !v.roleCode)
      ctx.addIssue({ code: 'custom', path: ['roleCode'], message: 'Choose a role' });
    if (v.approverType === 'PERSON' && !v.personId)
      ctx.addIssue({ code: 'custom', path: ['personId'], message: 'Choose a person' });
    if (v.conditionType === 'COST_ABOVE' && v.conditionValue == null)
      ctx.addIssue({ code: 'custom', path: ['conditionValue'], message: 'Enter the amount' });
  });
export const workflowInput = z.object({ steps: z.array(workflowStepInput).min(1).max(10) });

export const ruleInput = z.object({
  enabled: z.boolean(),
  severity: z.enum(RULE_SEVERITY),
  paramValue: z.coerce.number().min(0).max(10_000_000).nullable().default(null),
  message: z.string().trim().max(300).default(''),
});
export const settingsInput = z.object({ values: z.record(z.string(), z.string().max(1000)) });

export const delegationInput = z
  .object({
    fromPersonId: id.optional(),
    toPersonId: id,
    startDate: isoDate,
    endDate: isoDate,
    reason: z.string().trim().max(300).default(''),
  })
  .refine((v) => v.endDate >= v.startDate, { path: ['endDate'], message: 'Must be on or after the start' });

export const roleInput = z.object({ personId: id, role: z.enum(ROLES) });
export const resetPasswordInput = z.object({ personId: id });

export type LoginInput = z.infer<typeof loginInput>;
export type RequestCreateInput = z.infer<typeof requestCreateInput>;
export type DecisionInput = z.infer<typeof decisionInput>;
export type SkillInput = z.infer<typeof skillInput>;
export type CategoryInput = z.infer<typeof categoryInput>;
export type PositionInput = z.infer<typeof positionInput>;
export type PositionSkillInput = z.infer<typeof positionSkillInput>;
export type SessionInput = z.infer<typeof sessionInput>;
export type QuestionInput = z.infer<typeof questionInput>;
export type WorkflowStepInput = z.infer<typeof workflowStepInput>;
export type RuleInput = z.infer<typeof ruleInput>;
export type DelegationInput = z.infer<typeof delegationInput>;
