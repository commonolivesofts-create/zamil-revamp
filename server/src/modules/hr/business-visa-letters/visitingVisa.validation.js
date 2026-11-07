import Joi from 'joi';

const iso = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((v, h) => {
    const [y, m, d] = v.split('-').map(Number);
    const t = new Date(Date.UTC(y, m - 1, d));

    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
      ? v
      : h.error('date.invalid');
  });

const txt = (n = 1000) => Joi.string().trim().max(n).allow('', null);

export const idParams = Joi.object({
  id: Joi.string()
    .pattern(/^[1-9]\d*$/)
    .required(),
});

export const employeeParams = Joi.object({
  employeeNumber: Joi.string().trim().max(100).required(),
});

export const noQuery = Joi.object({});

// The picker's opening list has no term (all current employees); a search
// needs at least two characters.
export const employeeQuery = Joi.object({
  q: Joi.string().trim().min(2).max(100).allow('').default(''),
});

export const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),
  limit: Joi.number().integer().min(0).max(100000).default(10),
  search: txt(200),
  ref_no: txt(50),
  status: Joi.string().valid('DRAFT', 'FINAL').allow(null, ''),
  division_id: txt(50),
  from: iso.allow(''),
  to: iso.allow(''),
  sort: Joi.string()
    .pattern(/^(id|ref_no|letter_date|employee_name|status|division_id|created_at)( (asc|desc))?$/i)
    .default('id desc'),
});

export const writeBody = Joi.object({
  division_id: txt(50),
  ref_no: txt(50),
  letter_date: iso.allow(null, ''),
  consul_general: txt(1000),
  embassy: txt(1000),
  embassy_location: txt(1000),
  opening_text: txt(1000),
  request_for: Joi.string().valid('Business Single', 'Business Multiple').allow(null, ''),
  subject: txt(1000),
  employee_name: txt(250),
  nationality: txt(1000),
  passport_no: txt(1000),
  passport_date: iso.allow(null, ''),
  id_no: txt(1000),
  id_expiration_date: iso.allow(null, ''),
  job_title: txt(1000),
  employed_since: iso.allow(null, ''),
  contract_expiry: iso.allow(null, ''),
  contract_nature: txt(1000),
  monthly_salary: Joi.number().min(0).allow(null),
  visit_place: txt(1000),
  visit_days: Joi.number().min(0).allow(null),
  visit_purpose: txt(1000),
  expense_employee_name: txt(1000),
  expense_borne_by: txt(1000),
  return_employee_name: txt(1000),
  return_statement: txt(1000),
  closing_text: txt(1000),
  status: Joi.string().valid('DRAFT', 'FINAL').allow(null, ''),
  embassy_ar: txt(1000),
  job_title_ar: txt(1000),
  contract_nature_ar: txt(1000),
  nationality_ar: txt(1000),
  visit_purpose_ar: txt(1000),
}).unknown(false);
