'use strict';

/*
 * Personal Requisition Form CRUD API tests (README_personal_requisition_form.md).
 *
 * Contract under test: INSERT / READ / UPDATE / DELETE / LISTING WITH FILTERS, the attachment
 * sub-routes and the six lookups, through the real Express app, guards, multer parsing and Joi
 * validation, with an in-memory repository double injected through `requisitionRepository` and
 * a memory storage double through `requisitionStorage`. SQL itself is not exercised here; a
 * read-only verification script against TEST (pattern of scripts/verify-auth-sql.js) is listed
 * as a follow-up before merge.
 */

import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';

import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installRequisitions } from './helpers/requisitionFakes.js';
import { createApp } from '../src/app.js';

const BASE = '/api/v1/hr/requisitions';

/** Full valid JSON payload for POST (README §3.2); omitted fields exercise the §9 defaults. */
const BODY = {
  requestDate: '2026-10-25',
  jobName: 'Machine Operator',
  deptName: 'Production',
  dateNeeded: '2026-11-15',
  reasonOfReq: 'Addition',
  reason: 'New headcount for the line',
};

/** The same payload as multipart form fields (insert/update also accept multipart). */
const asForm = (req, body = BODY) => {
  for (const [key, value] of Object.entries(body)) req.field(key, String(value));
  return req;
};

// PUT never carries requestDate (README §5.1: REQUEST_DATE is frozen).
const PUT_BODY = Object.fromEntries(Object.entries(BODY).filter(([key]) => key !== 'requestDate'));

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });

  const person = (employeeNumber, fullName) => {
    store.addEmployee({ employeeNumber, username: `user.${employeeNumber}`, fullName });
    return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
  };
  const hrUser = person('1001', 'Hala HR');
  const managerUser = person('2001', 'Mona Manager');
  const staffUser = person('2002', 'Sam Staff');
  const strangerUser = person('3001', 'Nada None');
  const nobody = person('4001', 'Noor Nobody');

  // Mirrors the owner-registered Oracle catalogue (module REQUISITIONS, resource REQUISITIONS);
  // in memory.
  const requisitionsModule = rbac.addModule('REQUISITIONS');
  const requisitions = rbac.addResource(requisitionsModule, 'REQUISITIONS');
  const permissions = {
    VIEW: rbac.addPermission(requisitions, 'VIEW'),
    CREATE: rbac.addPermission(requisitions, 'CREATE'),
    UPDATE: rbac.addPermission(requisitions, 'UPDATE'),
    DELETE: rbac.addPermission(requisitions, 'DELETE'),
    MANAGE_ATTACHMENTS: rbac.addPermission(requisitions, 'MANAGE_ATTACHMENTS'),
  };

  const hrRole = rbac.addRole('REQUISITION_HR');
  for (const permission of Object.values(permissions)) rbac.grant(hrRole, permission);
  rbac.assign(hrUser, hrRole);

  const managerRole = rbac.addRole('REQUISITION_MANAGER');
  for (const action of ['VIEW', 'CREATE', 'UPDATE', 'DELETE']) {
    rbac.grant(managerRole, permissions[action]);
  }
  rbac.assign(managerUser, managerRole);

  const staffRole = rbac.addRole('REQUISITION_STAFF');
  rbac.grant(staffRole, permissions.VIEW);
  rbac.grant(staffRole, permissions.CREATE);
  rbac.assign(staffUser, staffRole);

  installRequisitions(store, {
    hrUserIds: [hrUser.userId],
    empMaster: [
      {
        userId: hrUser.userId,
        employeeNumber: '1001',
        fullName: 'Hala HR',
        supervisorName: 'Big Boss',
        jobId: '40',
        jobTitle: 'HR Officer',
        basicSalary: 15000,
        emailAddress: 'hala@example.com',
      },
      {
        userId: managerUser.userId,
        employeeNumber: '2001',
        fullName: 'Mona Manager',
        supervisorName: null,
        jobId: '20',
        jobTitle: 'Production Manager',
        basicSalary: 20000,
        emailAddress: 'mona@example.com',
      },
      {
        userId: staffUser.userId,
        employeeNumber: '2002',
        fullName: 'Sam Staff',
        supervisorName: 'Mona Manager',
        jobId: '10',
        jobTitle: 'Machine Operator',
        basicSalary: 8000,
        emailAddress: 'sam@example.com',
      },
      {
        userId: strangerUser.userId,
        employeeNumber: '3001',
        fullName: 'Nada None',
        supervisorName: 'Someone Else',
        jobId: '30',
        jobTitle: 'Warehouse Supervisor',
        basicSalary: 9000,
        emailAddress: 'nada@example.com',
      },
    ],
    deptMaster: [
      { orgId: 55, name: 'Production' },
      { orgId: 70, name: 'Warehouse' },
    ],
  });

  // Same wiring as createTestApp, plus the requisition repository and storage doubles.
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      requisitionRepository: store.requisitionRepository,
      requisitionStorage: store.requisitionStorage,
    },
  });

  return {
    store,
    rbac,
    permissions,
    hrUser,
    managerUser,
    staffUser,
    strangerUser,
    nobody,
    app,
    seedRequisition: store.seedRequisition,
  };
}

describe('requisition API', () => {
  let f;
  let hr; // session of the HR user (all five actions)
  let manager; // non-HR (VIEW/CREATE/UPDATE/DELETE; supervises Sam Staff)
  let staff; // non-HR (VIEW/CREATE only)
  let anonymous; // authenticated user with no grants

  beforeEach(async () => {
    f = setup();
    hr = await signIn(f.store, f.hrUser);
    manager = await signIn(f.store, f.managerUser);
    staff = await signIn(f.store, f.staffUser);
    anonymous = await signIn(f.store, f.nobody);
  });

  const get = (path, session = hr) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);
  const send = (method, path, session = hr, body) => {
    const req = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body === undefined ? req : req.send(body);
  };
  const upload = (method, path, session = hr) =>
    request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
  const audits = (code) => f.store.auditEvents(code);
  const assertForbidden = (res, reasonCode) => {
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'FORBIDDEN');
    assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, reasonCode);
  };

  describe('access control', () => {
    it('rejects unauthenticated callers with 401 on every verb', async () => {
      assert.equal((await request(f.app).get(BASE)).status, 401);
      assert.equal((await request(f.app).get(`${BASE}/100000`)).status, 401);
      assert.equal((await request(f.app).post(BASE).send(BODY)).status, 401);
      assert.equal((await request(f.app).put(`${BASE}/100000`).send(BODY)).status, 401);
      assert.equal((await request(f.app).delete(`${BASE}/100000`)).status, 401);
      assert.equal((await request(f.app).post(`${BASE}/100000/attachments`)).status, 401);
      assert.equal((await request(f.app).delete(`${BASE}/100000/attachments/1`)).status, 401);
      assert.equal((await request(f.app).get(`${BASE}/lookups/job-titles`)).status, 401);
      assert.equal((await request(f.app).get(`${BASE}/lookups/filter-options`)).status, 401);
    });

    it('denies a user without the permission (default deny) with 403 and audits NO_GRANT', async () => {
      assertForbidden(await get('/', anonymous), 'NO_GRANT');
      assertForbidden(await send('post', '/', anonymous, BODY), 'NO_GRANT');
    });

    it('lets an explicit DENY override a role grant on CREATE', async () => {
      f.rbac.override(f.staffUser, f.permissions.CREATE, 'DENY');
      assertForbidden(await send('post', '/', staff, BODY), 'EXPLICIT_DENY');
      assert.equal(f.store.state.requisitionForm.headers.length, 0);
    });

    it('requires the CSRF token on every unsafe method', async () => {
      const noCsrf = (method, path) =>
        request(f.app)[method](`${BASE}${path}`).set('Cookie', hr.cookie);
      for (const [method, path] of [
        ['post', '/'],
        ['put', '/100000'],
        ['delete', '/100000'],
        ['post', '/100000/attachments'],
        ['delete', '/100000/attachments/1'],
      ]) {
        const res = await noCsrf(method, path);
        assert.equal(res.status, 403, `${method} ${path}`);
        assert.equal(res.body.error.code, 'CSRF_REJECTED');
      }
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'CSRF_TOKEN_MISSING');
    });
  });

  describe('insert (POST /)', () => {
    it('creates a Draft with server-set requestor, defaults and no literal nulls', async () => {
      const res = await send('post', '/', staff, BODY);
      assert.equal(res.status, 201, JSON.stringify(res.body));
      assert.equal(res.body.data.requisitionId, '100000');
      assert.equal(res.body.data.requisitionNumber, '100000');

      const read = await get('/100000', staff);
      assert.equal(read.status, 200);
      const data = read.body.data;
      assert.equal(data.requisitionStatus, 'Draft'); // the only status this API writes (§11)
      assert.equal(data.requesterName, 'Sam Staff'); // server-set from the employee master (§3.2)
      assert.equal(data.requestedBy, '2002');
      assert.equal(data.createdBy, f.staffUser.userId);
      assert.equal(data.requestDate, '25-Oct-26'); // stored legacy form (§3.1)
      assert.equal(data.dateNeeded, '15-Nov-26');
      assert.equal(data.budgeted, 'N');
      assert.equal(data.budgetedSal, 0);
      assert.equal(data.gccExp, '0 - 2');
      assert.equal(data.skills, null); // the legacy literal 'null' quirk is not reproduced (§9)
      assert.equal(data.ticketStatus, '');
      assert.deepEqual(data.attachments, []);
    });

    it('requires replacementFor for Replacement and reason for Addition', async () => {
      const replacement = { ...BODY, reasonOfReq: 'Replacement' };
      delete replacement.reason;
      const res = await send('post', '/', hr, replacement);
      assert.equal(res.status, 400);
      assert.equal(res.body.error.code, 'VALIDATION_ERROR');

      const addition = { ...BODY, reasonOfReq: 'Addition' };
      delete addition.reason;
      assert.equal((await send('post', '/', hr, addition)).status, 400);
    });

    it('rejects unknown body fields and invalid enums', async () => {
      assert.equal((await send('post', '/', hr, { ...BODY, status: 'Approved' })).status, 400);
      assert.equal((await send('post', '/', hr, { ...BODY, budgeted: 'X' })).status, 400);
      assert.equal(
        (await send('post', '/', hr, { ...BODY, requestDate: 'yesterday' })).status,
        400,
      );
    });

    it('lets HR set ticketStatus and stamps the derived dates', async () => {
      const res = await send('post', '/', hr, { ...BODY, ticketStatus: 'Accepted' });
      assert.equal(res.status, 201, JSON.stringify(res.body));
      const { body } = await get(`/${res.body.data.requisitionId}`, hr);
      const { data } = body;
      assert.equal(data.ticketStatus, 'Accepted');
      assert.equal(data.acceptedDate, '19-Oct-26'); // store clock: 2026-10-19
      assert.equal(data.closedDate, null);
    });

    it('refuses a non-empty ticketStatus from a non-HR caller with 400', async () => {
      const res = await send('post', '/', staff, { ...BODY, ticketStatus: 'Open' });
      assert.equal(res.status, 400);
      assert.equal(res.body.error.details[0].field, 'ticketStatus');
      // An explicitly empty value is fine and stores NULL.
      assert.equal((await send('post', '/', staff, { ...BODY, ticketStatus: '' })).status, 201);
    });

    it('accepts a multipart insert with files, writing rows and bytes together', async () => {
      const res = await asForm(upload('post', '/', staff))
        .attach('files', Buffer.from('%PDF-1.4 cv'), 'cv.pdf')
        .attach('files', Buffer.from('%PDF-1.4 cert'), 'cert.pdf');
      assert.equal(res.status, 201, JSON.stringify(res.body));

      const { body } = await get(`/${res.body.data.requisitionId}`, staff);
      assert.deepEqual(
        body.data.attachments.map((a) => a.fileName),
        ['cv.pdf', 'cert.pdf'],
      );
      assert.equal(f.store.requisitionStorage.inventory.length, 2);
    });

    it('rejects disallowed extensions and excess file counts with 400', async () => {
      const bad = await asForm(upload('post', '/', staff)).attach(
        'files',
        Buffer.from('MZ'),
        'malware.exe',
      );
      assert.equal(bad.status, 400);
      assert.equal(bad.body.error.details[0].field, 'files');

      let tooMany = upload('post', '/', staff);
      for (let index = 1; index <= 11; index += 1) {
        tooMany = tooMany.attach('files', Buffer.from('x'), `file${index}.pdf`);
      }
      assert.equal((await asForm(tooMany)).status, 400);
      assert.equal(f.store.state.requisitionForm.headers.length, 0);
    });

    it('rolls the header back when a physical file write fails mid-transaction', async () => {
      f.store.requisitionStorage.failures.save = 2; // first file lands, second fails
      const res = await asForm(upload('post', '/', staff))
        .attach('files', Buffer.from('one'), 'one.pdf')
        .attach('files', Buffer.from('two'), 'two.pdf');
      assert.equal(res.status, 500);
      assert.equal(f.store.state.requisitionForm.headers.length, 0); // rolled back
      assert.equal(f.store.state.requisitionForm.attachments.length, 0);
      assert.equal(f.store.requisitionStorage.inventory.length, 0); // compensated
    });
  });

  describe('read (GET /:requisitionId)', () => {
    it('returns the header with its attachments and empty array when none', async () => {
      const id = f.seedRequisition({ createdBy: f.hrUser.userId, attachments: ['cv.pdf'] });
      const res = await get(`/${id}`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.requisitionId, id);
      assert.deepEqual(
        res.body.data.attachments.map((a) => a.fileName),
        ['cv.pdf'],
      );
    });

    it('applies §7.4 scope for non-HR callers: own and supervised rows only', async () => {
      const own = f.seedRequisition({ createdBy: f.managerUser.userId });
      const supervised = f.seedRequisition({ createdBy: f.staffUser.userId });
      const hidden = f.seedRequisition({ createdBy: f.strangerUser.userId });

      assert.equal((await get(`/${own}`, manager)).status, 200);
      assert.equal((await get(`/${supervised}`, manager)).status, 200); // Sam reports to Mona
      assert.equal((await get(`/${hidden}`, manager)).status, 404); // out of scope looks like 404
      assert.equal((await get(`/${hidden}`, hr)).status, 200); // HR sees everything
    });

    it('returns 404 for unknown ids and 400 for malformed ones', async () => {
      assert.equal((await get('/999999')).status, 404);
      for (const badId of ['abc', '0', '01', '100000000000000000000']) {
        assert.equal((await get(`/${badId}`)).status, 400, badId);
      }
    });
  });

  describe('listing (GET /)', () => {
    it('scopes the listing for non-HR callers and lets HR see everything', async () => {
      f.seedRequisition({ createdBy: f.managerUser.userId, jobName: 'A' });
      f.seedRequisition({ createdBy: f.staffUser.userId, jobName: 'B' });
      f.seedRequisition({ createdBy: f.strangerUser.userId, jobName: 'C' });
      f.seedRequisition({ createdBy: f.hrUser.userId, jobName: 'D' });

      const asManager = await get('/', manager);
      assert.deepEqual(asManager.body.data.map((row) => row.jobName).sort(), ['A', 'B']);
      assert.equal(asManager.body.pagination.total, 2);

      const asHr = await get('/', hr);
      assert.equal(asHr.body.pagination.total, 4);
    });

    it('honours createdBy for HR callers and ignores it for everyone else', async () => {
      f.seedRequisition({ createdBy: f.managerUser.userId, jobName: 'Manager row' });
      f.seedRequisition({ createdBy: f.strangerUser.userId, jobName: 'Stranger row' });

      const filtered = await get(`/?createdBy=${f.managerUser.userId}`, hr);
      assert.deepEqual(
        filtered.body.data.map((row) => row.jobName),
        ['Manager row'],
      );

      const bypass = await get(`/?createdBy=${f.strangerUser.userId}`, manager);
      assert.deepEqual(
        bypass.body.data.map((row) => row.jobName),
        ['Manager row'],
      ); // scope wins
    });

    it('filters by status, ticket status (NVL Open), reason, search and dates', async () => {
      f.seedRequisition({ createdBy: f.hrUser.userId, jobName: 'Forklift Operator' });
      f.seedRequisition({
        createdBy: f.hrUser.userId,
        requisitionStatus: 'Approved',
        ticketStatus: 'Accepted',
        acceptedDate: '01-Oct-26',
        reasonOfReq: 'Replacement',
        replacementFor: 'Ali Staff',
        requestDate: '01-Oct-26',
      });
      f.seedRequisition({
        createdBy: f.hrUser.userId,
        jobName: 'Warehouse Selector',
        requestDate: '25-Oct-26',
      });

      assert.equal((await get('/?requisitionStatus=Draft', hr)).body.pagination.total, 2);
      assert.equal((await get('/?ticketStatus=Open', hr)).body.pagination.total, 2); // NVL(ATTRIBUTE1,'Open')
      assert.equal((await get('/?ticketStatus=Accepted', hr)).body.pagination.total, 1);
      assert.equal((await get('/?reasonOfReq=Replacement', hr)).body.pagination.total, 1);
      const search = await get('/?search=forklift', hr);
      assert.deepEqual(
        search.body.data.map((row) => row.jobName),
        ['Forklift Operator'],
      );
      assert.equal((await get('/?dateFrom=2026-10-20', hr)).body.pagination.total, 1);
      assert.equal((await get('/?dateTo=2026-10-01', hr)).body.pagination.total, 1);
      const exact = await get(
        `/?requisitionId=${f.seedRequisition({ createdBy: f.hrUser.userId })}`,
        hr,
      );
      assert.equal(exact.body.pagination.total, 1);
    });

    it('paginates with the §7.1 bounds and rejects out-of-range values', async () => {
      for (let index = 0; index < 25; index += 1) f.seedRequisition({ createdBy: f.hrUser.userId });

      const first = await get('/', hr);
      assert.equal(first.body.data.length, 20); // default pageSize
      assert.deepEqual(first.body.pagination, {
        page: 1,
        limit: 20,
        total: 25,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      const second = await get('/?page=2', hr);
      assert.equal(second.body.data.length, 5);
      assert.equal(second.body.pagination.hasNextPage, false);

      assert.equal((await get('/?page=0', hr)).status, 400);
      assert.equal((await get('/?pageSize=101', hr)).status, 400);
    });

    it('sorts by the allowlisted columns in both directions', async () => {
      f.seedRequisition({ createdBy: f.hrUser.userId, dateNeeded: '03-Nov-26' });
      f.seedRequisition({ createdBy: f.hrUser.userId, dateNeeded: '01-Nov-26' });
      f.seedRequisition({ createdBy: f.hrUser.userId, dateNeeded: '02-Nov-26' });

      const asc = await get('/?sortBy=dateNeeded&sortDir=asc', hr);
      assert.deepEqual(
        asc.body.data.map((row) => row.dateNeeded),
        ['01-Nov-26', '02-Nov-26', '03-Nov-26'],
      );
      const desc = await get('/?sortBy=dateNeeded&sortDir=desc', hr);
      assert.equal(desc.body.data[0].dateNeeded, '03-Nov-26');
      assert.equal((await get('/?sortBy=secretColumn', hr)).status, 400);
    });
  });

  describe('update (PUT /:requisitionId)', () => {
    it('updates the business fields and the audit trio but never the frozen columns', async () => {
      const id = f.seedRequisition({ createdBy: f.managerUser.userId });
      const res = await send('put', `/${id}`, manager, {
        ...PUT_BODY,
        jobName: 'Forklift Operator',
        budgeted: 'Y',
        skills: 'Forklift licence',
      });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.data, { requisitionId: id });

      const { body } = await get(`/${id}`, manager);
      assert.equal(body.data.jobName, 'Forklift Operator');
      assert.equal(body.data.budgeted, 'Y');
      assert.equal(body.data.skills, 'Forklift licence');
      assert.equal(body.data.updatedBy, f.managerUser.userId);
      // Frozen (README §5.1): never updated.
      assert.equal(body.data.requisitionStatus, 'Draft');
      assert.equal(body.data.requestDate, '19-Oct-26');
      assert.equal(body.data.requesterName, 'Seeded Requester');
      assert.equal(body.data.requestedBy, '1001');
      assert.equal(body.data.requisitionNumber, id);
    });

    it('preserves the other ticket date while the status stands (corrected §5.1)', async () => {
      const id = f.seedRequisition({
        createdBy: f.hrUser.userId,
        ticketStatus: 'Accepted',
        acceptedDate: '01-Oct-26',
        closedDate: '05-Oct-26',
      });
      await send('put', `/${id}`, hr, { ...PUT_BODY, ticketStatus: 'Accepted' });
      const { body } = await get(`/${id}`, hr);
      assert.equal(body.data.acceptedDate, '19-Oct-26'); // re-stamped for the current status
      assert.equal(body.data.closedDate, '05-Oct-26'); // NOT wiped (the legacy bug)
    });

    it('leaves the ticket group untouched when ticketStatus is absent, clears it on ""', async () => {
      const kept = f.seedRequisition({
        createdBy: f.hrUser.userId,
        ticketStatus: 'Close',
        closedDate: '10-Oct-26',
      });
      await send('put', `/${kept}`, hr, PUT_BODY);
      const keptRead = await get(`/${kept}`, hr);
      assert.equal(keptRead.body.data.ticketStatus, 'Close');
      assert.equal(keptRead.body.data.closedDate, '10-Oct-26');

      await send('put', `/${kept}`, hr, { ...PUT_BODY, ticketStatus: '' });
      const cleared = await get(`/${kept}`, hr);
      assert.equal(cleared.body.data.ticketStatus, '');
      assert.equal(cleared.body.data.closedDate, null);
    });

    it('refuses ticketStatus from non-HR callers and gates non-Draft rows with 409', async () => {
      const own = f.seedRequisition({ createdBy: f.managerUser.userId });
      assert.equal(
        (await send('put', `/${own}`, manager, { ...PUT_BODY, ticketStatus: 'Open' })).status,
        400,
      );

      const approved = f.seedRequisition({
        createdBy: f.managerUser.userId,
        requisitionStatus: 'Approved',
      });
      const gated = await send('put', `/${approved}`, manager, PUT_BODY);
      assert.equal(gated.status, 409);
      assert.equal(gated.body.error.code, 'CANNOT_UPDATE_STATUS');
      assert.equal(gated.body.error.message, 'Request is InProcess/Approved — cannot update data');

      // HR users may always save (§5.0).
      assert.equal((await send('put', `/${approved}`, hr, PUT_BODY)).status, 200);
    });

    it('returns 404 for unknown or out-of-scope requisitions', async () => {
      assert.equal((await send('put', '/999999', hr, PUT_BODY)).status, 404);
      const hidden = f.seedRequisition({ createdBy: f.strangerUser.userId });
      assert.equal((await send('put', `/${hidden}`, manager, PUT_BODY)).status, 404);
    });

    it('appends uploaded files in the same transaction and rolls back on storage failure', async () => {
      const id = f.seedRequisition({ createdBy: f.hrUser.userId });
      const res = await asForm(upload('put', `/${id}`), {
        ...PUT_BODY,
        jobName: 'Forklift Operator',
      }).attach('files', Buffer.from('x'), 'extra.pdf');
      assert.equal(res.status, 200, JSON.stringify(res.body));
      const { body } = await get(`/${id}`, hr);
      assert.equal(body.data.jobName, 'Forklift Operator');
      assert.deepEqual(
        body.data.attachments.map((a) => a.fileName),
        ['extra.pdf'],
      );

      f.store.requisitionStorage.failures.save = 1;
      const failed = await asForm(upload('put', `/${id}`), {
        ...PUT_BODY,
        jobName: 'Should Not Persist',
      }).attach('files', Buffer.from('x'), 'never.pdf');
      assert.equal(failed.status, 500);
      const after = await get(`/${id}`, hr);
      assert.equal(after.body.data.jobName, 'Forklift Operator'); // rolled back
      assert.equal(after.body.data.attachments.length, 1);
    });
  });

  describe('delete (DELETE /:requisitionId)', () => {
    it('deletes a Draft with its attachments and files', async () => {
      const id = f.seedRequisition({ createdBy: f.managerUser.userId, attachments: ['old.pdf'] });
      f.store.requisitionStorage.inventory.push({
        attachmentId: '1',
        fileName: 'old.pdf',
        size: 3,
      });

      const res = await send('delete', `/${id}`, manager);
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.deepEqual(res.body.data, { requisitionId: id, deleted: true });
      assert.equal((await get(`/${id}`, hr)).status, 404);
      assert.equal(f.store.state.requisitionForm.attachments.length, 0);
      assert.equal(f.store.requisitionStorage.inventory.length, 0);
    });

    it('refuses non-Draft requisitions with 409 even for HR', async () => {
      const id = f.seedRequisition({ createdBy: f.hrUser.userId, requisitionStatus: 'Approved' });
      const res = await send('delete', `/${id}`, hr);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'CANNOT_DELETE_STATUS');
    });

    it('refuses a Draft referenced by an interview assessment with 409', async () => {
      const id = f.seedRequisition({ createdBy: f.hrUser.userId });
      f.store.state.interviewReferenceNumbers.push(id);
      const res = await send('delete', `/${id}`, hr);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'REQUISITION_IN_USE');
      assert.equal((await get(`/${id}`, hr)).status, 200); // nothing removed
    });

    it('returns 404 for unknown or out-of-scope requisitions and rolls back on failure', async () => {
      assert.equal((await send('delete', '/999999', hr)).status, 404);
      const hidden = f.seedRequisition({ createdBy: f.strangerUser.userId });
      assert.equal((await send('delete', `/${hidden}`, manager)).status, 404);

      const failing = f.seedRequisition({ createdBy: f.hrUser.userId });
      f.store.failures.requisitionDelete = true;
      assert.equal((await send('delete', `/${failing}`, hr)).status, 500);
      assert.equal((await get(`/${failing}`, hr)).status, 200); // rolled back
    });
  });

  describe('attachments', () => {
    it('uploads and removes attachments under MANAGE_ATTACHMENTS', async () => {
      const id = f.seedRequisition({ createdBy: f.staffUser.userId });

      // Staff has VIEW/CREATE but not MANAGE_ATTACHMENTS → default deny.
      const denied = await upload('post', `/${id}/attachments`, staff).attach(
        'files',
        Buffer.from('x'),
        'cv.pdf',
      );
      assertForbidden(denied, 'NO_GRANT');

      const created = await upload('post', `/${id}/attachments`, hr).attach(
        'files',
        Buffer.from('x'),
        'cv.pdf',
      );
      assert.equal(created.status, 201, JSON.stringify(created.body));
      const attachmentId = created.body.data.attachments[0].attachmentId;
      assert.equal(created.body.data.attachments[0].fileName, 'cv.pdf');
      assert.equal(f.store.requisitionStorage.inventory.length, 1);

      const removed = await send('delete', `/${id}/attachments/${attachmentId}`, hr);
      assert.equal(removed.status, 200);
      assert.deepEqual(removed.body.data, { requisitionId: id, attachmentId, deleted: true });
      assert.equal(f.store.requisitionStorage.inventory.length, 0);
      const { body } = await get(`/${id}`, hr);
      assert.deepEqual(body.data.attachments, []);
    });

    it('requires at least one file and 404s unknown requisitions and attachments', async () => {
      const id = f.seedRequisition({ createdBy: f.hrUser.userId, attachments: ['cv.pdf'] });

      const empty = await send('post', `/${id}/attachments`, hr);
      assert.equal(empty.status, 400);
      assert.equal(empty.body.error.details[0].field, 'files');

      // Staff can manage attachments but sees only their own scope → out-of-scope 404s.
      f.rbac.override(f.staffUser, f.permissions.MANAGE_ATTACHMENTS, 'ALLOW');
      assert.equal(
        (
          await upload('post', '/999999/attachments', staff).attach(
            'files',
            Buffer.from('x'),
            'a.pdf',
          )
        ).status,
        404,
      );
      const foreign = f.seedRequisition({ createdBy: f.strangerUser.userId });
      assert.equal(
        (
          await upload('post', `/${foreign}/attachments`, staff).attach(
            'files',
            Buffer.from('x'),
            'a.pdf',
          )
        ).status,
        404,
      );
      assert.equal((await send('delete', `/${id}/attachments/999`, hr)).status, 404);

      // An attachment of another requisition is not reachable through this one.
      const other = f.seedRequisition({ createdBy: f.hrUser.userId, attachments: ['other.pdf'] });
      const otherAttachment = f.store.state.requisitionForm.attachments.find(
        (a) => a.requisitionId === other,
      );
      assert.equal(
        (await send('delete', `/${id}/attachments/${otherAttachment.attachmentId}`, hr)).status,
        404,
      );
    });
  });

  describe('lookups (README §8)', () => {
    it('returns job titles and departments for the datalists', async () => {
      const jobs = await get('/lookups/job-titles');
      assert.deepEqual(jobs.body.data, [
        { jobId: '40', name: 'HR Officer' },
        { jobId: '30', name: 'Warehouse Supervisor' },
        { jobId: '20', name: 'Production Manager' },
        { jobId: '10', name: 'Machine Operator' }, // distinct by id, first row wins, ordered by id desc
      ]);
      const depts = await get('/lookups/departments');
      assert.deepEqual(depts.body.data, [
        { deptId: '55', name: 'Production' },
        { deptId: '70', name: 'Warehouse' },
      ]);
    });

    it('reports canManageTicket from the same HR probe that refuses non-HR ticket changes', async () => {
      assert.deepEqual((await get('/lookups/capabilities', hr)).body.data, {
        canManageTicket: true,
      });
      const staffCapabilities = await get('/lookups/capabilities', staff);
      assert.equal(staffCapabilities.status, 200);
      assert.deepEqual(staffCapabilities.body.data, { canManageTicket: false });
      assert.equal((await request(f.app).get(`${BASE}/lookups/capabilities`)).status, 401);
    });

    it('returns the session requestor and their supervised replacement candidates', async () => {
      const requestor = await get('/lookups/requestor', staff);
      assert.deepEqual(requestor.body.data, {
        fullName: 'Sam Staff',
        emailAddress: 'sam@example.com',
        employeeNumber: '2002',
      });
      const candidates = await get('/lookups/replacement-for', manager);
      assert.deepEqual(candidates.body.data, ['Sam Staff']);
      const none = await get('/lookups/replacement-for', staff);
      assert.deepEqual(none.body.data, []);
    });

    it('returns the budget for a full name and 404s unknown employees', async () => {
      const budget = await get('/lookups/budget?fullName=Sam%20Staff');
      assert.deepEqual(budget.body.data, { fullName: 'Sam Staff', totalPackage: 8000 });
      assert.equal((await get('/lookups/budget?fullName=Nobody%20Here')).status, 404);
      assert.equal((await get('/lookups/budget')).status, 400);
    });

    it('scopes filter options for non-HR callers', async () => {
      f.seedRequisition({ createdBy: f.managerUser.userId, jobName: 'Manager job' });
      f.seedRequisition({ createdBy: f.strangerUser.userId, jobName: 'Stranger job' });

      const asManager = await get('/lookups/filter-options', manager);
      assert.deepEqual(asManager.body.data.jobNames, ['Manager job']);
      const asHr = await get('/lookups/filter-options', hr);
      assert.deepEqual(asHr.body.data.jobNames.sort(), ['Manager job', 'Stranger job']);
      assert.ok(asHr.body.data.requisitionIds.length === 2);
      assert.ok(asHr.body.data.reasons.includes('Addition'));
    });
  });
});
