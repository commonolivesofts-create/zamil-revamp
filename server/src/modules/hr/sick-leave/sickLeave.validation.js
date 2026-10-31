import Joi from 'joi';

const date = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((v, h) => {
    const [y, m, d] = v.split('-').map(Number);
    const x = new Date(Date.UTC(y, m - 1, d));

    return x.getUTCFullYear() === y && x.getUTCMonth() === m - 1 && x.getUTCDate() === d
      ? v
      : h.error('any.invalid');
  });

const id = Joi.string()
  .pattern(/^[1-9][0-9]{0,18}$/)
  .required();

export const idParams = Joi.object({
  headerId: id,
});

export const attachmentParams = Joi.object({
  headerId: id,
  attachmentId: id,
});

export const employeeParams = Joi.object({
  empNumber: Joi.string().trim().max(40).required(),
});

export const empty = Joi.object({});

export const employeesQuery = Joi.object({
  q: Joi.string().trim().max(100).allow(''),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
});

export const listQuery = Joi.object({
  status: Joi.string()
    .trim()
    .uppercase()
    .valid('DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED', 'ALL')
    .default('ALL'),

  from: date,
  to: date,

  empId: Joi.string().max(40),
  empName: Joi.string().max(200),

  mine: Joi.boolean().default(false),

  page: Joi.number().integer().min(1).default(1),

  pageSize: Joi.number().integer().min(1).max(100).default(25),
});

export const writeBody = Joi.object({
  empNumber: Joi.string().trim().max(40).required(),

  leaveType: Joi.string().trim().max(100).required(),

  fromDate: date.required(),
  toDate: date.required(),

  fromDayType: Joi.string().valid('FULL', 'HALF').required(),

  toDayType: Joi.string().valid('FULL', 'HALF').required(),

  comments: Joi.string().trim().min(1).max(2000).required(),

  // Never trust values controlled by the client.
  days: Joi.any().strip(),
  empName: Joi.any().strip(),
  status: Joi.any().strip(),
  createdBy: Joi.any().strip(),
});
