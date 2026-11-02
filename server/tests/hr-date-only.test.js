import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as orientationRepository from '../src/modules/hr/orientation-trainings/orientationTraining.repository.js';
import * as probationRepository from '../src/modules/hr/probation-evaluations/probationEvaluation.repository.js';

// Date-only columns (JOINING_DATE) must reach the client as 'YYYY-MM-DD' strings. A DATE fetched as
// a JS Date is local midnight of the Node process and serialises in UTC, so on any server east of
// UTC (e.g. +03:00) 2026-01-15 became '2026-01-14T21:00:00.000Z' and the client showed the 14th.
function fakeConnection(rowsFor) {
  const statements = [];
  return {
    statements,
    async execute(sql, binds) {
      statements.push({ sql, binds });
      return { rows: rowsFor(sql), rowsAffected: 1 };
    },
  };
}

describe('HR date-only fields', () => {
  it('orientation employee lookups select JOINING_DATE as a YYYY-MM-DD string', async () => {
    const connection = fakeConnection(() => [{ START_DATE: '2026-01-15', EMPLOYEE_NUMBER: 'E-1' }]);
    const details = await orientationRepository.findEmployeeDetails(connection, 'E-1');
    await orientationRepository.listEmployees(connection, { userId: '1', isHr: true });
    for (const { sql } of connection.statements) {
      assert.match(sql, /TO_CHAR\((e\.)?JOINING_DATE, 'YYYY-MM-DD'\) AS START_DATE/);
    }
    assert.equal(details.startDate, '2026-01-15');
  });

  it('probation employee details select JOINING_DATE as a YYYY-MM-DD string', async () => {
    const connection = fakeConnection((sql) =>
      sql.includes('START_DATE')
        ? [{ START_DATE: '2026-01-15' }]
        : [{ PERSON_ID: '7', EMPLOYEE_NUMBER: 'E-1' }],
    );
    const details = await probationRepository.findEmployeeDetails(connection, {
      empName: 'Sample Employee 001',
      userId: '1',
    });
    const hire = connection.statements.find(({ sql }) => sql.includes('AS START_DATE'));
    assert.match(hire.sql, /TO_CHAR\(JOINING_DATE, 'YYYY-MM-DD'\) AS START_DATE/);
    assert.equal(details.hire.startDate, '2026-01-15');
  });

  it('orientation writes bind date-only values as YYYY-MM-DD (no two-digit years or month names)', async () => {
    const connection = fakeConnection(() => []);
    const table = orientationRepository.TABLES.N;
    await orientationRepository.updateHeader(connection, table, {
      headerId: '1',
      fromOrient: '1999-12-31',
      toOrient: '2026-01-15',
      startDate: '1999-12-31',
    });
    const [{ sql, binds }] = connection.statements;
    assert.doesNotMatch(sql, /DD-Mon/);
    assert.match(sql, /STARTING_DATE = TO_DATE\(:startDate, 'YYYY-MM-DD'\)/);
    assert.equal(binds.startDate, '1999-12-31');
  });
});
