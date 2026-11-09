import type {
  ApproverType,
  AttendanceMark,
  DeliveryMode,
  EligibilityRuleCode,
  ExamStatus,
  PositionStatus,
  RequestStatus,
  Requirement,
  RoleCode,
  RuleSeverity,
  SessionType,
  StepCondition,
  StepStatus,
} from './enums';

export interface Me {
  personId: number;
  personNumber: string;
  fullName: string;
  email: string | null;
  jobName: string | null;
  department: string | null;
  positionId: number | null;
  positionName: string | null;
  managerName: string | null;
  roles: RoleCode[];
  isManager: boolean;
  hasTeam: boolean;
  isTrainer: boolean;
  canEditJsm: boolean;
  mustChangePassword: boolean;
  delegatedTo: { name: string; until: string } | null;
  counts: { approvals: number; myOpen: number; examsOpen: number; unread: number; profilesPending: number };
}

export interface PersonRef {
  personId: number;
  personNumber: string;
  fullName: string;
  jobName: string | null;
  department: string | null;
  positionId: number | null;
  positionName: string | null;
  active: boolean;
}

export interface EmployeeRow extends PersonRef {
  email: string | null;
  buCode: string | null;
  managerId: number | null;
  managerName: string | null;
  positionSource: 'OVERRIDE' | 'JOB' | null;
  roles: RoleCode[];
  hasLogin: boolean;
  syncedAt: string | null;
}

export interface Category {
  id: number;
  code: string;
  name: string;
  colorIndex: number;
  sortOrder: number;
}
export interface Skill {
  id: number;
  code: string;
  name: string;
  categoryId: number;
  description: string;
  level1: string;
  level2: string;
  level3: string;
  level4: string;
  active: boolean;
}

export interface PositionSkill {
  skillId: number;
  requirement: Requirement;
  targetLevel: number;
  critical: boolean;
}
export interface Position {
  id: number;
  name: string;
  grade: string;
  department: string;
  jobNames: string[];
  ownerPersonId: number | null;
  ownerName: string | null;
  status: PositionStatus;
  versionNo: number;
  approvedAt: string | null;
  approvedByName: string | null;
  submittedAt: string | null;
  returnComment: string | null;
  requestLimit: number | null;
  headcount: number;
  counts: { R: number; O: number; U: number; critical: number };
  draftChanged: boolean;
}
export interface PositionDetail extends Position {
  skills: PositionSkill[];
  approvedSkills: PositionSkill[];
  validation: string[];
}

export interface SkillLevelRow {
  skillId: number;
  requirement: Requirement | null;
  targetLevel: number;
  critical: boolean;
  currentLevel: number;
  assessedAt: string | null;
  source: string | null;
}
export interface PersonSkills {
  person: PersonRef;
  managerName: string | null;
  readiness: number;
  rows: SkillLevelRow[];
  history: { skillId: number; fromLevel: number; toLevel: number; source: string; changedAt: string; byName: string }[];
}

export interface Session {
  id: number;
  title: string;
  skillId: number;
  skillName: string;
  sessionType: SessionType;
  trainerPersonId: number | null;
  trainerName: string | null;
  provider: string;
  startDate: string;
  endDate: string;
  startTime: string;
  endTime: string;
  capacity: number;
  externalSeats: number;
  seatsTaken: number;
  seatsLeft: number;
  waitlist: number;
  bandFrom: number;
  bandTo: number;
  costSar: number;
  location: string;
  deliveryMode: DeliveryMode;
  description: string;
  status: 'SCHEDULED' | 'CANCELLED';
  attendanceLocked: boolean;
  examStatus: ExamStatus | null;
  resultsReleased: boolean;
  hours: number;
}

export interface EligibilityIssue {
  code: EligibilityRuleCode;
  severity: RuleSeverity;
  message: string;
}
export interface Eligibility {
  ok: boolean;
  errors: EligibilityIssue[];
  warnings: EligibilityIssue[];
  currentLevel: number;
  requirement: Requirement | null;
  targetLevel: number;
  minReason: number;
  willWaitlist: boolean;
}

export interface ApprovalStep {
  id: number;
  stepNo: number;
  label: string;
  approverType: ApproverType;
  roleCode: RoleCode | null;
  approverPersonId: number | null;
  approverName: string | null;
  delegatedFromName: string | null;
  forwardedFromName: string | null;
  status: StepStatus;
  sinceAt: string | null;
  actedAt: string | null;
  actedByName: string | null;
  comments: string;
}
export interface TrainingRequest {
  id: number;
  requestNo: string;
  personId: number;
  personName: string;
  positionName: string | null;
  sessionId: number;
  session: Session;
  reason: string;
  status: RequestStatus;
  createdAt: string;
  createdByName: string;
  currentStepNo: number | null;
  steps: ApprovalStep[];
  canWithdraw: boolean;
  canDecide: boolean;
  waitingDays: number;
  eligibilityNow?: EligibilityIssue[];
}

export interface WorkflowStep {
  id: number;
  stepNo: number;
  label: string;
  approverType: ApproverType;
  roleCode: RoleCode | null;
  personId: number | null;
  personName: string | null;
  conditionType: StepCondition;
  conditionValue: number | null;
  enabled: boolean;
}
export interface EligibilityRule {
  code: EligibilityRuleCode;
  label: string;
  enabled: boolean;
  severity: RuleSeverity;
  paramValue: number | null;
  paramLabel: string | null;
  message: string;
  sortOrder: number;
}
export interface Delegation {
  id: number;
  fromPersonId: number;
  fromName: string;
  toPersonId: number;
  toName: string;
  startDate: string;
  endDate: string;
  reason: string;
  active: boolean;
}

export interface Question {
  id: number;
  text: string;
  choices: string[];
  correctIndex?: number;
  sortOrder: number;
}
export interface Exam {
  id: number;
  sessionId: number;
  status: ExamStatus;
  passTheory: number;
  passPractical: number;
  hasPractical: boolean;
  released: boolean;
  questions: Question[];
  submissions: number;
}
export interface RosterRow {
  requestId: number;
  requestNo: string;
  personId: number;
  personName: string;
  positionName: string | null;
  status: RequestStatus;
  mark: AttendanceMark | null;
  theory: number | null;
  submittedAt: string | null;
  practical: number | null;
  passed: boolean | null;
}
export interface MyAssessment {
  requestId: number;
  session: Session;
  state: 'notready' | 'open' | 'marking' | 'released';
  questions: Question[];
  theory: number | null;
  practical: number | null;
  passed: boolean | null;
  passTheory: number;
  passPractical: number;
}

export interface Notification {
  id: number;
  text: string;
  link: string;
  createdAt: string;
  read: boolean;
}
export interface AuditRow {
  id: number;
  at: string;
  byName: string;
  action: string;
  entity: string;
  ref: string;
}
export interface SyncRun {
  id: number;
  kind: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  rowsRead: number;
  inserted: number;
  updated: number;
  deactivated: number;
  message: string;
}
