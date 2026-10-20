import Joi from 'joi';

// NUMBER(19,0) identifiers travel as decimal strings; never as JS numbers.
const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;
const page = Joi.number().integer().min(1).max(100000).default(1);
const limit = Joi.number().integer().min(1).max(100).default(25);
const search = Joi.string().trim().min(2).max(100).pattern(NO_CONTROL_CHARACTERS);

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});

export const listUsersQuerySchema = Joi.object({
  page,
  limit,
  search,
  status: Joi.string().valid('PENDING', 'ACTIVE', 'DISABLED'),
  mfaEnrolled: Joi.boolean(),
  locked: Joi.boolean(),
  sortBy: Joi.string()
    .valid('employeeNumber', 'username', 'createdAt', 'lastLoginAt')
    .default('employeeNumber'),
  sortOrder: Joi.string().valid('asc', 'desc').default('asc'),
});

export const candidatesQuerySchema = Joi.object({ page, limit, search, hasAccount: Joi.boolean() });

export const userIdParams = Joi.object({ userId: id.required() });
export const userSessionParams = Joi.object({ userId: id.required(), sessionId: id.required() });

// CK_ZRV_USERS_EMP: trimmed and non-blank; the master's EMPLOYEE_NUMBER is VARCHAR2.
export const provisionSchema = Joi.object({
  employeeNumber: Joi.string()
    .max(30)
    .pattern(/^[A-Za-z0-9][A-Za-z0-9_-]*$/)
    .required(),
});
