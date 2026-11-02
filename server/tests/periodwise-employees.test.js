import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as repository from '../src/modules/hr/periodwise-employees/periodwiseEmployee.repository.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';

const BASE = '/api/v1/hr/reports/periodwise-employees';
const TODAY = '2026-10-31';
const PERIOD = 'dateFrom=2026-01-01&dateTo=2026-06-30';

// Fictional employees as XX_DIGI_EMP_MASTER rows (after the repository mapping).
const EMPLOYEES = [
  {
    employeeNumber: '9001',
    name: 'ZZTEST Employee A',
    birthDate: '1960-03-01',
    nationality: 'Saudi',
    jobTitle: 'Packer',
    position: 'Packer',
    departmentCode: '10',
    departmentName: 'Production',
    hasNationalId: true,
    startDate: '2000-01-15',
    endDate: null,
    leavingReason: null,
  },
  {
    employeeNumber: '9002',
    name: 'ZZTEST Employee B',
    birthDate: '1990-07-20',
    nationality: 'Indian',
    jobTitle: 'Accountant',
    position: 'Accountant',
    departmentCode: '20',
    departmentName: 'Finance',
    hasNationalId: false,
    startDate: '2026-02-01',
    endDate: null,
    leavingReason: null,
  },
  {
    employeeNumber: '9003',
    name: 'ZZTEST Employee C',
    birthDate: '1985-05-05',
    nationality: 'Saudi',
    jobTitle: 'Machine Operator',
    position: 'Operator',
    departmentCode: '10',
    departmentName: 'Production',
    hasNationalId: true,
    startDate: '2015-04-01',
    endDate: '2026-03-31',
    leavingReason: 'Resigned',
  },
  {
    employeeNumber: '9004',
    name: 'ZZTEST Employee D',
    birthDate: '2015-01-01',
    nationality: null,
    jobTitle: 'Store Keeper',
    position: 'Store Keeper',
    departmentCode: null,
    departmentName: null,
    hasNationalId: true,
    startDate: '2024-05-12',
    endDate: null,
    leavingReason: null,
  },
  // Out of scope: left before the period, and joined after it.
  {
    employeeNumber: '9005',
    name: 'ZZTEST Employee E',
    birthDate: '1970-01-01',
    nationality: 'Egyptian',
    jobTitle: 'Driver',
    position: 'Driver',
    departmentCode: '20',
    departmentName: 'Finance',
    hasNationalId: true,
    startDate: '2010-01-01',
    endDate: '2025-12-31',
    leavingReason: 'Retired',
  },
  {
    employeeNumber: '9006',
    name: 'ZZTEST Employee F',
    birthDate: '1999-01-01',
    nationality: 'Saudi',
    jobTitle: 'Buyer',
    position: 'Buyer',
    departmentCode: '20',
    departmentName: 'Finance',
    hasNationalId: true,
    startDate: '2026-07-01',
    endDate: null,
    leavingReason: null,
  },
];

// Same scope semantics as the SQL in periodwiseEmployee.repository.js.
function fakeRepository(calls) {
  return {
    async listScope(_connection, binds) {
      calls.push(binds);
      const { dateFrom, dateTo, department, status } = binds;
      return EMPLOYEES.filter(
        (row) =>
          row.startDate <= dateTo &&
          (!row.endDate || row.endDate >= dateFrom) &&
          (department === 'ALL' || row.departmentCode === department) &&
          (status === 'ALL' ||
            (status === 'ACTIVE' && (!row.endDate || row.endDate > dateTo)) ||
            (status === 'LEFT' && row.endDate && row.endDate <= dateTo)),
      ).map((row) => ({ ...row }));
    },
    async listDepartments() {
      return [
        { code: '20', name: 'Finance' },
        { code: '10', name: 'Production' },
      ];
    },
  };
}

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  const person = (employeeNumber, fullName) => {
    store.addEmployee({
      employeeNumber,
      fullName,
      email: `${employeeNumber.toLowerCase()}@example.invalid`,
    });
    return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
  };
  const viewer = person('E-VIEW', 'Vera Example');
  const nobody = person('E-NONE', 'Nora Example');
  const resource = rbac.addResource(rbac.addModule('HR'), 'PERIODWISE_EMPLOYEES');
  const role = rbac.addRole('PERIODWISE_VIEW_TEST');
  rbac.grant(role, rbac.addPermission(resource, 'VIEW'));
  rbac.assign(viewer, role);
  const calls = [];
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      periodwiseEmployeeRepository: fakeRepository(calls),
      periodwiseToday: () => TODAY,
    },
  });
  return { store, viewer, nobody, app, calls };
}

describe('periodwise employees report API', () => {
  let f;
  let viewer;
  let nobody;
  beforeEach(async () => {
    f = setup();
    viewer = await signIn(f.store, f.viewer);
    nobody = await signIn(f.store, f.nobody);
  });
  const get = (path, session = viewer) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);

  it('requires a session and HR.PERIODWISE_EMPLOYEES:VIEW on both routes', async () => {
    assert.equal((await request(f.app).get(`${BASE}?${PERIOD}`)).status, 401);
    for (const path of [`?${PERIOD}`, '/lookups/departments']) {
      const res = await get(path, nobody);
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    }
    assert.equal(f.calls.length, 0, 'the repository is never reached without the grant');
  });

  it('validates the period, department, status, refinements and paging', async () => {
    for (const [query, field] of [
      ['', 'dateFrom'],
      ['dateFrom=2026-01-01', 'dateTo'],
      ['dateFrom=2026-07-01&dateTo=2026-06-30', 'dateTo'],
      ['dateFrom=2026-02-30&dateTo=2026-06-30', 'dateFrom'],
      [`${PERIOD}&department=PROD;DROP`, 'department'],
      [`${PERIOD}&status=GONE`, 'status'],
      [`${PERIOD}&ageBand=TEEN`, 'ageBand'],
      [`${PERIOD}&sortBy=NATIONAL_IDENTIFIER`, 'sortBy'],
      [`${PERIOD}&pageSize=500`, 'pageSize'],
      [`${PERIOD}&nationalId=1`, 'nationalId'],
    ]) {
      const res = await get(`?${query}`);
      assert.equal(res.status, 400, query);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      assert.ok(
        res.body.error.details.some((detail) => detail.field === field),
        `${query}: ${JSON.stringify(res.body.error.details)}`,
      );
    }
    assert.equal(f.calls.length, 0);
  });

  it('returns a page of derived rows, pagination and the summary of the full scope', async () => {
    const res = await get(`?${PERIOD}&pageSize=2&sortBy=employeeNumber&sortDir=asc`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.deepEqual(f.calls[0], {
      dateFrom: '2026-01-01',
      dateTo: '2026-06-30',
      department: 'ALL',
      status: 'ALL',
    });
    assert.deepEqual(res.body.pagination, {
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
    assert.deepEqual(
      res.body.data.rows.map((row) => row.employeeNumber),
      ['9001', '9002'],
    );
    const [a, b] = res.body.data.rows;
    assert.deepEqual(a, {
      employeeNumber: '9001',
      name: 'ZZTEST Employee A',
      birthDate: '1960-03-01',
      age: 66,
      nationality: 'Saudi',
      jobTitle: 'Packer',
      position: 'Packer',
      departmentCode: '10',
      departmentName: 'Production',
      hasNationalId: true,
      startDate: '2000-01-15',
      endDate: null,
      years: 26.46,
      leavingReason: '',
      active: true,
      senior: true,
      flags: [],
    });
    assert.deepEqual(b.flags, ['NATIONAL_ID']);
    assert.equal('nationalId' in a || 'nationalIdentifier' in a, false, 'never the number');

    const { summary } = res.body.data;
    assert.deepEqual(
      {
        total: summary.total,
        active: summary.active,
        joiners: summary.joiners,
        leavers: summary.leavers,
        turnover: summary.turnover,
        saudization: summary.saudization,
        senior: summary.senior,
        flagged: summary.flagged,
      },
      // 4 in scope, 3 active (C left 2026-03-31), B joined in the period, C left in it;
      // turnover 1 / ((4 + 3) / 2) = 28.6 %; Saudi active: A only of A, B, D = 33.3 %;
      // flagged: B (no national ID) and D (born 2015, age 11).
      {
        total: 4,
        active: 3,
        joiners: 1,
        leavers: 1,
        turnover: 28.6,
        saudization: 33.3,
        senior: 1,
        flagged: 2,
      },
    );
    assert.deepEqual(summary.byDepartment, [
      { code: '10', name: 'Production', count: 2 },
      // Ties are ordered by code; an employee without a department has the empty code.
      { code: null, name: '', count: 1 },
      { code: '20', name: 'Finance', count: 1 },
    ]);
    assert.deepEqual(
      summary.ageBands.map((band) => [band.band, band.count]),
      [
        ['UNDER_30', 1],
        ['30_39', 1],
        ['40_49', 0],
        ['50_59', 0],
        ['60_PLUS', 1],
      ],
    );
    assert.deepEqual(summary.yearlyFlow.at(-1), { year: '2026', joiners: 1, leavers: 1 });
    assert.equal(summary.yearlyFlow.length, 6);
  });

  it('applies department and status to the scope and the summary', async () => {
    const left = await get(`?${PERIOD}&department=10&status=LEFT`);
    assert.equal(left.status, 200);
    assert.deepEqual(f.calls[0], {
      dateFrom: '2026-01-01',
      dateTo: '2026-06-30',
      department: '10',
      status: 'LEFT',
    });
    assert.deepEqual(
      left.body.data.rows.map((row) => row.employeeNumber),
      ['9003'],
    );
    assert.equal(left.body.data.summary.total, 1);
    assert.equal(left.body.data.rows[0].active, false);
  });

  it('narrows only the rows with search, nationality, age band and "needs checking"', async () => {
    const flagged = await get(`?${PERIOD}&flagged=true&sortBy=name&sortDir=asc`);
    assert.deepEqual(
      flagged.body.data.rows.map((row) => row.employeeNumber),
      ['9002', '9004'],
    );
    assert.equal(flagged.body.pagination.total, 2);
    assert.equal(flagged.body.data.summary.total, 4, 'the summary keeps the full scope');
    const saudi = await get(`?${PERIOD}&nationality=Saudi&ageBand=60_PLUS`);
    assert.deepEqual(
      saudi.body.data.rows.map((row) => row.employeeNumber),
      ['9001'],
    );
    const search = await get(`?${PERIOD}&search=accountant`);
    assert.deepEqual(
      search.body.data.rows.map((row) => row.employeeNumber),
      ['9002'],
    );
  });

  it('sorts numerically by age and years and pages beyond the end to an empty page', async () => {
    const byAge = await get(`?${PERIOD}&sortBy=age&sortDir=asc`);
    assert.deepEqual(
      byAge.body.data.rows.map((row) => row.age),
      [11, 36, 41, 66],
    );
    const empty = await get(`?${PERIOD}&page=9`);
    assert.deepEqual(empty.body.data.rows, []);
    assert.equal(empty.body.pagination.total, 4);
  });

  it('lists departments for the filter', async () => {
    const res = await get('/lookups/departments');
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data, [
      { code: '20', name: 'Finance' },
      { code: '10', name: 'Production' },
    ]);
    assert.equal((await get('/lookups/departments?x=1')).status, 400);
  });
});

describe('periodwise employees repository SQL', () => {
  it('binds every value, never selects the national ID and returns date-only strings', async () => {
    const statements = [];
    const connection = {
      async execute(sql, binds) {
        statements.push({ sql, binds });
        return { rows: [] };
      },
    };
    const binds = { dateFrom: '2026-01-01', dateTo: '2026-06-30', department: '10', status: 'ALL' };
    await repository.listScope(connection, binds);
    await repository.listDepartments(connection);
    const [scope, departments] = statements;
    assert.deepEqual(scope.binds, binds);
    // 'ALL' is also an SQL literal, so only the caller-supplied dates and code are checked.
    for (const value of [binds.dateFrom, binds.dateTo, "'10'"]) {
      assert.equal(scope.sql.includes(value), false, value);
    }
    assert.doesNotMatch(scope.sql, /\bNATIONAL_IDENTIFIER\b(?! IS NULL)/);
    assert.match(scope.sql, /TO_CHAR\(e\.JOINING_DATE, 'YYYY-MM-DD'\) AS START_DATE/);
    assert.match(scope.sql, /TO_CHAR\(e\.DATE_OF_BIRTH, 'YYYY-MM-DD'\) AS BIRTH_DATE/);
    assert.match(departments.sql, /FROM XX_DIGI_EMP_MASTER/);
  });
});
