import Joi from 'joi';

const date = Joi.string()
  .pattern(/^\d{4}-\d{2}-\d{2}$/)
  .custom((value, helpers) => {
    const parsed = new Date(`${value}T00:00:00Z`);

    const valid = !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;

    return valid ? value : helpers.error('any.invalid');
  });

const flag = Joi.alternatives()
  .try(
    Joi.boolean(),
    Joi.string().valid('Y', 'N', 'y', 'n', 'on', 'off', 'true', 'false', '1', '0', ''),
  )
  .optional();

const text = (max = 2000) => Joi.string().allow('', null).max(max).optional();

export const empty = Joi.object({});

export const idParams = Joi.object({
  id: Joi.number().integer().positive().required(),
});

export const employeeParams = Joi.object({
  empNo: Joi.string().trim().max(80).required(),
});

export const lookupQuery = Joi.object({
  q: Joi.string().trim().max(150).allow('').default(''),
});

export const listQuery = Joi.object({
  page: Joi.number().integer().min(1).default(1),

  limit: Joi.number().integer().min(0).max(1000).default(25),

  search: text(150),
  reference_no: text(50),

  warning_no: Joi.number().integer().positive(),

  emp_no: text(80),
  division: text(150),
  status: text(30),

  flag: Joi.string().valid(
    'irregular',
    'absent',
    'eating',
    'delaying',
    'make_problems',
    'warning_letter',
    'other_letter',
  ),

  date_from: date,
  date_to: date,

  sort: Joi.string()
    .valid('id', 'reference_no', 'warning_no', 'emp_no', 'emp_name', 'war_date', 'created_at')
    .default('created_at'),

  order: Joi.string().valid('asc', 'desc').default('desc'),
});

const writable = {
  war_date: date,

  irregular_flag: flag,
  absent_flag: flag,
  eating_flag: flag,
  delaying_flag: flag,
  make_problems_flag: flag,

  warning_letter_flag: flag,
  other_letter_flag: flag,

  others_text: text(),
  others_text_ar: text(),

  action_text: text(),
  action_text_ar: text(),

  warning_letter_comment: text(),
  other_letter_comment: text(),
};

const ignored = {
  reference_no: Joi.any(),
  warning_no: Joi.any(),

  emp_name: Joi.any(),
  emp_div: Joi.any(),
  emp_job: Joi.any(),

  status: Joi.any(),

  created_by: Joi.any(),
  created_at: Joi.any(),

  updated_by: Joi.any(),
  updated_at: Joi.any(),

  id: Joi.any(),
};

export const createBody = Joi.object({
  ...writable,
  ...ignored,

  emp_no: Joi.string().trim().max(80).required(),
});

export const updateBody = Joi.object({
  ...writable,
  ...ignored,

  emp_no: Joi.any(),
});

export function normalizeBody(body, creating = false) {
  const fields = [
    'irregular_flag',
    'absent_flag',
    'eating_flag',
    'delaying_flag',
    'make_problems_flag',
    'warning_letter_flag',
    'other_letter_flag',
  ];

  const result = {};

  for (const key of Object.keys(writable)) {
    if (Object.hasOwn(body, key)) {
      result[key] = body[key];
    }
  }

  if (creating) {
    result.emp_no = body.emp_no;

    // Create defaults the warning date to today (Riyadh) when it is omitted.
    if (!result.war_date) {
      result.war_date = new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Riyadh',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date());
    }
  }

  for (const key of fields) {
    const value = String(result[key] ?? 'N').toUpperCase();

    result[key] = ['Y', 'ON', 'TRUE', '1'].includes(value) ? 'Y' : 'N';
  }

  if (result.warning_letter_flag === 'N') {
    result.warning_letter_comment = null;
  }

  if (result.other_letter_flag === 'N') {
    result.other_letter_comment = null;
  }

  const hasReason = fields.slice(0, 5).some((key) => result[key] === 'Y');

  const hasOthers =
    String(result.others_text ?? '').trim() || String(result.others_text_ar ?? '').trim();

  if (!hasReason && !hasOthers) {
    throw Object.assign(new Error('At least one reason is required'), {
      field: 'others_text',
      code: 'REASON_REQUIRED',
    });
  }

  if (result.warning_letter_flag === 'Y' && !String(result.warning_letter_comment ?? '').trim()) {
    throw Object.assign(new Error('Written warning comment is required'), {
      field: 'warning_letter_comment',
      code: 'WARNING_COMMENT_REQUIRED',
    });
  }

  if (result.other_letter_flag === 'Y' && !String(result.other_letter_comment ?? '').trim()) {
    throw Object.assign(new Error('Other letter comment is required'), {
      field: 'other_letter_comment',
      code: 'OTHER_COMMENT_REQUIRED',
    });
  }

  return result;
}
