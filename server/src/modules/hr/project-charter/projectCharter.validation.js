import Joi from 'joi';

const id = Joi.string()
  .pattern(/^[1-9][0-9]{0,18}$/)
  .required();

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

const optional = (max = 4000) => Joi.string().trim().max(max).allow('', null);

const required = (max = 4000) => Joi.string().trim().min(1).max(max).required();

const milestone = Joi.object({
  start: Joi.boolean().default(false),
  complete: Joi.boolean().default(false),
}).default();

const milestoneFields = [
  'formProjectTeam',
  'finalizePlan',
  'definePhase',
  'analysisPhase',
  'improvementPhase',
  'controlPhase',
  'projectSummary',
];

export const charterParams = Joi.object({
  headerId: id,
});

export const ideaParams = Joi.object({
  ideaId: id,
});

export const employeeParams = Joi.object({
  empNo: Joi.string().trim().max(30).required(),
});

export const empty = Joi.object({});

export const listQuery = Joi.object({
  q: optional(200),
  ideaNo: optional(100),
  status: Joi.string().valid('Pending'),

  projectManager: optional(200),
  processOwner: optional(200),

  from: date,
  to: date,
  createdFrom: date,
  createdTo: date,

  page: Joi.number().integer().min(1).default(1),

  pageSize: Joi.number().integer().min(1).max(100).default(25),
});

export const employeesQuery = Joi.object({
  q: optional(100),
  scope: optional(30),

  page: Joi.number().integer().min(1).default(1),

  pageSize: Joi.number().integer().min(1).max(100).default(25),
});

const fields = {
  projectManager: required(240),
  processImpacted: optional(),

  expectedStartDate: date.required(),
  expectedEndDate: date.required(),

  purpose: required(),
  expectedDeliverables: required(),

  milestones: Joi.object(Object.fromEntries(milestoneFields.map((k) => [k, milestone]))).default(),

  projectTeam: optional(),
  supportResources: optional(),
  specialNeeds: optional(),
  processOwner: optional(240),
  keyStakeholders: optional(),
  finalCustomer: optional(),
  preparedBy: optional(240),
};

// Server-derived fields, status, creationDate,
// and idea reassignment are not accepted.

export const createBody = Joi.object({
  ideaId: id,
  ...fields,
});

export const updateBody = Joi.object(fields);

// Reward writes remain disabled until
// grading thresholds are confirmed.

export const rewardBody = Joi.object({
  actualSavings: Joi.number().min(0).required(),
});
