import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installContractorEmployees } from './helpers/contractorEmployeeFakes.js';

const BASE = '/api/v1/hr/contractor-employees';
const BODY = {
  division: '300000003618177',
  con_number: 88,
  status: 'Active',
  rate: 15,
  employee_name: 'Employee Example',
  iqamah: 123456789,
  department: 'QC',
  job: 40,
  direct_boss_id: 50,
  place: 'Plant',
  replacement: null,
  start_date: '2026-01-01',
  end_date: '2026-12-31',
  ajeer: true,
  sfda: false,
  blacklist: true,
  remark: 'Note',
};

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store);
  store.addEmployee({ employeeNumber: 'E-HR', username: 'E-HR' });
  store.addEmployee({ employeeNumber: 'E-NONE', username: 'E-NONE' });
  const hrUser = store.addUser('E-HR', { passwordHash: 'argon2-hash-placeholder' });
  const nobody = store.addUser('E-NONE', { passwordHash: 'argon2-hash-placeholder' });
  const module = rbac.addModule('HR');
  const resource = rbac.addResource(module, 'CONTRACTOR_EMPLOYEES');
  const permissions = Object.fromEntries(
    ['VIEW', 'CREATE', 'UPDATE', 'DELETE'].map((action) => [
      action,
      rbac.addPermission(resource, action),
    ]),
  );
  const role = rbac.addRole('CONTRACTOR_EMPLOYEE_TEST');
  Object.values(permissions).forEach((permission) => rbac.grant(role, permission));
  rbac.assign(hrUser, role);
  installContractorEmployees(store);
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      contractorEmployeeRepository: store.contractorEmployeeRepository,
    },
  });
  return { store, rbac, permissions, hrUser, nobody, app };
}

describe('contractor employee API', () => {
  let f;
  let hr;
  let nobody;
  beforeEach(async () => {
    f = setup();
    hr = await signIn(f.store, f.hrUser);
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

  it('requires authentication, permission grants, explicit DENY and CSRF', async () => {
    assert.equal((await request(f.app).get(BASE)).status, 401);
    assert.equal((await get('', nobody)).status, 403);
    const noCsrf = await request(f.app).post(BASE).set('Cookie', hr.cookie).send(BODY);
    assert.equal(noCsrf.status, 403);
    f.rbac.override(f.hrUser, f.permissions.DELETE, 'DENY');
    assert.equal((await send('delete', '/1')).status, 403);
  });

  it('creates and reads derived fields, dates and boolean flags', async () => {
    const created = await send('post', '', hr, { ...BODY, emp_id: '999', employee_number: '999' });
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.emp_id, '1');
    const detail = await get('/1');
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.job_title, 'Operator');
    assert.equal(detail.body.data.direct_boss, 'Boss Example');
    assert.equal(detail.body.data.ajeer, true);
    assert.equal(detail.body.data.end_date, '2026-12-31');
  });

  it('validates production section and date order, returns 404 and lookup data', async () => {
    assert.equal((await send('post', '', hr, { ...BODY, department: 'Production' })).status, 400);
    assert.equal((await send('post', '', hr, { ...BODY, start_date: '2027-01-01' })).status, 400);
    assert.equal((await get('/999')).status, 404);
    assert.deepEqual((await get('/lookups/departments')).body.data[0], {
      value: 'ALL',
      label: 'ALL',
    });
    assert.equal(
      (await request(f.app).get('/api/v1/hr/contractors/88').set('Cookie', hr.cookie)).body.data
        .con_name,
      'Contractor Example',
    );
  });

  it('filters, paginates, ignores ALL, and includes open-ended rows in the chosen date filter', async () => {
    f.store.state.contractorEmployees.employees = [
      {
        emp_id: '1',
        employee_number: '88',
        employee_name: 'Alpha',
        division: '300000003618177',
        department: 'QC',
        con_number: '88',
        status: 'Active',
        start_date: '2026-01-01',
        end_date: null,
      },
      {
        emp_id: '2',
        employee_number: '89',
        employee_name: 'Beta',
        division: '300000003618177',
        department: 'Production',
        con_number: '88',
        status: 'Inactive',
        start_date: '2026-02-01',
        end_date: '2026-10-01',
      },
    ];
    const response = await get(
      '?department=ALL&status=ALL&date_from=2026-01-01&date_to=2026-12-31&limit=1&page=2',
    );
    assert.equal(response.status, 200);
    assert.equal(response.body.data.length, 1);
    assert.equal(response.body.pagination.total, 2);
    assert.equal(response.body.pagination.page, 2);
    assert.equal((await get('?limit=201')).status, 400);
    assert.equal((await get('?department=%27%20OR%201%3D1%20--')).status, 200);
  });

  it('updates editable fields and clears nullable values, then hard-deletes with 204', async () => {
    await send('post', '', hr, BODY);
    const updated = await send('put', '/1', hr, {
      ...BODY,
      con_number: 88,
      status: 'Inactive',
      end_date: null,
      remark: null,
      blacklist: false,
    });
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    const detail = (await get('/1')).body.data;
    assert.equal(detail.status, 'Inactive');
    assert.equal(detail.end_date, null);
    assert.equal(detail.remark, null);
    assert.equal(detail.blacklist, false);
    assert.equal((await send('delete', '/1')).status, 204);
    assert.equal((await get('/1')).status, 404);
  });

  it('rolls back failed insert, update and delete transactions', async () => {
    f.store.failures.contractorEmployees.insert = true;
    assert.equal((await send('post', '', hr, BODY)).status, 500);
    assert.equal(f.store.state.contractorEmployees.employees.length, 0);
    delete f.store.failures.contractorEmployees.insert;
    await send('post', '', hr, BODY);
    f.store.failures.contractorEmployees.update = true;
    assert.equal((await send('put', '/1', hr, { ...BODY, status: 'Inactive' })).status, 500);
    assert.equal(f.store.state.contractorEmployees.employees[0].status, 'Active');
    delete f.store.failures.contractorEmployees.update;
    f.store.failures.contractorEmployees.delete = true;
    assert.equal((await send('delete', '/1')).status, 500);
    assert.equal(f.store.state.contractorEmployees.employees.length, 1);
  });
});
