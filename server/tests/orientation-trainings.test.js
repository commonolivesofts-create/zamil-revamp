// Orientation Training (New Hire Training, NHTF) API over a mocked repository (no Oracle). The
// legacy CI3 behaviours are listed in docs/testing/orientation-legacy-comparison.md.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installOrientationTrainings } from './helpers/orientationTrainingFakes.js';
import {
  divisionName,
  employeeType,
  fromStoredDate,
  isEditable,
  legacyTime,
  orientationDays,
  orientationPeriod,
  statusLabel,
  submitProblems,
} from '../src/modules/hr/orientation-trainings/orientationTraining.rules.js';

const BASE = '/api/v1/hr/orientation-trainings';
const BODY = {
  empNo: 'E-100Y',
  fromOrient: '2026-10-25',
  // Values an older client still sends; the server ignores them (legacy read-only fields).
  toOrient: '2026-10-30',
  startDate: '2026-10-01',
  section: 'Forged section',
  empname: 'Forged name',
  personId: '1',
  division: 'Forged division',
  type: 'Manager',
  position: 'Forged position',
  flag: 'Y',
  lines: [
    {
      department: 'Training with safety Dept',
      departmentHead: 'Manager Example',
      fromDate: '2026-10-25',
      toDate: '2026-10-25',
      orientationDays: 99,
      timeFrom: '09:00',
      timeTo: '17:00',
      orientationPeriod: 'forged',
      remarks: 'Induction',
    },
  ],
};

function setup({ identityStart } = {}) {
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
  installOrientationTrainings(store, { hrUserIds: [hrUser.userId], identityStart });
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
  const state = () => f.store.state.orientationTrainings;

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
    assert.equal(state().headers.N.length, 0);
  });

  it('create (legacy newaddtrainee): PRODUCTION tables, Draft, server-filled header, To = From, Scheduled By', async () => {
    const created = await send('post', '', hr, BODY);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.headerId, '1');
    assert.equal(created.body.data.flag, 'N', 'legacy saves every new request as PRODUCTION');
    assert.equal(created.body.data.reference, 'Production/26/001');
    assert.equal(state().headers.Y.length, 0);
    const [header] = state().headers.N;
    assert.equal(header.status, 'Draft');
    // Read-only legacy fields come from the employee master, never from the body.
    assert.equal(header.empname, 'Employee E-100Y');
    assert.equal(header.section, 'Manufacturing');
    assert.equal(header.division, 'Production');
    assert.equal(header.position, 'Technician');
    assert.equal(header.empType, 'Employee');
    assert.equal(header.startDate, '2026-01-01');
    assert.equal(header.toOrient, header.fromOrient, 'legacy copies From into the read-only To');
    assert.equal(
      header.orientationBy,
      'Test Actor',
      'Scheduled By = the signed-in user (findActorName)',
    );
    assert.equal(state().flags[0].tableName, 'PRODUCTION');
    const [line] = state().lines.N;
    assert.equal(line.orientationPeriod, '8.00 Hrs');
    assert.equal(line.orientationDays, '0', 'legacy days are to - from: the same day is 0');
    assert.equal(line.timeFrom, '09:00:00', 'time inputs use step="1"');
    assert.equal(line.department, 'Training with safety Dept');
  });

  it('lines: every legacy row field is optional; days and time follow the legacy formulas', async () => {
    const created = await send('post', '', hr, {
      empNo: 'E-100Y',
      fromOrient: '2026-10-25',
      lines: [
        { department: 'Training with HR Dept' },
        {
          department: 'Tour around factory',
          fromDate: '2026-10-25',
          toDate: '2026-10-27',
          timeFrom: '08:00:00',
          timeTo: '09:30:00',
        },
      ],
    });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const [blank, full] = state().lines.N;
    for (const key of ['departmentHead', 'fromDate', 'toDate', 'timeFrom', 'timeTo', 'remarks']) {
      assert.equal(blank[key], null, key);
    }
    assert.equal(blank.orientationDays, null);
    assert.equal(blank.orientationPeriod, null);
    assert.equal(full.orientationDays, '2');
    assert.equal(full.orientationPeriod, '1.30 Hrs', 'hours.minutes, not decimal hours');
  });

  it('validates: required employee and From, reversed line ranges, IDs, list bounds, unknown fields', async () => {
    const bad = async (body) => (await send('post', '', hr, body)).status;
    assert.equal(await bad({ ...BODY, extra: true }), 400);
    assert.equal(await bad({ ...BODY, fromOrient: undefined }), 400);
    assert.equal(await bad({ ...BODY, empNo: '' }), 400);
    assert.equal(await bad({ ...BODY, lines: [] }), 400);
    assert.equal(await bad({ ...BODY, lines: [{ ...BODY.lines[0], toDate: '2026-10-24' }] }), 400);
    assert.equal(await bad({ ...BODY, lines: [{ ...BODY.lines[0], timeTo: '08:00' }] }), 400);
    assert.equal(
      await bad({ ...BODY, lines: [{ ...BODY.lines[0], remarks: 'x'.repeat(1001) }] }),
      400,
    );
    assert.equal((await get('/01')).status, 400);
    assert.equal((await get('/1?flag=X')).status, 400);
    assert.equal((await get('')).status, 400);
    assert.equal((await get('?flag=Y&pageSize=101')).status, 400);
  });

  it('employee scope (legacy getEmpNum): HR any current employee, others only themselves', async () => {
    assert.equal((await get('/lookups/employees')).body.data.length, 2);
    assert.deepEqual(
      (await get('/lookups/employees', staff)).body.data.map((item) => item.empNo),
      ['E-STAFF'],
    );
    assert.equal((await get('/lookups/employee-details?empNo=E-100Y', staff)).status, 403);
    assert.equal((await get('/lookups/employee-details?empNo=E-STAFF', staff)).status, 200);
    assert.equal((await send('post', '', staff, BODY)).status, 403);
    assert.equal((await send('post', '', staff, { ...BODY, empNo: 'E-STAFF' })).status, 201);
  });

  it('opens legacy shared-service records with no registry row, and by explicit flag', async () => {
    const id = f.store.seedOrientationTraining({ lines: [{ lineId: '1' }] });
    state().flags = [];
    const detail = await get(`/${id}`);
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.data.flag, 'Y');
    assert.equal((await get(`/${id}?flag=Y`)).body.data.flag, 'Y');
    assert.equal((await get(`/${id}?flag=N`)).status, 404);
  });

  it('update: draft and rejected requests; saving sets Draft (legacy); in-process and approved are 409', async () => {
    const id = f.store.seedOrientationTraining({
      header: { status: 'REJECTED', orientationBy: 'Original Scheduler' },
      lines: [{ lineId: '1' }, { lineId: '2' }],
    });
    const updated = await send('put', `/${id}?flag=Y`, hr, {
      ...BODY,
      lines: [{ ...BODY.lines[0], department: 'Tour around factory' }],
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    const [header] = state().headers.Y;
    assert.equal(header.status, 'Draft');
    assert.equal(header.orientationBy, 'Original Scheduler', 'Scheduled By keeps its value');
    assert.equal(header.empname, 'Employee E-100Y');
    assert.deepEqual(
      state().lines.Y.map((line) => line.department),
      ['Tour around factory'],
    );
    for (const status of ['INPROCESS', 'Approved']) {
      header.status = status;
      const blocked = await send('put', `/${id}`, hr, BODY);
      assert.equal(blocked.status, 409, status);
      assert.equal(blocked.body.error.code, 'ORIENTATION_TRAINING_NOT_DRAFT');
      assert.equal((await send('delete', `/${id}/lines/1`)).status, 409);
    }
  });

  it('deletes draft records only', async () => {
    f.store.seedOrientationTraining({ lines: [{ lineId: '1' }] });
    assert.equal((await send('delete', '/1')).status, 200);
    assert.equal(state().flags.length, 0);
    f.store.seedOrientationTraining({ header: { status: 'Rejected' }, lines: [{ lineId: '1' }] });
    assert.equal((await send('delete', '/1')).status, 409);
  });

  it('list (legacy newhiretrain_list): per variant, HR all / others own, mixed-case statuses as legacy labels', async () => {
    f.store.seedOrientationTraining({
      header: {
        headerId: '10',
        createdBy: f.hrUser.userId,
        status: 'INPROCESS',
        pendingAt: 'Approver Example',
      },
    });
    f.store.seedOrientationTraining({
      header: { headerId: '11', createdBy: f.staffUser.userId, status: 'Rejected' },
    });
    f.store.seedOrientationTraining({
      header: { headerId: '12', createdBy: f.staffUser.userId, status: 'REJECTED' },
    });
    const all = await get('?flag=Y&page=1&pageSize=1&sortBy=HEADER_ID&sortDir=asc');
    assert.equal(all.status, 200);
    assert.equal(all.body.pagination.total, 3);
    assert.equal(all.body.data[0].status, 'Inprocess');
    assert.equal(all.body.data[0].rawStatus, 'INPROCESS');
    assert.equal(all.body.data[0].pendingAt, 'Approver Example');
    assert.equal((await get('?flag=Y&status=inprocess')).body.pagination.total, 1);
    assert.equal((await get('?flag=Y&status=Rejected')).body.pagination.total, 2);
    assert.equal((await get('?flag=Y&status=Pending')).status, 400);
    assert.equal((await get('?flag=Y', staff)).body.pagination.total, 2, 'own requests only');
    assert.equal((await get('?flag=N')).body.pagination.total, 0);
  });

  it('lookups: flag, managers, employee details and the training rows of the employee type', async () => {
    assert.equal((await get('/lookups/flag?empNo=E-100Y')).body.data.flag, 'N');
    assert.equal((await get('/lookups/flag?empNo=MISSING')).status, 404);
    assert.equal((await get('/lookups/managers')).body.data[0].empNo, 'M-100');
    assert.equal((await get('/lookups/employee-details?empNo=E-100Y')).status, 200);
    assert.equal((await get('/lookups/employee-details?empNo=MISSING')).status, 404);
    assert.equal((await get('/lookups/skills?empType=Employee')).body.data.skills.length, 5);
    assert.equal((await get('/lookups/skills?empType=Manager')).body.data.skills.length, 7);
    const other = (await get('/lookups/skills?empType=Contractor')).body.data;
    assert.equal(other.empType, 'Employee', 'legacy CASE: any other category is Employee');
    assert.equal(other.skills.length, 5);
  });

  it('rolls back partial insert, update, and delete transactions', async () => {
    f.store.failures.orientation.insertLine = true;
    assert.equal((await send('post', '', hr, BODY)).status, 500);
    assert.equal(state().headers.N.length, 0);
    f.store.failures.orientation.insertLine = false;
    f.store.seedOrientationTraining({ lines: [{ lineId: '1' }] });
    f.store.failures.orientation.insertLine = true;
    assert.equal((await send('put', '/1', hr, BODY)).status, 500);
    assert.equal(state().headers.Y[0].empname, 'Employee E-100Y');
    assert.equal(state().headers.Y[0].status, 'Draft');
    assert.equal(state().lines.Y[0].lineId, '1');
    f.store.failures.orientation.insertLine = false;
    f.store.failures.orientation.deleteHeader = true;
    assert.equal((await send('delete', '/1')).status, 500);
    assert.equal(state().lines.Y.length, 1);
    assert.equal(state().flags.length, 1);
  });
});

describe('orientation training record access', () => {
  let f;
  let hr;
  let staff;
  beforeEach(async () => {
    f = setup();
    hr = await signIn(f.store, f.hrUser);
    staff = await signIn(f.store, f.staffUser);
  });
  const call = (method, path, session, body) => {
    const req = request(f.app)[method](`${BASE}${path}`).set('Cookie', session.cookie);
    if (method !== 'get') req.set('X-CSRF-Token', session.csrf);
    return body === undefined ? req : req.send(body);
  };
  const isForbidden = (response) => {
    assert.equal(response.status, 403, JSON.stringify(response.body));
    assert.equal(response.body.error.code, 'FORBIDDEN');
  };

  it("returns 403 for another user's record by ID on read, update, delete and line delete", async () => {
    const id = f.store.seedOrientationTraining({ lines: [{}] });
    isForbidden(await call('get', `/${id}`, staff));
    isForbidden(await call('put', `/${id}`, staff, BODY));
    isForbidden(await call('delete', `/${id}`, staff));
    isForbidden(await call('delete', `/${id}/lines/1`, staff));
    assert.equal(f.store.state.orientationTrainings.lines.Y.length, 1);
    assert.equal((await call('get', `/${id}`, hr)).status, 200, 'HR users keep access');
    assert.equal((await call('get', '/999', staff)).status, 404, 'unknown IDs stay 404');
  });

  it('allows the owner and same-department users holding VIEW', async () => {
    const own = f.store.seedOrientationTraining({ header: { createdBy: f.staffUser.userId } });
    assert.equal((await call('get', `/${own}`, staff)).status, 200);
    const other = f.store.seedOrientationTraining();
    f.store.state.orientationDepartments = { 'E-STAFF': '10', 'E-100Y': '10' };
    assert.equal((await call('get', `/${other}`, staff)).status, 200);
    f.rbac.override(f.staffUser, f.permissions.VIEW, 'DENY');
    isForbidden(await call('put', `/${other}`, staff, BODY));
  });
});

describe('orientation training IDs come from the identity columns', () => {
  it('creates when the identity is far above MAX(HEADER_ID)', async () => {
    const f = setup({ identityStart: 1081 });
    f.store.seedOrientationTraining({ header: { headerId: '38' }, flag: 'N' });
    const hr = await signIn(f.store, f.hrUser);
    const created = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(BODY);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.headerId, '1081');
    assert.equal(created.body.data.reference, 'Production/26/1081', 'IDs above 999 are not cut');
    const { flags } = f.store.state.orientationTrainings;
    assert.ok(flags.some((item) => item.headerId === '1081' && item.tableName === 'PRODUCTION'));
  });
});

describe('orientation training legacy rules', () => {
  it('days, time, status, division and dates follow the legacy formulas', () => {
    assert.equal(orientationDays('2026-10-25', '2026-10-25'), 0);
    assert.equal(orientationDays('2026-10-25', '2026-10-28'), 3);
    assert.equal(orientationDays('2026-10-25', '2026-10-24'), null);
    assert.equal(orientationDays('', '2026-10-24'), null);
    assert.equal(orientationPeriod('08:00:00', '09:30:00'), '1.30 Hrs');
    assert.equal(orientationPeriod('08:15:00', '08:20:00'), '0.05 Hrs');
    assert.equal(orientationPeriod('09:00:00', '08:00:00'), null);
    assert.equal(legacyTime('08:00'), '08:00:00');
    assert.equal(legacyTime('08:00:30'), '08:00:30');
    assert.deepEqual(
      ['Draft', 'INPROCESS', 'InProcess', 'Approved', 'REJECTED', 'Rejected', null].map(
        statusLabel,
      ),
      ['Draft', 'Inprocess', 'Inprocess', 'Approved', 'Rejected', 'Rejected', 'Draft'],
    );
    assert.deepEqual(['Draft', 'Rejected', 'REJECTED', 'INPROCESS', 'Approved'].map(isEditable), [
      true,
      true,
      true,
      false,
      false,
    ]);
    assert.equal(divisionName('300000003618177'), 'IPP BU');
    assert.equal(divisionName('300000000000001'), 'FPP BU');
    assert.equal(divisionName(null), null);
    assert.equal(employeeType('GM'), 'Employee', 'the SQL already maps GM to Manager');
    assert.equal(fromStoredDate('1970-01-01'), null, 'legacy blank date');
    assert.equal(fromStoredDate('2000-01-01'), null);
    assert.equal(fromStoredDate('2026-10-25'), '2026-10-25');
  });

  it('validate-for-submit follows legacy submitWorkflow', () => {
    assert.deepEqual(submitProblems({ headerId: '1', rawStatus: 'Draft' }), []);
    assert.deepEqual(submitProblems({ headerId: '1', rawStatus: 'Rejected' }), []);
    assert.deepEqual(submitProblems({ headerId: '1', rawStatus: 'REJECTED' }), []);
    for (const status of ['INPROCESS', 'Inprocess', 'Approved', 'APPROVED', 'Accepted']) {
      assert.match(
        submitProblems({ headerId: '1', rawStatus: status })[0].message,
        /Cannot Re-initialize Workflow/,
      );
    }
    assert.equal(submitProblems({}).at(0).field, 'headerId');
  });

  it.todo('submit route: mail the creator’s direct manager, XXPHP_WORKFLOW NHTF row, INPROCESS');
  it.todo(
    'step 1 / step 2 approve and reject, FYI mail to department heads, final Approved/Rejected',
  );
});
