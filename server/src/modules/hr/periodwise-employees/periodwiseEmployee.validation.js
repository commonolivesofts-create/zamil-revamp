import Joi from 'joi';

const controls = /^[^\p{Cc}]+$/u;
const text = (max) => Joi.string().trim().max(max).pattern(controls).allow('').optional();
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

export const ALL_DEPARTMENTS = 'ALL';
export const STATUSES = Object.freeze(['ALL', 'ACTIVE', 'LEFT']);
// [band, minimum age, maximum age] of the active employees' age bands.
export const AGE_BANDS = Object.freeze([
  Object.freeze(['UNDER_30', 0, 29]),
  Object.freeze(['30_39', 30, 39]),
  Object.freeze(['40_49', 40, 49]),
  Object.freeze(['50_59', 50, 59]),
  Object.freeze(['60_PLUS', 60, 200]),
]);
export const SORT_KEYS = Object.freeze([
  'employeeNumber',
  'name',
  'birthDate',
  'age',
  'nationality',
  'jobTitle',
  'departmentName',
  'position',
  'startDate',
  'years',
  'endDate',
  'leavingReason',
]);

export const emptyQuerySchema = Joi.object({});

/**
 * Report scope (dateFrom, dateTo, department, status: also the scope of `summary`) and table
 * refinements (search, nationality, ageBand, flagged: rows only), sort and page.
 */
export const reportQuerySchema = Joi.object({
  dateFrom: isoDate.required(),
  // Reported on dateTo; ISO dates compare correctly as strings.
  dateTo: isoDate
    .required()
    .custom((value, helpers) => {
      const { dateFrom } = helpers.state.ancestors[0];
      return typeof dateFrom === 'string' && value < dateFrom ? helpers.error('date.order') : value;
    })
    .messages({ 'date.order': '"dateTo" must be on or after "dateFrom"' }),
  department: Joi.alternatives()
    .try(Joi.string().valid(ALL_DEPARTMENTS), Joi.string().pattern(/^[0-9]{1,19}$/))
    .default(ALL_DEPARTMENTS),
  status: Joi.string()
    .valid(...STATUSES)
    .default('ALL'),
  search: text(100),
  nationality: text(100),
  ageBand: Joi.string().valid(...AGE_BANDS.map(([band]) => band)),
  flagged: Joi.boolean().default(false),
  sortBy: Joi.string()
    .valid(...SORT_KEYS)
    .default('employeeNumber'),
  sortDir: Joi.string().valid('asc', 'desc').default('desc'),
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
});
