import Joi from 'joi';
import { AppError } from '../../../shared/errors/AppError.js';

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

const optionalAmount = (value) => {
  if (isMissing(value) || value === '') return null;

  const number = Number(value);

  if (!Number.isFinite(number)) {
    invalid('ALLOWANCE_INVALID');
  }

  return number;
};

const isValidAmount = (value) => {
  if (
    isMissing(value) ||
    typeof value === 'boolean' ||
    typeof value === 'object' ||
    String(value).trim() === ''
  ) {
    return false;
  }

  if (typeof value !== 'number' && !/^\d+(\.\d+)?$/.test(String(value))) {
    return false;
  }

  const number = Number(value);

  return Number.isFinite(number) && number >= 0 && number <= 9999999;
};

const positiveIdSchema = Joi.string()
  .pattern(/^[1-9]\d{0,18}$/)
  .required();
const amountInputSchema = Joi.alternatives().try(Joi.number(), Joi.string());
const optionalTextSchema = Joi.string().allow('');

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
  maritalStatus: optionalTextSchema,
});

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

  const validStatuses = ['DRAFT', 'INPROCESS', 'APPROVED', 'REJECTED'];

  if (status !== null && !validStatuses.includes(status)) {
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

export const validateWrite = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    invalid('VALIDATION_FAILED');
  }

  const empNo = employeeNumber(body.empNo);

  if (!isValidDate(body.effectiveDate)) {
    invalid('EFFECTIVE_DATE_REQUIRED');
  }

  if (!isMissing(body.formDate) && !isValidDate(body.formDate)) {
    invalid('VALIDATION_FAILED');
  }

  if (!isMissing(body.startDate) && body.startDate !== '' && !isValidDate(body.startDate)) {
    invalid('VALIDATION_FAILED');
  }

  const revised = body.new;

  if (!revised || typeof revised !== 'object' || Array.isArray(revised)) {
    invalid('POSITION_INVALID');
  }

  if (typeof revised.position !== 'string' || revised.position.trim() === '') {
    invalid('POSITION_INVALID');
  }

  const allowanceFields = ['basicSal', 'houseAll', 'transAll', 'otherAll', 'communAll', 'carAll'];

  for (const field of allowanceFields) {
    if (!isValidAmount(revised[field])) {
      invalid('ALLOWANCE_INVALID');
    }
  }

  if (!['S', 'M'].includes(revised.maritalStatus)) {
    invalid('MARITAL_STATUS_INVALID');
  }

  for (const field of ['remarks', 'views']) {
    const value = body[field];

    if (!isMissing(value) && (typeof value !== 'string' || value.length > 2000)) {
      invalid('TEXT_TOO_LONG');
    }
  }

  const old = body.old && typeof body.old === 'object' && !Array.isArray(body.old) ? body.old : {};

  // Use cents to avoid ordinary floating-point summation errors.
  const totalCents = allowanceFields.reduce(
    (total, field) => total + Math.round(Number(revised[field]) * 100),
    0,
  );

  return {
    empNo,

    formDate: body.formDate ?? new Date().toISOString().slice(0, 10),

    arbDate: optionalText(body.arbDate),
    effectiveDate: body.effectiveDate,

    empName: optionalText(body.empName),
    nationality: optionalText(body.nationality),
    section: optionalText(body.section),
    department: optionalText(body.department),
    startDate: body.startDate || null,

    oldPosition: optionalText(old.position),
    oldBasicSal: optionalAmount(old.basicSal),
    oldHouseAll: optionalAmount(old.houseAll),
    oldTransAll: optionalAmount(old.transAll),
    oldOtherAll: optionalAmount(old.otherAll),
    oldCommunAll: optionalAmount(old.communAll),
    oldCarAll: optionalAmount(old.carAll),
    oldTotal: optionalAmount(old.total),
    oldMaritalStatus: optionalText(old.maritalStatus),

    newPosition: revised.position.trim(),
    newBasicSal: Number(revised.basicSal),
    newHouseAll: Number(revised.houseAll),
    newTransAll: Number(revised.transAll),
    newOtherAll: Number(revised.otherAll),
    newCommunAll: Number(revised.communAll),
    newCarAll: Number(revised.carAll),
    newTotal: totalCents / 100,
    newMaritalStatus: revised.maritalStatus,

    remarks: optionalText(body.remarks),
    views: optionalText(body.views),
  };
};
