/** Requirement of a skill in a position profile. "Not applicable" = the skill is simply not in the profile. */
export const REQUIREMENTS = ['R', 'O', 'U'] as const;
export type Requirement = (typeof REQUIREMENTS)[number];
export const REQUIREMENT_LABEL: Record<Requirement, string> = {
  R: 'Required',
  O: 'Optional',
  U: 'Understand',
};

export const LEVELS = [0, 1, 2, 3, 4] as const;
export const LEVEL_LABEL = ['None', 'Basic', 'Intermediate', 'Advanced', 'Expert'] as const;

export const ROLES = ['SYS_ADMIN', 'HR_ADMIN', 'HR_LEAD', 'FINANCE', 'TRAINER'] as const;
export type RoleCode = (typeof ROLES)[number];
export const ROLE_LABEL: Record<RoleCode, string> = {
  SYS_ADMIN: 'System administrator',
  HR_ADMIN: 'HR administrator',
  HR_LEAD: 'HR Lead',
  FINANCE: 'Finance',
  TRAINER: 'Trainer',
};

export const POSITION_STATUS = ['DRAFT', 'PENDING', 'APPROVED', 'RETURNED'] as const;
export type PositionStatus = (typeof POSITION_STATUS)[number];

export const SESSION_TYPES = ['INTERNAL', 'EXTERNAL'] as const;
export type SessionType = (typeof SESSION_TYPES)[number];
export const DELIVERY_MODES = ['IN_PERSON', 'ONLINE', 'BLENDED'] as const;
export type DeliveryMode = (typeof DELIVERY_MODES)[number];
export const SESSION_STATUS = ['SCHEDULED', 'CANCELLED'] as const;

export const REQUEST_STATUS = [
  'PENDING',
  'APPROVED',
  'WAITLISTED',
  'REJECTED',
  'WITHDRAWN',
  'ATTENDED',
  'NO_SHOW',
  'COMPLETED',
  'NOT_PASSED',
] as const;
export type RequestStatus = (typeof REQUEST_STATUS)[number];
export const REQUEST_STATUS_LABEL: Record<RequestStatus, string> = {
  PENDING: 'In approval',
  APPROVED: 'Approved',
  WAITLISTED: 'Waitlisted',
  REJECTED: 'Rejected',
  WITHDRAWN: 'Withdrawn',
  ATTENDED: 'Attended',
  NO_SHOW: 'No-show',
  COMPLETED: 'Completed',
  NOT_PASSED: 'Not passed',
};
/** Requests that still hold (or wait for) a place. */
export const ACTIVE_STATUSES: RequestStatus[] = ['PENDING', 'APPROVED', 'WAITLISTED'];
/** Requests that occupy a seat. */
export const SEATED_STATUSES: RequestStatus[] = [
  'APPROVED',
  'ATTENDED',
  'COMPLETED',
  'NOT_PASSED',
  'NO_SHOW',
];

export const STEP_STATUS = ['WAITING', 'PENDING', 'APPROVED', 'REJECTED', 'SKIPPED', 'CANCELLED'] as const;
export type StepStatus = (typeof STEP_STATUS)[number];

/** Who approves a workflow step. */
export const APPROVER_TYPES = ['DIRECT_MANAGER', 'SECOND_MANAGER', 'ROLE', 'PERSON'] as const;
export type ApproverType = (typeof APPROVER_TYPES)[number];
export const APPROVER_TYPE_LABEL: Record<ApproverType, string> = {
  DIRECT_MANAGER: 'Direct manager',
  SECOND_MANAGER: "Manager's manager",
  ROLE: 'Anyone with a role',
  PERSON: 'Named person',
};
/** When a workflow step applies. */
export const STEP_CONDITIONS = ['ALWAYS', 'COST_ABOVE', 'EXTERNAL_ONLY'] as const;
export type StepCondition = (typeof STEP_CONDITIONS)[number];
export const STEP_CONDITION_LABEL: Record<StepCondition, string> = {
  ALWAYS: 'Always',
  COST_ABOVE: 'Only when cost is above',
  EXTERNAL_ONLY: 'Only for external sessions',
};

export const ATTENDANCE_MARKS = ['PRESENT', 'LATE', 'ABSENT'] as const;
export type AttendanceMark = (typeof ATTENDANCE_MARKS)[number];

export const EXAM_STATUS = ['DRAFT', 'PUBLISHED'] as const;
export type ExamStatus = (typeof EXAM_STATUS)[number];

export const RULE_SEVERITY = ['BLOCK', 'WARN'] as const;
export type RuleSeverity = (typeof RULE_SEVERITY)[number];

/** Catalogue of eligibility rules. Each is a row in TH_ELIGIBILITY_RULES that HR can switch on/off, re-grade and tune. */
export const ELIGIBILITY_RULES = {
  EMPLOYEE_ACTIVE: { label: 'Employee is active in Fusion', param: null },
  POSITION_MAPPED: { label: 'Employee is mapped to a position', param: null },
  PROFILE_APPROVED: { label: 'Position skill profile has been approved', param: null },
  MANAGER_REQUIRED: { label: 'Employee has a direct manager in Fusion', param: null },
  CUTOFF_DAYS: { label: 'Requests close N days before the session starts', param: 'days' },
  SKILL_IN_PROFILE: { label: 'Session skill is in the position profile (R or O)', param: null },
  EXTERNAL_OUTSIDE_PROFILE: {
    label: 'External session outside the profile (applies when the skill is not R/O)',
    param: null,
  },
  BELOW_TARGET: { label: 'Employee is below the target level for the skill', param: null },
  LEVEL_BAND: { label: "Current level is inside the session's level band", param: null },
  DUPLICATE_REQUEST: { label: 'No other active request for the same session', param: null },
  SAME_SKILL_ACTIVE: { label: 'No other active request for the same skill', param: null },
  TIME_CLASH: { label: 'No clash with another active request', param: null },
  TRAINER_SELF: { label: 'Trainer cannot request own session', param: null },
  YEARLY_LIMIT: { label: 'Yearly request limit per employee', param: 'requests' },
  YEARLY_COST_CAP: { label: 'Yearly external spend cap per employee (SAR)', param: 'SAR' },
  SEATS_FULL: { label: 'Session has free seats (else waitlist)', param: null },
  REASON_MIN_LENGTH: { label: 'Business reason minimum length', param: 'characters' },
  REASON_MIN_LENGTH_PAID: { label: 'Business reason minimum length for paid sessions', param: 'characters' },
} as const;
export type EligibilityRuleCode = keyof typeof ELIGIBILITY_RULES;

/** Tunable settings (TH_SETTINGS). */
export const SETTINGS = {
  LEVEL_RAISE_ON_PASS: { label: 'Levels gained on passing', type: 'int', def: '1' },
  LEVEL_CAP_AT_TARGET: { label: 'Do not raise above the target level', type: 'flag', def: 'N' },
  NO_EXAM_RAISES_LEVEL: {
    label: 'Attendance raises the level when a session has no exam',
    type: 'flag',
    def: 'N',
  },
  WAITLIST_AUTO_PROMOTE: { label: 'Promote the waitlist when a seat frees up', type: 'flag', def: 'Y' },
  PASS_THEORY_DEFAULT: { label: 'Default theory pass mark (%)', type: 'int', def: '70' },
  PASS_PRACTICAL_DEFAULT: { label: 'Default practical pass mark (0–10)', type: 'int', def: '6' },
  MIN_QUESTIONS: { label: 'Questions needed to publish an exam', type: 'int', def: '3' },
  REMIND_AFTER_DAYS: { label: 'Remind approver after (days)', type: 'int', def: '2' },
  ANNUAL_BUDGET_SAR: { label: 'Annual training budget (SAR)', type: 'int', def: '300000' },
  JSM_MIN_REQUIRED: { label: 'Profile: minimum required skills', type: 'int', def: '5' },
  JSM_REQUIRE_BEHAVIOURAL: {
    label: 'Profile: at least one behavioural skill required',
    type: 'flag',
    def: 'Y',
  },
  JSM_MANDATORY_SKILLS: { label: 'Profile: skill codes every position must require', type: 'text', def: '' },
  JSM_HR_APPROVAL: { label: 'Profile changes need HR approval', type: 'flag', def: 'Y' },
} as const;
export type SettingKey = keyof typeof SETTINGS;
