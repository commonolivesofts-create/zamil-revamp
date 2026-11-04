import Joi from 'joi';
import { STATUS_LABELS } from './orientationTraining.rules.js';

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
export const employeesQuerySchema = Joi.object({ search: requiredText(100).optional() });
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
  // Legacy statuses are stored in mixed case (Draft, INPROCESS, Approved, REJECTED, Rejected).
  status: Joi.string()
    .valid(...STATUS_LABELS)
    .insensitive(),
  empNo: text(50),
  empType: text(50),
  dateFrom: isoDate,
  dateTo: isoDate,
  sortBy: Joi.string()
    .valid('HEADER_ID', 'ORIENTATION_DURATION_FROM', 'EMPLOYEE_NAME', 'CREATION_DATE')
    .default('HEADER_ID'),
  sortDir: Joi.string().valid('asc', 'desc').default('desc'),
});

/** Variant of a record (legacy form/{id}/{Y|N}); header IDs of the two tables can overlap. */
export const recordQuerySchema = Joi.object({ flag: Joi.string().valid('Y', 'N') });

// Legacy time inputs use step="1" (HH:MM:SS); HH:MM is accepted too.
const time = Joi.string()
  .pattern(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/)
  .allow('', null);
const optionalDate = isoDate.allow('', null);

// Legacy line inputs: Training (read only), Department Head, From/To Date, Time From/To and Remark;
// none is required. Orientation Days and Orientation Time are computed by the server.
const line = Joi.object({
  lineId: id,
  department: requiredText(1000),
  departmentHead: text(1000).allow(null),
  fromDate: optionalDate,
  toDate: optionalDate,
  orientationDays: Joi.any().strip(),
  timeFrom: time,
  timeTo: time,
  orientationPeriod: Joi.any().strip(),
  remarks: text(1000).allow(null),
});

// Legacy posts Name (empno) and From; everything else is read only and filled from the employee
// or computed (To = From, Scheduled By, Ref #). Older clients still send those: accepted, ignored.
const ignored = Joi.any().strip();
const header = {
  empNo: requiredText(50),
  fromOrient: isoDate.required(),
  toOrient: ignored,
  startDate: ignored,
  orientationBy: ignored,
  flag: ignored,
  section: ignored,
  empname: ignored,
  personId: ignored,
  division: ignored,
  type: ignored,
  position: ignored,
  lines: Joi.array().items(line).min(1).required(),
};

const toMinutes = (value) => {
  const [hours, minutes] = value.split(':').map(Number);
  return hours * 60 + minutes;
};
// Legacy wrote "Select To Date" as the days and "-2.-30 Hrs" as the time of a reversed range; such
// a line is refused instead.
const validateLines = (value, helpers) => {
  if (value.lines.some((item) => item.fromDate && item.toDate && item.toDate < item.fromDate)) {
    return helpers.error('date.lineOrder');
  }
  if (
    value.lines.some(
      (item) => item.timeFrom && item.timeTo && toMinutes(item.timeTo) < toMinutes(item.timeFrom),
    )
  ) {
    return helpers.error('time.lineOrder');
  }
  return value;
};
const withLineRules = (schema) =>
  schema.custom(validateLines).messages({
    'date.lineOrder': 'Line toDate must be on or after fromDate',
    'time.lineOrder': 'Line timeTo must be on or after timeFrom',
  });

export const createBodySchema = withLineRules(Joi.object(header));
export const updateBodySchema = withLineRules(Joi.object(header));
