import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { testAuthConfig, createAuthStore } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';

const BASE = '/api/v1/hr/personnel-record-changes';
const BIG_ID = '9007199254740993';
const BODY = {
  empNo: '12001',
  formDate: '2026-10-29',
  arbDate: 'Hijri date',
  effectiveDate: '2026-11-01',
  empName: 'Employee Example',
  nationality: 'Saudi',
  section: 'Production',
  department: 'Injection',
  startDate: '2019-03-17',
  old: {
    position: 'Operator',
    basicSal: 5000,
    houseAll: 1000,
    transAll: 500,
    otherAll: 0,
    communAll: 300,
    carAll: 200,
    total: 7000,
    maritalStatus: 'M',
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

const rowFrom = (headerId, values, extra = {}) => ({
  HEADER_ID: headerId,
  REF_NO: `${headerId.padStart(4, '0')}-${values.section ?? ''}`,
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
  NEW_GRADE: null,
  NEW_LEVEL: null,
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

function createRepository() {
  const state = {
    rows: [],
    failures: {},
    master: {
      FULL_NAME: 'Employee Example',
      NATIONALITY: 'Saudi',
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
      TOTAL_SALARY: 7000,
    },
  };
  const repo = {
    state,
    latest: async (_connection, empNo) =>
      [...state.rows]
        .filter((row) => row.EMP_NO === empNo)
        .sort((a, b) => (BigInt(b.HEADER_ID) > BigInt(a.HEADER_ID) ? 1 : -1))[0] ?? null,
    master: async (_connection, empNo) => (empNo === '12001' ? state.master : null),
    positionExists: async (_connection, name) => ['Operator', 'Supervisor'].includes(name),
    nextId: async () =>
      String(
        state.rows.reduce(
          (max, row) => (BigInt(row.HEADER_ID) > max ? BigInt(row.HEADER_ID) : max),
          0n,
        ) + 1n,
      ),
    insert: async (_connection, id, ref, values, userId) => {
      if (repo.state.failures.insert) throw new Error('insert failed');
      const row = rowFrom(id, values, { REF_NO: ref, CREATED_BY: userId });
      state.rows.push(row);
      return { rowsAffected: 1 };
    },
    read: async (_id, _connection) =>
      state.rows.find((row) => row.HEADER_ID === String(_id)) ?? null,
    lockRow: async (_connection, id) =>
      state.rows.find((row) => row.HEADER_ID === String(id)) ?? null,
    update: async (_connection, id, values, updatedBy) => {
      if (repo.state.failures.update) throw new Error('update failed');
      const row = state.rows.find((item) => item.HEADER_ID === String(id));
      if (!row) return { rowsAffected: 0 };
      Object.assign(row, rowFrom(String(id), values), {
        REF_NO: row.REF_NO,
        STATUS: row.STATUS,
        CREATED_BY: row.CREATED_BY,
        CREATED_AT_ISO: row.CREATED_AT_ISO,
        UPDATED_BY: updatedBy,
        UPDATED_AT_ISO: '2026-10-30',
      });
      return { rowsAffected: 1 };
    },
    delete: async (_connection, id) => {
      if (repo.state.failures.delete) throw new Error('delete failed');
      const index = state.rows.findIndex((row) => row.HEADER_ID === String(id));
      if (index < 0) return { rowsAffected: 0 };
      state.rows.splice(index, 1);
      return { rowsAffected: 1 };
    },
    list: async (_connection, filters) => {
      let rows = [...state.rows];
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
      return { total, rows: rows.slice(start, start + filters.pageSize) };
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
  const hrUser = createUser('PS-HR');
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
  return { app, store, rbac, permissions, hrUser, deniedUser, personalStatusRepository };
}

describe('personal status change API', () => {
  let f;
  let session;
  let denied;
  beforeEach(async () => {
    f = setup();
    session = await signIn(f.store, f.hrUser);
    denied = await signIn(f.store, f.deniedUser);
  });

  const get = (path = '', cookie = session.cookie) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', cookie);
  const send = (method, path, cookie = session.cookie, body) => {
    const call = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', cookie)
      .set('X-CSRF-Token', session.csrf);
    return body === undefined ? call : call.send(body);
  };

  it('enforces authentication, action permissions, DENY and CSRF on writes', async () => {
    assert.equal((await request(f.app).get(BASE)).status, 401);
    assert.equal((await get('', denied.cookie)).status, 403);
    assert.equal(
      (await request(f.app).post(BASE).set('Cookie', session.cookie).send(BODY)).status,
      403,
    );
    f.rbac.override(f.hrUser, f.permissions.CREATE, 'DENY');
    assert.equal((await send('post', '', session.cookie, BODY)).status, 403);
  });

  it('creates and reads server-owned fields, recomputes totals and keeps identifiers exact', async () => {
    const created = await send('post', '', session.cookie, BODY);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.headerId, '1');
    assert.equal(created.body.data.refNo, '0001-Production');
    assert.equal(created.body.data.status, 'DRAFT');
    assert.equal(created.body.data.new.total, 7500);
    assert.equal(f.personalStatusRepository.state.rows[0].CREATED_BY, String(f.hrUser.userId));
    assert.equal(f.personalStatusRepository.state.rows[0].USER_ID, null);
    const forged = await send('post', '', session.cookie, {
      ...BODY,
      headerId: '9',
      refNo: 'forged',
      status: 'APPROVED',
      createdBy: '999',
      userId: '999',
      signatures: { president: 'forged' },
    });
    assert.equal(forged.status, 400);
    assert.equal(f.personalStatusRepository.state.rows.length, 1);
    const detail = await get('/1');
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.old.position, 'Operator');
    assert.deepEqual(detail.body.data.signatures, {
      hrAdmin: null,
      hrAdminSign: null,
      vp: null,
      vpSign: null,
      president: null,
      presidentSign: null,
    });

    f.personalStatusRepository.state.rows[0].HEADER_ID = BIG_ID;
    assert.equal((await get(`/${BIG_ID}`)).body.data.headerId, BIG_ID);
  });

  it('validates documented inputs and maps absent employees and positions', async () => {
    for (const [body, code] of [
      [{ ...BODY, effectiveDate: '' }, 'EFFECTIVE_DATE_REQUIRED'],
      [{ ...BODY, effectiveDate: '2026-02-30' }, 'EFFECTIVE_DATE_REQUIRED'],
      [{ ...BODY, empNo: '99999' }, 'EMP_NOT_FOUND'],
      [{ ...BODY, new: { ...BODY.new, position: 'Missing' } }, 'POSITION_INVALID'],
      [{ ...BODY, new: { ...BODY.new, basicSal: -1 } }, 'ALLOWANCE_INVALID'],
      [{ ...BODY, new: { ...BODY.new, maritalStatus: 'X' } }, 'MARITAL_STATUS_INVALID'],
      [{ ...BODY, remarks: 'x'.repeat(2001) }, 'TEXT_TOO_LONG'],
    ]) {
      const result = await send('post', '', session.cookie, body);
      assert.equal(result.status, 400, code);
      assert.equal(result.body.error.code, code);
    }
  });

  it('updates editable fields without changing status, reference or creation audit fields', async () => {
    const created = await send('post', '', session.cookie, BODY);
    const original = structuredClone(f.personalStatusRepository.state.rows[0]);
    const result = await send('put', '/1', session.cookie, {
      ...BODY,
      remarks: 'Changed',
      new: { ...BODY.new, total: 0 },
    });
    assert.equal(result.status, 200, JSON.stringify(result.body));
    const saved = f.personalStatusRepository.state.rows[0];
    assert.equal(saved.STATUS, original.STATUS);
    assert.equal(saved.REF_NO, original.REF_NO);
    assert.equal(saved.CREATED_BY, original.CREATED_BY);
    assert.equal(saved.CREATED_AT_ISO, original.CREATED_AT_ISO);
    assert.equal(saved.UPDATED_BY, String(f.hrUser.userId));
    assert.equal(result.body.data.new.total, 7500);
    assert.equal(created.status, 201);
  });

  it('deletes every status and returns 404 for missing rows', async () => {
    assert.equal((await get('/999')).status, 404);
    assert.equal((await send('put', '/999', session.cookie, BODY)).status, 404);
    assert.equal((await send('delete', '/999')).status, 404);
    for (const status of ['DRAFT', 'REJECTED', 'INPROCESS', 'APPROVED']) {
      await send('post', '', session.cookie, BODY);
      const headerId = String(f.personalStatusRepository.state.rows[0].HEADER_ID);
      f.personalStatusRepository.state.rows[0].STATUS = status;
      assert.equal((await send('delete', `/${headerId}`)).status, 200, status);
      assert.equal(f.personalStatusRepository.state.rows.length, 0);
      assert.equal((await send('delete', `/${headerId}`)).status, 404);
    }
  });

  it('lists with exact totals, filters, pagination and rejects invalid bounds', async () => {
    await send('post', '', session.cookie, BODY);
    await send('post', '', session.cookie, { ...BODY, empName: 'Second Person', section: 'Sales' });
    Object.assign(f.personalStatusRepository.state.rows[1], {
      STATUS: 'APPROVED',
      DEPT: 'Sales',
      NEW_POSITION: 'Operator',
      CREATED_BY: '2002',
      FORM_DATE_ISO: '2026-10-30',
    });
    const result = await get('?search=Second&page=1&pageSize=1&sort=headerId&order=desc');
    assert.equal(result.status, 200);
    assert.equal(result.body.data.meta.total, 1);
    assert.equal(result.body.data.rows.length, 1);
    assert.equal(result.body.data.rows[0].empName, 'Second Person');
    assert.equal((await get('')).body.data.meta.total, 2, 'listing is not creator-scoped');
    assert.equal((await get('?created_by=me')).status, 400, 'there is no created_by filter');
    const userId = String(f.hrUser.userId);
    for (const filter of [
      'status=DRAFT',
      'section=Production',
      'department=Injection',
      'position=Supervisor',
      `requestor=${userId}`,
      'date_from=2026-10-30',
      'date_to=2026-10-29',
      'status=APPROVED&section=Sales&department=Sales&position=Operator&requestor=2002&date_from=2026-10-30&date_to=2026-10-30',
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
    assert.ok(!JSON.stringify(result.body).includes('PENDING_AT'));
  });

  it('supports deduplicated lookup lists and both employee auto-fill branches', async () => {
    assert.deepEqual((await get('/lookups/employees')).body.data, [
      { empNo: '12001' },
      { empNo: '12002' },
    ]);
    assert.deepEqual((await get('/lookups/positions')).body.data, [
      { name: 'Operator' },
      { name: 'Supervisor' },
    ]);
    const branchA = await get('/lookups/employees/12001');
    assert.equal(branchA.body.data.branch, 'employeeMaster');
    assert.equal(branchA.body.data.old.basicSal, 5000);
    await send('post', '', session.cookie, BODY);
    const branchB = await get('/lookups/employees/12001');
    assert.equal(branchB.body.data.branch, 'previousRequest');
    assert.equal(branchB.body.data.old.position, 'Supervisor');
    assert.equal(branchB.body.data.old.maritalStatus, null);
    assert.equal((await get('/lookups/employees/99999')).status, 404);
    assert.equal(
      (await get('/lookups/employees/99999')).body.error.message,
      'No Data Available for given Employee Number',
    );
  });

  it('rolls back create, update and delete when repository work fails', async () => {
    f.personalStatusRepository.state.failures.insert = true;
    assert.equal((await send('post', '', session.cookie, BODY)).status, 500);
    assert.equal(f.personalStatusRepository.state.rows.length, 0);
    delete f.personalStatusRepository.state.failures.insert;

    await send('post', '', session.cookie, BODY);
    const before = structuredClone(f.personalStatusRepository.state.rows[0]);
    f.personalStatusRepository.state.failures.update = true;
    assert.equal(
      (await send('put', '/1', session.cookie, { ...BODY, remarks: 'Changed' })).status,
      500,
    );
    assert.deepEqual(f.personalStatusRepository.state.rows[0], before);
    delete f.personalStatusRepository.state.failures.update;

    f.personalStatusRepository.state.failures.delete = true;
    assert.equal((await send('delete', '/1')).status, 500);
    assert.equal(f.personalStatusRepository.state.rows.length, 1);
  });
});
