import Joi from 'joi';
import { dbText } from '../formText.validation.js';

/*
 * Interview Assessment Form request schemas (README_interview_assessment_form.md §3.2, §7.1, §9).
 * NUMBER(19,0) identifiers travel as decimal strings; legacy DB column spellings (materialStatus,
 * SAFTY_AWARENESS via rate7, NATION_CONFIRT via cRating4, sumWeekness, managningDirector) are kept
 * in the API contract because renaming requires a DB migration (README §10.8).
 */
const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;
const text = (max) =>
  Joi.string().trim().max(max).pattern(NO_CONTROL_CHARACTERS).allow('').optional();

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});

export const headerIdParams = Joi.object({ headerId: id.required() });

// §7.1 query parameters (owner-approved: README verbatim, page/pageSize/sortBy/sortDir).
const page = Joi.number().integer().min(1).max(100000).default(1);
const pageSize = Joi.number().integer().min(1).max(100).default(20);
// Date-only values (docs/02 §4). Joi's .isoDate() converts the value into a full timestamp, so
// the YYYY-MM-DD shape and the calendar validity are checked explicitly and the original
// string is kept for the service's TO_DATE conversion.
const DATE_ONLY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isoDate = Joi.string()
  .pattern(DATE_ONLY)
  .custom((value, helpers) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return helpers.error('date.invalid');
    }
    return value;
  })
  .messages({ 'date.invalid': '{{#label}} must be a real calendar date in YYYY-MM-DD format' });

export const listQuerySchema = Joi.object({
  page,
  pageSize,
  search: text(100),
  status: Joi.string().valid('Incomplete', 'Inprocess', 'Approved', 'Rejected'),
  evaluationStatus: Joi.string().valid('Passed', 'Hold', 'Failed'),
  requisitionNo: text(100),
  positionName: text(200),
  division: Joi.string().valid('Food', 'Non-Food'),
  interviewType: Joi.string().valid('Personal', 'Online'),
  dateFrom: isoDate,
  dateTo: isoDate,
  createdBy: id,
  sortBy: Joi.string()
    .valid('HEADER_ID', 'INTERVIEW_DATE', 'CANDIDATE_NAME', 'CREATION_DATE')
    .default('HEADER_ID'),
  sortDir: Joi.string().valid('asc', 'desc').default('desc'),
});

// Ratings are "1"–"5" or "N/A"; empty is accepted and stored as '-' (README §1.2, §9).
const rating = Joi.string().valid('1', '2', '3', '4', '5', 'N/A').allow('').optional();
const amount = Joi.number().min(0).optional();
const count = Joi.number().integer().min(0).optional();
// APP_BU_INFO payroll BUs and their labels (README §1.1). APP_BU_INFO does not exist in the ADW
// schema, so the spec's fixed values are served from here by GET /lookups/payroll-units.
export const PAYROLL_UNITS = Object.freeze([
  Object.freeze({ code: '300000003618177', name: 'IPP' }),
  Object.freeze({ code: '300000003618190', name: 'FPP' }),
]);
const BU_VALUES = PAYROLL_UNITS.map((unit) => unit.code);

const personalSpecSchema = Joi.object({
  rate1: rating,
  remark1: dbText(200),
  rate2: rating,
  remark2: dbText(200),
  rate3: rating,
  remark3: dbText(200),
  rate4: rating,
  remark4: dbText(200),
  rate5: rating,
  remark5: dbText(200),
  rate6: rating,
  remark6: dbText(200),
  rate7: rating,
  remark7: dbText(200),
  rate8: rating,
  remark8: dbText(200),
  // Client totals are accepted but recomputed server-side (README §9).
  rate9: count,
  remarks: text(500),
});

const jobCompetencySchema = Joi.object({
  cRating1: rating,
  cRemark1: dbText(200),
  cRating2: rating,
  cRemark2: dbText(200),
  cRating3: rating,
  cRemark3: dbText(200),
  cRating4: rating,
  cRemark4: dbText(200),
  cRating5: rating,
  cRemark5: dbText(200),
  cRating6: rating,
  cRemark6: dbText(200),
  cRating7: count,
  cRemarks: text(500),
  sumStrength: dbText(200, { multiline: true }),
  sumWeekness: dbText(200, { multiline: true }),
});

const evaluationSchema = Joi.object({
  status: Joi.string().valid('Passed', 'Hold', 'Failed').required(),
  interviewedBy: dbText(50),
  adminManager: dbText(50),
  hrRep: dbText(50),
  deptRep: dbText(50),
  comment: dbText(50),
  managningDirector: dbText(50),
});

/**
 * Full create/update payload (README §3.2) for both POST and PUT: the edit form replaces all four
 * sections. `status` is only ever written as 'Incomplete' on insert; PUT never changes it.
 */
export const writeBodySchema = Joi.object({
  candidateName: dbText(200, { required: true }),
  requisitionNo: dbText(50, { required: true }),
  positionName: dbText(200, { required: true }),
  attribute3: Joi.string()
    .trim()
    .valid(...BU_VALUES)
    .required(),
  nationality: text(100),
  materialStatus: Joi.string().valid('Single', 'Married').allow('').optional(),
  age: Joi.number().integer().min(18).max(70).optional(),
  interviewDate: isoDate,
  interviewTime: text(20),
  interviewType: Joi.string().valid('Personal', 'Online').allow('').optional(),
  secondaryEducation: Joi.string()
    .valid('Secondary Education', 'Diploma', 'Degree', 'Masters Degree')
    .allow('')
    .optional(),
  secondaryEducationChk: Joi.string().valid('Yes', 'No').allow('').optional(),
  lastPositionHeld: text(200),
  companyName: text(200),
  relevantYearsExperience: Joi.number().integer().min(0).max(50).optional(),
  location: text(100),
  currentEmployer: text(200),
  joining: isoDate,
  major: text(100),
  division: Joi.string().valid('Food', 'Non-Food').allow('').optional(),
  curSalBasic: amount,
  expSalBasic: amount,
  curSalTotal: amount,
  expSalTotal: amount,
  interviewedBy: text(200),
  interviewedBy2: text(200),
  interviewedBy3: text(200),
  status: Joi.string().valid('Incomplete').default('Incomplete'),
  personalSpec: personalSpecSchema,
  jobCompetency: jobCompetencySchema,
  // Required: EVAL_STATUS is a NOT NULL column and the service reads evaluation.status.
  evaluation: evaluationSchema.required(),
});
