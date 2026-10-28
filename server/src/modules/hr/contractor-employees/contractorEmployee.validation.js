import Joi from 'joi';

const ID = /^[1-9][0-9]{0,18}$/;
const NUMBER = /^[0-9]{1,18}$/;
const CONTROL = /^[^\p{Cc}]*$/u;
const text = (max) => Joi.string().trim().max(max).pattern(CONTROL).allow('', null).optional();
const date = Joi.string()
  .pattern(/^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/)
  .custom((value, helpers) => {
    const [year, month, day] = value.split('-').map(Number);
    const valid = new Date(Date.UTC(year, month - 1, day));
    return valid.getUTCFullYear() === year &&
      valid.getUTCMonth() === month - 1 &&
      valid.getUTCDate() === day
      ? value
      : helpers.error('date.invalid');
  })
  .messages({ 'date.invalid': '{{#label}} must be a real calendar date in YYYY-MM-DD format' });
const positiveId = Joi.alternatives().try(
  Joi.number().integer().min(1).max(Number.MAX_SAFE_INTEGER),
  Joi.string().pattern(ID),
);
const optionalNullableId = Joi.alternatives()
  .try(Joi.number().integer().min(0).max(Number.MAX_SAFE_INTEGER), Joi.string().pattern(NUMBER))
  .allow(null)
  .optional();

export const LOOKUP_NAMES = Object.freeze([
  'divisions',
  'departments',
  'contractors',
  'jobs',
  'bosses',
  'sections',
]);
export const DEPARTMENTS = Object.freeze(['Production', 'QC', 'Maintenance', 'W/H', 'Admin']);
export const DIVISIONS = Object.freeze(['300000003618177', '300000003618190', 'IBM', 'Z3P']);

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});
export const empIdParams = Joi.object({ empId: Joi.string().pattern(ID).required() });
export const conNumberParams = Joi.object({ conNumber: Joi.string().pattern(NUMBER).required() });
export const lookupParams = Joi.object({
  name: Joi.string()
    .valid(...LOOKUP_NAMES)
    .required(),
});

export const listQuerySchema = Joi.object({
  division: text(50),
  department: text(50),
  contractor_number: Joi.string().pattern(NUMBER),
  status: Joi.string().valid('Active', 'Inactive', 'ALL'),
  date_from: date,
  date_to: date,
  page: Joi.number().integer().min(1).max(100000).default(1),
  limit: Joi.number().integer().min(1).max(200).default(50),
  sort: Joi.string()
    .valid('employee_number', 'employee_name', 'start_date', 'end_date', 'status', 'con_number')
    .default('employee_number'),
  order: Joi.string().valid('asc', 'desc').default('asc'),
});

const serverOwned = {
  emp_id: Joi.any(),
  employee_number: Joi.any(),
  con_name: Joi.any(),
  job_title: Joi.any(),
  direct_boss: Joi.any(),
};
export const writeBodySchema = Joi.object({
  ...serverOwned,
  division: Joi.string()
    .valid(...DIVISIONS)
    .required(),
  con_number: positiveId.required(),
  status: Joi.string().valid('Active', 'Inactive').required(),
  rate: Joi.number().min(0).required(),
  employee_name: Joi.string()
    .trim()
    .min(1)
    .max(150)
    .pattern(/^[^\p{Cc}]+$/u)
    .required(),
  iqamah: Joi.number().integer().required(),
  department: Joi.string()
    .valid(...DEPARTMENTS)
    .required(),
  prod_dep: Joi.alternatives()
    .try(Joi.string().max(100).pattern(CONTROL), optionalNullableId)
    .allow(null),
  job: positiveId.required(),
  direct_boss_id: positiveId.required(),
  place: text(200),
  replacement: optionalNullableId,
  start_date: date.required(),
  end_date: date.allow(null),
  ajeer: Joi.boolean().default(false),
  sfda: Joi.boolean().default(false),
  blacklist: Joi.boolean().default(false),
  remark: text(4000),
})
  .custom((value, helpers) => {
    if (
      value.department === 'Production' &&
      (value.prod_dep === undefined || value.prod_dep === null || value.prod_dep === '')
    ) {
      return helpers.error('employee.productionSection');
    }
    if (value.end_date && value.end_date < value.start_date)
      return helpers.error('employee.dateOrder');
    return value;
  })
  .messages({
    'employee.productionSection': 'prod_dep is required for the Production department',
    'employee.dateOrder': 'end_date must be on or after start_date',
  });
