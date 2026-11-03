import Joi from 'joi';

const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;
const text = (max) =>
  Joi.string().trim().max(max).pattern(NO_CONTROL_CHARACTERS).allow('').optional();
const requiredText = (max) =>
  Joi.string().trim().min(1).max(max).pattern(NO_CONTROL_CHARACTERS).required();
const page = Joi.number().integer().min(1).max(100000).default(1);
const pageSize = Joi.number().integer().min(1).max(100).default(20);
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

export const FORM_TYPES = Object.freeze([
  'Workers_Technicians',
  'Trainee',
  'Engineers_Staff',
  'Department_Managers',
  'Supervisors_and_Foremens',
]);

// REQUEST_STATUS values the legacy form writes (insert, then Probation_Model::updateRequestStatus).
export const REQUEST_STATUSES = Object.freeze(['DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED']);

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});
export const headerIdParams = Joi.object({ headerId: id.required() });
export const employeesQuerySchema = Joi.object({ search: text(100) });
export const employeeDetailsQuerySchema = Joi.object({ empName: requiredText(200) });
export const criteriaQuerySchema = Joi.object({
  formType: Joi.string()
    .valid(...FORM_TYPES)
    .required(),
});

export const listQuerySchema = Joi.object({
  page,
  pageSize,
  search: text(100),
  requestStatus: Joi.string().valid(...REQUEST_STATUSES),
  formType: Joi.string().valid(...FORM_TYPES),
  empNumber: text(50),
  department: text(200),
  dateFrom: isoDate,
  dateTo: isoDate,
  sortBy: Joi.string()
    .valid('HEADER_ID', 'CREATED_AT', 'EMP_NAME', 'TOTAL_RATING')
    .default('HEADER_ID'),
  // The authoritative PAF spec and existing HR modules call this sortDir.
  sortDir: Joi.string().valid('asc', 'desc').default('desc'),
});

// Every probation text column is VARCHAR2(500) (TEST dictionary).
const COLUMN = 500;
const rating = Joi.number().integer().valid(1, 2, 3, 4, 5);
// Values the server takes from elsewhere (employee master, criteria of the form type, session, the
// ratings) or that the legacy form never sends: accepted from older clients, then discarded.
const ignored = Joi.any().strip();
const IGNORED_HEADER = Object.freeze({
  evaluationPeriod: ignored,
  empId: ignored,
  grade: ignored,
  employeeName: ignored,
  jobTitle: ignored,
  department: ignored,
  totalRating: ignored,
  evaluationResult: ignored,
});

/**
 * The legacy create form (probation.php): form type, employee, joining date (prf_date, an editable
 * input filled with the employee's joining date) and the evaluation period are entered; Comments
 * and Suggestion are read only until the first save; each criterion of the form type takes an
 * optional 1–5 rating (blank is stored as 0). Criterion texts come from the form type.
 */
export const createBodySchema = Joi.object({
  ...IGNORED_HEADER,
  formType: Joi.string()
    .valid(...FORM_TYPES)
    .required(),
  employeeNumber: requiredText(50),
  formDate: isoDate,
  fromDate: isoDate.required(),
  toDate: isoDate.required(),
  comment: ignored,
  comments: ignored,
  lines: Joi.array()
    .items(Joi.object({ rating: rating.optional(), param: ignored, paramAr: ignored }))
    .max(20)
    .default([]),
})
  .custom((value, helpers) => {
    if (value.toDate < value.fromDate) return helpers.error('date.order');
    return value;
  })
  .messages({ 'date.order': 'toDate must be on or after fromDate' });

/**
 * The legacy edit form (prf_uplines.php) saves only Comments, Suggestion and the ratings, and
 * requires all of them; the other header fields are shown but not saved.
 */
export const updateBodySchema = Joi.object({
  ...IGNORED_HEADER,
  formType: ignored,
  employeeNumber: ignored,
  formDate: ignored,
  fromDate: ignored,
  toDate: ignored,
  comment: requiredText(COLUMN),
  comments: requiredText(COLUMN),
  lines: Joi.array()
    .items(
      Joi.object({
        lineId: id.required(),
        rating: rating.required(),
        param: ignored,
        paramAr: ignored,
      }),
    )
    .max(20)
    .unique('lineId')
    .required(),
});
