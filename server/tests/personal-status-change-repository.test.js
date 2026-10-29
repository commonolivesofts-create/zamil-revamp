import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { createPersonalStatusRepository } from '../src/modules/hr/personal-status/personalStatusChange.repository.js';

function mockConnection(results = []) {
  const calls = [];
  return {
    calls,
    async execute(sql, binds, options) {
      calls.push({ sql, binds, options });
      return results.shift() ?? { rows: [], rowsAffected: 1 };
    },
  };
}

const values = {
  formDate: '2026-10-29',
  arbDate: null,
  effectiveDate: '2026-11-01',
  empNo: '12001',
  empName: 'Test Employee',
  nationality: 'Saudi',
  section: 'Production',
  department: 'Injection',
  startDate: '2019-03-17',
  oldPosition: 'Operator',
  oldBasicSal: 5000,
  oldHouseAll: 1000,
  oldTransAll: 500,
  oldCommunAll: 300,
  oldCarAll: 200,
  oldOtherAll: 0,
  oldTotal: 7000,
  oldMaritalStatus: 'M',
  newPosition: 'Supervisor',
  newBasicSal: 5500,
  newHouseAll: 1000,
  newTransAll: 500,
  newCommunAll: 300,
  newCarAll: 200,
  newOtherAll: 0,
  newTotal: 7500,
  newMaritalStatus: 'S',
  remarks: null,
  views: null,
};

describe('personal status change repository', () => {
  it('preserves large header IDs as strings and uses an explicit read column list', async () => {
    const connection = mockConnection([{ rows: [{ ID: '9007199254740993' }] }, { rows: [] }]);
    const repository = createPersonalStatusRepository();

    assert.equal(await repository.nextId(connection), '9007199254740993');
    await repository.read('9007199254740993', connection);

    assert.match(connection.calls[0].sql, /TO_CHAR\(NVL\(MAX\(HEADER_ID\) \+ 1, 1\)\)/);
    assert.match(connection.calls[1].sql, /TO_CHAR\(R\.HEADER_ID\) HEADER_ID/);
    assert.doesNotMatch(connection.calls[1].sql, /R\.\*/);
    assert.equal(connection.calls[1].binds.headerId, '9007199254740993');
  });

  it('binds all insert/update values, converts ISO dates, and leaves server-owned columns alone', async () => {
    const connection = mockConnection();
    const repository = createPersonalStatusRepository();

    await repository.insert(connection, '142', '0142-Production', values, '88');
    await repository.update(connection, '142', values, '99');

    const [insert, update] = connection.calls;
    assert.match(insert.sql, /TO_DATE\(:startDate, 'YYYY-MM-DD'\)/);
    assert.match(insert.sql, /TO_DATE\(:effectiveDate, 'YYYY-MM-DD'\)/);
    assert.equal(insert.binds.headerId, '142');
    assert.equal(insert.binds.startDate, '2019-03-17');
    assert.match(insert.sql, /'DRAFT'/);
    assert.match(insert.sql, /USER_ID[\s\S]*?NULL/);
    assert.doesNotMatch(update.sql, /^\s*(STATUS|REF_NO|CREATED_BY|CREATED_AT)\s*=/m);
    assert.doesNotMatch(update.sql.split('WHERE')[0], /HEADER_ID\s*=/);
    assert.match(update.sql, /UPDATED_BY = :updatedBy/);
    assert.equal(update.binds.updatedBy, '99');
  });

  it('keeps list filtering parameterized, uses allowlisted ordering and returns a real count', async () => {
    const connection = mockConnection([{ rows: [{ TOTAL: 1 }] }, { rows: [{ HEADER_ID: '1' }] }]);
    const repository = createPersonalStatusRepository();
    const result = await repository.list(connection, {
      search: "%' OR 1=1 --",
      status: 'DRAFT',
      section: 'Production',
      department: 'Injection',
      position: 'Supervisor',
      requestor: '88',
      date_from: '2026-10-01',
      date_to: '2026-10-31',
      page: 2,
      pageSize: 10,
      sort: 'headerId',
      order: 'desc',
    });

    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    assert.equal(connection.calls.length, 2);
    assert.ok(connection.calls[0].binds.search.includes('\\%'));
    assert.match(connection.calls[1].sql, /ORDER BY\s+R\.HEADER_ID DESC/);
    assert.equal(connection.calls[1].binds.offset, 10);
    assert.equal(connection.calls[1].binds.pageSize, 10);
    assert.doesNotMatch(connection.calls[1].sql, /PENDING_AT|XXPHP_WORKFLOW/);
    assert.equal(connection.calls[0].sql.includes("%' OR 1=1 --"), false);
  });
});
