import Joi from 'joi';

const rating = Joi.string().valid('A', 'AS', 'BS', 'CS');

const department = Joi.string().valid('production', 'shared-services');

const date = Joi.string().pattern(/^\d{4}-\d{2}-\d{2}$/);

export const headerIdParams = Joi.object({
  headerId: Joi.string()
    .pattern(/^[1-9]\d*$/)
    .required(),
});

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});

export const criteriaQuerySchema = Joi.object({
  department: department.required(),
});

export const employeeQuerySchema = Joi.object({
  empNo: Joi.string().max(100),
  name: Joi.string().max(200),
  email: Joi.string().max(200),
  limit: Joi.number().integer().min(1).max(100).default(50),
});

export const listQuerySchema = Joi.object({
  search: Joi.string().max(200),

  status: Joi.string().valid('DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED'),

  department,
  employeeNumber: Joi.string().max(100),
  requestNo: Joi.string().max(100),

  date_from: date,
  date_to: date,

  page: Joi.number().integer().min(1).default(1),

  pageSize: Joi.number().integer().min(1).max(100).default(25),

  sort: Joi.string()
    .valid('headerId', 'requestNo', 'employeeName', 'activityDate', 'status', 'createdAt')
    .default('createdAt'),

  order: Joi.string().valid('asc', 'desc').default('desc'),
});

const employee = Joi.object({
  number: Joi.string().required(),
  name: Joi.string().required(),
  email: Joi.string().required(),
  position: Joi.string().required(),
  departmentName: Joi.string().required(),
}).required();

const line = Joi.object({
  lineNumber: Joi.number().integer().min(0).required(),
  rating: rating.required(),
  remark: Joi.string().min(1).max(500).required(),
});

export const createBodySchema = Joi.object({
  department: department.required(),
  employee,
  activityDate: date.required(),
  overallRating: rating.required(),
  remark: Joi.string().min(1).required(),
  lines: Joi.array().items(line).required(),
});

export const updateBodySchema = createBodySchema;

// Map Joi failures to the documented EMF error codes.
export function validationCode(path, type) {
  if (path.startsWith('department')) {
    return 'INVALID_DEPARTMENT';
  }

  if (path.startsWith('activityDate') || path === 'date_from' || path === 'date_to') {
    return 'INVALID_DATE';
  }

  if (path === 'overallRating' || /^lines\.\d+\.rating$/.test(path)) {
    return 'INVALID_RATING';
  }

  if (path === 'lines' || /^lines\.\d+\.lineNumber$/.test(path)) {
    return 'INVALID_LINE_COUNT';
  }

  if (/^lines\.\d+\.remark$/.test(path) && type === 'string.max') {
    return 'LINE_REMARK_TOO_LONG';
  }

  if (path === 'remark' && type === 'string.max') {
    return 'REMARK_TOO_LONG';
  }

  return 'REQUIRED_FIELD';
}
