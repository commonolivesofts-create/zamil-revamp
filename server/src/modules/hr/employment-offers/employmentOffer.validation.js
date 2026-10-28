import Joi from 'joi';

/*
 * Employment Offer Form request schemas (README_employment_offer_form.md §7.1, §9).
 * NUMBER PK identifiers travel as decimal strings; legacy column spellings (line ATTRIBUTE1 =
 * comment, ATTRIBUTE2 = salary-arabic duplicate) are internal — the API payload uses the
 * README §3.2 names only. Business dates arrive as ISO 'YYYY-MM-DD' and are converted to the
 * stored 'DD-Mon-YYYY' form in the service (§3.1).
 */
const id = Joi.string().pattern(/^[1-9][0-9]{0,18}$/);
const NO_CONTROL_CHARACTERS = /^[^\p{Cc}]+$/u;
const text = (max) =>
  Joi.string().trim().max(max).pattern(NO_CONTROL_CHARACTERS).allow('').optional();
const requiredText = (max) =>
  Joi.string().trim().min(1).max(max).pattern(NO_CONTROL_CHARACTERS).required();

export const emptyQuerySchema = Joi.object({});
export const emptyBodySchema = Joi.object({});

export const headerIdParams = Joi.object({ headerId: id.required() });

// §7.1 query parameters (README verbatim, page/pageSize/sortBy/sortDir).
const page = Joi.number().integer().min(1).max(100000).default(1);
const pageSize = Joi.number().integer().min(1).max(100).default(20);
// Date-only values (docs/02 §4). Joi's .isoDate() would rewrite the value into a full timestamp,
// so the YYYY-MM-DD shape and the calendar validity are checked explicitly and the original
// string is kept for the service's TO_DATE conversion.
const DATE_ONLY = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;
const isoDate = Joi.string()
  .pattern(DATE_ONLY)
  .custom((value, helpers) => {
    const [year, month, day] = value.split('-').map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (
      date.getUTCFullYear() !== year ||
      date.getUTCMonth() !== month - 1 ||
      date.getUTCDate() !== day
    ) {
      return helpers.error('date.invalid');
    }
    return value;
  })
  .messages({ 'date.invalid': '{{#label}} must be a real calendar date in YYYY-MM-DD format' });

// Business-unit ids only; labels are contradictory in the legacy views (README §8.9), so the
// API never labels them.
export const BU_VALUES = Object.freeze(['300000002689294', '300000002689307']);

export const listQuerySchema = Joi.object({
  page,
  pageSize,
  search: text(100),
  intNo: text(100),
  requisitionNo: text(100),
  division: Joi.string().valid(...BU_VALUES),
  // Free bounded string: only value today is 'Incomplete' (write-once STATUS used as a filter).
  status: text(30),
  dateFrom: isoDate,
  dateTo: isoDate,
  createdBy: id,
  sortBy: Joi.string()
    .valid('HEADER_ID', 'OFFER_DATE', 'EMPLOYEE_NAME', 'CREATION_DATE')
    .default('HEADER_ID'),
  sortDir: Joi.string().valid('asc', 'desc').default('desc'),
});

// BASIC_SALARY is a NUMBER; legacy stripped commas client-side, so a comma string ("8,500")
// is accepted and normalized to a number server-side (README §9).
const salary = Joi.alternatives().try(
  Joi.number().min(0),
  Joi.string()
    .trim()
    .pattern(/^(\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/)
    .custom((value, helpers) => {
      const parsed = Number(value.replaceAll(',', ''));
      if (Number.isNaN(parsed)) return helpers.error('number.base');
      return parsed;
    }, 'strip salary commas'),
);
// ATTRIBUTE11 is NUMBER/VARCHAR2 (README §1.1): accepts "REQ-1024" or a plain number.
const requisitionNoValue = Joi.alternatives().try(
  Joi.number(),
  Joi.string().trim().max(100).pattern(NO_CONTROL_CHARACTERS),
);

const lineSchema = Joi.object({
  basicSalary: salary.optional(),
  basicSalaryAr: text(1000),
  housingAllowance: text(500),
  housingAllowanceAr: text(500),
  transportation: text(500),
  transportationAr: text(500),
  annualVacation: text(500),
  annualVacationAr: text(500),
  ticket: text(500),
  ticketAr: text(500),
  medical: text(500),
  medicalAr: text(500),
  contractPeriod: text(500),
  contractPeriodAr: text(500),
  // Required: APPROXIMATE_STARTING_DATE is a NOT NULL DATE (README §9).
  approximateStartingDate: isoDate.required(),
  approximateStartingDateAr: text(100),
  // Optional: the SQL applies the hardcoded defaults from §1.2 via NVL when absent.
  probationaryPeriod: text(500),
  probationaryPeriodAr: text(500),
  comment: text(4000),
});

/**
 * Full create/update payload (README §3.2, §9) for both POST and PUT. `status` is write-once
 * 'Incomplete' on insert and is never accepted on update; `line` is a single object, required.
 */
export const writeBodySchema = Joi.object({
  offerDate: isoDate.required(),
  employeeName: requiredText(200),
  employeeNameAr: text(200),
  position: requiredText(200),
  division: Joi.string()
    .trim()
    .valid(...BU_VALUES)
    .required(),
  to: text(50),
  toArabic: text(50),
  applicant: text(200),
  intNo: requiredText(100),
  reqNo: requisitionNoValue.optional(),
  line: lineSchema.required(),
});

// --- Lookup/helper query schemas (README §8) -----------------------------------------------------

export const candidatesQuerySchema = Joi.object({
  // Default false preserves legacy behaviour (README §8.1).
  excludeOffered: Joi.boolean().default(false),
});

export const allowancesQuerySchema = Joi.object({
  type: Joi.string()
    .valid('housing', 'transportation', 'contract-period', 'annual-vacation', 'medical', 'ticket')
    .required(),
});

export const numberToArabicQuerySchema = Joi.object({
  number: Joi.number().required(),
});

export const hijriDateQuerySchema = Joi.object({
  date: isoDate.required(),
});
