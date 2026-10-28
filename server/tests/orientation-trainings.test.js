import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installOrientationTrainings } from './helpers/orientationTrainingFakes.js';

const BASE = '/api/v1/hr/orientation-trainings';
const BODY = {
  empNo: 'E-100Y',
  fromOrient: '2026-10-25',
  toOrient: '2026-10-30',
  startDate: '2026-10-01',
  section: 'Manufacturing',
  empname: 'Employee E-100Y',
  personId: '7001',
  division: 'Production',
  type: 'Employee',
  position: 'Technician',
  flag: 'N', // Deliberately conflicts with the current org mapping in the fake repository.
  lines: [
    {
      department: 'Safety',
      departmentHead: 'Manager Example',
      fromDate: '2026-10-25',
      toDate: '2026-10-25',
      orientationDays: 1,
      timeFrom: '09:00',
      timeTo: '17:00',
      remarks: 'Induction',
    },
  ],
};

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  const addPerson = (employeeNumber, fullName) => {
    store.addEmployee({
      employeeNumber,
      fullName,
      email: `${employeeNumber.toLowerCase()}@example.invalid`,
    });
    return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
  };
  const hrUser = addPerson('E-HR', 'Hana Example');
  const staffUser = addPerson('E-STAFF', 'Sam Example');
  const nobody = addPerson('E-NONE', 'Nora Example');
  const module = rbac.addModule('HR');
  const resource = rbac.addResource(module, 'ORIENTATION_TRAININGS');
  const permissions = Object.fromEntries(
    ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_LINES'].map((action) => [
      action,
      rbac.addPermission(resource, action),
    ]),
  );
  const hrRole = rbac.addRole('NHT_HR_TEST');
  for (const permission of Object.values(permissions)) rbac.grant(hrRole, permission);
  rbac.assign(hrUser, hrRole);
  const staffRole = rbac.addRole('NHT_STAFF_TEST');
  for (const action of ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_LINES']) {
    rbac.grant(staffRole, permissions[action]);
  }
  rbac.assign(staffUser, staffRole);
  installOrientationTrainings(store, { hrUserIds: [hrUser.userId] });
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      orientationTrainingRepository: store.orientationTrainingRepository,
    },
  });
  return { store, rbac, permissions, hrUser, staffUser, nobody, app };
}

describe('orientation training API', () => {
  let f;
  let hr;
  let staff;
  let nobody;
  beforeEach(async () => {
    f = setup();
    hr = await signIn(f.store, f.hrUser);
    staff = await signIn(f.store, f.staffUser);
    nobody = await signIn(f.store, f.nobody);
  });

  const get = (path, session = hr) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);
  const send = (method, path, session = hr, body) => {
    const call = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body === undefined ? call : call.send(body);
  };
  const forbidden = (response, reason) => {
    assert.equal(response.status, 403, JSON.stringify(response.body));
    assert.equal(f.store.auditEvents('ACCESS_DENIED').at(-1).reasonCode, reason);
  };

  it('denies unauthenticated and ungranted access by default', async () => {
    assert.equal((await request(f.app).get(BASE)).status, 401);
    forbidden(await get('/lookups/managers', nobody), 'NO_GRANT');
    forbidden(await send('post', '', nobody, BODY), 'NO_GRANT');
  });

  it('requires CSRF for every mutation and honors explicit DENY', async () => {
    const noCsrf = await request(f.app).post(BASE).set('Cookie', hr.cookie).send(BODY);
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.body.error.code, 'CSRF_REJECTED');
    f.rbac.override(f.hrUser, f.permissions.CREATE, 'DENY');
    forbidden(await send('post', '', hr, BODY), 'EXPLICIT_DENY');
    assert.equal(f.store.state.orientationTrainings.headers.Y.length, 0);
  });

  it('creates with the server-resolved table flag, reference, header and lines', async () => {
    const created = await send('post', '', hr, BODY);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.headerId, '1');
    assert.equal(created.body.data.flag, 'Y');
    assert.equal(created.body.data.reference, 'Production/26/001');
    const state = f.store.state.orientationTrainings;
    assert.equal(state.headers.Y[0].status, 'Draft');
    assert.equal(state.headers.N.length, 0);
    assert.equal(state.flags[0].tableName, 'SHARED');
    assert.equal(state.lines.Y[0].orientationPeriod, '8.00 Hrs');
  });

  it('reads, replaces all lines on update, and deletes a single line', async () => {
    f.store.seedOrientationTraining({ lines: [{ lineId: '1' }, { lineId: '2' }] });
    const detail = await get('/1');
    assert.equal(detail.status, 200);
    assert.deepEqual(
      detail.body.data.lines.map((line) => line.lineId),
      ['1', '2'],
    );
    const updated = await send('put', '/1', hr, {
      ...BODY,
      flag: 'N',
      lines: [{ ...BODY.lines[0], lineId: '3', department: 'Quality' }],
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.deepEqual(
      f.store.state.orientationTrainings.lines.Y.map((line) => line.lineId),
      ['1'],
    );
    const deleted = await send('delete', '/1/lines/1');
    assert.equal(deleted.status, 200);
    assert.equal(f.store.state.orientationTrainings.lines.Y.length, 0);
    assert.equal((await send('delete', '/1/lines/9')).status, 404);
  });

  it('validates date ranges, IDs, required flag filter, and unknown fields', async () => {
    assert.equal((await send('post', '', hr, { ...BODY, extra: true })).status, 400);
    assert.equal((await send('post', '', hr, { ...BODY, toOrient: '2026-10-20' })).status, 400);
    assert.equal(
      (
        await send('post', '', hr, {
          ...BODY,
          lines: [{ ...BODY.lines[0], fromDate: '2026-10-31' }],
        })
      ).status,
      400,
    );
    assert.equal((await get('/01')).status, 400);
    assert.equal((await get('')).status, 400);
    assert.equal((await get('?flag=Y&pageSize=101')).status, 400);
  });

  it('returns 404 for missing headers, employees, and assignments', async () => {
    assert.equal((await get('/999')).status, 404);
    const missing = await send('post', '', hr, { ...BODY, empNo: 'MISSING' });
    assert.equal(missing.status, 404);
  });

  it('deletes draft records only', async () => {
    f.store.seedOrientationTraining({ lines: [{ lineId: '1' }] });
    assert.equal((await send('delete', '/1')).status, 200);
    assert.equal(f.store.state.orientationTrainings.flags.length, 0);
    f.store.seedOrientationTraining({ header: { status: 'Approved' }, lines: [{ lineId: '1' }] });
    const blocked = await send('delete', '/1');
    assert.equal(blocked.status, 409);
  });

  it('filters and paginates a flag-specific listing with actor scoping', async () => {
    f.store.seedOrientationTraining({ header: { headerId: '10', createdBy: f.hrUser.userId } });
    f.store.seedOrientationTraining({ header: { headerId: '11', createdBy: f.staffUser.userId } });
    const hrPage = await get('?flag=Y&page=1&pageSize=1&sortBy=HEADER_ID&sortDir=asc');
    assert.equal(hrPage.status, 200);
    assert.equal(hrPage.body.pagination.total, 2);
    assert.deepEqual(
      hrPage.body.data.map((row) => row.headerId),
      ['10'],
    );
    const staffPage = await get('?flag=Y&empNo=E-100Y', staff);
    assert.equal(staffPage.body.pagination.total, 1);
    const production = await get('?flag=N');
    assert.equal(production.body.pagination.total, 0);
  });

  it('serves the five lookup endpoints', async () => {
    assert.equal((await get('/lookups/flag?empNo=E-100Y')).body.data.flag, 'Y');
    assert.equal((await get('/lookups/employees')).status, 200);
    assert.equal((await get('/lookups/managers')).body.data[0].empNo, 'M-100');
    assert.equal((await get('/lookups/employee-details?empNo=E-100Y')).status, 200);
    assert.equal((await get('/lookups/skills?empType=Employee')).body.data.skills.length, 5);
  });

  it('rolls back partial insert, update, and delete transactions', async () => {
    f.store.failures.orientation.insertLine = true;
    assert.equal((await send('post', '', hr, BODY)).status, 500);
    assert.equal(f.store.state.orientationTrainings.headers.Y.length, 0);
    f.store.failures.orientation.insertLine = false;
    f.store.seedOrientationTraining({ lines: [{ lineId: '1' }] });
    f.store.failures.orientation.insertLine = true;
    assert.equal(
      (await send('put', '/1', hr, { ...BODY, empname: 'Partial update', lines: BODY.lines }))
        .status,
      500,
    );
    assert.equal(f.store.state.orientationTrainings.headers.Y[0].empname, 'Employee E-100Y');
    assert.equal(f.store.state.orientationTrainings.lines.Y[0].lineId, '1');
    f.store.failures.orientation.insertLine = false;
    f.store.failures.orientation.deleteHeader = true;
    assert.equal((await send('delete', '/1')).status, 500);
    assert.equal(f.store.state.orientationTrainings.lines.Y.length, 1);
    assert.equal(f.store.state.orientationTrainings.flags.length, 1);
  });
});
