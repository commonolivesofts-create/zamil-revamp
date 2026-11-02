import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import oracledb from 'oracledb';
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
  arbDate: 'Hijri date',
  effectiveDate: '2026-11-01',
  empNo: '12001',
  empName: 'Test Employee',
  nationality: 'Nationality A',
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
  newGrade: null,
  newLevel: null,
  remarks: null,
  views: null,
};

const LEGACY_DATE =
  /TO_DATE\(R\.START_DATE DEFAULT NULL ON CONVERSION ERROR, 'DD-MON-RR', 'NLS_DATE_LANGUAGE=AMERICAN'\)/;

describe('personal status change repository', () => {
  it('reads the VARCHAR2 legacy dates with an explicit format and keeps IDs as strings', async () => {
    const connection = mockConnection([{ rows: [] }]);
    const repository = createPersonalStatusRepository();
    await repository.read('9007199254740993', connection);
    const { sql, binds } = connection.calls[0];
    assert.match(sql, /TO_CHAR\(R\.HEADER_ID\) HEADER_ID/);
    assert.doesNotMatch(sql, /R\.\*/);
    // START_DATE and *_SIGN hold DD-MON-YY text; a date TO_CHAR on them raised ORA-01722.
    assert.match(sql, LEGACY_DATE);
    for (const column of ['HR_ADMIN_SIGN', 'VP_SIGN', 'PRESIDENT_SIGN']) {
      assert.match(sql, new RegExp(`TO_DATE\\(R\\.${column} DEFAULT NULL ON CONVERSION ERROR`));
      assert.doesNotMatch(sql, new RegExp(`TO_CHAR\\(R\\.${column},`));
    }
    assert.doesNotMatch(sql, /TO_CHAR\(R\.START_DATE,/);
    assert.equal(binds.headerId, '9007199254740993');
  });

  it('autofill: latest request snapshot and the master row with TOTAL_SALARY', async () => {
    const connection = mockConnection([{ rows: [{ EMP_NO: '2172' }] }, { rows: [{}] }]);
    const repository = createPersonalStatusRepository();
    await repository.latest(connection, '2172');
    await repository.master(connection, '2172');
    assert.equal(connection.calls[0].binds.empNo, '2172');
    assert.match(connection.calls[0].sql, /TO_CHAR\(R\.EMP_NO\) = :empNo/);
    assert.match(connection.calls[0].sql, LEGACY_DATE);
    assert.doesNotMatch(connection.calls[0].sql, /HR_ADMIN_SIGN|PRESIDENT_SIGN|R\.STATUS/);
    assert.match(connection.calls[1].sql, /TOTAL_SALARY/);
    assert.match(connection.calls[1].sql, /CURRENT_EMP_FLAG = 'Y'/);
  });

  it('insert uses the identity column, binds every value and writes START_DATE as DD-MON-RR text', async () => {
    const connection = mockConnection([{ rowsAffected: 1, outBinds: { headerId: ['653'] } }]);
    const repository = createPersonalStatusRepository();
    assert.equal(await repository.insert(connection, values, '88'), '653');
    const { sql, binds } = connection.calls[0];
    assert.match(sql, /RETURNING HEADER_ID INTO :headerId/);
    assert.doesNotMatch(sql.split('VALUES')[0], /\bHEADER_ID\b/, 'no explicit HEADER_ID');
    assert.doesNotMatch(sql, /MAX\(HEADER_ID\)/);
    assert.deepEqual(binds.headerId, { dir: oracledb.BIND_OUT, type: oracledb.STRING });
    assert.match(
      sql,
      /TO_CHAR\(TO_DATE\(:startDate, 'YYYY-MM-DD'\), 'DD-MON-RR', 'NLS_DATE_LANGUAGE=AMERICAN'\)/,
    );
    assert.match(sql, /TO_DATE\(:effectiveDate, 'YYYY-MM-DD'\)/);
    assert.match(sql, /TO_DATE\(:formDate, 'YYYY-MM-DD'\)/);
    assert.match(sql, /'DRAFT'/);
    assert.equal(binds.createdBy, '88');
    assert.equal(binds.startDate, '2019-03-17');
    assert.equal(binds.arbDate, 'Hijri date');

    await repository.setReference(connection, '653', '0653-Production');
    assert.match(connection.calls[1].sql, /SET REF_NO = :refNo/);
    assert.deepEqual(connection.calls[1].binds, { headerId: '653', refNo: '0653-Production' });
  });

  it('update writes the answers only, and the snapshot only when asked; never server-owned columns', async () => {
    const connection = mockConnection();
    const repository = createPersonalStatusRepository();
    await repository.update(connection, '142', values, '99');
    await repository.update(connection, '142', values, '99', { snapshot: true });
    const [plain, withSnapshot] = connection.calls;
    for (const call of [plain, withSnapshot]) {
      const set = call.sql.split('WHERE')[0];
      assert.doesNotMatch(
        set,
        /\b(STATUS|REF_NO|CREATED_BY|CREATED_AT|FORM_DATE|ARB_DATE|HEADER_ID)\s*=/,
      );
      assert.match(set, /UPDATED_BY = :updatedBy/);
      assert.match(set, /NEW_GRADE = :newGrade/);
      assert.match(set, /OLD_MARITAL_STATUS = :oldMaritalStatus/);
    }
    assert.doesNotMatch(plain.sql, /EMP_NAME =|OLD_TOTAL =|START_DATE =/);
    assert.equal('empName' in plain.binds, false);
    assert.match(withSnapshot.sql, /EMP_NAME = :empName/);
    assert.match(withSnapshot.sql, /OLD_TOTAL = :oldTotal/);
    assert.equal(withSnapshot.binds.empName, 'Test Employee');
  });

  it('list: parameterized filters, allowlisted ordering, PENDING_AT and record-access scope', async () => {
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
      scope: { userId: '7', employeeNumber: '12003' },
    });
    assert.equal(result.total, 1);
    assert.equal(result.rows.length, 1);
    const [count, page] = connection.calls;
    assert.ok(count.binds.search.includes('\\%'));
    assert.equal(count.sql.includes("%' OR 1=1 --"), false);
    assert.match(page.sql, /ORDER BY\s+R\.HEADER_ID DESC/);
    assert.equal(page.binds.offset, 10);
    assert.equal(page.binds.pageSize, 10);
    // Legacy report column; read only, no workflow write.
    assert.match(page.sql, /FROM XXPHP_WORKFLOW W[\s\S]*W\.MSG_TYPE = 'RCF'[\s\S]*PENDING_AT/);
    assert.match(page.sql, /W\.USER_KEY = TO_CHAR\(R\.HEADER_ID\)/);
    for (const call of [count, page]) {
      assert.match(call.sql, /R\.CREATED_BY = :scopeUserId OR EXISTS/);
      assert.equal(call.binds.scopeUserId, '7');
      assert.equal(call.binds.scopeEmployeeNumber, '12003');
    }

    const hr = mockConnection([{ rows: [{ TOTAL: 0 }] }, { rows: [] }]);
    await repository.list(hr, {
      page: 1,
      pageSize: 25,
      sort: 'headerId',
      order: 'desc',
      scope: null,
    });
    assert.doesNotMatch(hr.calls[0].sql, /scopeUserId/);
  });

  it('positions accept the datalist (POSITION_NAME) or a job title (the auto-filled default)', async () => {
    const connection = mockConnection([{ rows: [{ FOUND: 1 }] }]);
    const repository = createPersonalStatusRepository();
    assert.equal(await repository.positionExists(connection, 'Operator'), true);
    assert.match(connection.calls[0].sql, /POSITION_NAME = :name OR JOB_TITLE = :name/);
  });

  it('HR check fails closed and same-department compares ORGANIZATION_ID', async () => {
    const connection = mockConnection([{ rows: [] }, { rows: [{ SAME: 1 }] }]);
    const repository = createPersonalStatusRepository();
    assert.equal(await repository.isHrUser(connection, '5'), false);
    assert.match(connection.calls[0].sql, /LOOKUP_TYPE = 'XXZP_HR'/);
    assert.match(
      connection.calls[0].sql,
      /HAVING COUNT\(DISTINCT E\.USER_ID\) = 1 AND COUNT\(\*\) = COUNT\(E\.USER_ID\)/,
    );
    assert.equal(connection.calls[0].binds.userId, '5');
    assert.equal(
      await repository.isSameDepartment(connection, {
        actorEmployeeNumber: '1',
        subjectEmployeeNumber: '2',
      }),
      true,
    );
    assert.match(connection.calls[1].sql, /S\.ORGANIZATION_ID = A\.ORGANIZATION_ID/);
  });
});
