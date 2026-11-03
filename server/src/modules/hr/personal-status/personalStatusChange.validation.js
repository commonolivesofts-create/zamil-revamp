import Joi from 'joi';
import { AppError } from '../../../shared/errors/AppError.js';
import {
  AMOUNT_MAX_LENGTH,
  MARITAL_STATUSES,
  PAY_FIELDS,
  STATUSES,
  payTotal,
} from './personalStatusChange.rules.js';

export class PersonalStatusError extends AppError {
  constructor(status, code, message = 'Validation failed') {
    super(status, code, message);
    this.name = 'PersonalStatusError';
  }
}

const invalid = (code, message = 'Validation failed') => {
  throw new PersonalStatusError(400, code, message);
};

const isMissing = (value) => value === null || value === undefined;

const isValidDate = (value) => {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return false;
  }

  const [year, month, day] = value.split('-').map(Number);

  const date = new Date(Date.UTC(year, month - 1, day));

  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
};

const validPositiveId = (value, code) => {
  const text = String(value);

  if (!/^[1-9]\d{0,18}$/.test(text)) {
    invalid(code);
  }

  return text;
};

export const positiveId = (value) => validPositiveId(value, 'INVALID_ID');

export const employeeNumber = (value) => validPositiveId(value, 'EMP_NOT_FOUND');

const optionalText = (value) => {
  if (isMissing(value)) return null;
  return String(value);
};

const optionalLimitedText = (value, max) => {
  if (isMissing(value) || value === '') return null;

  if (typeof value !== 'string' || value.length > max) {
    invalid('TEXT_TOO_LONG');
  }

  return value;
};

// Legacy revised amounts: digits and a dot only (validateNumericInput) and maxlength="7"; money
// keeps at most two decimals.
const isValidAmount = (value) => {
  if (isMissing(value) || typeof value === 'boolean' || typeof value === 'object') {
    return false;
  }

  const text = String(value).trim();

  return text.length <= AMOUNT_MAX_LENGTH && /^\d+(\.\d{1,2})?$/.test(text);
};

const positiveIdSchema = Joi.string()
  .pattern(/^[1-9]\d{0,18}$/)
  .required();
const amountInputSchema = Joi.alternatives().try(Joi.number(), Joi.string());
const optionalTextSchema = Joi.string().allow('');
const nullableTextSchema = optionalTextSchema.allow(null);

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});

export const headerIdParamsSchema = Joi.object({
  headerId: positiveIdSchema,
});

export const employeeNumberParamsSchema = Joi.object({
  empNo: positiveIdSchema,
});

export const listQuerySchema = Joi.object({
  search: Joi.string(),
  status: Joi.string(),
  section: Joi.string(),
  department: Joi.string(),
  position: Joi.string(),
  requestor: Joi.string()
    .pattern(/^[1-9]\d{0,18}$/)
    .allow(''),
  date_from: Joi.string(),
  date_to: Joi.string(),
  page: Joi.alternatives().try(Joi.number(), Joi.string()),
  pageSize: Joi.alternatives().try(Joi.number(), Joi.string()),
  sort: Joi.string(),
  order: Joi.string(),
});

const salaryWriteSchema = Joi.object({
  position: optionalTextSchema,
  basicSal: amountInputSchema,
  houseAll: amountInputSchema,
  transAll: amountInputSchema,
  otherAll: amountInputSchema,
  communAll: amountInputSchema,
  carAll: amountInputSchema,
  total: amountInputSchema,
  maritalStatus: nullableTextSchema,
  grade: nullableTextSchema,
  level: nullableTextSchema,
});

// The employee snapshot, form date and Hijri date are server values. Older clients still send
// them, so they are accepted here and ignored by validateWrite.
export const writeBodySchema = Joi.object({
  empNo: Joi.alternatives().try(Joi.number(), Joi.string()),
  formDate: optionalTextSchema,
  arbDate: optionalTextSchema,
  effectiveDate: optionalTextSchema,
  empName: optionalTextSchema,
  nationality: optionalTextSchema,
  section: optionalTextSchema,
  department: optionalTextSchema,
  startDate: optionalTextSchema,
  old: salaryWriteSchema,
  new: salaryWriteSchema,
  remarks: optionalTextSchema,
  views: optionalTextSchema,
});

const optionalFilter = (value) => {
  if (isMissing(value) || value === '') return null;

  if (typeof value !== 'string') {
    invalid('LIST_FILTER_INVALID');
  }

  return value;
};

const parseInteger = (value, fallback, minimum, maximum) => {
  if (isMissing(value)) return fallback;

  if (
    !/^\d+$/.test(String(value)) ||
    !Number.isSafeInteger(Number(value)) ||
    Number(value) < minimum ||
    Number(value) > maximum
  ) {
    invalid('LIST_FILTER_INVALID');
  }

  return Number(value);
};

export const parseListing = (query = {}) => {
  const status = optionalFilter(query.status)?.toUpperCase() ?? null;

  if (status !== null && !STATUSES.includes(status)) {
    invalid('LIST_FILTER_INVALID');
  }

  const dateFrom = optionalFilter(query.date_from);
  const dateTo = optionalFilter(query.date_to);

  if (dateFrom !== null && !isValidDate(dateFrom)) {
    invalid('LIST_FILTER_INVALID');
  }

  if (dateTo !== null && !isValidDate(dateTo)) {
    invalid('LIST_FILTER_INVALID');
  }

  if (dateFrom !== null && dateTo !== null && dateFrom > dateTo) {
    invalid('LIST_FILTER_INVALID');
  }

  const allowedSorts = [
    'headerId',
    'empNo',
    'empName',
    'formDate',
    'status',
    'oldTotal',
    'newTotal',
  ];

  const sort = query.sort ?? 'headerId';
  const order = String(query.order ?? 'desc').toLowerCase();

  if (!allowedSorts.includes(sort) || !['asc', 'desc'].includes(order)) {
    invalid('LIST_FILTER_INVALID');
  }

  const page = parseInteger(query.page, 1, 1, Number.MAX_SAFE_INTEGER);

  const pageSize = parseInteger(query.pageSize, 25, 1, 100);

  if (!Number.isSafeInteger((page - 1) * pageSize)) {
    invalid('LIST_FILTER_INVALID');
  }

  const requestor =
    isMissing(query.requestor) || query.requestor === ''
      ? null
      : validPositiveId(query.requestor, 'LIST_FILTER_INVALID');

  return {
    search: optionalFilter(query.search)?.trim() ?? null,
    status,
    section: optionalFilter(query.section),
    department: optionalFilter(query.department),
    position: optionalFilter(query.position),
    requestor,
    date_from: dateFrom,
    date_to: dateTo,

    page,
    pageSize,
    sort,
    order,
  };
};

/**
 * The requester's answers only, checked with the legacy save rules (HTML `required`, maxlength
 * and the numeric filter of form.php). The employee snapshot, FORM_DATE, ARB_DATE, REF_NO,
 * NEW_TOTAL and STATUS are computed by the service.
 */
export const validateWrite = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid('VALIDATION_FAILED');
  }

  const empNo = employeeNumber(body.empNo);

  if (!isValidDate(body.effectiveDate)) {
    invalid('EFFECTIVE_DATE_REQUIRED');
  }

  const revised = body.new;

  if (!revised || typeof revised !== 'object' || Array.isArray(revised)) {
    invalid('POSITION_INVALID');
  }

  // NEW_POSITION is VARCHAR2(100).
  if (
    typeof revised.position !== 'string' ||
    revised.position.trim() === '' ||
    revised.position.trim().length > 100
  ) {
    invalid('POSITION_INVALID');
  }

  for (const field of PAY_FIELDS) {
    if (!isValidAmount(revised[field])) {
      invalid('ALLOWANCE_INVALID');
    }
  }

  if (!MARITAL_STATUSES.includes(revised.maritalStatus)) {
    invalid('MARITAL_STATUS_INVALID');
  }

  for (const field of ['remarks', 'views']) {
    const value = body[field];

    if (!isMissing(value) && (typeof value !== 'string' || value.length > 2000)) {
      invalid('TEXT_TOO_LONG');
    }
  }

  const old = body.old && typeof body.old === 'object' && !Array.isArray(body.old) ? body.old : {};

  // Legacy OLD_MARITAL_STATUS is an editable, optional input. Undefined keeps the server snapshot;
  // null or '' clears it.
  let oldMaritalStatus;

  if (old.maritalStatus === null || old.maritalStatus === '') {
    oldMaritalStatus = null;
  } else if (old.maritalStatus !== undefined) {
    if (!MARITAL_STATUSES.includes(old.maritalStatus)) {
      invalid('MARITAL_STATUS_INVALID');
    }

    oldMaritalStatus = old.maritalStatus;
  }

  const amounts = Object.fromEntries(PAY_FIELDS.map((field) => [field, Number(revised[field])]));

  return {
    empNo,
    effectiveDate: body.effectiveDate,
    oldMaritalStatus,

    newPosition: revised.position.trim(),
    newBasicSal: amounts.basicSal,
    newHouseAll: amounts.houseAll,
    newTransAll: amounts.transAll,
    newOtherAll: amounts.otherAll,
    newCommunAll: amounts.communAll,
    newCarAll: amounts.carAll,
    // Always the sum of the six items; a client total is ignored.
    newTotal: payTotal(amounts),
    newMaritalStatus: revised.maritalStatus,
    // NEW_GRADE / NEW_LEVEL (VARCHAR2(50)): new-only and optional; legacy shows empty labels.
    newGrade: optionalLimitedText(revised.grade, 50),
    newLevel: optionalLimitedText(revised.level, 50),

    remarks: optionalText(body.remarks),
    views: optionalText(body.views),
  };
};
