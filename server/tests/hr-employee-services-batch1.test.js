// Backend fixes for the HR employee services batch 1 (Reward Nomination 1113, Share an Idea 1097,
// Sick Leave 1076): permission checks, the draft/rejected edit guard and the fixed sick leave type.
// Mocked: in-memory auth/RBAC store and stub repositories; no Oracle access.
import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { createEmployeeOfTheMonthService } from '../src/modules/hr/employee-of-the-month/employeeOfTheMonth.service.js';
import { createSickLeaveService } from '../src/modules/hr/sick-leave/sickLeave.service.js';
import { writeBody as sickLeaveBody } from '../src/modules/hr/sick-leave/sickLeave.validation.js';
import { testAuthConfig, createAuthStore } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';

function setup(resourceCode, actions) {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  const add = (number) => {
    store.addEmployee({
      employeeNumber: number,
      fullName: `Test ${number}`,
      email: `${number.toLowerCase()}@example.invalid`,
    });
    return store.addUser(number, { passwordHash: 'argon2-hash-placeholder' });
  };
  const allowed = add('ES-ALLOWED');
  const denied = add('ES-DENIED');
  const resource = rbac.addResource(rbac.addModule('HR'), resourceCode);
  const permissions = Object.fromEntries(actions.map((a) => [a, rbac.addPermission(resource, a)]));
  const role = rbac.addRole('ES_TEST');
  for (const permission of Object.values(permissions)) rbac.grant(role, permission);
  rbac.assign(allowed, role);
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
    },
  });
  return { store, rbac, permissions, allowed, denied, app };
}

describe('Ideas API permissions (HR.IDEAS)', () => {
  const BASE = '/api/v1/ideas';
  let f, allowed, denied;
  beforeEach(async () => {
    f = setup('IDEAS', ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_ATTACHMENTS']);
    allowed = await signIn(f.store, f.allowed);
    denied = await signIn(f.store, f.denied);
  });

  it('requires a session and HR.IDEAS:VIEW for reads', async () => {
    assert.equal((await request(f.app).get(`${BASE}/lookups/divisions`)).status, 401);
    const forbidden = await request(f.app)
      .get(`${BASE}/lookups/divisions`)
      .set('Cookie', denied.cookie);
    assert.equal(forbidden.status, 403);
    assert.equal(forbidden.body.error.code, 'FORBIDDEN');
    const ok = await request(f.app).get(`${BASE}/lookups/divisions`).set('Cookie', allowed.cookie);
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.deepEqual(
      ok.body.data.map((item) => item.name),
      ['IPP BU', 'FPP BU'],
    );
  });

  it('applies an explicit DENY of VIEW', async () => {
    f.rbac.override(f.allowed, f.permissions.VIEW, 'DENY');
    const res = await request(f.app)
      .get(`${BASE}/lookups/categories`)
      .set('Cookie', allowed.cookie);
    assert.equal(res.status, 403);
  });

  it('requires CSRF and the matching action for writes', async () => {
    const noCsrf = await request(f.app).post(BASE).set('Cookie', allowed.cookie).send({});
    assert.equal(noCsrf.status, 403);
    for (const [method, path, permission] of [
      ['post', '', 'CREATE'],
      ['put', '/5', 'UPDATE'],
      ['delete', '/5', 'DELETE'],
      ['post', '/5/feasibility', 'UPDATE'],
      ['post', '/5/attachments', 'MANAGE_ATTACHMENTS'],
      ['delete', '/5/attachments/6', 'MANAGE_ATTACHMENTS'],
    ]) {
      f.rbac.override(f.allowed, f.permissions[permission], 'DENY');
      const res = await request(f.app)
        [method](`${BASE}${path}`)
        .set('Cookie', allowed.cookie)
        .set('X-CSRF-Token', allowed.csrf)
        .send({});
      assert.equal(res.status, 403, `${method} ${path}`);
      const user = await signIn(f.store, f.denied);
      const other = await request(f.app)
        [method](`${BASE}${path}`)
        .set('Cookie', user.cookie)
        .set('X-CSRF-Token', user.csrf)
        .send({});
      assert.equal(other.status, 403, `${method} ${path} without the permission`);
    }
  });
});

describe('Sick Leave API permissions (HR.SICK_LEAVE)', () => {
  const BASE = '/api/v1/hr/sick-leave';
  let f, denied;
  beforeEach(async () => {
    f = setup('SICK_LEAVE', ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'MANAGE_ATTACHMENTS']);
    denied = await signIn(f.store, f.denied);
  });

  it('uses the fixed resource and denies (403, not 503) without the permission', async () => {
    assert.equal((await request(f.app).get(BASE)).status, 401);
    for (const path of ['', '/lookups/employees', '/lookups/employees/1', '/7']) {
      const res = await request(f.app).get(`${BASE}${path}`).set('Cookie', denied.cookie);
      assert.equal(res.status, 403, path);
    }
    const write = await request(f.app)
      .put(`${BASE}/7`)
      .set('Cookie', denied.cookie)
      .set('X-CSRF-Token', denied.csrf)
      .send({});
    assert.equal(write.status, 403);
  });
});

describe('Sick Leave fixed leave type (legacy form 1076)', () => {
  const body = {
    empNumber: '1001',
    fromDate: '2026-10-05',
    toDate: '2026-10-06',
    fromDayType: 'FULL',
    toDayType: 'FULL',
    comments: 'Fever',
  };

  it('defaults to "Sick Leave" and rejects any other leave type', () => {
    assert.equal(sickLeaveBody.validate(body).value.leaveType, 'Sick Leave');
    assert.equal(sickLeaveBody.validate({ ...body, leaveType: 'Sick Leave' }).error, undefined);
    assert.ok(sickLeaveBody.validate({ ...body, leaveType: 'Annual Leave' }).error);
  });

  it('stores "Sick Leave" without a leave-type lookup', async () => {
    let inserted;
    const service = createSickLeaveService({
      repository: {
        ensureWriteSchema: async () => ({}),
        resolveSelf: async () => '1001',
        findEmployee: async () => ({ empNumber: '1001', empName: 'Test Employee' }),
        insert: async (_c, data) => {
          inserted = data;
          return 31;
        },
        addAttachment: async () => 41,
      },
      withTransaction: async (_pool, callback) => callback({}),
      storage: { save: async () => {}, remove: async () => {} },
    });
    const result = await service.create({ userId: 9 }, { ...body, leaveType: 'Sick Leave' }, [
      { originalname: 'certificate.pdf', buffer: Buffer.from('pdf') },
    ]);
    assert.equal(result.headerId, 31);
    assert.equal(result.days, 2);
    assert.equal(inserted.leaveType, 'Sick Leave');
    assert.equal(inserted.empName, 'Test Employee');
  });
});

describe('Employee of the Month edit guard (DRAFT and REJECTED only)', () => {
  const line = (lineNumber) => ({ lineNumber, rating: 'A', remark: 'Evidence' });
  const body = {
    department: 'production',
    employee: {
      number: '2001',
      name: 'Test Nominee',
      email: 'nominee@example.invalid',
      position: 'Operator',
      departmentName: 'Production',
    },
    activityDate: '2026-10-31',
    overallRating: 'AS',
    remark: 'Consistent output',
    lines: [0, 1, 2, 3].map(line),
  };
  const serviceFor = (status, calls) =>
    createEmployeeOfTheMonthService({
      repository: {
        get: async () => ({
          HEADER_ID: 42,
          DEPT_TYPE: 'Production',
          CREATED_BY: 7,
          STATUS: status,
        }),
        getLines: async () => [],
        isHrUser: async () => false,
        employee: async () => ({
          EMPLOYEE_NUMBER: '2001',
          FULL_NAME: 'Test Nominee',
          EMAIL_ADDRESS: 'nominee@example.invalid',
          POSITION_NAME: 'Operator',
          DEPARTMENT: 'Production',
        }),
        requestor: async () => ({ EMPLOYEE_NUMBER: '3001' }),
        update: async (_c, _id, _h, nextStatus) => calls.push(['update', nextStatus]),
        replaceLines: async () => calls.push(['lines']),
        remove: async () => calls.push(['remove']),
      },
      withConnection: async (_pool, callback) => callback({}),
      withTransaction: async (_pool, callback) => callback({}),
    });

  for (const status of ['INPROCESS', 'APPROVED']) {
    it(`rejects an update of a ${status} nomination with 409 and writes nothing`, async () => {
      const calls = [];
      await assert.rejects(
        serviceFor(status, calls).update({ userId: 7, employeeNumber: '3001' }, '42', body),
        (error) => error.statusCode === 409 && error.code === 'CONFLICT',
      );
      assert.deepEqual(calls, []);
    });

    it(`rejects a delete of a ${status} nomination with 409`, async () => {
      const calls = [];
      await assert.rejects(
        serviceFor(status, calls).remove({ userId: 7 }, '42'),
        (error) => error.statusCode === 409,
      );
      assert.deepEqual(calls, []);
    });
  }

  for (const status of ['DRAFT', 'REJECTED']) {
    it(`updates a ${status} nomination and keeps its status`, async () => {
      const calls = [];
      await serviceFor(status, calls).update({ userId: 7, employeeNumber: '3001' }, '42', body);
      assert.deepEqual(calls, [['update', status], ['lines']]);
    });
  }
});

describe('Contract fixes', () => {
  it('Employee of the Month list uses the standard paginated envelope', async () => {
    const { createEmployeeOfTheMonthController } =
      await import('../src/modules/hr/employee-of-the-month/employeeOfTheMonth.controller.js');
    const controller = createEmployeeOfTheMonthController({
      service: { list: async () => ({ items: [{ headerId: 1 }], total: 26 }) },
    });
    let body;
    const res = {
      req: { id: 'request-1' },
      status() {
        return this;
      },
      json(value) {
        body = value;
      },
    };
    await controller.list({ auth: {}, query: { page: 2, pageSize: 25 } }, res);
    assert.deepEqual(body, {
      success: true,
      data: [{ headerId: 1 }],
      pagination: {
        page: 2,
        limit: 25,
        total: 26,
        totalPages: 2,
        hasNextPage: false,
        hasPreviousPage: true,
      },
      meta: { requestId: 'request-1' },
    });
  });

  it('Sick Leave detail returns camelCase attachments with YYYY-MM-DD dates', async () => {
    const header = {
      HEADER_ID: 5,
      EMP_ID: '1001',
      CREATED_BY: 9,
      STATUS: 'Draft',
      FROM_DATE_ISO: '2026-10-05',
      TO_DATE_ISO: '2026-10-06',
      FROM_DAY_TYPE: 'FULL',
      TO_DAY_TYPE: 'FULL',
    };
    const service = createSickLeaveService({
      repository: {
        header: async () => header,
        resolveSelf: async () => '1001',
        capabilities: async () => ({ dayTypes: true }),
        attachments: async () => [
          { ATTACHMENT_ID: 21, FILE_NAME: 'a.pdf', ATTACHED_ON: new Date(2026, 9, 7) },
        ],
      },
      withConnection: async (_pool, callback) => callback({}),
    });
    const detail = await service.get({ userId: 9 }, '5');
    assert.deepEqual(detail.attachments, [
      { attachmentId: 21, fileName: 'a.pdf', attachedOn: '2026-10-07' },
    ]);
  });

  it('Sick Leave detail still loads when the optional half-day columns are absent', async () => {
    const header = {
      HEADER_ID: 5,
      EMP_ID: '1001',
      CREATED_BY: 9,
      STATUS: 'Draft',
      FROM_DATE_ISO: '2026-10-05',
      TO_DATE_ISO: '2026-10-06',
    };
    const service = createSickLeaveService({
      repository: {
        header: async (_connection, _id, _lock, withDayTypes) =>
          withDayTypes ? { ...header, FROM_DAY_TYPE: 'HALF' } : header,
        resolveSelf: async () => '1001',
        capabilities: async () => ({ dayTypes: false }),
        attachments: async () => [],
      },
      withConnection: async (_pool, callback) => callback({}),
    });
    const detail = await service.get({ userId: 9 }, '5');
    assert.equal(detail.fromDayType, 'FULL');
    assert.equal(detail.toDayType, 'FULL');
  });
});
