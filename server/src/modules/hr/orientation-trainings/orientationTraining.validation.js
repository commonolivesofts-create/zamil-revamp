import Joi from 'joi';
import { dbText } from '../formText.validation.js';
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
  department: dbText(1000, { required: true }),
  departmentHead: dbText(1000, { nullable: true }),
  fromDate: optionalDate,
  toDate: optionalDate,
  orientationDays: Joi.any().strip(),
  timeFrom: time,
  timeTo: time,
  orientationPeriod: Joi.any().strip(),
  remarks: dbText(1000, { multiline: true, nullable: true }),
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

const toSeconds = (value) => {
  const [hours, minutes, seconds = 0] = value.split(':').map(Number);
  return hours * 3600 + minutes * 60 + seconds;
};
// Legacy wrote "Select To Date" as the days and "-2.-30 Hrs" as the time of a reversed range; such
// a line is refused instead.
const validateLines = (value, helpers) => {
  for (const [index, item] of value.lines.entries()) {
    const row = index + 1;
    if (Boolean(item.fromDate) !== Boolean(item.toDate)) {
      return helpers.error('date.linePair', {
        field: `lines.${index}.${item.fromDate ? 'toDate' : 'fromDate'}`,
        row,
      });
    }
    if (item.fromDate && item.toDate && item.toDate < item.fromDate) {
      return helpers.error('date.lineOrder', { field: `lines.${index}.toDate`, row });
    }
    if (Boolean(item.timeFrom) !== Boolean(item.timeTo)) {
      return helpers.error('time.linePair', {
        field: `lines.${index}.${item.timeFrom ? 'timeTo' : 'timeFrom'}`,
        row,
      });
    }
    if (item.timeFrom && item.timeTo && toSeconds(item.timeTo) <= toSeconds(item.timeFrom)) {
      return helpers.error('time.lineOrder', { field: `lines.${index}.timeTo`, row });
    }
    if (!item.fromDate || !item.toDate || !item.timeFrom || !item.timeTo) continue;
    for (let prior = 0; prior < index; prior += 1) {
      const earlier = value.lines[prior];
      if (!earlier.fromDate || !earlier.toDate || !earlier.timeFrom || !earlier.timeTo) continue;
      const datesOverlap = earlier.fromDate <= item.toDate && item.fromDate <= earlier.toDate;
      const timesOverlap =
        toSeconds(earlier.timeFrom) < toSeconds(item.timeTo) &&
        toSeconds(item.timeFrom) < toSeconds(earlier.timeTo);
      if (datesOverlap && timesOverlap) {
        return helpers.error('time.overlap', {
          field: `lines.${index}.timeFrom`,
          row,
          prior: prior + 1,
        });
      }
    }
  }
  return value;
};
const withLineRules = (schema) =>
  schema.custom(validateLines).messages({
    'date.linePair': 'Training row {{#row}} needs both From and To dates',
    'date.lineOrder': 'Training row {{#row}}: To date must be on or after From date',
    'time.linePair': 'Training row {{#row}} needs both From and To times',
    'time.lineOrder': 'Training row {{#row}}: To time must be after From time',
    'time.overlap': 'Training row {{#row}} overlaps with row {{#prior}}. Choose another time',
  });

export const createBodySchema = withLineRules(Joi.object(header));
export const updateBodySchema = withLineRules(Joi.object(header));
