import { canonicalize, sha256Hex } from './canonicalJson.js';
import { assertOracleIdentifier } from './identifiers.js';
import { canonicalKeyValue, describeOracleType, FAMILIES } from './typeCompatibility.js';

/*
 * Canonical business-record keys — the one implementation every later package must use for
 * XX_ZRV_WF_INSTANCES.RECORD_KEY_JSON / RECORD_KEY_SHA256 (format `zrv.wf.recordKey/1`).
 *
 *   RECORD_KEY_JSON   = canonical JSON object { "<KEY_COLUMN>": "<canonical text>", ... }
 *                       (keys sorted by code point; every value a string — see
 *                       typeCompatibility.js for the exact per-type text forms)
 *   RECORD_KEY_SHA256 = SHA-256 (lower-case hex) of that text.
 *
 * Single and composite keys (up to 32 columns) are supported. NUMBER, VARCHAR2/NVARCHAR2,
 * CHAR/NCHAR, DATE, TIMESTAMP, TIMESTAMP WITH TIME ZONE and RAW columns are verified key types;
 * LOBs, TIMESTAMP WITH LOCAL TIME ZONE and other types fail closed. Null and empty parts fail
 * closed. A key never identifies a record by itself being unique: every read by key goes through
 * assertSingleRecord(), so a duplicate match is refused rather than silently picking a row.
 */
export const RECORD_KEY_FORMAT = 'zrv.wf.recordKey/1';
export const MAX_KEY_COLUMNS = 32;
/** Reads by key fetch at most this many rows, so a duplicate is detected instead of hidden. */
export const SINGLE_RECORD_FETCH_LIMIT = 2;

export class RecordKeyError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'RecordKeyError';
    this.code = code;
  }
}

function checkKeyColumns(keyColumns) {
  if (!Array.isArray(keyColumns) || keyColumns.length < 1) {
    throw new RecordKeyError('KEY_COLUMNS_REQUIRED', 'A record key needs at least one column');
  }
  if (keyColumns.length > MAX_KEY_COLUMNS) {
    throw new RecordKeyError('KEY_TOO_WIDE', `A record key has at most ${MAX_KEY_COLUMNS} columns`);
  }
  const names = keyColumns.map((column) => assertOracleIdentifier(column?.name, 'Key column'));
  if (new Set(names).size !== names.length) {
    throw new RecordKeyError('KEY_COLUMN_DUPLICATE', 'A key column is listed twice');
  }
  return names;
}

/**
 * Canonical key of one record. `keyColumns` are dictionary column descriptions
 * (`{ name, oracleType, precision, scale }`); `values` holds exactly one value per key column, as
 * fetched with keyFetchExpression() (or as typed by a user for a lookup). Throws RecordKeyError or
 * MappingValueError; never coerces an ambiguous value.
 */
export function buildRecordKey(keyColumns, values) {
  const names = checkKeyColumns(keyColumns);
  if (!values || typeof values !== 'object' || Array.isArray(values)) {
    throw new RecordKeyError('KEY_VALUES_REQUIRED', 'Key values must be an object');
  }
  const extra = Object.keys(values).filter((name) => !names.includes(name));
  if (extra.length) {
    throw new RecordKeyError('KEY_VALUE_UNEXPECTED', `Unexpected key part: ${extra.join(', ')}`);
  }
  const key = {};
  for (const column of keyColumns) {
    if (!Object.hasOwn(values, column.name)) {
      throw new RecordKeyError('KEY_VALUE_MISSING', `Missing key part ${column.name}`);
    }
    key[column.name] = canonicalKeyValue(column, values[column.name]);
  }
  const json = canonicalize(key);
  return Object.freeze({
    format: RECORD_KEY_FORMAT,
    json,
    sha256: sha256Hex(json),
    value: Object.freeze(key),
  });
}

const SHA256_HEX = /^[0-9a-f]{64}$/;
const isPlainObject = (value) =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

/**
 * Integrity check of a record key received from elsewhere (a caller, a request, a stored row)
 * against the mapping's key columns, using this module's own canonical implementation — there is
 * no second format. The key is rebuilt with buildRecordKey() from the parts in `json`; the result
 * must be byte-identical to `json`, its SHA-256 must equal `sha256` (lower-case hex), and `value`
 * must canonicalize to the same JSON. Returns the rebuilt, frozen key; throws RecordKeyError:
 *   RECORD_KEY_MALFORMED          not a { json, sha256, value } key / json is not a JSON object
 *   RECORD_KEY_FORMAT_UNSUPPORTED a `format` other than zrv.wf.recordKey/1
 *   RECORD_KEY_HASH_INVALID       sha256 is not 64 lower-case hex characters
 *   RECORD_KEY_COLUMNS_INVALID    the key columns themselves are invalid
 *   RECORD_KEY_VALUE_INVALID      a part is missing, unexpected, null or not valid for its type
 *   RECORD_KEY_NONCANONICAL       json differs from the canonical form (order, spacing, typing,
 *                                 number/date representation, duplicate properties)
 *   RECORD_KEY_HASH_MISMATCH      sha256 is not the hash of json
 *   RECORD_KEY_VALUE_MISMATCH     value does not represent exactly the same key as json
 */
export function verifyRecordKey(recordKey, keyColumns) {
  const fail = (code, message) => {
    throw new RecordKeyError(code, message);
  };
  if (!isPlainObject(recordKey)) fail('RECORD_KEY_MALFORMED', 'A record key object is required');
  const { json, sha256, value, format } = recordKey;
  if (format !== undefined && format !== RECORD_KEY_FORMAT) {
    fail('RECORD_KEY_FORMAT_UNSUPPORTED', `Only ${RECORD_KEY_FORMAT} keys are accepted`);
  }
  if (typeof json !== 'string' || typeof sha256 !== 'string' || !isPlainObject(value)) {
    fail('RECORD_KEY_MALFORMED', 'A record key has json, sha256 and value');
  }
  if (!SHA256_HEX.test(sha256)) fail('RECORD_KEY_HASH_INVALID', 'sha256 must be lower-case hex');
  let parts;
  try {
    parts = JSON.parse(json);
  } catch {
    fail('RECORD_KEY_MALFORMED', 'json is not valid JSON');
  }
  if (!isPlainObject(parts)) fail('RECORD_KEY_MALFORMED', 'json must be a JSON object');
  try {
    checkKeyColumns(keyColumns);
  } catch (error) {
    fail('RECORD_KEY_COLUMNS_INVALID', error.message);
  }
  let rebuilt;
  try {
    rebuilt = buildRecordKey(keyColumns, parts);
  } catch (error) {
    fail('RECORD_KEY_VALUE_INVALID', error.message);
  }
  if (rebuilt.json !== json) fail('RECORD_KEY_NONCANONICAL', 'The key is not in canonical form');
  if (rebuilt.sha256 !== sha256) fail('RECORD_KEY_HASH_MISMATCH', 'sha256 does not match the key');
  let valueJson;
  try {
    valueJson = canonicalize(value);
  } catch {
    fail('RECORD_KEY_VALUE_MISMATCH', 'value is not a canonical key value');
  }
  if (valueJson !== json)
    fail('RECORD_KEY_VALUE_MISMATCH', 'value and json describe different keys');
  return rebuilt;
}

/**
 * SQL expression that fetches a key column as text in a session-independent form accepted by the
 * canonical parsers. `columnRef` must already be a quoted, dictionary-verified reference.
 */
export function keyFetchExpression(column, columnRef) {
  const { family } = describeOracleType(column);
  switch (family) {
    case FAMILIES.NUMBER:
      return `TO_CHAR(${columnRef}, 'TM9', 'NLS_NUMERIC_CHARACTERS=''.,''')`;
    case FAMILIES.DATE:
      return `TO_CHAR(${columnRef}, 'YYYY-MM-DD"T"HH24:MI:SS')`;
    case FAMILIES.TIMESTAMP:
      return `TO_CHAR(${columnRef}, 'YYYY-MM-DD"T"HH24:MI:SS.FF9')`;
    case FAMILIES.TIMESTAMP_TZ:
      return `TO_CHAR(SYS_EXTRACT_UTC(${columnRef}), 'YYYY-MM-DD"T"HH24:MI:SS.FF9') || 'Z'`;
    case FAMILIES.RAW:
      return `RAWTOHEX(${columnRef})`;
    case FAMILIES.VARCHAR:
    case FAMILIES.CHAR:
      return columnRef;
    default:
      throw new RecordKeyError('KEY_TYPE_UNSUPPORTED', `Column ${column.name} cannot be a key`);
  }
}

/**
 * Fail-closed single-record rule for every read by key (fetch at most SINGLE_RECORD_FETCH_LIMIT
 * rows): exactly one row is returned; none is RECORD_NOT_FOUND; more than one is
 * DUPLICATE_RECORD_KEY — never "the first row".
 */
export function assertSingleRecord(rows) {
  if (!Array.isArray(rows)) throw new RecordKeyError('RECORD_READ_INVALID', 'Rows are required');
  if (rows.length === 0) throw new RecordKeyError('RECORD_NOT_FOUND', 'No record has this key');
  if (rows.length > 1) {
    throw new RecordKeyError('DUPLICATE_RECORD_KEY', 'More than one record has this key');
  }
  return rows[0];
}
