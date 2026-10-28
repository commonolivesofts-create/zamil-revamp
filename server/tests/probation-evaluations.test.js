import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installProbationEvaluations } from './helpers/probationEvaluationFakes.js';

const BASE = '/api/v1/hr/probation-evaluations';
const BODY = {
  formDate: '2026-10-01',
  evaluationPeriod: 'Probation period',
  formType: 'Engineers_Staff',
  employeeName: 'Taylor Example',
  employeeNumber: 'E-2001',
  empId: 'P-2001',
  grade: 5,
  jobTitle: 'Engineer',
  department: 'Engineering',
  fromDate: '2026-04-01',
  toDate: '2026-09-30',
  comment: 'Good progress',
  totalRating: 4,
  lines: [{ param: 'Quality of work', paramAr: 'جودة العمل', rating: 4 }],
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
  const resource = rbac.addResource(module, 'PROBATION_EVALUATIONS');
  const permissions = Object.fromEntries(
    ['VIEW', 'CREATE', 'UPDATE', 'DELETE'].map((action) => [
      action,
      rbac.addPermission(resource, action),
    ]),
  );
  const hrRole = rbac.addRole('PAF_HR_TEST');
  for (const permission of Object.values(permissions)) rbac.grant(hrRole, permission);
  rbac.assign(hrUser, hrRole);
  const staffRole = rbac.addRole('PAF_STAFF_TEST');
  rbac.grant(staffRole, permissions.VIEW);
  rbac.grant(staffRole, permissions.CREATE);
  rbac.assign(staffUser, staffRole);

  installProbationEvaluations(store, { hrEmployeeNumbers: [hrUser.employeeNumber] });
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      probationEvaluationRepository: store.probationEvaluationRepository,
    },
  });
  return { store, rbac, permissions, hrUser, staffUser, nobody, app };
}

describe('probation evaluation API', () => {
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
  const forbidden = (res, reason) => {
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal(f.store.auditEvents('ACCESS_DENIED').at(-1).reasonCode, reason);
  };

  it('rejects unauthenticated requests and denies missing permission by default', async () => {
    assert.equal((await request(f.app).get(BASE)).status, 401);
    forbidden(await get('', nobody), 'NO_GRANT');
    forbidden(await send('post', '', nobody, BODY), 'NO_GRANT');
  });

  it('requires CSRF for writes and honors explicit DENY overrides', async () => {
    const noCsrf = await request(f.app).post(BASE).set('Cookie', hr.cookie).send(BODY);
    assert.equal(noCsrf.status, 403);
    assert.equal(noCsrf.body.error.code, 'CSRF_REJECTED');
    f.store.seedProbationEvaluation({}, [{ lineId: '1' }]);
    const noCsrfUpdate = await request(f.app)
      .put(`${BASE}/1`)
      .set('Cookie', hr.cookie)
      .send({ ...BODY, lines: [{ ...BODY.lines[0], lineId: '1' }] });
    assert.equal(noCsrfUpdate.status, 403);
    const noCsrfDelete = await request(f.app).delete(`${BASE}/1`).set('Cookie', hr.cookie);
    assert.equal(noCsrfDelete.status, 403);
    f.rbac.override(f.hrUser, f.permissions.CREATE, 'DENY');
    forbidden(await send('post', '', hr, BODY), 'EXPLICIT_DENY');
    assert.equal(f.store.state.probationEvaluations.headers.length, 1);
  });

  it('creates, reads, and updates a header and its lines', async () => {
    const created = await send('post', '', hr, BODY);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.headerId, '1');
    assert.ok(created.body.data.uuid);
    assert.equal(f.store.state.probationEvaluations.headers[0].requestStatus, 'DRAFT');
    assert.equal(
      f.store.state.probationEvaluations.headers[0].userName,
      f.store.state.employees.find(
        (employee) => employee.employeeNumber === f.hrUser.employeeNumber,
      ).fullName,
    );
    assert.equal(f.store.state.probationEvaluations.lines.length, 1);

    const detail = await get('/1');
    assert.ok(detail.status === 200, JSON.stringify(detail.body));
    assert.deepEqual(
      detail.body.data.lines.map((line) => line.lineId),
      ['1'],
    );
    assert.equal(detail.body.data.formDate, BODY.formDate);

    const update = await send('put', '/1', hr, {
      ...BODY,
      employeeName: 'Taylor Updated',
      lines: [{ ...BODY.lines[0], lineId: '1', rating: 5 }],
    });
    assert.ok(update.status === 200, JSON.stringify(update.body));
    assert.deepEqual(update.body.data, { headerId: '1' });
    const saved = f.store.state.probationEvaluations.headers[0];
    assert.equal(saved.employeeName, 'Taylor Updated');
    assert.equal(saved.requestStatus, 'DRAFT');
    assert.equal(
      saved.userName,
      f.store.state.employees.find(
        (employee) => employee.employeeNumber === f.hrUser.employeeNumber,
      ).fullName,
    );
    assert.equal(f.store.state.probationEvaluations.lines[0].rating, 5);
  });

  it('rejects invalid bodies, unknown fields, IDs, and reversed dates', async () => {
    const invalid = await send('post', '', hr, { ...BODY, formType: 'unknown' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
    const unknown = await send('post', '', hr, { ...BODY, requestStatus: 'APPROVED' });
    assert.equal(unknown.status, 400);
    const badId = await get('/01');
    assert.equal(badId.status, 400);
    const reversed = await send('post', '', hr, { ...BODY, fromDate: '2026-10-01' });
    assert.equal(reversed.status, 400);
  });

  it('returns 404 for missing headers or lines', async () => {
    assert.equal((await get('/999')).status, 404);
    f.store.seedProbationEvaluation({}, [{ lineId: '9' }]);
    const update = await send('put', '/1', hr, {
      ...BODY,
      lines: [{ ...BODY.lines[0], lineId: '99' }],
    });
    assert.equal(update.status, 404);
  });

  it('deletes drafts and refuses non-drafts', async () => {
    f.store.seedProbationEvaluation({}, [{ lineId: '1' }]);
    const deleted = await send('delete', '/1', hr);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body.data, { headerId: '1', deleted: true });
    f.store.seedProbationEvaluation({ requestStatus: 'APPROVED' }, [{ lineId: '1' }]);
    const conflict = await send('delete', '/1', hr);
    assert.equal(conflict.status, 409);
    assert.equal(f.store.state.probationEvaluations.headers.length, 1);
  });

  it('paginates, filters, sorts, and scopes listing by trusted actor', async () => {
    f.store.seedProbationEvaluation({
      headerId: '10',
      employeeName: 'Hana One',
      createdBy: f.hrUser.userId,
    });
    f.store.seedProbationEvaluation({
      headerId: '11',
      employeeName: 'Hana Two',
      createdBy: f.hrUser.userId,
    });
    f.store.seedProbationEvaluation({
      headerId: '12',
      employeeName: 'Sam Only',
      createdBy: f.staffUser.userId,
    });
    const page = await get('?page=1&pageSize=1&sortBy=HEADER_ID&sortDir=asc');
    assert.equal(page.status, 200);
    assert.equal(page.body.pagination.total, 3);
    assert.deepEqual(
      page.body.data.map((item) => item.headerId),
      ['10'],
    );
    const ownRows = await get('', staff);
    assert.deepEqual(
      ownRows.body.data.map((item) => item.headerId),
      ['12'],
    );
    const filtered = await get('?search=two&requestStatus=DRAFT');
    assert.deepEqual(
      filtered.body.data.map((item) => item.headerId),
      ['11'],
    );
    const tooLarge = await get('?pageSize=101');
    assert.equal(tooLarge.status, 400);
    const unknownSort = await get('?sortBy=CREATED_BY');
    assert.equal(unknownSort.status, 400);
  });

  it('serves the PAF lookup endpoints', async () => {
    assert.deepEqual((await get('/lookups/form-types')).body.data.formTypes.length, 5);
    assert.equal((await get('/lookups/employees')).status, 200);
    assert.equal(
      (await get('/lookups/requestor')).body.data.employeeNumber,
      f.hrUser.employeeNumber,
    );
    const details = await get('/lookups/employee-details?empName=Hana%20Example');
    assert.equal(details.status, 200);
    assert.equal(details.body.data.ids.employeeNumber, f.hrUser.employeeNumber);
  });

  it('rolls back partial insert, update, and delete transactions', async () => {
    f.store.failures.probationInsertAfterLine = true;
    assert.equal((await send('post', '', hr, BODY)).status, 500);
    assert.equal(f.store.state.probationEvaluations.headers.length, 0);
    f.store.failures.probationInsertAfterLine = false;

    f.store.seedProbationEvaluation({}, [{ lineId: '1' }]);
    f.store.failures.probationUpdateAfterLine = true;
    assert.equal(
      (
        await send('put', '/1', hr, {
          ...BODY,
          employeeName: 'Changed',
          lines: [{ ...BODY.lines[0], lineId: '1' }],
        })
      ).status,
      500,
    );
    assert.equal(f.store.state.probationEvaluations.headers[0].employeeName, 'Test Employee');
    f.store.failures.probationUpdateAfterLine = false;

    f.store.failures.probationDeleteAfterLines = true;
    assert.equal((await send('delete', '/1', hr)).status, 500);
    assert.equal(f.store.state.probationEvaluations.headers.length, 1);
    assert.equal(f.store.state.probationEvaluations.lines.length, 1);
  });
});
