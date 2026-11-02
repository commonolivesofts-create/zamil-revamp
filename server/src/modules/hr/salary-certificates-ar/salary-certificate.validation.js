
import Joi from 'joi';

const date = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const parsed = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(parsed.getTime()) &&
      parsed.toISOString().slice(0, 10) === value
      ? value
      : helpers.error('any.invalid');
  });

const ascii = (s) =>
  typeof s === 'string'
    ? s
        .replace(/[٠-٩]/g, (c) =>
          String(c.charCodeAt(0) - 0x660)
        )
        .replace(/[۰-۹]/g, (c) =>
          String(c.charCodeAt(0) - 0x6f0)
        )
    : s;

export { ascii };

export const idParams = Joi.object({
  id: Joi.number().integer().positive().required(),
});

export const empParams = Joi.object({
  empNo: Joi.string().trim().max(80).required(),
});

export const empty = Joi.object({});

export const listQuery = Joi.object({
  q: Joi.string().trim().max(150),

  employeeNo: Joi.string().trim().max(80),

  division: Joi.string().trim().max(150),

  status: Joi.string().valid('DRAFT'),

  from: date,
  to: date,

  createdFrom: date,
  createdTo: date,

  page: Joi.number()
    .integer()
    .min(1)
    .default(1),

  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(25),
});

export const pickerQuery = Joi.object({
  q: Joi.string().trim().max(80).allow(''),

  page: Joi.number()
    .integer()
    .min(1)
    .default(1),

  pageSize: Joi.number()
    .integer()
    .min(1)
    .max(100)
    .default(25),
});

// Employee and salary snapshot fields are server-owned.
// Client overrides are not accepted.

export const writeBody = Joi.object({
  employeeNo: Joi.string()
    .trim()
    .max(80)
    .required(),

  certDate: date.optional(),

  toEmpName: Joi.string()
    .trim()
    .min(1)
    .max(1000)
    .required(),

  approvalName: Joi.string()
    .trim()
    .min(1)
    .max(500)
    .required(),

  allowanceFlag: Joi.string()
    .valid('Yes', 'No')
    .required(),

  empNameList: Joi.string()
    .trim()
    .max(2000)
    .allow('', null),

  // Required consistency assertion.
  // The actual stored value comes from Oracle.
  joiningDate: date.required(),
}).unknown(false);
