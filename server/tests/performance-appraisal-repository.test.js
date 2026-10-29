import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import * as repository from '../src/modules/hr/performance-appraisals/performanceAppraisal.repository.js';

function connectionWith(responses = []) {
  const calls = [];
  return {
    calls,
    async execute(sql, binds, options) {
      calls.push({ sql, binds, options });
      return responses.shift() ?? { rows: [], rowsAffected: 1 };
    },
  };
}

describe('performance appraisal Oracle repository', () => {
  it('omits the database generated header ID and binds every create value', async () => {
    const conn = connectionWith();
    await repository.insertHeader(conn, {
      uuid: 'uuid',
      personId: '2',
      empName: 'Name',
      empNumber: '3',
    });
    const { sql, binds } = conn.calls[0];
    assert.match(sql, /INSERT INTO XXZP\.XXZPI_HR_PA_HEADER_TAB/);
    assert.doesNotMatch(sql, /\(HEADER_ID,/);
    assert.doesNotMatch(sql, /XXZP_RATING_WF_LOOKUP|ATTRIBUTE2|ATTRIBUTE3|ATTRIBUTE4/);
    assert.match(sql, /'Inprocess'/);
    assert.equal(binds.uuid, 'uuid');
  });

  it('reads back header ID by UUID and binds employee-year duplicate checks', async () => {
    const conn = connectionWith([
      { rows: [{ HEADER_ID: '9007199254740993' }] },
      { rows: [{ TOTAL: 1 }] },
    ]);
    assert.equal(await repository.findHeaderIdByUuid(conn, 'uuid'), '9007199254740993');
    assert.match(conn.calls[0].sql, /WHERE UUID = :uuid/);
    assert.equal(conn.calls[0].binds.uuid, 'uuid');
    assert.equal(await repository.hasDuplicate(conn, '15', 2026), true);
    assert.deepEqual(conn.calls[1].binds, { employeeNumber: '15', year: 2026 });
    assert.match(conn.calls[1].sql, /NVL\(UPPER\(STATUS\), '-'\) <> 'REJECTED'/);
  });

  it('uses only active filter binds and a static allowlisted sort expression for listing', async () => {
    const conn = connectionWith([{ rows: [{ TOTAL: 3 }] }, { rows: [] }]);
    await repository.listAppraisals(conn, {
      year: 2026,
      filters: { search: '%A%', status: null, grade: 'B', department: null },
      page: 2,
      pageSize: 25,
      sort: 'rating',
      order: 'desc',
      userId: '44',
      isHr: false,
    });
    assert.deepEqual(conn.calls[0].binds, { year: 2026, search: '%A%', grade: 'B', userId: '44' });
    assert.match(conn.calls[1].sql, /ORDER BY HR\.TOTAL_RATINGS DESC/);
    assert.equal(conn.calls[1].binds.offset, 25);
    assert.equal(conn.calls[1].binds.pageSize, 25);
    assert.doesNotMatch(conn.calls[0].sql, /XXPHP_WORKFLOW|PENDING_AT/);
  });

  it('updates no status, employee, period, audit, or workflow-owned columns', async () => {
    const conn = connectionWith([{ rowsAffected: 1 }]);
    await repository.updateHeader(conn, { headerId: '7', rating: 4, grade: 'B' });
    assert.match(conn.calls[0].sql, /SET TOTAL_RATINGS/);
    assert.doesNotMatch(
      conn.calls[0].sql,
      /STATUS\s*=|EMPLOYEE_|APPRAISAL_PERIOD|CREATED_BY|ATTRIBUTE[234]/,
    );
    assert.equal(conn.calls[0].binds.headerId, '7');
  });
});
