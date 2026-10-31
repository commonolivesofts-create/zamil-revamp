import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

import { validationCode } from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.validation.js';

test('EMF validator maps documented errors', () => {
  assert.equal(validationCode('department', 'any.only'), 'INVALID_DEPARTMENT');

  assert.equal(validationCode('activityDate', 'string.pattern.base'), 'INVALID_DATE');

  assert.equal(validationCode('lines.2.rating', 'any.only'), 'INVALID_RATING');

  assert.equal(validationCode('lines.3.lineNumber', 'any.required'), 'INVALID_LINE_COUNT');

  assert.equal(validationCode('lines.2.remark', 'string.max'), 'LINE_REMARK_TOO_LONG');
});

test('EMF endpoint registration uses UPDATE and lookup routing before ID', () => {
  const routes = readFileSync(
    new URL(
      '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.routes.js',
      import.meta.url,
    ),
    'utf8',
  );

  assert.ok(routes.indexOf("'/lookups/employees'") < routes.indexOf("'/:headerId'"));

  assert.match(routes, /write\('UPDATE'/);

  assert.doesNotMatch(routes, /write\('EDIT'/);
});
