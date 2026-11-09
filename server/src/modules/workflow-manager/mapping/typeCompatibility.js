/*
 * Oracle datatype families, mapping field types and PRECISE canonical values.
 *
 * Precision rule: Oracle NUMBER values travel as decimal strings and are normalized with string
 * arithmetic only — never through JavaScript floating point. A JS number is accepted only when it
 * is a safe integer; anything else is refused with PRECISION_RISK. Date/time values travel as
 * strings in fixed ISO-like forms:
 *   DATE            YYYY-MM-DDTHH:MM:SS               (Oracle DATE: no time zone, seconds)
 *   TIMESTAMP(n)    YYYY-MM-DDTHH:MM:SS.fffffffff     (always 9 fraction digits, no time zone)
 *   TIMESTAMP TZ    YYYY-MM-DDTHH:MM:SS.fffffffffZ    (converted exactly to UTC)
 * Field type DATE (a calendar date stored in an Oracle DATE) canonicalizes to YYYY-MM-DD and
 * refuses a non-midnight time. Years 0001–9999 only. TIMESTAMP WITH LOCAL TIME ZONE depends on the
 * session time zone and is therefore unsupported. Distinct database values never map to the same
 * canonical value; the one documented equivalence is CHAR/NCHAR trailing blanks, which Oracle
 * itself compares as blank-padded (VARCHAR2 values are kept exactly).
 */
export class MappingValueError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'MappingValueError';
    this.code = code;
  }
}

const fail = (code, message) => {
  throw new MappingValueError(code, message);
};

// --- Oracle datatype families --------------------------------------------------------------------

export const FAMILIES = Object.freeze({
  NUMBER: 'NUMBER',
  VARCHAR: 'VARCHAR',
  CHAR: 'CHAR',
  CLOB: 'CLOB',
  DATE: 'DATE',
  TIMESTAMP: 'TIMESTAMP',
  TIMESTAMP_TZ: 'TIMESTAMP_TZ',
  TIMESTAMP_LTZ: 'TIMESTAMP_LTZ',
  RAW: 'RAW',
  UNSUPPORTED: 'UNSUPPORTED',
});

/**
 * `{ family, integral, fractionalDigits }` of a dictionary column
 * (`{ oracleType, precision, scale }` as in ALL_TAB_COLUMNS DATA_TYPE / DATA_PRECISION / DATA_SCALE).
 */
export function describeOracleType({ oracleType, scale = null }) {
  const type = String(oracleType ?? '');
  if (type === 'NUMBER') {
    return { family: FAMILIES.NUMBER, integral: scale === 0, fractionalDigits: null };
  }
  // FLOAT(b) is stored as an Oracle NUMBER (decimal, exact); its scale is undefined.
  if (type === 'FLOAT') return { family: FAMILIES.NUMBER, integral: false, fractionalDigits: null };
  if (['VARCHAR2', 'NVARCHAR2', 'VARCHAR'].includes(type)) return { family: FAMILIES.VARCHAR };
  if (['CHAR', 'NCHAR'].includes(type)) return { family: FAMILIES.CHAR };
  if (['CLOB', 'NCLOB'].includes(type)) return { family: FAMILIES.CLOB };
  if (type === 'DATE') return { family: FAMILIES.DATE };
  if (type === 'RAW') return { family: FAMILIES.RAW };
  let match = /^TIMESTAMP\(([0-9])\)$/.exec(type);
  if (match) return { family: FAMILIES.TIMESTAMP, fractionalDigits: Number(match[1]) };
  match = /^TIMESTAMP\(([0-9])\) WITH TIME ZONE$/.exec(type);
  if (match) return { family: FAMILIES.TIMESTAMP_TZ, fractionalDigits: Number(match[1]) };
  if (/^TIMESTAMP\([0-9]\) WITH LOCAL TIME ZONE$/.test(type)) {
    return { family: FAMILIES.TIMESTAMP_LTZ };
  }
  return { family: FAMILIES.UNSUPPORTED };
}

// Families whose values have one exact, session-independent text form.
const KEY_FAMILIES = new Set([
  FAMILIES.NUMBER,
  FAMILIES.VARCHAR,
  FAMILIES.CHAR,
  FAMILIES.DATE,
  FAMILIES.TIMESTAMP,
  FAMILIES.TIMESTAMP_TZ,
  FAMILIES.RAW,
]);

/** `null` when the column may be part of a record or line key, else the reason code. */
export function keyIneligibility(column) {
  const { family } = describeOracleType(column);
  if (KEY_FAMILIES.has(family)) return null;
  if (family === FAMILIES.CLOB) return 'KEY_TYPE_LOB';
  if (family === FAMILIES.TIMESTAMP_LTZ) return 'KEY_TYPE_SESSION_DEPENDENT';
  return 'KEY_TYPE_UNSUPPORTED';
}

// --- Mapping field types -------------------------------------------------------------------------

export const FIELD_TYPES = Object.freeze([
  'TEXT',
  'INTEGER',
  'DECIMAL',
  'DATE',
  'DATETIME',
  'TIMESTAMP_TZ',
  'BOOLEAN',
  'REFERENCE',
]);

export const REFERENCE_TYPES = Object.freeze([
  'EMPLOYEE_NUMBER_REF',
  'USER_ID_REF',
  'PERSON_ID_REF',
  'ORGANIZATION_REF',
  'DEPARTMENT_REF',
  'OPAQUE',
]);

const COMPATIBLE = Object.freeze({
  TEXT: [FAMILIES.VARCHAR, FAMILIES.CHAR, FAMILIES.CLOB],
  INTEGER: [FAMILIES.NUMBER],
  DECIMAL: [FAMILIES.NUMBER],
  DATE: [FAMILIES.DATE],
  DATETIME: [FAMILIES.DATE, FAMILIES.TIMESTAMP],
  TIMESTAMP_TZ: [FAMILIES.TIMESTAMP_TZ],
  BOOLEAN: [FAMILIES.VARCHAR, FAMILIES.CHAR, FAMILIES.NUMBER],
  REFERENCE: [FAMILIES.NUMBER, FAMILIES.VARCHAR, FAMILIES.CHAR, FAMILIES.RAW],
});

/** `null` when a field of `fieldType` may read `column`, else the reason code. */
export function fieldTypeIncompatibility(fieldType, column) {
  const described = describeOracleType(column);
  if (!COMPATIBLE[fieldType]) return 'FIELD_TYPE_UNKNOWN';
  if (!COMPATIBLE[fieldType].includes(described.family)) return 'FIELD_TYPE_INCOMPATIBLE';
  if (fieldType === 'INTEGER' && !described.integral) return 'FIELD_TYPE_NOT_INTEGRAL';
  return null;
}

/** Whether two columns may be joined by equality without implicit conversion. */
export function joinable(left, right) {
  const a = describeOracleType(left).family;
  const b = describeOracleType(right).family;
  const text = [FAMILIES.VARCHAR, FAMILIES.CHAR];
  if (a === b) return KEY_FAMILIES.has(a);
  return text.includes(a) && text.includes(b);
}

// --- Precise canonical values --------------------------------------------------------------------

const DECIMAL_TEXT = /^([+-])?([0-9]*)(?:\.([0-9]*))?(?:[eE]([+-]?[0-9]{1,4}))?$/;
const MAX_INPUT_DIGITS = 200;
// Oracle NUMBER: at most 40 significant digits; magnitude 1e-130 <= |x| < 1e126.
const MAX_SIGNIFICANT_DIGITS = 40;

/**
 * Exact canonical decimal text: no '+', no leading zeros, no trailing fractional zeros, no
 * exponent, '0' for zero (never '-0'). Accepts strings (including '.5', '1.50', '1E+3' as Oracle
 * TM9 output may use), bigint and safe-integer numbers.
 */
export function canonicalDecimal(input) {
  let text;
  if (typeof input === 'bigint') text = input.toString();
  else if (typeof input === 'number') {
    if (!Number.isSafeInteger(input)) {
      fail('PRECISION_RISK', 'Decimal values must be sent as strings, not floating-point numbers');
    }
    text = String(input);
  } else if (typeof input === 'string') text = input.trim();
  else fail('INVALID_DECIMAL', 'A decimal value must be a string');

  const match = DECIMAL_TEXT.exec(text);
  if (!match || (!match[2] && !match[3])) fail('INVALID_DECIMAL', 'Not a decimal number');
  const [, sign, intPart = '', fracPart = '', exponentText = '0'] = match;
  if (intPart.length + fracPart.length > MAX_INPUT_DIGITS) {
    fail('NUMBER_OUT_OF_RANGE', 'Too many digits');
  }
  let digits = `${intPart}${fracPart}`;
  // Position of the decimal point within `digits`.
  let point = intPart.length + Number(exponentText);
  const leading = digits.length - digits.replace(/^0+/, '').length;
  digits = digits.slice(leading);
  point -= leading;
  digits = digits.replace(/0+$/, '');
  if (!digits) return '0';
  if (digits.length > MAX_SIGNIFICANT_DIGITS) {
    fail('NUMBER_OUT_OF_RANGE', 'More than 40 significant digits');
  }
  // Decimal exponent of the leading digit: value = 0.d1d2... * 10^point.
  if (point > 126 || point < -129) fail('NUMBER_OUT_OF_RANGE', 'Outside the Oracle NUMBER range');
  let body;
  if (point <= 0) body = `0.${'0'.repeat(-point)}${digits}`;
  else if (point >= digits.length) body = `${digits}${'0'.repeat(point - digits.length)}`;
  else body = `${digits.slice(0, point)}.${digits.slice(point)}`;
  return sign === '-' ? `-${body}` : body;
}

export function canonicalInteger(input) {
  const value = canonicalDecimal(input);
  if (value.includes('.')) fail('NOT_AN_INTEGER', 'The value is not an integer');
  return value;
}

const pad = (value, width) => String(value).padStart(width, '0');
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;

function checkCivil(year, month, day, hour, minute, second, code) {
  if (year < 1 || year > 9999) fail(code, 'Year must be between 0001 and 9999');
  if (month < 1 || month > 12) fail(code, 'Invalid month');
  const max = month === 2 && isLeap(year) ? 29 : DAYS_IN_MONTH[month - 1];
  if (day < 1 || day > max) fail(code, 'Invalid day of month');
  if (hour > 23 || minute > 59 || second > 59) fail(code, 'Invalid time of day');
}

const DATE_TEXT = /^([0-9]{4})-([0-9]{2})-([0-9]{2})(?:[T ]([0-9]{2}):([0-9]{2}):([0-9]{2}))?$/;

/** Oracle DATE → `YYYY-MM-DDTHH:MM:SS` (date-only input means midnight). */
export function canonicalDateTime(input) {
  const match = typeof input === 'string' ? DATE_TEXT.exec(input) : null;
  if (!match) fail('INVALID_DATE', 'Expected YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS');
  const [y, mo, d, h = 0, mi = 0, s = 0] = match.slice(1).map((part) => Number(part ?? 0));
  checkCivil(y, mo, d, h, mi, s, 'INVALID_DATE');
  return `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}T${pad(h, 2)}:${pad(mi, 2)}:${pad(s, 2)}`;
}

/** Calendar date stored in an Oracle DATE → `YYYY-MM-DD`; a time other than midnight is refused. */
export function canonicalCalendarDate(input) {
  const value = canonicalDateTime(input);
  if (!value.endsWith('T00:00:00')) fail('DATE_HAS_TIME', 'The date carries a time of day');
  return value.slice(0, 10);
}

const TIMESTAMP_TEXT =
  /^([0-9]{4})-([0-9]{2})-([0-9]{2})[T ]([0-9]{2}):([0-9]{2}):([0-9]{2})(?:\.([0-9]{1,9}))?(Z|[+-][0-9]{2}:[0-9]{2})?$/;

function parseTimestamp(input, code) {
  const match = typeof input === 'string' ? TIMESTAMP_TEXT.exec(input) : null;
  if (!match) fail(code, 'Expected YYYY-MM-DDTHH:MM:SS[.fffffffff][Z|±HH:MM]');
  const [y, mo, d, h, mi, s] = match.slice(1, 7).map(Number);
  checkCivil(y, mo, d, h, mi, s, code);
  return { y, mo, d, h, mi, s, fraction: (match[7] ?? '').padEnd(9, '0'), zone: match[8] ?? null };
}

const formatTimestamp = ({ y, mo, d, h, mi, s, fraction }) =>
  `${pad(y, 4)}-${pad(mo, 2)}-${pad(d, 2)}T${pad(h, 2)}:${pad(mi, 2)}:${pad(s, 2)}.${fraction}`;

/** Oracle TIMESTAMP(n) (no time zone) → `YYYY-MM-DDTHH:MM:SS.fffffffff`. */
export function canonicalTimestamp(input, { fractionalDigits = 9 } = {}) {
  const parts = parseTimestamp(input, 'INVALID_TIMESTAMP');
  if (parts.zone) fail('INVALID_TIMESTAMP', 'A TIMESTAMP without time zone cannot carry an offset');
  if (parts.fraction.slice(fractionalDigits).replace(/0/g, '')) {
    fail('INVALID_TIMESTAMP', `More than ${fractionalDigits} fractional second digits`);
  }
  return formatTimestamp(parts);
}

// Days since 1970-01-01 for a proleptic Gregorian date (Howard Hinnant's algorithm), and back.
function daysFromCivil(y, m, d) {
  const year = m <= 2 ? y - 1 : y;
  const era = Math.floor(year / 400);
  const yoe = year - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days) {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor(
    (doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365,
  );
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

/** Oracle TIMESTAMP WITH TIME ZONE → exact UTC instant `YYYY-MM-DDTHH:MM:SS.fffffffffZ`. */
export function canonicalTimestampTz(input) {
  const parts = parseTimestamp(input, 'INVALID_TIMESTAMP_TZ');
  if (!parts.zone) fail('INVALID_TIMESTAMP_TZ', 'An explicit Z or ±HH:MM offset is required');
  let offsetMinutes = 0;
  if (parts.zone !== 'Z') {
    const sign = parts.zone[0] === '-' ? -1 : 1;
    const hours = Number(parts.zone.slice(1, 3));
    const minutes = Number(parts.zone.slice(4, 6));
    if (hours > 14 || minutes > 59 || (hours === 14 && minutes > 0)) {
      fail('INVALID_TIMESTAMP_TZ', 'Offset out of range');
    }
    offsetMinutes = sign * (hours * 60 + minutes);
  }
  // Whole minutes since the epoch in UTC; seconds and the fraction are unaffected by the offset.
  const minutes =
    daysFromCivil(parts.y, parts.mo, parts.d) * 1440 + parts.h * 60 + parts.mi - offsetMinutes;
  const days = Math.floor(minutes / 1440);
  const minuteOfDay = minutes - days * 1440;
  const { y, m, d } = civilFromDays(days);
  if (y < 1 || y > 9999) fail('INVALID_TIMESTAMP_TZ', 'Year must be between 0001 and 9999 in UTC');
  return `${formatTimestamp({
    y,
    mo: m,
    d,
    h: Math.floor(minuteOfDay / 60),
    mi: minuteOfDay % 60,
    s: parts.s,
    fraction: parts.fraction,
  })}Z`;
}

/** Oracle RAW → upper-case hex. */
export function canonicalRaw(input) {
  if (typeof input !== 'string' || !/^(?:[0-9A-Fa-f]{2}){1,2000}$/.test(input)) {
    fail('INVALID_RAW', 'Expected an even-length hexadecimal string');
  }
  return input.toUpperCase();
}

/** Text value; '' is NULL in Oracle and is refused where a value is required. */
export function canonicalText(input, { family = FAMILIES.VARCHAR } = {}) {
  if (typeof input !== 'string') fail('INVALID_TEXT', 'A text value must be a string');
  if (!input.isWellFormed()) fail('INVALID_TEXT', 'The text is not well-formed');
  // CHAR/NCHAR compare blank-padded in Oracle, so trailing blanks never distinguish two values.
  const value = family === FAMILIES.CHAR ? input.replace(/ +$/, '') : input;
  if (value === '') fail('EMPTY_VALUE', 'An empty string is NULL in Oracle');
  return value;
}

/** Canonical text of one key column value, by Oracle family; unsupported types fail closed. */
export function canonicalKeyValue(column, value) {
  if (value === null || value === undefined) fail('NULL_KEY_VALUE', 'A key value cannot be null');
  const reason = keyIneligibility(column);
  if (reason) fail(reason, `Column ${column.name ?? ''} cannot be part of a key`);
  const { family, fractionalDigits } = describeOracleType(column);
  switch (family) {
    case FAMILIES.NUMBER:
      return canonicalDecimal(value);
    case FAMILIES.VARCHAR:
    case FAMILIES.CHAR:
      return canonicalText(value, { family });
    case FAMILIES.DATE:
      return canonicalDateTime(value);
    case FAMILIES.TIMESTAMP:
      return canonicalTimestamp(value, { fractionalDigits });
    case FAMILIES.TIMESTAMP_TZ:
      return canonicalTimestampTz(value);
    default:
      return canonicalRaw(value);
  }
}

/**
 * Canonical typed value for a mapped field (conditions, templates and execution use this). Null
 * stays null. BOOLEAN needs the field's `booleanMapping` of stored values.
 */
export function canonicalFieldValue(field, column, value) {
  if (value === null || value === undefined) return null;
  const { family, fractionalDigits } = describeOracleType(column);
  if (fieldTypeIncompatibility(field.type, column)) {
    fail('FIELD_TYPE_INCOMPATIBLE', `Field ${field.code} cannot read column ${column.name}`);
  }
  switch (field.type) {
    case 'TEXT':
      if (typeof value !== 'string' || !value.isWellFormed()) {
        fail('INVALID_TEXT', 'A text value must be a well-formed string');
      }
      return family === FAMILIES.CHAR ? value.replace(/ +$/, '') : value;
    case 'INTEGER':
      return canonicalInteger(value);
    case 'DECIMAL':
      return canonicalDecimal(value);
    case 'DATE':
      return canonicalCalendarDate(value);
    case 'DATETIME':
      return family === FAMILIES.DATE
        ? canonicalDateTime(value)
        : canonicalTimestamp(value, { fractionalDigits });
    case 'TIMESTAMP_TZ':
      return canonicalTimestampTz(value);
    case 'BOOLEAN': {
      const stored = family === FAMILIES.NUMBER ? canonicalDecimal(value) : String(value);
      if (stored === field.booleanMapping?.true) return true;
      if (stored === field.booleanMapping?.false) return false;
      return fail('INVALID_BOOLEAN', `Value is not one of the mapped boolean values`);
    }
    default:
      return canonicalKeyValue(column, value);
  }
}
