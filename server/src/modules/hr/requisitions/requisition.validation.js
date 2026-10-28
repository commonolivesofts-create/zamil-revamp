import Joi from 'joi';

/*
 * Personal Requisition Form request schemas (README_personal_requisition_form.md §3.2, §7.1, §9).
 * NUMBER(19,0) identifiers travel as decimal strings; legacy DB column spellings and enums
 * (REASON_OF_REQ values, GCC_EXP/WORK_EXP ranges, ATTRIBUTE1 ticket values) are kept because
 * renaming requires a DB migration (README §10.9). `requestDate` exists only on insert: update
 * never touches REQUEST_DATE (README §5.1), so it is rejected there as an unknown field.
 */
const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const nullableId = Joi.string()
  .pattern(/^[0-9]{1,19}$/)
  .allow('')
  .optional();
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;
const text = (max) =>
  Joi.string().trim().max(max).pattern(NO_CONTROL_CHARACTERS).allow('').allow(null).optional();
const requiredText = (max) =>
  Joi.string().trim().min(1).max(max).pattern(NO_CONTROL_CHARACTERS).required();
const date = Joi.string().isoDate();
const yn = Joi.string().valid('Y', 'N');
const experienceRange = Joi.string().valid('0 - 2', '2 - 5', '5 - 10', '> 10');

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});

export const requisitionIdParams = Joi.object({ requisitionId: id.required() });
export const attachmentParams = Joi.object({
  requisitionId: id.required(),
  attachmentId: id.required(),
});

// README §9 validation rules shared by insert and update.
const writeFields = {
  jobId: nullableId,
  jobName: requiredText(200),
  deptId: nullableId,
  deptName: requiredText(200),
  dateNeeded: date.required(),
  reasonOfReq: Joi.string().valid('Replacement', 'Addition').required(),
  replacementFor: Joi.when('reasonOfReq', {
    is: Joi.string().valid('Replacement'),
    then: requiredText(200),
    otherwise: text(200),
  }),
  reason: Joi.when('reasonOfReq', {
    is: Joi.string().valid('Addition'),
    then: requiredText(4000),
    otherwise: text(4000),
  }),
  budgeted: yn.default('N'),
  budgetedSal: Joi.number().min(0).default(0),
  highSchool: yn.default('N'),
  diploma: yn.default('N'),
  higherDiploma: yn.default('N'),
  degree: yn.default('N'),
  masterDegree: yn.default('N'),
  gccExp: experienceRange.default('0 - 2'),
  workExp: experienceRange.default('0 - 2'),
  skills: text(4000),
  other: text(4000),
  remark: text(4000),
  totalPackage: Joi.number().min(0).allow(null).optional(),
  // HR-only (server-side role check, README §9); absence on update means "preserve".
  ticketStatus: Joi.string().valid('', 'Open', 'Accepted', 'Close').optional(),
};

export const createBodySchema = Joi.object({
  requestDate: date.required(),
  ...writeFields,
});

export const updateBodySchema = Joi.object({ ...writeFields });

// §7.1 query parameters (README verbatim: page/pageSize/sortBy/sortDir).
const page = Joi.number().integer().min(1).max(100000).default(1);
const pageSize = Joi.number().integer().min(1).max(100).default(20);
const nameFilter = Joi.string().trim().min(1).max(100).pattern(NO_CONTROL_CHARACTERS);

export const listQuerySchema = Joi.object({
  page,
  pageSize,
  requisitionStatus: Joi.string().valid('Draft', 'Inprocess', 'Approved', 'Rejected'),
  ticketStatus: Joi.string().valid('Open', 'Accepted', 'Close'),
  requisitionId: id,
  requesterName: nameFilter,
  jobName: nameFilter,
  deptName: nameFilter,
  reasonOfReq: Joi.string().valid('Replacement', 'Addition'),
  dateFrom: date,
  dateTo: date,
  search: nameFilter,
  createdBy: Joi.string().pattern(/^[0-9]{1,19}$/),
  sortBy: Joi.string()
    .valid('requisitionId', 'requestDate', 'dateNeeded', 'requesterName', 'creationDate')
    .default('requisitionId'),
  sortDir: Joi.string().valid('asc', 'desc').default('desc'),
});

export const budgetQuerySchema = Joi.object({ fullName: requiredText(200) });

// Attachment policy (README §9): legacy extension allowlist plus the owner-approved
// size cap (10 MB per file) and per-request count cap (10 files).
export const ATTACHMENT_EXTENSIONS = Object.freeze([
  'jpg',
  'jpeg',
  'png',
  'gif',
  'txt',
  'doc',
  'docx',
  'pdf',
  'xls',
  'xlsx',
  'csv',
  'html',
  'ppt',
  'pptx',
  'odt',
]);
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;
export const MAX_ATTACHMENT_FILES = 10;
