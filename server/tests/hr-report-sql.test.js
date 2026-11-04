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
