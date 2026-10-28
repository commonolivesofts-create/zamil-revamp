import Joi from 'joi';

const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const controls = /^[^\p{Cc}]+$/u;
const text = (max) => Joi.string().trim().max(max).pattern(controls).allow('').optional();
const requiredText = (max) => Joi.string().trim().min(1).max(max).pattern(controls).required();
const page = Joi.number().integer().min(1).max(100000).default(1);
const pageSize = Joi.number().integer().min(1).max(100).default(20);
const dateOnly = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isoDate = Joi.string()
  .pattern(dateOnly)
  .custom((value, helpers) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    return date.getUTCFullYear() === year &&
      date.getUTCMonth() === month - 1 &&
      date.getUTCDate() === day
      ? value
      : helpers.error('date.invalid');
  })
  .messages({ 'date.invalid': '{{#label}} must be a real calendar date in YYYY-MM-DD format' });

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});
export const headerIdParams = Joi.object({ headerId: id.required() });
export const lineIdParams = Joi.object({ headerId: id.required(), lineId: id.required() });
export const flagQuerySchema = Joi.object({ empNo: requiredText(50) });
export const employeeDetailsQuerySchema = Joi.object({ empNo: requiredText(50) });
export const skillsQuerySchema = Joi.object({ empType: requiredText(50) });

export const SKILLS_BY_TYPE = Object.freeze({
  Supervisor: Object.freeze([
    'Training with HR Dept',
    'Training with safety Dept',
    'Meeting with Manager',
    'Meeting with his director',
    'Training with IT Dept',
    'Tour around factory',
    'Meeting with HR to make sure all tasks are clear',
  ]),
  Manager: Object.freeze([
    'Training with HR Dept',
    'Training with safety Dept',
    'Meeting with all directors',
    'Meeting with General Manager',
    'Training with IT Dept',
    'Tour around factory',
    'Meeting with HR to make sure all tasks are clear',
  ]),
  Employee: Object.freeze([
    'Training with HR Dept',
    'Training with safety Dept',
    'Training with IT Dept',
    'Tour around factory',
    'Meeting with HR to make sure all tasks are clear',
  ]),
  plant: Object.freeze([
    'Quality Assurance / Control',
    'Planning',
    'HR Department',
    'Production / Process',
    'Maintenance',
    'Tool Room',
    'Warehouse & Shipping',
    'Safety',
    'Administration and HR',
    'Purchasing',
    'Finance',
    'IT',
  ]),
});

export const listQuerySchema = Joi.object({
  flag: Joi.string().valid('Y', 'N').required(),
  page,
  pageSize,
  search: text(100),
  status: Joi.string().valid('Draft', 'Inprocess', 'Approved'),
  empNo: text(50),
  empType: text(50),
  dateFrom: isoDate,
  dateTo: isoDate,
  sortBy: Joi.string()
    .valid('HEADER_ID', 'ORIENTATION_DURATION_FROM', 'EMPLOYEE_NAME', 'CREATION_DATE')
    .default('HEADER_ID'),
  sortDir: Joi.string().valid('asc', 'desc').default('desc'),
});

const line = Joi.object({
  lineId: id,
  department: requiredText(200),
  departmentHead: requiredText(200),
  fromDate: isoDate.required(),
  toDate: isoDate.required(),
  orientationDays: Joi.number().integer().min(0).required(),
  timeFrom: Joi.string()
    .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .required(),
  timeTo: Joi.string()
    .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
    .required(),
  orientationPeriod: text(50),
  remarks: text(2000),
});

const header = {
  empNo: requiredText(50),
  fromOrient: isoDate.required(),
  toOrient: isoDate.required(),
  startDate: isoDate,
  orientationBy: text(200),
  // Accepted for payload compatibility only. The service always resolves the effective flag.
  flag: Joi.string().valid('Y', 'N'),
  section: requiredText(200),
  empname: requiredText(200),
  personId: requiredText(50),
  division: requiredText(200),
  type: requiredText(50),
  position: requiredText(200),
  lines: Joi.array().items(line).min(1).required(),
};

const validateDateRanges = (value, helpers) => {
  if (value.toOrient < value.fromOrient) return helpers.error('date.headerOrder');
  if (
    value.lines.some((item) => item.fromDate < value.fromOrient || item.toDate > value.toOrient)
  ) {
    return helpers.error('date.lineRange');
  }
  if (value.lines.some((item) => item.toDate < item.fromDate))
    return helpers.error('date.lineOrder');
  return value;
};
const dates = (schema) =>
  schema.custom(validateDateRanges).messages({
    'date.headerOrder': 'toOrient must be on or after fromOrient',
    'date.lineRange': 'Line dates must be within the header orientation dates',
    'date.lineOrder': 'Line toDate must be on or after fromDate',
  });

export const createBodySchema = dates(Joi.object(header));
export const updateBodySchema = dates(
  Joi.object({
    ...header,
    lines: Joi.array().items(line).min(1).required(),
  }),
);
