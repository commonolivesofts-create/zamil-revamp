import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installPerformanceAppraisals } from './helpers/performanceAppraisalFakes.js';

const BASE = '/api/v1/hr/performance-appraisals';
const body = () => ({
  year: new Date().getFullYear(),
  employee: {
    personId: '9001',
    name: 'Jordan Example',
    number: '9001',
    hireDate: '2020-01-02',
    jobId: '5',
    jobTitle: 'Analyst',
    departmentId: '7',
    department: 'Finance Section',
    yearsInCompany: 6,
    yearsInPosition: 3,
    evaluatedBy: 'Hana Example',
  },
  criteria: Array.from({ length: 20 }, (_, i) => ({
    id: i + 1,
    rating: i === 0 ? 5 : 4,
    justification: `reason ${i + 1}`,
  })),
  development: ['Leadership'],
  training: ['Oracle training'],
  remarks: { employee: 'meeting', appraiser: 'good' },
  formLanguage: 'English',
});

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  const addUser = (number, name) => {
    store.addEmployee({
      employeeNumber: number,
      fullName: name,
      email: `${number}@example.invalid`,
    });
    return store.addUser(number, { passwordHash: 'argon2-hash-placeholder' });
  };
  const hr = addUser('HR-1', 'Hana Example');
  const appraised = addUser('9001', 'Jordan Example');
  const noGrant = addUser('NONE', 'No Grant');
  const module = rbac.addModule('HR');
  const resource = rbac.addResource(module, 'PERFORMANCE_APPRAISALS');
  const permissions = Object.fromEntries(
    ['VIEW', 'CREATE', 'UPDATE', 'DELETE'].map((action) => [
      action,
      rbac.addPermission(resource, action),
    ]),
  );
  const role = rbac.addRole('PERFORMANCE_APPRAISAL_TEST');
  for (const permission of Object.values(permissions)) rbac.grant(role, permission);
  rbac.assign(hr, role);
  rbac.assign(appraised, role);
  const performanceAppraisalRepository = installPerformanceAppraisals(store);
  store.state.performanceAppraisals.hrUsers.push(hr.userId);
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      performanceAppraisalRepository,
    },
  });
  return { store, rbac, permissions, hr, appraised, noGrant, app };
}
const createAll = async (f, session) =>
  request(f.app)
    .post(BASE)
    .set('Cookie', session.cookie)
    .set('X-CSRF-Token', session.csrf)
    .send(body());

describe('performance appraisal API', () => {
  let f, hr, employee;
  beforeEach(async () => {
    f = setup();
    hr = await signIn(f.store, f.hr);
    employee = await signIn(f.store, f.appraised);
  });

  it('T-01/T-02/T-16 creates a 20-line bilingual appraisal with server-computed result and DML in one transaction', async () => {
    const res = await createAll(f, hr);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const state = f.store.state.performanceAppraisals;
    assert.equal(res.body.data.headerId, '1');
    assert.equal(state.headers[0].status, 'Inprocess');
    assert.equal(state.headers[0].result.rating, 4.05);
    assert.equal(state.headers[0].result.grade, 'B');
    assert.equal(state.ratings.length, 20);
    assert.equal(state.ratings[19].id, 20);
    assert.equal(state.ratings[0].name, 'Quality / Accuracy of Work');
    const arabic = body();
    arabic.formLanguage = 'Arabic';
    const duplicate = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(arabic);
    assert.equal(duplicate.status, 409);
    f.store.state.performanceAppraisals.headers[0].status = 'Rejected';
    const second = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(arabic);
    assert.equal(second.status, 201);
    assert.match(f.store.state.performanceAppraisals.ratings.at(-20).name, /جودة/);
  });

  it('T-03/T-17 rejects invalid payloads, invalid IDs, and unknown employee names', async () => {
    const bad = body();
    bad.criteria.pop();
    assert.equal(
      (
        await request(f.app)
          .post(BASE)
          .set('Cookie', hr.cookie)
          .set('X-CSRF-Token', hr.csrf)
          .send(bad)
      ).status,
      400,
    );
    const invalidYear = body();
    invalidYear.year = new Date().getFullYear() - 6;
    const yearResponse = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(invalidYear);
    assert.equal(yearResponse.body.error.code, 'YEAR_INVALID');
    const invalidRatings = body();
    invalidRatings.criteria[0].rating = 6;
    const ratingsResponse = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(invalidRatings);
    assert.equal(ratingsResponse.body.error.code, 'RATINGS_INVALID');
    const invalidDevelopment = body();
    invalidDevelopment.development[0] = '';
    const developmentResponse = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(invalidDevelopment);
    assert.equal(developmentResponse.body.error.code, 'DEVELOPMENT_REQUIRED');
    const invalidTraining = body();
    invalidTraining.training[0] = '';
    const trainingResponse = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(invalidTraining);
    assert.equal(trainingResponse.body.error.code, 'TRAINING_REQUIRED');
    const invalidEmployee = body();
    invalidEmployee.employee.name = 'Unknown Employee';
    const employeeResponse = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(invalidEmployee);
    assert.equal(employeeResponse.body.error.code, 'EMP_NOT_FOUND');
    assert.equal((await request(f.app).get(`${BASE}/01`).set('Cookie', hr.cookie)).status, 400);
    assert.equal(
      (await request(f.app).get(`${BASE}/lookups/employees/nope`).set('Cookie', hr.cookie)).status,
      404,
    );
    assert.equal((await request(f.app).get(BASE)).status, 401);
    const injection = await request(f.app)
      .get(`${BASE}/lookups/employees/x%27%20OR%20%271%27%3D%271`)
      .set('Cookie', hr.cookie);
    assert.equal(injection.status, 404);
  });

  it('T-04/T-05/T-06 reads all criteria, blocks Inprocess updates, and preserves server-owned fields on update', async () => {
    await createAll(f, hr);
    const detail = await request(f.app).get(`${BASE}/1`).set('Cookie', hr.cookie);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.criteria.length, 20);
    assert.equal(detail.body.data.criteria[0].id, '1');
    assert.equal(detail.body.data.development.length, 1);
    const update = body();
    assert.equal(
      (
        await request(f.app)
          .put(`${BASE}/1`)
          .set('Cookie', hr.cookie)
          .set('X-CSRF-Token', hr.csrf)
          .send(update)
      ).status,
      409,
    );
    const record = f.store.state.performanceAppraisals.headers[0];
    record.status = 'Approved';
    const before = {
      ...record.employee,
      period: record.period,
      status: record.status,
      createdBy: record.createdBy,
    };
    update.criteria[0].rating = 2;
    assert.equal(
      (
        await request(f.app)
          .put(`${BASE}/1`)
          .set('Cookie', hr.cookie)
          .set('X-CSRF-Token', hr.csrf)
          .send(update)
      ).status,
      200,
    );
    assert.deepEqual(
      {
        ...record.employee,
        period: record.period,
        status: record.status,
        createdBy: record.createdBy,
      },
      before,
    );
    assert.equal(record.result.rating, 3.9);
  });

  it('T-07 restricts employee remarks to the appraised employee and only changes that field', async () => {
    await createAll(f, hr);
    const denied = await request(f.app)
      .put(`${BASE}/1/employee-remarks`)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send({ remarks: 'no' });
    assert.equal(denied.status, 403);
    const before = structuredClone(f.store.state.performanceAppraisals.headers[0]);
    const ok = await request(f.app)
      .put(`${BASE}/1/employee-remarks`)
      .set('Cookie', employee.cookie)
      .set('X-CSRF-Token', employee.csrf)
      .send({ remarks: 'employee view' });
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    const after = f.store.state.performanceAppraisals.headers[0];
    assert.equal(after.remarks.employee, 'employee view');
    assert.equal(after.remarks.appraiser, before.remarks.appraiser);
    assert.equal(after.result.rating, before.result.rating);
  });

  it('T-08 deletes line rows and header transactionally and returns 404 on repeat', async () => {
    await createAll(f, hr);
    const del = () =>
      request(f.app).delete(`${BASE}/1`).set('Cookie', hr.cookie).set('X-CSRF-Token', hr.csrf);
    assert.equal((await del()).status, 200);
    assert.equal(f.store.state.performanceAppraisals.ratings.length, 0);
    assert.equal((await del()).status, 404);
  });

  it('T-09/T-10 lists by year, filters, pagination, and scopes non-HR records', async () => {
    await createAll(f, hr);
    const all = await request(f.app)
      .get(`${BASE}?year=${new Date().getFullYear()}&pageSize=1&sort=empName&order=asc`)
      .set('Cookie', hr.cookie);
    assert.equal(all.status, 200);
    assert.equal(all.body.pagination.total, 1);
    assert.equal(all.body.data.length, 1);
    const noHr = await request(f.app).get(BASE).set('Cookie', employee.cookie);
    assert.equal(noHr.body.pagination.total, 0);
    assert.equal(JSON.stringify(all.body).includes('PENDING_AT'), false);
  });

  it('T-11/T-12/T-13 serves lookups, duplicate checks, and grade stats', async () => {
    const employees = await request(f.app)
      .get(`${BASE}/lookups/employees`)
      .set('Cookie', hr.cookie);
    assert.equal(employees.status, 200);
    assert.equal(employees.body.data[0].name, 'Jordan Example');
    const details = await request(f.app)
      .get(`${BASE}/lookups/employees/Jordan%20Example`)
      .set('Cookie', hr.cookie);
    assert.equal(details.body.data.personId, '9001');
    assert.equal(
      (await request(f.app).get(`${BASE}/lookups/requestor`).set('Cookie', hr.cookie)).status,
      200,
    );
    const stats = await request(f.app).get(`${BASE}/lookups/grade-stats`).set('Cookie', hr.cookie);
    assert.equal(stats.body.data.quota.target.E, 1);
  });

  it('T-18 enforces missing permission, CSRF, and explicit DENY', async () => {
    const noGrant = await signIn(f.store, f.noGrant);
    assert.equal((await request(f.app).get(BASE).set('Cookie', noGrant.cookie)).status, 403);
    assert.equal(
      (await request(f.app).post(BASE).set('Cookie', hr.cookie).send(body())).status,
      403,
    );
    f.rbac.override(f.hr, f.permissions.CREATE, 'DENY');
    const denied = await createAll(f, hr);
    assert.equal(denied.status, 403);
  });

  it('rolls back insert, update, and delete transaction failures', async () => {
    f.store.state.performanceAppraisals.failAt = 'rating';
    const failedCreate = await createAll(f, hr);
    assert.equal(failedCreate.status, 500);
    assert.equal(f.store.state.performanceAppraisals.headers.length, 0);
    f.store.state.performanceAppraisals.failAt = null;
    await createAll(f, hr);
    f.store.state.performanceAppraisals.headers[0].status = 'Approved';
    f.store.state.performanceAppraisals.failAt = 'updateHeader';
    const failedUpdate = await request(f.app)
      .put(`${BASE}/1`)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(body());
    assert.equal(failedUpdate.status, 500);
    assert.equal(f.store.state.performanceAppraisals.headers[0].result.rating, 4.05);
    f.store.state.performanceAppraisals.failAt = 'delete';
    const failedDelete = await request(f.app)
      .delete(`${BASE}/1`)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf);
    assert.equal(failedDelete.status, 500);
    assert.equal(f.store.state.performanceAppraisals.headers.length, 1);
    assert.equal(f.store.state.performanceAppraisals.ratings.length, 20);
  });
});
