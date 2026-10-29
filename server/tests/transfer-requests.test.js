import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { testAuthConfig, createAuthStore } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installTransferRequests } from './helpers/transferRequestFakes.js';

const BASE = '/api/v1/hr/transfer-requests';
const BODY = {
  plant: 'Zamil Plastic Non-Food',
  current: { empName: 'Employee Example' },
  transfer: {
    jobTitle: 'Senior Operator',
    dept: 'Maintenance Department',
    section: 'Maintenance Section',
    effectiveDate: '2026-11-15',
    bloodType: 'O+',
    superiorNo: '2280',
    changeSalary: 'Yes',
    budgetedSalary: 'No',
  },
  itHr: { adminSignature: 'typed-but-shared-column' },
};

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  const add = (number, name) => {
    store.addEmployee({
      employeeNumber: number,
      fullName: name,
      email: `${number.toLowerCase()}@example.invalid`,
    });
    return store.addUser(number, { passwordHash: 'argon2-hash-placeholder' });
  };
  const hrUser = add('TR-HR', 'Test HR'),
    staffUser = add('TR-STAFF', 'Test Staff'),
    denied = add('TR-DENIED', 'Test Denied');
  const module = rbac.addModule('HR'),
    resource = rbac.addResource(module, 'TRANSFER_REQUESTS');
  const permissions = Object.fromEntries(
    ['VIEW', 'CREATE', 'UPDATE', 'DELETE'].map((a) => [a, rbac.addPermission(resource, a)]),
  );
  const role = rbac.addRole('TR_TEST');
  for (const permission of Object.values(permissions)) rbac.grant(role, permission);
  rbac.assign(hrUser, role);
  rbac.assign(staffUser, role);
  installTransferRequests(store, { hrUserIds: [hrUser.userId] });
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      transferRequestRepository: store.transferRequestRepository,
    },
  });
  return { store, rbac, permissions, hrUser, staffUser, denied, app };
}

describe('transfer request API', () => {
  let f, hr, staff, denied;
  beforeEach(async () => {
    f = setup();
    hr = await signIn(f.store, f.hrUser);
    staff = await signIn(f.store, f.staffUser);
    denied = await signIn(f.store, f.denied);
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
  const forbid = async (res) => assert.equal(res.status, 403, JSON.stringify(res.body));

  it('authenticates, authorizes by action and requires CSRF for writes', async () => {
    assert.equal((await request(f.app).get(BASE)).status, 401);
    await forbid(await get('', denied));
    const noCsrf = await request(f.app).post(BASE).set('Cookie', hr.cookie).send(BODY);
    assert.equal(noCsrf.status, 403);
    f.rbac.override(f.hrUser, f.permissions.CREATE, 'DENY');
    await forbid(await send('post', '', hr, BODY));
  });

  it('creates, reads, updates and deletes while preserving server-owned values', async () => {
    const created = await send('post', '', hr, BODY);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const id = created.body.data.headerId;
    assert.match(id, /^[1-9][0-9]{0,18}$/);
    assert.equal(f.store.state.transferRequests[0].status, 'Draft');
    const detail = await get(`/${id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.status, 'Draft');
    const updated = await send('put', `/${id}`, hr, {
      ...BODY,
      status: 'Approved',
      createdBy: 'faked',
      approvals: { president: 'Approved' },
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(f.store.state.transferRequests[0].status, 'Draft');
    const deleted = await send('delete', `/${id}`);
    assert.equal(deleted.status, 200);
    assert.equal(f.store.state.transferRequests.length, 0);
  });

  it('validates documented domains and unknown employees without writing', async () => {
    for (const [field, value, code] of [
      ['plant', 'Bad', 'PLANT_INVALID'],
      ['employee', 'Absent', 'EMP_NOT_FOUND'],
      ['job', 'Absent', 'JOB_TITLE_INVALID'],
      ['dept', 'Absent', 'DEPT_INVALID'],
      ['section', 'Absent', 'SECTION_INVALID'],
      ['date', 'bad', 'EFFECTIVE_DATE_REQUIRED'],
      ['blood', 'bad', 'BLOOD_TYPE_INVALID'],
      ['superior', '999', 'SUPERIOR_INVALID'],
      ['salary', 'Maybe', 'SALARY_FLAG_INVALID'],
    ]) {
      const body = structuredClone(BODY);
      if (field === 'plant') body.plant = value;
      if (field === 'employee') body.current.empName = value;
      if (field === 'job') body.transfer.jobTitle = value;
      if (field === 'dept') body.transfer.dept = value;
      if (field === 'section') body.transfer.section = value;
      if (field === 'date') body.transfer.effectiveDate = value;
      if (field === 'blood') body.transfer.bloodType = value;
      if (field === 'superior') body.transfer.superiorNo = value;
      if (field === 'salary') body.transfer.changeSalary = value;
      const result = await send('post', '', hr, body);
      assert.equal(result.status, 400, field);
      assert.equal(result.body.error.code, code, field);
    }
    for (const [field, code] of [
      ['plant', 'PLANT_INVALID'],
      ['employee', 'EMP_NOT_FOUND'],
      ['job', 'JOB_TITLE_INVALID'],
      ['dept', 'DEPT_INVALID'],
      ['section', 'SECTION_INVALID'],
      ['effectiveDate', 'EFFECTIVE_DATE_REQUIRED'],
      ['bloodType', 'BLOOD_TYPE_INVALID'],
      ['superiorNo', 'SUPERIOR_INVALID'],
      ['changeSalary', 'SALARY_FLAG_INVALID'],
      ['budgetedSalary', 'SALARY_FLAG_INVALID'],
    ]) {
      const body = structuredClone(BODY);
      if (field === 'plant') delete body.plant;
      else if (field === 'employee') delete body.current.empName;
      else delete body.transfer[field === 'job' ? 'jobTitle' : field];
      const result = await send('post', '', hr, body);
      assert.equal(result.status, 400, `missing ${field}`);
      assert.equal(result.body.error.code, code, `missing ${field}`);
    }
    assert.equal(f.store.state.transferRequests.length, 0);
  });

  it('scopes listing for non-HR, validates pagination, and supports lookups', async () => {
    const body = {
      ...structuredClone(BODY),
      mgrDate: '2026-11-15',
      current: { ...BODY.current, dept: 'Production' },
    };
    await send('post', '', hr, body);
    await send('post', '', staff, BODY);
    Object.assign(f.store.state.transferRequests[1], {
      plant: 'Zamil Plastic Food',
      requestedBy: 'Other Requestor',
      cEmpName: 'Other Employee',
      cEmpNo: '9876',
      cJobTitle: 'Other Current Job',
      cDept: 'Sales',
      tJobTitle: 'Other Transfer Job',
      tDept: 'Sales Department',
      mgrDate: '2027-01-01',
      status: 'Rejected',
    });
    const own = await get('', staff);
    assert.equal(own.status, 200, JSON.stringify(own.body));
    assert.equal(own.body.data.rows.length, 1);
    assert.equal(own.body.data.meta.total, 1);
    assert.equal((await get('')).body.data.rows.length, 2, 'HR sees all creators');
    assert.equal((await get('?page=0')).status, 400);
    assert.equal((await get('?pageSize=101')).status, 400);
    for (const filter of [
      'search=Employee%20Example',
      'status=Draft',
      'plant=Zamil%20Plastic%20Non-Food',
      'transferDept=Maintenance%20Department',
      'currentDept=Production',
      'jobTitle=Senior%20Operator',
      'date_from=2026-12-01',
      'date_to=2026-11-30',
      'search=Employee%20Example&status=Draft&plant=Zamil%20Plastic%20Non-Food&transferDept=Maintenance%20Department&currentDept=Production&jobTitle=Senior%20Operator&date_from=2026-11-01&date_to=2026-11-30',
    ]) {
      const filtered = await get(`?${filter}`);
      assert.equal(filtered.status, 200, filter);
      assert.equal(
        filtered.body.data.meta.total,
        1,
        `${filter}: ${JSON.stringify(filtered.body.data)}`,
      );
      const expectedPlant =
        filter === 'date_from=2026-12-01' ? 'Zamil Plastic Food' : 'Zamil Plastic Non-Food';
      assert.equal(filtered.body.data.rows[0].plant, expectedPlant, filter);
    }
    assert.equal((await get('/lookups/employees')).body.data[0].name, 'Employee Example');
    assert.equal((await get('/lookups/employees/Unknown')).status, 404);
    assert.equal((await get('/lookups/departments')).body.data.length, 11);
    assert.equal((await get('/lookups/jobs')).body.data[0].name, 'Senior Operator');
    assert.equal((await get('/lookups/sections')).body.data[0].name, 'Maintenance Section');
    assert.equal((await get('/lookups/directors')).body.data[0].empNo, '2280');
    assert.equal((await get('/lookups/blood-types')).body.data[0].code, 'O+');
    assert.equal((await get('/lookups/requestor')).body.data[0].fullName, 'Requester Example');
  });

  it('returns 404 and blocks updates/deletes for Inprocess and Approved; allows Draft/Rejected delete', async () => {
    assert.equal((await get('/999')).status, 404);
    assert.equal((await send('put', '/999', hr, BODY)).status, 404);
    assert.equal((await send('delete', '/999')).status, 404);
    await send('post', '', hr, BODY);
    for (const status of ['Inprocess', 'Approved']) {
      f.store.state.transferRequests[0].status = status;
      assert.equal((await send('put', '/1', hr, BODY)).status, 409);
      assert.equal((await send('delete', '/1')).status, 409);
    }
    f.store.state.transferRequests[0].status = 'Rejected';
    assert.equal((await send('delete', '/1')).status, 200);
  });

  it('rolls back failed insert, update and delete transactions', async () => {
    f.store.failures.transferRequests.insert = true;
    assert.equal((await send('post', '', hr, BODY)).status, 500);
    assert.equal(f.store.state.transferRequests.length, 0);
    delete f.store.failures.transferRequests.insert;
    await send('post', '', hr, BODY);
    f.store.failures.transferRequests.update = true;
    assert.equal((await send('put', '/1', hr, BODY)).status, 500);
    assert.equal(f.store.state.transferRequests[0].plant, BODY.plant);
    delete f.store.failures.transferRequests.update;
    f.store.failures.transferRequests.delete = true;
    assert.equal((await send('delete', '/1')).status, 500);
    assert.equal(f.store.state.transferRequests.length, 1);
  });
});
