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

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});
export const headerIdParams = Joi.object({ headerId: id.required() });
export const employeeDetailsQuerySchema = Joi.object({ empName: requiredText(200) });

export const listQuerySchema = Joi.object({
  page,
  pageSize,
  search: text(100),
  requestStatus: Joi.string().valid('DRAFT', 'INPROCESS', 'APPROVED', 'Rejected'),
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

const lineBase = {
  param: Joi.string().trim().min(1).pattern(NO_CONTROL_CHARACTERS).required(),
  paramAr: Joi.string().trim().pattern(NO_CONTROL_CHARACTERS).allow('').optional(),
  // Empty legacy ratings are stored as zero; a supplied rating must be 1–5.
  rating: Joi.number().integer().valid(1, 2, 3, 4, 5).default(0),
};

const headerBase = {
  formDate: isoDate.required(),
  evaluationPeriod: text(200),
  formType: Joi.string()
    .valid(...FORM_TYPES)
    .required(),
  employeeName: requiredText(200),
  employeeNumber: requiredText(50),
  empId: text(50),
  grade: Joi.number().integer().min(0).default(0),
  jobTitle: text(200),
  department: text(200),
  fromDate: isoDate.required(),
  toDate: isoDate.required(),
  comment: text(4000),
  // `comments` maps to APPROVED_BY_CMNT and exists in the legacy write form.
  comments: text(4000),
  totalRating: Joi.number().integer().min(0).max(100),
};

const withDateOrder = (schema) =>
  schema
    .custom((value, helpers) => {
      if (value.fromDate && value.toDate && value.toDate < value.fromDate) {
        return helpers.error('date.order');
      }
      return value;
    })
    .messages({ 'date.order': 'toDate must be on or after fromDate' });

export const createBodySchema = withDateOrder(
  Joi.object({
    ...headerBase,
    lines: Joi.array().items(Joi.object(lineBase)).min(1).max(20).required(),
  }),
);

export const updateBodySchema = withDateOrder(
  Joi.object({
    ...headerBase,
    lines: Joi.array()
      .items(Joi.object({ ...lineBase, lineId: id.required() }))
      .min(1)
      .max(20)
      .required(),
  }),
);
