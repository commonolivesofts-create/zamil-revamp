// SQL-level regressions found on Oracle TEST (2026-11-04), checked with a
// recording connection (no Oracle): every statement receives exactly the
// binds it references (node-oracledb NJS-098), no bind name is an Oracle
// reserved word (ORA-01745), and the clearance department-manager list keeps
// all three legacy branches.
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';

import * as clearance from '../src/modules/hr/employee-clearance/employee_clearance_repository.js';
import * as survey from '../src/modules/hr/surveyReport/surveyReport.repository.js';

function recordingConnection(
  rows = [{ TOTAL: 0, N: 0, CNT: 0, PERSON_ID: 1, EMPLOYEE_NUMBER: 1 }],
) {
  const statements = [];
  return {
    statements,
    execute: async (sql, binds = {}) => {
      statements.push({ sql, binds });
      return { rows };
    },
  };
}

const placeholders = (sql) =>
  new Set([...sql.matchAll(/:([A-Za-z_][A-Za-z0-9_]*)/g)].map((m) => m[1]));
const RESERVED = new Set([
  'from',
  'to',
  'select',
  'where',
  'order',
  'group',
  'date',
  'level',
  'size',
  'mode',
  'number',
  'user',
]);

function assertExactBinds(statements) {
  assert.ok(statements.length > 0);
  for (const { sql, binds } of statements) {
    if (Array.isArray(binds)) continue;
    const used = placeholders(sql.replace(/'[^']*'/g, ''));
    assert.deepEqual(new Set(Object.keys(binds)), used, sql.trim().slice(0, 80));
    for (const name of used)
      assert.equal(RESERVED.has(name.toLowerCase()), false, `reserved bind :${name}`);
  }
}

describe('Employee clearance repository SQL', () => {
  it('count and page queries of the list get only their own binds', async () => {
    const c = recordingConnection();
    await clearance.list(c, '1', false, {
      page: 2,
      pageSize: 10,
      status: 'Draft',
      q: 'a',
      department: 'b',
      createdFrom: '2026-01-01',
      createdTo: '2026-12-31',
    });
    assertExactBinds(c.statements);
  });

  it('employee lookup count and page get only their own binds', async () => {
    const c = recordingConnection();
    await clearance.employees(c, '1', false, { scope: 'scoped', q: 'a', page: 1, pageSize: 5 });
    assertExactBinds(c.statements);
  });

  it('the department-manager list keeps the three legacy branches', async () => {
    const c = recordingConnection([]);
    await clearance.approvers(c, 'department');
    const sql = c.statements[0].sql;
    assert.match(sql, /SUPERVISOR_NAME IN/);
    assert.match(sql, /300000002811134/);
    assert.match(sql, /APPROVAL_AUTHORITY BETWEEN 5 AND 9/);
  });
});

describe('Survey repository SQL', () => {
  it('the response list binds no reserved word and only what it references', async () => {
    const c = recordingConnection([{ CNT: 0 }]);
    await survey.list(c, {
      page: 1,
      pageSize: 5,
      year: '2025',
      jobLevel: 'Manager',
      from: '2025-01-01',
      to: '2025-12-31',
    });
    assertExactBinds(c.statements);
  });
});

describe('Employee clearance service connection use', () => {
  it('resolves VIEW_ALL before taking a connection (no nested pool acquisition)', async () => {
    const { createEmployeeClearanceService } =
      await import('../src/modules/hr/employee-clearance/employee_clearance_service.js');
    let held = 0;
    const holdsWhileHeld = [];
    const withConnection = async (_pool, fn) => {
      held += 1;
      try {
        return await fn({});
      } finally {
        held -= 1;
      }
    };
    const repository = {
      list: async () => ({ total: 0, items: [] }),
      employees: async () => ({ total: 0, items: [] }),
      isInScope: async () => true,
      employee: async () => ({ EMPLOYEE_NUMBER: 1 }),
      supervisorUserId: async () => null,
      getFull: async () => null,
      computerDestinations: async () => [],
    };
    const service = createEmployeeClearanceService({
      repository,
      withConnection,
      withTransaction: withConnection,
      holds: async () => {
        holdsWhileHeld.push(held);
        return false;
      },
    });
    const auth = { userId: '7' };
    await service.list(auth, { page: 1, pageSize: 1 });
    await service.employees(auth, { page: 1, pageSize: 1 });
    await service.employee(auth, 1);
    await service.computerDestinations(auth);
    await assert.rejects(service.get(auth, '1'), { statusCode: 404 });
    assert.equal(holdsWhileHeld.length, 5);
    assert.deepEqual(holdsWhileHeld, [0, 0, 0, 0, 0]);
  });
});

describe('Salary certificate repository SQL', () => {
  it('lists and the employee picker bind no reserved word and only what they reference', async () => {
    const { repository: english } =
      await import('../src/modules/hr/salary-certificates-english/salary-certificate-english.repository.js');
    const { repository: arabic } =
      await import('../src/modules/hr/salary-certificates-ar/salary-certificate.repository.js');
    for (const repo of [english, arabic]) {
      const c = recordingConnection([{ TOTAL: 0 }]);
      await repo.list(c, { page: 1, pageSize: 5, q: 'a', from: '2026-01-01', to: '2026-12-31' });
      await repo.picker(c, { q: '1', page: 1, pageSize: 5 });
      assertExactBinds(c.statements);
      // The picker searches by name too and returns it for the dropdown.
      const picker = c.statements.find(({ sql }) => sql.includes('ORDER BY EMPLOYEE_NUMBER'));
      assert.match(picker.sql, /FULL_NAME/);
      assert.match(picker.sql, /UPPER\(FULL_NAME\) LIKE/);
    }
  });
});

describe('Salary certificate identity', () => {
  const row = {
    EMPLOYEE_NUMBER: '1001',
    FULL_NAME: 'Omar Ali',
    POSITION_NAME: 'Engineer',
    NATIONALITY: 'Egyptian',
    JOINING_DATE: '2020-01-05',
    DIVISION: 'IPP',
    BASIC_SALARY: 5000,
    HOUSING_ALLOWANCE: 0,
    TRANSPORTATION_ALLOWANCE: 0,
    COMMUNICATION_ALLOWANCE: 0,
    CAR_ALLOWANCE: 0,
  };

  it('English: no identifier is blank, not an error; a non-Saudi falls back to ID or passport', async () => {
    const { createSalaryCertificateEnglishService } =
      await import('../src/modules/hr/salary-certificates-english/salary-certificate-english.service.js');
    const serviceWith = (r) =>
      createSalaryCertificateEnglishService({
        repository: { employee: async () => [r] },
        withConnection: (_pool, fn) => fn({}),
      });

    // TEST employee data: no NATIONAL_IDENTIFIER/PASSPORT/IQAMA. Legacy printed a blank ID.
    assert.equal((await serviceWith(row).employee('1001')).nationalIdentifier, '');
    assert.equal(
      (await serviceWith({ ...row, PASSPORT_NUMBER: 'P123456' }).employee('1001'))
        .nationalIdentifier,
      'P123456',
    );
    assert.equal(
      (
        await serviceWith({
          ...row,
          NATIONALITY: 'Saudi',
          NATIONAL_IDENTIFIER: '1234567890',
        }).employee('1001')
      ).nationalIdentifier,
      '1234567890',
    );
  });

  it('Arabic: no identifier is blank, not an error; a non-Saudi falls back to ID or passport', async () => {
    const { createSalaryCertificateService } =
      await import('../src/modules/hr/salary-certificates-ar/salary-certificate.service.js');
    const serviceWith = (r) =>
      createSalaryCertificateService({
        repository: { employee: async () => [r] },
        withConnection: (_pool, fn) => fn({}),
      });
    const arabic = {
      ...row,
      FULL_NAME_AR: 'عمر علي',
      POSITION_ARABIC: 'مهندس',
      NATIONALITY_AR: 'مصري',
      NATION_EN: 'Egyptian',
    };

    assert.equal((await serviceWith(arabic).employee('1001')).nationalIdentifier, '');
    assert.equal(
      (await serviceWith({ ...arabic, IQAMA_NUMBER: '2345678901' }).employee('1001'))
        .nationalIdentifier,
      '2345678901',
    );
  });
});

describe('Tourist visa letter repository SQL', () => {
  it('loads the selected employee by employee number and maps the national ID from details', async () => {
    const { repository: tourist } =
      await import('../src/modules/hr/tourist-visa-letters/tourist-visa.repository.js');
    const c = recordingConnection([
      {
        EMPLOYEE_NO: '1001',
        EMPLOYEE_NAME: 'Employee',
        NATIONALITY: 'Indian',
        PASSPORT_NO: 'P123',
        NATIONAL_ID: 'N123',
        POSITION: 'Operator',
      },
    ]);

    const [employee] = await tourist.employee(c, '1001');
    const [{ sql, binds }] = c.statements;
    assert.deepEqual(binds, { employee_no: '1001' });
    assert.match(sql, /M\.EMPLOYEE_NUMBER = :employee_no/);
    assert.match(sql, /M\.FULL_NAME EMPLOYEE_NAME/);
    assert.match(sql, /M\.NATIONALITY/);
    assert.match(sql, /M\.PASSPORT_NUMBER PASSPORT_NO/);
    assert.match(sql, /D\.NATIONAL_IDENTIFIER NATIONAL_ID/);
    assert.match(sql, /M\.POSITION_NAME POSITION/);
    assert.equal(employee.employee_no, '1001');
    assert.equal(employee.national_id, 'N123');
  });

  it('writes and reads the physical POSI_START_DATE and EMP_NATIONALITY columns (TEST, legacy model)', async () => {
    const { repository: tourist } =
      await import('../src/modules/hr/tourist-visa-letters/tourist-visa.repository.js');
    const c = recordingConnection([]);
    const types = new Map([
      ['POSI_START_DATE', 'DATE'],
      ['EMP_NATIONALITY', 'VARCHAR2'],
    ]);
    await tourist.insert(c, {}, types);
    await tourist.update(c, '1b4e28ba-2fa1-41d2-883f-0016d3cca427', {}, types);
    await tourist.get(c, '1b4e28ba-2fa1-41d2-883f-0016d3cca427', types);
    for (const { sql: raw } of c.statements) {
      const sql = raw.replace(/ AS [A-Z_]+/g, '');
      assert.doesNotMatch(sql, /\bPOSITION_START_DATE(_AR)?\s*(=|,|\))/, sql.slice(0, 60));
      assert.doesNotMatch(sql, /\bEMPLOYEE_NATIONALITY(_AR)?\s*(=|,|\))/, sql.slice(0, 60));
    }
    const [insert, update, read] = c.statements.map(({ sql }) => sql);
    assert.match(insert, /POSI_START_DATE,POSI_START_DATE_AR/);
    assert.match(update, /EMP_NATIONALITY_AR = :employee_nationality_ar/);
    assert.match(read, /TO_CHAR\(POSI_START_DATE, 'YYYY-MM-DD'\) AS POSITION_START_DATE/);
    assert.match(read, /EMP_NATIONALITY AS EMPLOYEE_NATIONALITY\b/);
  });
});
