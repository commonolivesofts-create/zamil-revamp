import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installProbationEvaluations } from './helpers/probationEvaluationFakes.js';

const BASE = '/api/v1/hr/probation-evaluations';
// The legacy create form: form type, employee, joining date, evaluation period, optional ratings.
const BODY = {
  formType: 'Engineers_Staff',
  employeeNumber: 'E-STAFF',
  formDate: '2026-10-01',
  fromDate: '2026-04-01',
  toDate: '2026-09-30',
  lines: [{ rating: 4 }],
};
// The legacy edit form: Comments, Suggestion and every criterion's rating.
const edit = (lineIds, rating = 5) => ({
  comment: 'Good progress',
  comments: 'Keep going',
  lines: lineIds.map((lineId) => ({ lineId, rating })),
});

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

  installProbationEvaluations(store, { hrEmployeeNumbers: [hrUser.employeeNumber], identityStart });
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
  const headers = () => f.store.state.probationEvaluations.headers;
  const lines = () => f.store.state.probationEvaluations.lines;

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
      .send(edit(['1']));
    assert.equal(noCsrfUpdate.status, 403);
    const noCsrfDelete = await request(f.app).delete(`${BASE}/1`).set('Cookie', hr.cookie);
    assert.equal(noCsrfDelete.status, 403);
    f.rbac.override(f.hrUser, f.permissions.CREATE, 'DENY');
    forbidden(await send('post', '', hr, BODY), 'EXPLICIT_DENY');
    assert.equal(headers().length, 1);
  });

  it('creates with the criteria of the form type, reads, and saves the legacy edit fields', async () => {
    const created = await send('post', '', hr, BODY);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.headerId, '1');
    assert.ok(created.body.data.uuid);
    const [header] = headers();
    assert.equal(header.requestStatus, 'DRAFT');
    assert.equal(header.userName, 'Hana Example', 'prepared by: the signed-in user');
    assert.equal(header.employeeName, 'Sam Example', 'from the employee master');
    assert.equal(header.employeeNumber, 'E-STAFF');
    assert.equal(header.formDate, BODY.formDate);
    assert.equal(header.comment, '-', 'Comments are read only on the legacy create form');
    assert.equal(header.comments, '-');
    assert.equal(header.totalRating, 4);
    assert.equal(lines().length, 20, 'the 20 criteria of the form type');
    assert.equal(lines()[0].param, 'Criterion 1');
    assert.equal(lines()[0].rating, 4);
    assert.ok(
      lines()
        .slice(1)
        .every((line) => line.rating === 0),
    );

    const detail = await get('/1');
    assert.equal(detail.status, 200, JSON.stringify(detail.body));
    assert.equal(detail.body.data.lines.length, 20);
    assert.equal(detail.body.data.formDate, BODY.formDate);
    assert.equal(detail.body.data.preparedBy, 'Hana Example');
    assert.equal(detail.body.data.evaluationResult, 'NOT_ACCEPTABLE');

    const ids = detail.body.data.lines.map((line) => line.lineId);
    const update = await send('put', '/1', hr, {
      ...edit(ids),
      employeeNumber: 'E-NONE',
      formType: 'Trainee',
    });
    assert.equal(update.status, 200, JSON.stringify(update.body));
    assert.deepEqual(update.body.data, { headerId: '1' });
    assert.equal(header.comment, 'Good progress');
    assert.equal(header.comments, 'Keep going');
    assert.equal(header.totalRating, 100);
    assert.equal(header.employeeNumber, 'E-STAFF', 'the edit form saves no other header field');
    assert.equal(header.formType, 'Engineers_Staff');
    assert.equal(header.requestStatus, 'DRAFT');
    assert.ok(lines().every((line) => line.rating === 5 && line.param.startsWith('Criterion')));
  });

  it('rejects invalid bodies, unknown fields, IDs and reversed dates', async () => {
    const invalid = await send('post', '', hr, { ...BODY, formType: 'unknown' });
    assert.equal(invalid.status, 400);
    assert.equal(invalid.body.error.code, 'VALIDATION_ERROR');
    assert.equal((await send('post', '', hr, { ...BODY, requestStatus: 'APPROVED' })).status, 400);
    assert.equal((await get('/01')).status, 400);
    assert.equal((await send('post', '', hr, { ...BODY, fromDate: '2026-10-01' })).status, 400);
    assert.equal((await send('post', '', hr, { ...BODY, lines: [{ rating: 6 }] })).status, 400);
    assert.equal(headers().length, 0);
  });

  it('accepts only an employee of the legacy select (the reporting hierarchy)', async () => {
    const self = await send('post', '', hr, { ...BODY, employeeNumber: 'E-HR' });
    assert.equal(self.status, 403, JSON.stringify(self.body));
    const unknown = await send('post', '', hr, { ...BODY, employeeNumber: 'E-OTHER' });
    assert.equal(unknown.status, 403);
    assert.equal(headers().length, 0);
  });

  it('refuses a form type whose criteria are not available', async () => {
    const response = await send('post', '', hr, { ...BODY, formType: 'Trainee' });
    assert.equal(response.status, 422, JSON.stringify(response.body));
    assert.equal(response.body.error.code, 'PROBATION_CRITERIA_UNAVAILABLE');
    assert.equal(headers().length, 0);
  });

  it('returns 404 for missing headers and 400 unless every stored line is rated', async () => {
    assert.equal((await get('/999')).status, 404);
    assert.equal((await send('put', '/999', hr, edit(['1']))).status, 404);
    f.store.seedProbationEvaluation({}, [{}, {}]);
    const other = await send('put', '/1', hr, edit(['1', '99']));
    assert.equal(other.status, 400, JSON.stringify(other.body));
    const missing = await send('put', '/1', hr, edit(['1']));
    assert.equal(missing.status, 400);
    assert.equal(headers()[0].comment, '-');
  });

  it('deletes drafts and refuses non-drafts', async () => {
    f.store.seedProbationEvaluation({}, [{ lineId: '1' }]);
    const deleted = await send('delete', '/1', hr);
    assert.equal(deleted.status, 200);
    assert.deepEqual(deleted.body.data, { headerId: '1', deleted: true });
    f.store.seedProbationEvaluation({ requestStatus: 'APPROVED' }, [{ lineId: '1' }]);
    const conflict = await send('delete', '/1', hr);
    assert.equal(conflict.status, 409);
    assert.equal(headers().length, 1);
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
      pendingAt: 'Approver Example',
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
      filtered.body.data.map((item) => [item.headerId, item.pendingAt]),
      [['11', 'Approver Example']],
    );
    assert.equal((await get('?pageSize=101')).status, 400);
    assert.equal((await get('?sortBy=CREATED_BY')).status, 400);
  });

  it('serves the PAF lookup endpoints', async () => {
    assert.deepEqual((await get('/lookups/form-types')).body.data.formTypes.length, 5);
    const criteria = await get('/lookups/criteria?formType=Engineers_Staff');
    assert.equal(criteria.status, 200);
    assert.equal(criteria.body.data.formType, 'Engineers_Staff');
    assert.equal(criteria.body.data.criteria.length, 20);
    assert.deepEqual(criteria.body.data.criteria[0], { param: 'Criterion 1', paramAr: 'معيار 1' });
    assert.deepEqual((await get('/lookups/criteria?formType=Trainee')).body.data.criteria, []);
    assert.equal((await get('/lookups/criteria?formType=unknown')).status, 400);
    assert.equal((await get('/lookups/criteria')).status, 400);
    // The hierarchy starts at the signed-in user's employee number (not the app user ID).
    const employees = await get('/lookups/employees');
    assert.equal(employees.status, 200);
    assert.deepEqual(employees.body.data.map((item) => item.fullName).sort(), [
      'Nora Example',
      'Sam Example',
    ]);
    assert.ok(employees.body.data.every((item) => item.employeeNumber));
    const searched = await get('/lookups/employees?search=sam');
    assert.deepEqual(
      searched.body.data.map((item) => item.employeeNumber),
      [f.staffUser.employeeNumber],
    );
    assert.deepEqual(f.store.state.probationEmployeeQueries.at(-1), {
      employeeNumber: f.hrUser.employeeNumber,
      search: 'sam',
    });
    assert.equal((await get('/lookups/employees?other=1')).status, 400);
    assert.equal((await get(`/lookups/employees?search=${'x'.repeat(101)}`)).status, 400);
    assert.equal(
      (await get('/lookups/requestor')).body.data.employeeNumber,
      f.hrUser.employeeNumber,
    );
    const details = await get('/lookups/employee-details?empName=Sam%20Example');
    assert.equal(details.status, 200);
    assert.equal(details.body.data.ids.employeeNumber, f.staffUser.employeeNumber);
    // Only the employees the legacy select offers.
    const outside = await get('/lookups/employee-details?empName=Hana%20Example');
    assert.equal(outside.status, 403);
  });

  it('rolls back partial insert, update, and delete transactions', async () => {
    f.store.failures.probationInsertAfterLine = true;
    assert.equal((await send('post', '', hr, BODY)).status, 500);
    assert.equal(headers().length, 0);
    f.store.failures.probationInsertAfterLine = false;

    f.store.seedProbationEvaluation({}, [{ lineId: '1' }]);
    f.store.failures.probationUpdateAfterLine = true;
    assert.equal((await send('put', '/1', hr, edit(['1']))).status, 500);
    assert.equal(headers()[0].comment, '-');
    assert.equal(lines()[0].rating, 4);
    f.store.failures.probationUpdateAfterLine = false;

    f.store.failures.probationDeleteAfterLines = true;
    assert.equal((await send('delete', '/1', hr)).status, 500);
    assert.equal(headers().length, 1);
    assert.equal(lines().length, 1);
  });
});

describe('probation evaluation record access, status guard and audit', () => {
  let f;
  let hr;
  let editor;
  let editorUser;
  beforeEach(async () => {
    f = setup();
    // A non-HR user who may view and update (but is not HR in the XXZP_HR lookup).
    f.store.addEmployee({
      employeeNumber: 'E-EDIT',
      fullName: 'Eli Example',
      email: 'e-edit@example.invalid',
    });
    editorUser = f.store.addUser('E-EDIT', { passwordHash: 'argon2-hash-placeholder' });
    const role = f.rbac.addRole('PAF_EDITOR_TEST');
    f.rbac.grant(role, f.permissions.VIEW);
    f.rbac.grant(role, f.permissions.UPDATE);
    f.rbac.grant(role, f.permissions.DELETE);
    f.rbac.assign(editorUser, role);
    hr = await signIn(f.store, f.hrUser);
    editor = await signIn(f.store, editorUser);
  });
  const update = edit(['1']);
  const call = (method, path, session, body) => {
    const req = request(f.app)[method](`${BASE}${path}`).set('Cookie', session.cookie);
    if (method !== 'get') req.set('X-CSRF-Token', session.csrf);
    return body === undefined ? req : req.send(body);
  };
  const isForbidden = (response) => {
    assert.equal(response.status, 403, JSON.stringify(response.body));
    assert.equal(response.body.success, false);
    assert.equal(response.body.error.code, 'FORBIDDEN');
  };
  const header = () => f.store.state.probationEvaluations.headers[0];

  it("returns 403 for another user's record by ID on read, update and delete", async () => {
    const id = f.store.seedProbationEvaluation({}, [{ lineId: '1' }]);
    isForbidden(await call('get', `/${id}`, editor));
    isForbidden(await call('put', `/${id}`, editor, update));
    isForbidden(await call('delete', `/${id}`, editor));
    assert.equal(header().comment, '-');
    assert.equal((await call('get', `/${id}`, hr)).status, 200, 'HR users keep access');
    assert.equal((await call('get', '/999', editor)).status, 404, 'unknown IDs stay 404');
  });

  it('allows the owner and same-department users holding VIEW', async () => {
    const own = f.store.seedProbationEvaluation({ createdBy: editorUser.userId }, [{}]);
    assert.equal((await call('get', `/${own}`, editor)).status, 200);
    const other = f.store.seedProbationEvaluation({ employeeNumber: 'T-2002' }, [{}]);
    f.store.state.probationDepartments = { 'E-EDIT': '20', 'T-2002': '20' };
    assert.equal((await call('get', `/${other}`, editor)).status, 200);
    f.rbac.override(editorUser, f.permissions.VIEW, 'DENY');
    isForbidden(await call('put', `/${other}`, editor, edit(['2'])));
  });

  for (const status of ['INPROCESS', 'APPROVED']) {
    it(`keeps ${status} evaluations read only (409)`, async () => {
      const id = f.store.seedProbationEvaluation({ requestStatus: status }, [{}]);
      const response = await call('put', `/${id}`, hr, update);
      assert.equal(response.status, 409, JSON.stringify(response.body));
      assert.equal(response.body.error.code, 'PROBATION_EVALUATION_NOT_DRAFT');
      assert.equal(header().comment, '-');
      assert.equal(header().updatedBy, undefined);
    });
  }

  it('lets the preparer correct a REJECTED evaluation without changing its status', async () => {
    const id = f.store.seedProbationEvaluation({ requestStatus: 'REJECTED' }, [{}]);
    const response = await call('put', `/${id}`, hr, update);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(header().requestStatus, 'REJECTED');
    assert.equal(header().comment, 'Good progress');
  });

  it('records UPDATED_BY and UPDATED_AT on update', async () => {
    const id = f.store.seedProbationEvaluation({}, [{}]);
    const response = await call('put', `/${id}`, hr, update);
    assert.equal(response.status, 200, JSON.stringify(response.body));
    assert.equal(header().updatedBy, f.hrUser.userId);
    assert.equal(header().updatedAt, 'SYSDATE');
  });
});

describe('probation evaluation IDs come from the identity columns', () => {
  it('creates an evaluation when the identity is above MAX(HEADER_ID) and sends no LINE_ID', async () => {
    const f = setup({ identityStart: 1040 });
    f.store.seedProbationEvaluation({ headerId: '1023' }, [{}]);
    const hr = await signIn(f.store, f.hrUser);
    const created = await request(f.app)
      .post(BASE)
      .set('Cookie', hr.cookie)
      .set('X-CSRF-Token', hr.csrf)
      .send(BODY);
    assert.equal(created.status, 201, JSON.stringify(created.body));
    assert.equal(created.body.data.headerId, '1040');
    const lines = f.store.state.probationEvaluations.lines.filter((l) => l.headerId === '1040');
    assert.deepEqual(
      lines.map((line) => line.lineId),
      Array.from({ length: 20 }, (_, index) => String(1040 + index)),
    );
  });
});
