import Joi from 'joi';

const ID = /^[1-9][0-9]{0,18}$/;
const CONTROL = /^[^\p{Cc}]+$/u;
const text = (max, required = false) => {
  const schema = Joi.string().trim().max(max).pattern(CONTROL).allow('');
  return required ? schema.min(1).required() : schema.optional();
};
const identifier = Joi.string().pattern(ID);
const year = Joi.number().integer().min(2000).max(2200);

export const headerIdParams = Joi.object({ headerId: identifier.required() });
export const employeeNameParams = Joi.object({ name: text(200, true) });
export const emptyBodySchema = Joi.object({});
export const emptyQuerySchema = Joi.object({});
export const employeeLookupQuerySchema = Joi.object({ year: year });
export const listQuerySchema = Joi.object({
  year: year,
  page: Joi.number().integer().min(1).max(100000).default(1),
  pageSize: Joi.number().integer().min(1).max(100).default(25),
  search: text(100),
  status: text(50),
  grade: Joi.string().valid('A', 'B', 'C', 'D', 'E'),
  department: text(200),
  sort: Joi.string()
    .valid(
      'headerId',
      'empName',
      'empNumber',
      'jobTitle',
      'grade',
      'rating',
      'year',
      'creationDate',
    )
    .default('headerId'),
  order: Joi.string().valid('asc', 'desc').default('desc'),
});

const body = Joi.object({
  year: Joi.any(),
  employee: Joi.any(),
  criteria: Joi.array().items(
    Joi.object({
      id: Joi.any(),
      rating: Joi.any(),
      justification: text(4000),
    }).unknown(false),
  ),
  development: Joi.array().items(Joi.string().trim().max(4000).pattern(CONTROL).allow('')).max(5),
  training: Joi.array().items(Joi.string().trim().max(4000).pattern(CONTROL).allow('')).max(5),
  remarks: Joi.object({ employee: text(4000), appraiser: text(4000) })
    .unknown(false)
    .default({}),
  formLanguage: Joi.string().valid('English', 'Arabic').required(),
}).unknown(false);

export const createBodySchema = body;
export const updateBodySchema = body;
export const employeeRemarksBodySchema = Joi.object({ remarks: text(4000, true) }).unknown(false);
