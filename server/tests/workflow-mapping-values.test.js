/*
 * Workflow Manager M2-0 — canonical JSON, precise Oracle values and canonical record keys.
 * Fixed vectors: the expected SHA-256 values were computed independently with node:crypto over
 * the literal canonical strings, so a change to the canonical format breaks these tests.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  canonicalize,
  CanonicalJsonError,
  fingerprint,
  MAX_DEPTH,
} from '../src/modules/workflow-manager/mapping/canonicalJson.js';
import {
  assertSingleRecord,
  buildRecordKey,
  keyFetchExpression,
  MAX_KEY_COLUMNS,
  RECORD_KEY_FORMAT,
  SINGLE_RECORD_FETCH_LIMIT,
} from '../src/modules/workflow-manager/mapping/recordKey.js';
import {
  canonicalCalendarDate,
  canonicalDateTime,
  canonicalDecimal,
  canonicalFieldValue,
  canonicalInteger,
  canonicalKeyValue,
  canonicalRaw,
  canonicalText,
  canonicalTimestamp,
  canonicalTimestampTz,
  describeOracleType,
  fieldTypeIncompatibility,
  joinable,
  keyIneligibility,
} from '../src/modules/workflow-manager/mapping/typeCompatibility.js';
import {
  assertOracleIdentifier,
  qualifiedName,
  quoteIdentifier,
} from '../src/modules/workflow-manager/mapping/identifiers.js';

const throwsCode = (fn, code) => assert.throws(fn, (error) => error.code === code, code);
const num = (extra = {}) => ({ name: 'N', oracleType: 'NUMBER', ...extra });

describe('canonical JSON', () => {
  it('orders keys by code point, removes whitespace and matches a fixed vector', () => {
    const value = { é: 'é', b: [true, null, 'x'], a: 1 };
    const { json, sha256 } = fingerprint(value);
    assert.equal(json, '{"a":1,"b":[true,null,"x"],"é":"é"}');
    assert.equal(sha256, '556aca01af123a29ccb387a06c76e2bb41817dc3441334591ed9ceda03d0da94');
    assert.equal(
      canonicalize({ b: 1, a: { d: 2, c: 3 } }),
      canonicalize({ a: { c: 3, d: 2 }, b: 1 }),
    );
    assert.deepEqual(JSON.parse(json), value, 'strict JSON round trip');
  });

  it('orders astral characters by code point, not UTF-16 unit', () => {
    // U+FF61 (one unit) < U+1F600 (surrogate pair) by code point; UTF-16 order is reversed.
    assert.equal(canonicalize({ '\u{1F600}': 1, '｡': 2 }), '{"｡":2,"😀":1}');
  });

  it('rejects ambiguous or lossy values instead of dropping or coercing them', () => {
    for (const bad of [
      { a: undefined },
      { a: 1.5 },
      { a: Number.MAX_SAFE_INTEGER + 1 },
      { a: NaN },
      { a: Infinity },
      { a: -0 },
      { a: 10n },
      { a: () => 1 },
      { a: Symbol('s') },
      { a: new Date(0) },
      { a: new Map() },
      { a: '\uD800' },
      { [Symbol('k')]: 1 },
      [1, , 3], // eslint-disable-line no-sparse-arrays
    ]) {
      assert.throws(() => canonicalize(bad), CanonicalJsonError, JSON.stringify(String(bad)));
    }
    let deep = 'x';
    for (let i = 0; i <= MAX_DEPTH; i += 1) deep = [deep];
    assert.throws(() => canonicalize(deep), CanonicalJsonError);
  });
});

describe('precise Oracle values', () => {
  it('normalizes decimals exactly with string arithmetic', () => {
    const cases = [
      ['0', '0'],
      ['-0.000', '0'],
      ['+007.50', '7.5'],
      ['.5', '0.5'],
      ['-.5', '-0.5'],
      ['1E+3', '1000'],
      ['1.23e-5', '0.0000123'],
      ['12345678901234567890123456789012345678.9', '12345678901234567890123456789012345678.9'],
      ['0.1000000000000000055511151231257827', '0.1000000000000000055511151231257827'],
      ['-12345678901234567890.1234567890', '-12345678901234567890.123456789'],
      [42, '42'],
      [9007199254740993n, '9007199254740993'],
    ];
    for (const [input, expected] of cases)
      assert.equal(canonicalDecimal(input), expected, String(input));
    // 0.1 + 0.2 must never be produced by floating point; JS non-integers are refused.
    throwsCode(() => canonicalDecimal(0.1), 'PRECISION_RISK');
    throwsCode(() => canonicalDecimal(Number.MAX_SAFE_INTEGER + 2), 'PRECISION_RISK');
    for (const bad of ['', '.', '1.2.3', '1e', 'abc', '0x10', '1,5', ' - 1']) {
      throwsCode(() => canonicalDecimal(bad), 'INVALID_DECIMAL');
    }
    throwsCode(() => canonicalDecimal('1'.repeat(41)), 'NUMBER_OUT_OF_RANGE');
    throwsCode(() => canonicalDecimal('1e126'), 'NUMBER_OUT_OF_RANGE');
    throwsCode(() => canonicalDecimal('1e-131'), 'NUMBER_OUT_OF_RANGE');
    assert.equal(canonicalDecimal('9.99e125'), `999${'0'.repeat(123)}`);
    throwsCode(() => canonicalInteger('1.01'), 'NOT_AN_INTEGER');
    assert.equal(canonicalInteger('100.000'), '100');
  });

  it('keeps distinct high-precision values distinct', () => {
    const a = canonicalDecimal('0.30000000000000000000000000000000000001');
    const b = canonicalDecimal('0.3');
    assert.notEqual(a, b);
  });

  it('canonicalizes DATE, TIMESTAMP and TIMESTAMP WITH TIME ZONE deterministically', () => {
    assert.equal(canonicalDateTime('2026-02-28'), '2026-02-28T00:00:00');
    assert.equal(canonicalDateTime('2026-02-28 13:05:09'), '2026-02-28T13:05:09');
    assert.equal(canonicalCalendarDate('2024-02-29T00:00:00'), '2024-02-29');
    throwsCode(() => canonicalCalendarDate('2024-02-29T00:00:01'), 'DATE_HAS_TIME');
    throwsCode(() => canonicalDateTime('2026-02-29'), 'INVALID_DATE');
    throwsCode(() => canonicalDateTime('0000-01-01'), 'INVALID_DATE');
    throwsCode(() => canonicalDateTime('2026-01-01T24:00:00'), 'INVALID_DATE');
    assert.equal(canonicalTimestamp('2026-01-01T10:00:00.5'), '2026-01-01T10:00:00.500000000');
    assert.equal(canonicalTimestamp('2026-01-01T10:00:00'), '2026-01-01T10:00:00.000000000');
    throwsCode(
      () => canonicalTimestamp('2026-01-01T10:00:00.1234567', { fractionalDigits: 6 }),
      'INVALID_TIMESTAMP',
    );
    throwsCode(() => canonicalTimestamp('2026-01-01T10:00:00Z'), 'INVALID_TIMESTAMP');
    assert.equal(
      canonicalTimestampTz('2026-02-28T22:30:00-03:00'),
      '2026-03-01T01:30:00.000000000Z',
    );
    assert.equal(
      canonicalTimestampTz('2024-02-29T01:00:00.123456789+03:00'),
      '2024-02-28T22:00:00.123456789Z',
    );
    assert.equal(canonicalTimestampTz('2026-12-31T23:59:59Z'), '2026-12-31T23:59:59.000000000Z');
    // Same instant in two offsets → same canonical value.
    assert.equal(
      canonicalTimestampTz('2026-06-01T12:00:00+03:00'),
      canonicalTimestampTz('2026-06-01T09:00:00Z'),
    );
    throwsCode(() => canonicalTimestampTz('2026-06-01T12:00:00'), 'INVALID_TIMESTAMP_TZ');
    throwsCode(() => canonicalTimestampTz('2026-06-01T12:00:00+15:00'), 'INVALID_TIMESTAMP_TZ');
    throwsCode(() => canonicalTimestampTz('0001-01-01T00:30:00+01:00'), 'INVALID_TIMESTAMP_TZ');
  });

  it('canonicalizes text and RAW without merging distinct values', () => {
    assert.equal(canonicalText('A '), 'A ', 'VARCHAR2 keeps trailing blanks');
    assert.equal(canonicalText('A  ', { family: 'CHAR' }), 'A', 'CHAR is blank-padded in Oracle');
    throwsCode(() => canonicalText(''), 'EMPTY_VALUE');
    throwsCode(() => canonicalText('\uDC00'), 'INVALID_TEXT');
    assert.equal(canonicalRaw('0aFf'), '0AFF');
    throwsCode(() => canonicalRaw('ABC'), 'INVALID_RAW');
  });

  it('classifies Oracle types and field compatibility', () => {
    assert.equal(describeOracleType(num({ scale: 0 })).integral, true);
    assert.equal(describeOracleType(num()).integral, false, 'NUMBER without scale is not integral');
    assert.equal(
      describeOracleType({ oracleType: 'TIMESTAMP(6) WITH TIME ZONE' }).family,
      'TIMESTAMP_TZ',
    );
    assert.equal(
      keyIneligibility({ oracleType: 'TIMESTAMP(6) WITH LOCAL TIME ZONE' }),
      'KEY_TYPE_SESSION_DEPENDENT',
    );
    assert.equal(keyIneligibility({ oracleType: 'CLOB' }), 'KEY_TYPE_LOB');
    assert.equal(keyIneligibility({ oracleType: 'BINARY_DOUBLE' }), 'KEY_TYPE_UNSUPPORTED');
    assert.equal(keyIneligibility({ oracleType: 'RAW' }), null);
    assert.equal(fieldTypeIncompatibility('INTEGER', num()), 'FIELD_TYPE_NOT_INTEGRAL');
    assert.equal(fieldTypeIncompatibility('DECIMAL', num()), null);
    assert.equal(
      fieldTypeIncompatibility('DATE', { oracleType: 'VARCHAR2' }),
      'FIELD_TYPE_INCOMPATIBLE',
    );
    assert.equal(
      fieldTypeIncompatibility('TEXT', { oracleType: 'BLOB' }),
      'FIELD_TYPE_INCOMPATIBLE',
    );
    assert.equal(joinable(num(), num({ scale: 0 })), true);
    assert.equal(joinable({ oracleType: 'VARCHAR2' }, { oracleType: 'CHAR' }), true);
    assert.equal(
      joinable(num(), { oracleType: 'VARCHAR2' }),
      false,
      'no implicit conversion joins',
    );
  });

  it('produces typed canonical field values for future conditions', () => {
    const decimalField = { code: 'AMOUNT', type: 'DECIMAL' };
    assert.equal(canonicalFieldValue(decimalField, num({ scale: 4 }), '1234.5000'), '1234.5');
    assert.equal(canonicalFieldValue(decimalField, num(), null), null);
    const flag = { code: 'URGENT', type: 'BOOLEAN', booleanMapping: { true: 'Y', false: 'N' } };
    assert.equal(canonicalFieldValue(flag, { oracleType: 'VARCHAR2' }, 'Y'), true);
    throwsCode(() => canonicalFieldValue(flag, { oracleType: 'VARCHAR2' }, 'y'), 'INVALID_BOOLEAN');
    throwsCode(
      () => canonicalFieldValue({ code: 'D', type: 'DATE' }, num(), '1'),
      'FIELD_TYPE_INCOMPATIBLE',
    );
    assert.equal(canonicalKeyValue({ oracleType: 'DATE' }, '2026-01-02'), '2026-01-02T00:00:00');
  });
});

describe('canonical record keys', () => {
  const id = { name: 'REQUEST_ID', oracleType: 'NUMBER' };

  it('builds single keys with a fixed vector', () => {
    const key = buildRecordKey([id], { REQUEST_ID: '1045' });
    assert.equal(key.format, RECORD_KEY_FORMAT);
    assert.equal(key.json, '{"REQUEST_ID":"1045"}');
    assert.equal(key.sha256, 'eaed05e689ea0ce20bb24a5ddb276fc59d8cb7200c11a0ea31b022fd8b641e8c');
    // Different textual forms of the same Oracle NUMBER give the same key.
    assert.equal(buildRecordKey([id], { REQUEST_ID: '1045.000' }).sha256, key.sha256);
    assert.equal(buildRecordKey([id], { REQUEST_ID: 1045 }).sha256, key.sha256);
    assert.ok(Object.isFrozen(key.value));
  });

  it('builds composite keys independent of column order (fixed vector)', () => {
    const columns = [
      { name: 'ORDER_NO', oracleType: 'VARCHAR2' },
      { name: 'LINE_NO', oracleType: 'NUMBER', scale: 0 },
    ];
    const key = buildRecordKey(columns, { LINE_NO: '2', ORDER_NO: 'A-1' });
    assert.equal(key.json, '{"LINE_NO":"2","ORDER_NO":"A-1"}');
    assert.equal(key.sha256, '4b5855dec54fe634ecc742d4614d432ae620d4e904a6387277ef21c077fd63ac');
    assert.equal(
      buildRecordKey([...columns].reverse(), { ORDER_NO: 'A-1', LINE_NO: '2' }).sha256,
      key.sha256,
    );
  });

  it('builds decimal and date/time keys without precision loss (fixed vector)', () => {
    const key = buildRecordKey(
      [
        { name: 'AMOUNT', oracleType: 'NUMBER', precision: 38, scale: 9 },
        { name: 'BOOKED_AT', oracleType: 'TIMESTAMP(9) WITH TIME ZONE' },
        { name: 'DAY', oracleType: 'DATE' },
      ],
      {
        AMOUNT: '-012345678901234567890.1234567890',
        BOOKED_AT: '2026-02-28T22:30:00-03:00',
        DAY: '2026-02-28',
      },
    );
    assert.equal(
      key.json,
      '{"AMOUNT":"-12345678901234567890.123456789","BOOKED_AT":"2026-03-01T01:30:00.000000000Z","DAY":"2026-02-28T00:00:00"}',
    );
    assert.equal(key.sha256, 'd9568befacbbb00f0db9049824edea541a4b29da8f8e375a6e3d3c116f2c3501');
  });

  it('fails closed on nulls, empties, unsupported types and malformed key input', () => {
    throwsCode(() => buildRecordKey([id], { REQUEST_ID: null }), 'NULL_KEY_VALUE');
    throwsCode(
      () => buildRecordKey([{ name: 'K', oracleType: 'VARCHAR2' }], { K: '' }),
      'EMPTY_VALUE',
    );
    throwsCode(
      () => buildRecordKey([{ name: 'K', oracleType: 'CLOB' }], { K: 'x' }),
      'KEY_TYPE_LOB',
    );
    throwsCode(
      () => buildRecordKey([{ name: 'K', oracleType: 'BINARY_FLOAT' }], { K: '1' }),
      'KEY_TYPE_UNSUPPORTED',
    );
    throwsCode(
      () =>
        buildRecordKey([{ name: 'K', oracleType: 'TIMESTAMP(6) WITH LOCAL TIME ZONE' }], {
          K: 'x',
        }),
      'KEY_TYPE_SESSION_DEPENDENT',
    );
    throwsCode(() => buildRecordKey([id], {}), 'KEY_VALUE_MISSING');
    throwsCode(() => buildRecordKey([id], { REQUEST_ID: '1', OTHER: '2' }), 'KEY_VALUE_UNEXPECTED');
    throwsCode(() => buildRecordKey([], {}), 'KEY_COLUMNS_REQUIRED');
    throwsCode(() => buildRecordKey([id, id], { REQUEST_ID: '1' }), 'KEY_COLUMN_DUPLICATE');
    throwsCode(
      () => buildRecordKey([{ name: 'a"; DROP', oracleType: 'NUMBER' }], {}),
      'INVALID_IDENTIFIER',
    );
    const wide = Array.from({ length: MAX_KEY_COLUMNS + 1 }, (_, i) => ({
      name: `K${i}`,
      oracleType: 'NUMBER',
    }));
    throwsCode(() => buildRecordKey(wide, {}), 'KEY_TOO_WIDE');
    throwsCode(() => buildRecordKey([id], { REQUEST_ID: 0.5 }), 'PRECISION_RISK');
  });

  it('reads by key fail closed: exactly one row, never "the first"', () => {
    assert.equal(SINGLE_RECORD_FETCH_LIMIT, 2);
    assert.deepEqual(assertSingleRecord([{ A: 1 }]), { A: 1 });
    throwsCode(() => assertSingleRecord([]), 'RECORD_NOT_FOUND');
    throwsCode(() => assertSingleRecord([{ A: 1 }, { A: 1 }]), 'DUPLICATE_RECORD_KEY');
    throwsCode(() => assertSingleRecord(null), 'RECORD_READ_INVALID');
  });

  it('fetches key columns with session-independent expressions', () => {
    const ref = quoteIdentifier('C');
    assert.equal(
      keyFetchExpression(num(), ref),
      `TO_CHAR("C", 'TM9', 'NLS_NUMERIC_CHARACTERS=''.,''')`,
    );
    assert.match(
      keyFetchExpression({ oracleType: 'TIMESTAMP(6) WITH TIME ZONE' }, ref),
      /SYS_EXTRACT_UTC/,
    );
    assert.equal(keyFetchExpression({ oracleType: 'VARCHAR2' }, ref), '"C"');
    throwsCode(
      () => keyFetchExpression({ name: 'C', oracleType: 'CLOB' }, ref),
      'KEY_TYPE_UNSUPPORTED',
    );
  });
});

describe('Oracle identifiers', () => {
  it('quotes only verified dictionary-form names and refuses injection', () => {
    assert.equal(qualifiedName('DEMO_APP', 'DEMO_REQUEST_H'), '"DEMO_APP"."DEMO_REQUEST_H"');
    for (const bad of ['demo', 'A"B', 'A B', 'A;DROP', '1A', '', 'A'.repeat(129), 'A--', null]) {
      assert.throws(
        () => assertOracleIdentifier(bad),
        (error) => error.code === 'INVALID_IDENTIFIER',
        String(bad),
      );
    }
  });
});
