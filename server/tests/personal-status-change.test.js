// Personal Status Change (Personnel Record Change, form 1110) API over a mocked repository (no
// Oracle). The legacy CI3 behaviours each test covers are named in docs/testing/
// status-change-legacy-comparison.md.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { testAuthConfig, createAuthStore } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import {
  businessToday,
  hijriDate,
  payTotal,
  referenceNumber,
  submitProblems,
} from '../src/modules/hr/personal-status/personalStatusChange.rules.js';

const BASE = '/api/v1/hr/personnel-record-changes';
const BIG_ID = '9007199254740993';
const BODY = {
  empNo: '12001',
  effectiveDate: '2026-11-01',
  // Snapshot fields an older client still sends; the server ignores them.
  formDate: '2020-01-01',
  arbDate: 'forged Hijri date',
  empName: 'Forged Name',
  nationality: 'Forged',
  section: 'Forged',
  department: 'Forged',
  startDate: '2000-01-01',
  old: {
    position: 'Forged',
    basicSal: 1,
    houseAll: 1,
    transAll: 1,
    otherAll: 1,
    communAll: 1,
    carAll: 1,
    total: 1,
  },
  new: {
    position: 'Supervisor',
    basicSal: 5500,
    houseAll: 1000,
    transAll: 500,
    otherAll: 0,
    communAll: 300,
    carAll: 200,
    total: 1,
    maritalStatus: 'S',
  },
  remarks: 'Review',
  views: 'Notes',
};

// Synthetic master rows: employee number → { row, organization }.
const MASTER = {
  12001: {
    organization: 'ORG-A',
    row: {
      FULL_NAME: 'Employee Example',
      NATIONALITY: 'Nationality A',
      DIVISION: 'Production',
      DEPARTMENT_NAME: 'Injection',
      JOINING_DATE_ISO: '2019-03-17',
      JOB_NAME: 'Operator',
      MARITAL_STATUS: 'M',
      BASIC_SALARY: 5000,
      HOUSING_ALLOWANCE: 1000,
      TRANSPORTATION_ALLOWANCE: 500,
      COMMUNICATION_ALLOWANCE: 300,
      CAR_ALLOWANCE: 200,
      OTHER_ALLOWANCE: 0,
      // Legacy shows TOTAL_SALARY as stored, which need not equal the sum (7000).
      TOTAL_SALARY: 7100,
    },
  },
  12002: {
    organization: 'ORG-B',
    row: {
      FULL_NAME: 'Second Example',
      NATIONALITY: 'Nationality B',
      DIVISION: 'Sales',
      DEPARTMENT_NAME: 'Sales',
      JOINING_DATE_ISO: '2021-06-01',
      JOB_NAME: 'Clerk',
      MARITAL_STATUS: 'S',
      BASIC_SALARY: 3000,
      HOUSING_ALLOWANCE: 750,
      TRANSPORTATION_ALLOWANCE: 300,
      COMMUNICATION_ALLOWANCE: 0,
      CAR_ALLOWANCE: 0,
      OTHER_ALLOWANCE: 0,
      TOTAL_SALARY: 4050,
    },
  },
};

const rowFrom = (headerId, values, extra = {}) => ({
  HEADER_ID: headerId,
  REF_NO: null,
  USER_ID: null,
  FORM_DATE_ISO: values.formDate,
  ARB_DATE: values.arbDate,
  EFFECTIVE_DATE_ISO: values.effectiveDate,
  EMP_NO: values.empNo,
  EMP_NAME: values.empName,
  NATIONALITY: values.nationality,
  SECTION: values.section,
  DEPT: values.department,
  START_DATE_ISO: values.startDate,
  OLD_POSITION: values.oldPosition,
  OLD_BASIC_SAL: values.oldBasicSal,
  OLD_HOUSE_ALL: values.oldHouseAll,
  OLD_TRANS_ALL: values.oldTransAll,
  OLD_OTHER_ALL: values.oldOtherAll,
  OLD_COMMUN_ALL: values.oldCommunAll,
  OLD_CAR_ALL: values.oldCarAll,
  OLD_TOTAL: values.oldTotal,
  OLD_MARITAL_STATUS: values.oldMaritalStatus,
  OLD_GRADE: null,
  OLD_LEVEL: null,
  NEW_POSITION: values.newPosition,
  NEW_BASIC_SAL: values.newBasicSal,
  NEW_HOUSE_ALL: values.newHouseAll,
  NEW_TRANS_ALL: values.newTransAll,
  NEW_OTHER_ALL: values.newOtherAll,
  NEW_COMMUN_ALL: values.newCommunAll,
  NEW_CAR_ALL: values.newCarAll,
  NEW_TOTAL: values.newTotal,
  NEW_MARITAL_STATUS: values.newMaritalStatus,
  NEW_GRADE: values.newGrade ?? null,
  NEW_LEVEL: values.newLevel ?? null,
  REMARKS: values.remarks,
  VIEWS: values.views,
  STATUS: 'DRAFT',
  HR_ADMIN: null,
  HR_ADMIN_SIGN_ISO: null,
  VP: null,
  VP_SIGN_ISO: null,
  PRESIDENT: null,
  PRESIDENT_SIGN_ISO: null,
  CREATED_BY: '1001',
  CREATED_AT_ISO: '2026-10-29',
  UPDATED_BY: null,
  UPDATED_AT_ISO: null,
  ...extra,
});

const SNAPSHOT_COLUMNS = {
  EMP_NO: 'empNo',
  EMP_NAME: 'empName',
  NATIONALITY: 'nationality',
  SECTION: 'section',
  DEPT: 'department',
  START_DATE_ISO: 'startDate',
  OLD_POSITION: 'oldPosition',
  OLD_BASIC_SAL: 'oldBasicSal',
  OLD_HOUSE_ALL: 'oldHouseAll',
  OLD_TRANS_ALL: 'oldTransAll',
  OLD_OTHER_ALL: 'oldOtherAll',
  OLD_COMMUN_ALL: 'oldCommunAll',
  OLD_CAR_ALL: 'oldCarAll',
  OLD_TOTAL: 'oldTotal',
};

function createRepository() {
  const state = { rows: [], failures: {}, hrUsers: new Set(), nextId: 653, calls: [] };
  const organizationOf = (employeeNumber) => MASTER[employeeNumber]?.organization ?? null;
  const sameDepartment = (actorEmployeeNumber, subject) =>
    Boolean(organizationOf(actorEmployeeNumber)) &&
    organizationOf(actorEmployeeNumber) === organizationOf(subject);
  const find = (id) => state.rows.find((row) => row.HEADER_ID === String(id)) ?? null;
  const repo = {
    state,
    latest: async (_connection, empNo) =>
      [...state.rows]
        .filter((row) => row.EMP_NO === empNo && row.STATUS === 'APPROVED')
        .sort((a, b) => (BigInt(b.HEADER_ID) > BigInt(a.HEADER_ID) ? 1 : -1))[0] ?? null,
    master: async (_connection, empNo) =>
      MASTER[empNo]?.current === false ? null : (MASTER[empNo]?.row ?? null),
    positionExists: async (_connection, name) => ['Operator', 'Supervisor', 'Clerk'].includes(name),
    insert: async (_connection, values, userId) => {
      if (state.failures.insert) throw new Error('insert failed');
      state.calls.push({ insert: values });
      const id = String(state.nextId++);
      state.rows.push(rowFrom(id, values, { CREATED_BY: userId }));
      return id;
    },
    setReference: async (_connection, id, refNo) => {
      find(id).REF_NO = refNo;
      return { rowsAffected: 1 };
    },
    read: async (id) => find(id),
    lockRow: async (_connection, id) => find(id),
    update: async (_connection, id, values, updatedBy, { snapshot = false } = {}) => {
      if (state.failures.update) throw new Error('update failed');
      state.calls.push({ update: values, snapshot });
      const row = find(id);
      if (!row) return { rowsAffected: 0 };
      const next = rowFrom(String(id), values);
      const keep = [
        'REF_NO',
        'FORM_DATE_ISO',
        'ARB_DATE',
        'STATUS',
        'CREATED_BY',
        'CREATED_AT_ISO',
        'OLD_GRADE',
        'OLD_LEVEL',
        ...(snapshot ? [] : Object.keys(SNAPSHOT_COLUMNS)),
      ];
      for (const key of keep) next[key] = row[key];
      Object.assign(row, next, { UPDATED_BY: updatedBy, UPDATED_AT_ISO: '2026-10-30' });
      return { rowsAffected: 1 };
    },
    delete: async (_connection, id) => {
      if (state.failures.delete) throw new Error('delete failed');
      const index = state.rows.findIndex((row) => row.HEADER_ID === String(id));
      if (index < 0) return { rowsAffected: 0 };
      state.rows.splice(index, 1);
      return { rowsAffected: 1 };
    },
    isHrUser: async (_connection, userId) => state.hrUsers.has(String(userId)),
    isSameDepartment: async (_connection, { actorEmployeeNumber, subjectEmployeeNumber }) =>
      sameDepartment(actorEmployeeNumber, subjectEmployeeNumber),
    list: async (_connection, filters) => {
      let rows = [...state.rows];
      if (filters.scope) {
        rows = rows.filter(
          (row) =>
            row.CREATED_BY === filters.scope.userId ||
            sameDepartment(filters.scope.employeeNumber, row.EMP_NO),
        );
      }
      if (filters.search) {
        rows = rows.filter((row) =>
          [row.EMP_NO, row.EMP_NAME, row.REF_NO].some((value) =>
            String(value).toUpperCase().includes(filters.search.toUpperCase()),
          ),
        );
      }
      if (filters.status) rows = rows.filter((row) => row.STATUS === filters.status);
      if (filters.section) rows = rows.filter((row) => row.SECTION === filters.section);
      if (filters.department) rows = rows.filter((row) => row.DEPT === filters.department);
      if (filters.position) rows = rows.filter((row) => row.NEW_POSITION === filters.position);
      if (filters.requestor) rows = rows.filter((row) => row.CREATED_BY === filters.requestor);
      if (filters.date_from) rows = rows.filter((row) => row.FORM_DATE_ISO >= filters.date_from);
      if (filters.date_to) rows = rows.filter((row) => row.FORM_DATE_ISO <= filters.date_to);
      rows.sort((a, b) => (BigInt(a.HEADER_ID) > BigInt(b.HEADER_ID) ? -1 : 1));
      const total = rows.length;
      const start = (filters.page - 1) * filters.pageSize;
      return {
        total,
        rows: rows
          .slice(start, start + filters.pageSize)
          .map((row) => ({ ...row, PENDING_AT: row.PENDING_AT ?? null })),
      };
    },
    employees: async () => [{ empNo: '12001' }, { empNo: '12002' }],
    positions: async () => [{ name: 'Operator' }, { name: 'Supervisor' }],
  };
  return repo;
}

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  const createUser = (employeeNumber) => {
    store.addEmployee({ employeeNumber, fullName: employeeNumber });
    return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
  };
  // The creator works in ORG-A (employee 12001's department).
  const hrUser = createUser('12003');
  MASTER[12003] = { organization: 'ORG-A', row: MASTER[12001].row };
  const otherUser = createUser('12004');
  MASTER[12004] = { organization: 'ORG-C', row: MASTER[12001].row };
  const deniedUser = createUser('PS-DENIED');
  const module = rbac.addModule('HR');
  const resource = rbac.addResource(module, 'PERSONNEL_RECORD_CHANGES');
  const permissions = Object.fromEntries(
    ['VIEW', 'CREATE', 'UPDATE', 'DELETE'].map((action) => [
      action,
      rbac.addPermission(resource, action),
    ]),
  );
  const role = rbac.addRole('PS_TEST');
  for (const permission of Object.values(permissions)) rbac.grant(role, permission);
  rbac.assign(hrUser, role);
  rbac.assign(otherUser, role);
  const personalStatusRepository = createRepository();
  const db = {
    withConnection: async (_pool, work) => work({}),
    withTransaction: async (_pool, work) => {
      const before = structuredClone(personalStatusRepository.state.rows);
      try {
        return await work({});
      } catch (error) {
        personalStatusRepository.state.rows = before;
        throw error;
      }
    },
  };
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      personalStatusRepository,
    },
  });
  return {
    app,
    store,
    rbac,
    permissions,
    hrUser,
    otherUser,
    deniedUser,
    personalStatusRepository,
  };
}

describe('personal status change API', () => {
  let f;
  let session;
  let other;
  let denied;
  beforeEach(async () => {
    f = setup();
    session = await signIn(f.store, f.hrUser);
    other = await signIn(f.store, f.otherUser);
    denied = await signIn(f.store, f.deniedUser);
  });

  const get = (path = '', who = session) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', who.cookie);
  const send = (method, path, who = session, body) => {
    const call = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', who.cookie)
      .set('X-CSRF-Token', who.csrf);
    return body === undefined ? call : call.send(body);
  };
  const rows = () => f.personalStatusRepository.state.rows;
  const create = async (body = BODY, who = session) => {
    const created = await send('post', '', who, body);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    return created.body.data;
  };

  it('enforces authentication, action permissions, DENY and CSRF on writes', async () => {
    assert.equal((await request(f.app).get(BASE)).status, 401);
    assert.equal((await get('', denied)).status, 403);
    assert.equal(
      (await request(f.app).post(BASE).set('Cookie', session.cookie).send(BODY)).status,
      403,
    );
    f.rbac.override(f.hrUser, f.permissions.CREATE, 'DENY');
    assert.equal((await send('post', '', session, BODY)).status, 403);
  });

  it('create: identity HEADER_ID, legacy REF_NO, DRAFT, and server-computed snapshot and dates', async () => {
    const data = await create();
    assert.equal(data.headerId, '653', 'the ID returned by the identity insert');
    assert.equal(data.refNo, '0653-Production', 'sprintf("%04d", id) . "-" . SECTION');
    assert.equal(data.status, 'DRAFT');
    assert.equal(data.formDate, businessToday(), 'FORM_DATE is today, never the body value');
    assert.equal(data.arbDate, hijriDate(businessToday()), 'ARB_DATE is the Hijri form date');
    // Current information and record come from the master row, never from the body.
    assert.equal(data.empName, 'Employee Example');
    assert.equal(data.section, 'Production');
    assert.equal(data.startDate, '2019-03-17');
    assert.equal(data.old.position, 'Operator');
    assert.equal(data.old.basicSal, 5000);
    assert.equal(data.old.total, 7100, 'OLD_TOTAL = master TOTAL_SALARY');
    assert.equal(data.old.maritalStatus, 'M', 'current family status defaults to the master');
    assert.equal(data.new.total, 7500, 'NEW_TOTAL is the sum, the client total is ignored');
    assert.equal(rows()[0].CREATED_BY, String(f.hrUser.userId));
    assert.equal(rows()[0].USER_ID, null);

    const forged = await send('post', '', session, {
      ...BODY,
      headerId: '9',
      refNo: 'forged',
      status: 'APPROVED',
      createdBy: '999',
      userId: '999',
      signatures: { president: 'forged' },
    });
    assert.equal(forged.status, 400);
    assert.equal(rows().length, 1);

    const detail = await get('/653');
    assert.equal(detail.status, 200);
    assert.deepEqual(detail.body.data.signatures, {
      hrAdmin: null,
      hrAdminSign: null,
      vp: null,
      vpSign: null,
      president: null,
      presidentSign: null,
    });
    rows()[0].HEADER_ID = BIG_ID;
    assert.equal((await get(`/${BIG_ID}`)).body.data.headerId, BIG_ID);
  });

  it('create: the editable current family status and the optional new-only grade and level', async () => {
    const data = await create({
      ...BODY,
      old: { maritalStatus: 'S' },
      new: { ...BODY.new, grade: 'G7', level: 'L2' },
    });
    assert.equal(data.old.maritalStatus, 'S');
    assert.equal(data.new.grade, 'G7');
    assert.equal(data.new.level, 'L2');
    const cleared = await create({ ...BODY, old: { maritalStatus: '' } });
    assert.equal(cleared.old.maritalStatus, null);
  });

  it('validates the legacy save rules', async () => {
    for (const [body, code] of [
      [{ ...BODY, effectiveDate: '' }, 'EFFECTIVE_DATE_REQUIRED'],
      [{ ...BODY, effectiveDate: '2026-02-30' }, 'EFFECTIVE_DATE_REQUIRED'],
      [{ ...BODY, empNo: '99999' }, 'EMP_NOT_FOUND'],
      [{ ...BODY, new: { ...BODY.new, position: 'Missing' } }, 'POSITION_INVALID'],
      [{ ...BODY, new: { ...BODY.new, position: ' ' } }, 'POSITION_INVALID'],
      [{ ...BODY, new: { ...BODY.new, position: 'x'.repeat(101) } }, 'POSITION_INVALID'],
      [{ ...BODY, new: { ...BODY.new, basicSal: -1 } }, 'ALLOWANCE_INVALID'],
      [{ ...BODY, new: { ...BODY.new, basicSal: '' } }, 'VALIDATION_ERROR'],
      [{ ...BODY, new: { ...BODY.new, basicSal: '12345678' } }, 'ALLOWANCE_INVALID'],
      [{ ...BODY, new: { ...BODY.new, basicSal: '1.234' } }, 'ALLOWANCE_INVALID'],
      [{ ...BODY, new: { ...BODY.new, carAll: '1.2.3' } }, 'ALLOWANCE_INVALID'],
      [{ ...BODY, new: { ...BODY.new, maritalStatus: 'X' } }, 'MARITAL_STATUS_INVALID'],
      [{ ...BODY, new: { ...BODY.new, maritalStatus: '' } }, 'MARITAL_STATUS_INVALID'],
      [{ ...BODY, old: { maritalStatus: 'Married' } }, 'MARITAL_STATUS_INVALID'],
      [{ ...BODY, new: { ...BODY.new, grade: 'x'.repeat(51) } }, 'TEXT_TOO_LONG'],
      [{ ...BODY, remarks: 'x'.repeat(2001) }, 'TEXT_TOO_LONG'],
      [{ ...BODY, views: 'x'.repeat(2001) }, 'TEXT_TOO_LONG'],
    ]) {
      const result = await send('post', '', session, body);
      assert.equal(result.status, 400, code);
      assert.equal(result.body.error.code, code, JSON.stringify(body.new ?? body));
    }
    // maxlength 7 and up to two decimals are accepted.
    const accepted = await send('post', '', session, {
      ...BODY,
      new: { ...BODY.new, basicSal: '9999999', houseAll: '1234.56' },
    });
    assert.equal(accepted.status, 201);
    assert.equal(accepted.body.data.new.total, 9999999 + 1234.56 + 500 + 300 + 200);
  });

  it('update: drafts only; keeps FORM_DATE, ARB_DATE, REF_NO and the snapshot unless the employee changes', async () => {
    await create();
    const original = structuredClone(rows()[0]);
    const result = await send('put', '/653', session, {
      ...BODY,
      remarks: 'Changed',
      empName: 'Forged again',
      new: { ...BODY.new, basicSal: 6000, total: 0 },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const saved = rows()[0];
    for (const key of ['STATUS', 'REF_NO', 'FORM_DATE_ISO', 'ARB_DATE', 'CREATED_BY']) {
      assert.equal(saved[key], original[key], key);
    }
    assert.equal(saved.EMP_NAME, 'Employee Example');
    assert.equal(saved.OLD_TOTAL, 7100);
    assert.equal(saved.OLD_MARITAL_STATUS, 'M', 'kept when the body leaves it out');
    assert.equal(saved.UPDATED_BY, String(f.hrUser.userId));
    assert.equal(result.body.data.new.total, 8000);
    assert.equal(f.personalStatusRepository.state.calls.at(-1).snapshot, false);

    const moved = await send('put', '/653', session, { ...BODY, empNo: '12002' });
    assert.equal(moved.status, 200);
    assert.equal(f.personalStatusRepository.state.calls.at(-1).snapshot, true);
    assert.equal(moved.body.data.empName, 'Second Example');
    assert.equal(moved.body.data.old.total, 4050);
    assert.equal(moved.body.data.refNo, original.REF_NO, 'REF_NO is not renumbered');

    for (const status of ['INPROCESS', 'APPROVED', 'REJECTED']) {
      rows()[0].STATUS = status;
      const locked = await send('put', '/653', session, BODY);
      assert.equal(locked.status, 409, status);
      assert.equal(locked.body.error.code, 'PERSONNEL_RECORD_CHANGE_NOT_DRAFT');
    }
  });

  it('delete: drafts only; 404 for missing rows', async () => {
    assert.equal((await get('/999')).status, 404);
    assert.equal((await send('put', '/999', session, BODY)).status, 404);
    assert.equal((await send('delete', '/999')).status, 404);
    await create();
    for (const status of ['INPROCESS', 'APPROVED', 'REJECTED']) {
      rows()[0].STATUS = status;
      assert.equal((await send('delete', '/653')).status, 409, status);
      assert.equal(rows().length, 1);
    }
    rows()[0].STATUS = 'DRAFT';
    assert.equal((await send('delete', '/653')).status, 200);
    assert.equal(rows().length, 0);
  });

  it('record access: creator, HR, or same department with VIEW; others get 403', async () => {
    await create();
    // otherUser: not the creator, not HR, department ORG-C (the employee is in ORG-A).
    assert.equal((await get('/653', other)).status, 403);
    assert.equal((await send('put', '/653', other, BODY)).status, 403);
    assert.equal((await send('delete', '/653', other)).status, 403);
    assert.equal((await get('', other)).body.data.meta.total, 0, 'the list hides it too');

    f.personalStatusRepository.state.hrUsers.add(String(f.otherUser.userId));
    assert.equal((await get('/653', other)).status, 200, 'HR');
    assert.equal((await get('', other)).body.data.meta.total, 1, 'HR sees every request');
    f.personalStatusRepository.state.hrUsers.clear();

    MASTER[12004].organization = 'ORG-A';
    assert.equal((await get('/653', other)).status, 200, 'same department with VIEW');
    assert.equal((await get('', other)).body.data.meta.total, 1);
    f.rbac.override(f.otherUser, f.permissions.VIEW, 'DENY');
    assert.equal((await get('/653', other)).status, 403, 'VIEW is required');
    MASTER[12004].organization = 'ORG-C';
  });

  it('lists the legacy report columns with filters, pagination and bounds', async () => {
    f.personalStatusRepository.state.hrUsers.add(String(f.hrUser.userId));
    await create();
    await create({ ...BODY, empNo: '12002' });
    Object.assign(rows()[1], {
      STATUS: 'APPROVED',
      NEW_POSITION: 'Operator',
      CREATED_BY: '2002',
      FORM_DATE_ISO: '2026-10-30',
      PENDING_AT: 'Approver Name',
    });
    const result = await get('?search=Second&page=1&pageSize=1&sort=headerId&order=desc');
    assert.equal(result.status, 200);
    assert.equal(result.body.data.meta.total, 1);
    const [row] = result.body.data.rows;
    assert.equal(row.empName, 'Second Example');
    for (const key of [
      'empNo',
      'empName',
      'position',
      'section',
      'department',
      'oldTotal',
      'newTotal',
      'remarks',
      'requestor',
      'pendingAt',
      'status',
    ]) {
      assert.ok(key in row, key);
    }
    assert.equal(row.pendingAt, 'Approver Name');
    assert.equal((await get('?created_by=me')).status, 400, 'there is no created_by filter');
    const userId = String(f.hrUser.userId);
    const today = businessToday();
    for (const filter of [
      'status=DRAFT',
      'section=Production',
      'department=Injection',
      'position=Supervisor',
      `requestor=${userId}`,
      'date_from=2026-10-30&date_to=2026-10-30',
      `date_from=${today}`,
      'status=APPROVED&section=Sales&department=Sales&position=Operator&requestor=2002',
    ]) {
      const filtered = await get(`?${filter}`);
      assert.equal(filtered.status, 200, filter);
      assert.equal(filtered.body.data.meta.total, 1, filter);
    }
    assert.equal((await get('?page=0')).status, 400);
    assert.equal((await get('?pageSize=101')).status, 400);
    assert.equal((await get('?sort=HEADER_ID')).status, 400);
    assert.equal((await get('?status=Pending')).status, 400);
    const injection = await get("?search=%25'%20OR%201%3D1%20--");
    assert.equal(injection.body.data.meta.total, 0);
  });

  it('auto-fill: master employee info; current record from the latest APPROVED request, else the master', async () => {
    assert.deepEqual((await get('/lookups/employees')).body.data, [
      { empNo: '12001' },
      { empNo: '12002' },
    ]);
    assert.deepEqual((await get('/lookups/positions')).body.data, [
      { name: 'Operator' },
      { name: 'Supervisor' },
    ]);
    const branchA = (await get('/lookups/employees/12001')).body.data;
    assert.equal(branchA.branch, 'employeeMaster');
    assert.equal(branchA.old.basicSal, 5000);
    assert.equal(branchA.old.total, 7100);
    assert.deepEqual(branchA.new, { position: 'Operator', maritalStatus: 'M' });
    // A draft (or rejected / in-process) request is a proposal, not the current record.
    await create();
    assert.equal((await get('/lookups/employees/12001')).body.data.branch, 'employeeMaster');

    // An approved request saved with a blank snapshot (as legacy rows on TEST): the employee's
    // information still comes from the master, the current record from the approved request.
    Object.assign(rows()[0], {
      STATUS: 'APPROVED',
      EMP_NAME: null,
      NATIONALITY: null,
      SECTION: null,
      DEPT: null,
      START_DATE_ISO: null,
      NEW_MARITAL_STATUS: 'married',
      NEW_TOTAL: null,
    });
    const branchB = (await get('/lookups/employees/12001')).body.data;
    assert.equal(branchB.branch, 'previousRequest');
    assert.deepEqual(
      [
        branchB.empName,
        branchB.nationality,
        branchB.section,
        branchB.department,
        branchB.startDate,
      ],
      ['Employee Example', 'Nationality A', 'Production', 'Injection', '2019-03-17'],
    );
    assert.equal(branchB.old.position, 'Supervisor');
    assert.equal(branchB.old.basicSal, 5500);
    assert.equal(branchB.old.total, 7500, 'a missing NEW_TOTAL is the sum of the six items');
    assert.equal(branchB.old.maritalStatus, 'M', 'legacy free text read as S/M');
    assert.deepEqual(branchB.new, { position: 'Supervisor', maritalStatus: 'M' });

    rows()[0].NEW_MARITAL_STATUS = null;
    assert.equal(
      (await get('/lookups/employees/12001')).body.data.old.maritalStatus,
      'M',
      "no family status on the request: the master's",
    );

    // No current master row: the approved request's snapshot is the only source.
    MASTER[12001].current = false;
    Object.assign(rows()[0], { EMP_NAME: 'Stored Name', SECTION: 'Stored Section' });
    const noMaster = (await get('/lookups/employees/12001')).body.data;
    assert.equal(noMaster.empName, 'Stored Name');
    assert.equal(noMaster.section, 'Stored Section');
    assert.equal(noMaster.old.maritalStatus, null);
    rows()[0].STATUS = 'DRAFT';
    assert.equal((await get('/lookups/employees/12001')).status, 404, 'neither source');
    delete MASTER[12001].current;

    assert.equal((await get('/lookups/employees/99999')).status, 404);
    assert.equal(
      (await get('/lookups/employees/99999')).body.error.message,
      'No Data Available for given Employee Number',
    );
  });

  it('rolls back create, update and delete when repository work fails', async () => {
    f.personalStatusRepository.state.failures.insert = true;
    assert.equal((await send('post', '', session, BODY)).status, 500);
    assert.equal(rows().length, 0);
    delete f.personalStatusRepository.state.failures.insert;

    await create();
    const before = structuredClone(rows()[0]);
    f.personalStatusRepository.state.failures.update = true;
    assert.equal((await send('put', '/653', session, { ...BODY, remarks: 'Changed' })).status, 500);
    assert.deepEqual(rows()[0], before);
    delete f.personalStatusRepository.state.failures.update;

    f.personalStatusRepository.state.failures.delete = true;
    assert.equal((await send('delete', '/653')).status, 500);
    assert.equal(rows().length, 1);
  });
});

describe('personal status change rules', () => {
  it('REF_NO, Total SR and the Hijri date follow the legacy formats', () => {
    assert.equal(referenceNumber('7', 'Production'), '0007-Production');
    assert.equal(referenceNumber('12345', null), '12345-');
    assert.equal(payTotal({ basicSal: 100.1, houseAll: 0.2, transAll: 0 }), 100.3);
    const hijri = hijriDate('2026-11-02');
    assert.match(hijri, /هـ$/, 'legacy ARB_DATE values end with هـ');
    assert.ok(hijri.length <= 100, 'ARB_DATE is VARCHAR2(100)');
    assert.match(businessToday(new Date('2026-11-01T22:30:00Z')), /^2026-11-02$/, 'Asia/Riyadh');
  });

  it('validate-for-submit: legacy Rec_flow::submit status rule and the save-required fields', () => {
    const ready = {
      headerId: '653',
      status: 'DRAFT',
      empNo: '12001',
      effectiveDate: '2026-11-01',
      new: {
        position: 'Supervisor',
        basicSal: 1,
        houseAll: 0,
        transAll: 0,
        otherAll: 0,
        communAll: 0,
        carAll: 0,
        maritalStatus: 'S',
      },
    };
    assert.deepEqual(submitProblems(ready), []);
    assert.deepEqual(submitProblems({ ...ready, status: 'REJECTED' }), [], 'rejected may resubmit');
    for (const status of ['INPROCESS', 'Inprocess', 'APPROVED', 'Approved', 'Accepted']) {
      assert.deepEqual(
        submitProblems({ ...ready, status }).map((problem) => problem.field),
        ['status'],
        status,
      );
    }
    assert.deepEqual(
      submitProblems(null).map((problem) => problem.field),
      ['headerId'],
    );
    assert.deepEqual(
      submitProblems({
        ...ready,
        effectiveDate: null,
        new: { ...ready.new, position: '', carAll: null, maritalStatus: null },
      }).map((problem) => problem.field),
      ['effectiveDate', 'new.position', 'new.carAll', 'new.maritalStatus'],
    );
  });

  it.todo('submit route: send to the first approver, set INPROCESS (shared workflow not built)');
  it.todo('approve/reject per step: HR_ADMIN/VP/PRESIDENT + *_SIGN, final APPROVED/REJECTED');
  it.todo('approver routing by requester department (operations/production/... vs others)');
  it.todo('workflow e-mails, delegation, forward, reassign and request-information');
});
