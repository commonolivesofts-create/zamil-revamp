import Joi from 'joi';

// Validate ISO dates in YYYY-MM-DD format.
const date = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const parsed = new Date(`${value}T00:00:00Z`);

    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value
      ? value
      : helpers.error('any.invalid');
  });

// The optional dates are blank in the form and the client sends them as null.
// Only the letter date itself is required.
const optionalDate = date.allow(null, '');

const requiredDate = date.required();

// Reject HTML angle brackets and control characters
// without using a control-character regular expression.
const containsUnsafeCharacters = (value) => {
  for (const character of value) {
    const code = character.charCodeAt(0);

    if (character === '<' || character === '>' || code < 32) {
      return true;
    }
  }

  return false;
};

// Reusable text validation.
const text = (max = 500) =>
  Joi.string()
    .trim()
    .max(max)
    .custom((value, helpers) => {
      if (containsUnsafeCharacters(value)) {
        return helpers.error('string.pattern.base');
      }

      return value;
    })
    .allow('', null);

// Empty object schema.
export const empty = Joi.object({});

// UUID route parameter.
export const uuidParams = Joi.object({
  uuid: Joi.string().guid({ version: 'uuidv4' }).required(),
});

// Employee route parameter.
export const employeeParams = Joi.object({
  empNo: Joi.string().trim().max(80).required(),
});

// Country route parameter.
export const countryParams = Joi.object({
  country: Joi.string().trim().max(150).required(),
});

// Employee lookup query.
// An empty q lists the first employees with the form (the picker's opening list); a search
// still needs two characters.
export const employeeQuery = Joi.object({
  q: Joi.string().trim().min(2).max(100).allow('').default(''),
});

// Listing filters and pagination.
export const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),

  limit: Joi.number().integer().min(0).max(10000).default(25),

  search: text(200),

  ref_no: text(100),

  division: Joi.string().valid('ZPIL', 'Z3P'),

  country: text(150),

  employee_no: text(80),

  approval_name: text(200),

  date_from: optionalDate,

  date_to: optionalDate,

  sort: Joi.string()
    .valid(
      'id',
      'ref_no',
      'employee_no',
      'employee_name',
      'country',
      'division',
      'cur_date',
      'created_at',
    )
    .default('id'),

  order: Joi.string().valid('asc', 'desc').default('desc'),
});

// Tourist Visa Letter request fields.
const raw = {
  // Letter details
  cur_date: requiredDate,
  cur_date_ar: text(500),

  division: Joi.string().valid('ZPIL', 'Z3P').required(),

  country: text(500),
  country_ar: text(500),

  // Employee details
  employee_no: text(100),
  employee_no_ar: text(100),

  employee_name: text(500),
  employee_name_ar: text(500),

  nationality: text(500),
  nationality_ar: text(500),

  passport_no: text(100),
  passport_no_ar: text(100),

  pass_issue_date: optionalDate,
  pass_issue_date_ar: optionalDate,

  national_id: text(100),
  national_id_ar: text(100),

  nati_issue_date: optionalDate,
  nati_issue_date_ar: optionalDate,

  // Position details
  position: text(500),
  position_ar: text(500),

  position_start_date: optionalDate,
  position_start_date_ar: optionalDate,

  // Contract details
  contract_expired: optionalDate,
  contract_expired_ar: optionalDate,

  contract: text(500),
  contract_ar: text(500),

  // Salary details
  salary: Joi.alternatives().try(Joi.number().min(0), text(60)),

  salary_ar: Joi.alternatives().try(Joi.number().min(0), text(60)),

  salary_word: text(2000),
  salary_word_ar: text(2000),

  // Employee nationality
  employee_nationality: text(500),
  employee_nationality_ar: text(500),

  // Passport for print
  manager_passport: text(500),
  manager_passport_ar: text(500),

  // Tourism details
  tourism_to: text(500),
  tourism_to_ar: text(500),

  tourism_from: text(500),
  tourism_from_ar: text(500),

  // Approver / Signatory
  approval_name: text(500),
  position_name: text(500),
};

// Create/update validation.
export const writeBody = Joi.object(raw)
  .fork(
    [
      'cur_date',
      'division',
      'country',
      'employee_no',
      'tourism_to',
      'tourism_from',
      'approval_name',
      'position_name',
    ],
    (schema) => schema.required(),
  )
  .keys({
    // Server-owned fields must never be taken from the client.
    id: Joi.any().strip(),
    uuid: Joi.any().strip(),
    ref_no: Joi.any().strip(),

    created_by: Joi.any().strip(),
    created_at: Joi.any().strip(),

    updated_by: Joi.any().strip(),
    updated_at: Joi.any().strip(),
  });
