import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { columns } from '../src/modules/hr/employee-clearance/employee_clearance_repository.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';

const BASE = '/api/v1/hr/employee-clearance';
const SECTION_KEYS = ['employeeDept', 'quality', 'warehouse', 'accounts', 'admin'];
const DELETE_KEYS = [
  'XX_CLEARANCE_IT',
  'XX_CLEARANCE_EMPLOYEES',
  'XX_CLEARANCE_QUALITY',
  'XX_CLEARANCE_WH',
  'XX_CLEARANCE_ACCOUNTS',
  'XX_CLEARANCE_ADMIN',
  'XXZP_EMCLFOR_WORK',
  'XX_CLEARANCE_HEADER',
];

const BODY = {
  employee: { empNo: 1002 },
  contact: '5550100',
  purpose: 'Employee clearance',
  vacationFrom: '2026-11-01',
  vacationTo: '2026-11-15',
  departmentManager: { name: 'Test Manager', signature: '' },
  itManager: { name: '', signature: '' },
  computerReceivedBy: 'it',
  computerSignature: '',
  sections: {
    employeeDept: { items: ['files', 'book_manuals'] },
    quality: { items: ['uniform'] },
    admin: { items: ['bank_loan'], appDate: '2026-10-31' },
  },
  itMatrix: [
    { lineId: 99, action: 'no action', accessTo: '' },
    { lineId: 99, action: 'no action', accessTo: '' },
    { lineId: 99, action: 'no action', accessTo: '' },
    { lineId: 99, action: 'no action', accessTo: '' },
    { lineId: 99, action: 'no action', accessTo: '' },
  ],
};

const copy = (value) => structuredClone(value);

function installEmployeeClearance(store, employeeByUser) {
  const state = {
    headers: [],
    sections: new Map(),
    itMatrix: [],
    nextId: 900,
  };
  const employeeRows = new Map([
    [
      '1001',
      {
        PERSON_ID: 1,
        EMPLOYEE_NUMBER: '1001',
        FULL_NAME: 'Test Manager',
        JOB_TITLE: 'Manager',
        DEPARTMENT_NAME: 'Operations',
        DIVISION: '300000003618177',
        EMAIL_ADDRESS: 'manager@example.invalid',
        SUPERVISOR_NAME: null,
        SUPERVISOR_ID: null,
        USER_ID: employeeByUser.get('1001'),
      },
    ],
    [
      '1002',
      {
        PERSON_ID: 2,
        EMPLOYEE_NUMBER: '1002',
        FULL_NAME: 'Test Employee',
        JOB_TITLE: 'Technician',
        DEPARTMENT_NAME: 'Operations',
        DIVISION: '300000003618177',
        EMAIL_ADDRESS: 'employee@example.invalid',
        SUPERVISOR_NAME: 'Test Manager',
        SUPERVISOR_ID: 1,
        USER_ID: employeeByUser.get('1002'),
      },
    ],
    [
      '2001',
      {
        PERSON_ID: 3,
        EMPLOYEE_NUMBER: '2001',
        FULL_NAME: 'Other Employee',
        JOB_TITLE: 'Analyst',
        DEPARTMENT_NAME: 'Finance',
        DIVISION: '300000003618190',
        EMAIL_ADDRESS: 'other@example.invalid',
        SUPERVISOR_NAME: 'Test Employee',
        SUPERVISOR_ID: 2,
        USER_ID: employeeByUser.get('2001'),
      },
    ],
  ]);
  const employeeForUser = (userId) =>
    [...employeeRows.values()].find((employee) => employee.USER_ID === String(userId));
  const inScope = (userId, empNo, privileged = false) => {
    if (privileged) return employeeRows.has(String(empNo));
    const actor = employeeForUser(userId);
    const target = employeeRows.get(String(empNo));
    return Boolean(
      actor &&
      target &&
      (actor.EMPLOYEE_NUMBER === target.EMPLOYEE_NUMBER ||
        target.SUPERVISOR_ID === actor.PERSON_ID),
    );
  };
  const getHeader = (id) => state.headers.find((header) => header.HEADER_ID === String(id));
  const getSection = (id, key) => state.sections.get(`${id}:${key}`) ?? null;

  const repository = {
    columns,
    actor: async (_connection, userId) => {
      const row = employeeForUser(userId);
      return row
        ? {
            PERSON_ID: row.PERSON_ID,
            EMPLOYEE_NUMBER: row.EMPLOYEE_NUMBER,
            FULL_NAME: row.FULL_NAME,
          }
        : null;
    },
    isInScope: async (_connection, userId, empNo, privileged) => inScope(userId, empNo, privileged),
    employee: async (_connection, empNo) => copy(employeeRows.get(String(empNo)) ?? null),
    approvers: async (_connection, section) =>
      section === 'department'
        ? [{ NAME: 'Test Manager', EMP_NO: '1001', USER_ID: employeeByUser.get('1001') }]
        : [{ NAME: `Test ${section}`, EMP_NO: '1001', USER_ID: employeeByUser.get('1001') }],
    computerDestinations: async (_connection, userId, privileged) =>
      [...employeeRows.values()]
        .filter((employee) => inScope(userId, employee.EMPLOYEE_NUMBER, privileged))
        .map((employee) => ({
          VALUE: employee.EMPLOYEE_NUMBER,
          LABEL: employee.FULL_NAME,
        })),
    supervisorUserId: async (_connection, empNo) =>
      String(empNo) === '1002'
        ? { USER_ID: employeeByUser.get('1001') }
        : String(empNo) === '2001'
          ? { USER_ID: employeeByUser.get('1002') }
          : null,
    insertHeader: async (_connection, data) => {
      const id = String(state.nextId++);
      state.headers.push({
        HEADER_ID: id,
        REFERENCE_NO: null,
        EMP_NO: data.empNo,
        EMP_NAME: data.empName,
        JOB_TITLE: data.jobTitle,
        DEPARTMENT: data.department,
        ATTRIBUTE1: data.division,
        ATTRIBUTE2: data.computerFlag,
        ATTRIBUTE3: data.purpose,
        CONTACT: data.contact,
        DEP_MGR: data.depMgrName,
        DEPMGR_NO: data.depMgrNo,
        DEPMGR_DATE: data.depMgrDate,
        DEPMGR_SIG: data.depMgrSig,
        COM_REC: data.compRec,
        COM_SIG: data.compSig,
        IT_MGR: data.itMgr,
        ITMGR_DATE: data.itMgrDate,
        ITMGR_SIG: data.itMgrSig,
        STATUS: 'Draft',
        CREATED_BY: data.userId,
        CREATION_DATE: '2026-10-31',
      });
      return id;
    },
    setReference: async (_connection, id, referenceNo) => {
      getHeader(id).REFERENCE_NO = referenceNo;
    },
    insertWork: async () => {},
    insertIT: async (_connection, id, _header, line) => {
      state.itMatrix.push({
        HEADER_ID: String(id),
        LINE_ID: line.lineId,
        SUBJECT: line.subject,
        SUBJECT_ACTION: line.action,
        ACCESS_TO: line.accessTo,
      });
    },
    writeSection: async (_connection, key, id, _header, section) => {
      const managerColumns = {
        employeeDept: 'EMP_MGR_USERID',
        quality: 'QLTY_MGR_USERID',
        warehouse: 'WH_MGR_USERID',
        accounts: 'ACC_MGR_USERID',
        admin: 'ADMIN_MGR_USERID',
      };
      state.sections.set(`${id}:${key}`, {
        ...section.flags,
        COMMENTS: section.comments,
        COST: section.cost,
        APPROVER: section.approver,
        APP_SIG: section.signature,
        [managerColumns[key]]: section.managerUserId,
        ATTRIBUTE1: section.vacationFrom,
        ATTRIBUTE2: section.vacationTo,
        APP_DATE: section.appDate,
        ATTRIBUTE5: section.visaExpiry,
      });
    },
    getHeader: async (_connection, id) => copy(getHeader(id) ?? null),
    getFull: async (_connection, id) => {
      const header = getHeader(id);
      if (!header) return null;
      return {
        header: copy(header),
        itMatrix: copy(state.itMatrix.filter((line) => line.HEADER_ID === String(id))),
        sections: Object.fromEntries(SECTION_KEYS.map((key) => [key, copy(getSection(id, key))])),
      };
    },
    updateHeader: async (_connection, id, data) => {
      const header = getHeader(id);
      if (!header || !['DRAFT', 'REJECTED'].includes(header.STATUS.toUpperCase())) {
        return { rowsAffected: 0 };
      }
      Object.assign(header, {
        EMP_NO: data.empNo,
        EMP_NAME: data.empName,
        JOB_TITLE: data.jobTitle,
        DEPARTMENT: data.department,
        ATTRIBUTE1: data.division,
        ATTRIBUTE2: data.computerFlag,
        ATTRIBUTE3: data.purpose,
        CONTACT: data.contact,
        DEP_MGR: data.depMgrName,
        DEPMGR_NO: data.depMgrNo,
        DEPMGR_DATE: data.depMgrDate,
        DEPMGR_SIG: data.depMgrSig,
        COM_REC: data.compRec,
        COM_SIG: data.compSig,
        IT_MGR: data.itMgr,
        ITMGR_DATE: data.itMgrDate,
        ITMGR_SIG: data.itMgrSig,
      });
      return { rowsAffected: 1 };
    },
    updateIT: async (_connection, id, header, line) => {
      const existing = state.itMatrix.find(
        (item) => item.HEADER_ID === String(id) && item.LINE_ID === line.lineId,
      );
      if (existing) {
        Object.assign(existing, {
          SUBJECT_ACTION: line.action,
          ACCESS_TO: line.accessTo,
        });
      } else {
        await repository.insertIT(_connection, id, header, line);
      }
    },
    remove: async (_connection, id) => {
      state.headers = state.headers.filter((header) => header.HEADER_ID !== String(id));
      state.itMatrix = state.itMatrix.filter((line) => line.HEADER_ID !== String(id));
      for (const key of SECTION_KEYS) state.sections.delete(`${id}:${key}`);
      return Object.fromEntries(DELETE_KEYS.map((key) => [key, 1]));
    },
    list: async (_connection, userId, privileged, filter) => {
      let headers = state.headers.filter(
        (header) => privileged || inScope(userId, header.EMP_NO, false),
      );
      if (filter.pendingAt) headers = [];
      if (filter.empNo) {
        headers = headers.filter((header) => String(header.EMP_NO) === String(filter.empNo));
      }
      return {
        total: headers.length,
        items: headers.map((header) => ({
          ...header,
          DIVISION: header.ATTRIBUTE1,
          COMPUTER_FLAG: header.ATTRIBUTE2,
          PURPOSE: header.ATTRIBUTE3,
          VACATION_FROM: getSection(header.HEADER_ID, 'employeeDept')?.ATTRIBUTE1,
          VACATION_TO: getSection(header.HEADER_ID, 'employeeDept')?.ATTRIBUTE2,
        })),
      };
    },
    employees: async (_connection, userId, privileged, filter) => {
      let employees = [...employeeRows.values()].filter((employee) =>
        filter.scope === 'all' && privileged
          ? true
          : inScope(userId, employee.EMPLOYEE_NUMBER, false),
      );
      if (filter.q) {
        const q = filter.q.toLowerCase();
        employees = employees.filter(
          (employee) =>
            employee.FULL_NAME.toLowerCase().includes(q) || employee.EMPLOYEE_NUMBER.includes(q),
        );
      }
      const offset = (filter.page - 1) * filter.pageSize;
      return {
        total: employees.length,
        items: employees.slice(offset, offset + filter.pageSize),
      };
    },
  };

  store.employeeClearance = { repository, state };
}

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store);

  const addUser = (employeeNumber, fullName) => {
    store.addEmployee({
      employeeNumber,
      username: `clearance.${employeeNumber}`,
      fullName,
      email: `${employeeNumber}@example.invalid`,
    });
    return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
  };

  const manager = addUser('1001', 'Test Manager');
  const staff = addUser('1002', 'Test Employee');
  const outsider = addUser('2001', 'Other Employee');
  const noPermissions = addUser('3001', 'No Permission');
  const employeeByUser = new Map(
    [manager, staff, outsider].map((user) => [user.employeeNumber, user.userId]),
  );

  const module = rbac.addModule('EMPLOYEE_CLEARANCE');
  const resource = rbac.addResource(module, 'EMPLOYEE_CLEARANCE');
  const permissions = Object.fromEntries(
    ['VIEW', 'CREATE', 'UPDATE', 'DELETE', 'VIEW_ALL'].map((action) => [
      action,
      rbac.addPermission(resource, action),
    ]),
  );
  const staffRole = rbac.addRole('EMPLOYEE_CLEARANCE_STAFF');
  for (const action of ['VIEW', 'CREATE', 'UPDATE', 'DELETE']) {
    rbac.grant(staffRole, permissions[action]);
  }
  rbac.assign(staff, staffRole);
  rbac.assign(outsider, staffRole);

  const allAccessRole = rbac.addRole('EMPLOYEE_CLEARANCE_VIEW_ALL');
  for (const permission of Object.values(permissions)) rbac.grant(allAccessRole, permission);
  rbac.assign(manager, allAccessRole);

  installEmployeeClearance(store, employeeByUser);

  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      employeeClearanceRepository: store.employeeClearance.repository,
    },
  });

  return { app, store, rbac, manager, staff, outsider, noPermissions };
}

describe('employee clearance API', () => {
  let f;
  let sessions;

  beforeEach(async () => {
    f = setup();
    sessions = {
      manager: await signIn(f.store, f.manager),
      staff: await signIn(f.store, f.staff),
      outsider: await signIn(f.store, f.outsider),
      noPermissions: await signIn(f.store, f.noPermissions),
    };
  });

  const get = (path, session = sessions.staff) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);
  const send = (method, path, session = sessions.staff, body) => {
    const req = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body === undefined ? req : req.send(body);
  };

  it('requires authentication and the route permission', async () => {
    const anonymous = [
      request(f.app).get(BASE),
      request(f.app).post(BASE).send(BODY),
      request(f.app).get(`${BASE}/lookups/employees`),
      request(f.app).get(`${BASE}/lookups/employees/1002`),
      request(f.app).get(`${BASE}/lookups/approvers`),
      request(f.app).get(`${BASE}/lookups/computer-destinations`),
      request(f.app).get(`${BASE}/900`),
      request(f.app).put(`${BASE}/900`).send(BODY),
      request(f.app).delete(`${BASE}/900`),
    ];
    for (const response of await Promise.all(anonymous)) assert.equal(response.status, 401);

    const denied = await get('', sessions.noPermissions);
    assert.equal(denied.status, 403);
    assert.equal(denied.body.error.code, 'FORBIDDEN');
  });

  it('validates request bodies and parameters with 400 responses', async () => {
    const invalidBody = await send('post', '', sessions.staff, {
      ...BODY,
      itMatrix: BODY.itMatrix.slice(0, 4),
    });
    assert.equal(invalidBody.status, 400);
    assert.equal(invalidBody.body.error.code, 'VALIDATION_ERROR');

    const invalidDate = await send('post', '', sessions.staff, {
      ...BODY,
      vacationFrom: '2026-02-30',
    });
    assert.equal(invalidDate.status, 400);

    const invalidId = await get('/not-an-id');
    assert.equal(invalidId.status, 400);
  });

  it('creates, reads, updates, lists, and deletes while normalizing server-owned data', async () => {
    const created = await send('post', '', sessions.staff, BODY);
    assert.equal(created.status, 201);
    assert.equal(created.body.data.status, 'Draft');

    const { headerId, referenceNo } = created.body.data;
    assert.match(headerId, /^[1-9]\d{0,18}$/);
    assert.match(referenceNo, /^300000003618177\/\d{2}\/\d+$/);

    const state = f.store.employeeClearance.state;
    const header = state.headers[0];
    assert.equal(header.EMP_NAME, 'Test Employee');
    assert.equal(header.DEPMGR_NO, '1001');
    assert.equal(header.STATUS, 'Draft');
    assert.equal(state.itMatrix.length, 5);
    assert.deepEqual(
      state.itMatrix.map((line) => line.LINE_ID),
      [1, 2, 3, 4, 5],
    );
    assert.deepEqual(state.sections.get(`${headerId}:employeeDept`).FILES, 1);
    assert.deepEqual(state.sections.get(`${headerId}:employeeDept`).BOOK_MANUALS, 1);
    assert.deepEqual(state.sections.get(`${headerId}:employeeDept`).TOOLS, 0);
    assert.deepEqual(state.sections.get(`${headerId}:quality`).UNIFORM, 1);
    assert.deepEqual(state.sections.get(`${headerId}:admin`).BANK_LOAN, 1);

    const detail = await get(`/${headerId}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.empName, 'Test Employee');
    assert.deepEqual(detail.body.data.sections.employeeDept.items.sort(), [
      'book_manuals',
      'files',
    ]);

    const listed = await get('');
    assert.equal(listed.status, 200);
    assert.equal(listed.body.data.total, 1);
    assert.equal(listed.body.data.items[0].headerId, headerId);

    const updated = await send('put', `/${headerId}`, sessions.staff, {
      ...BODY,
      purpose: 'Updated purpose',
    });
    assert.equal(updated.status, 200);
    assert.equal(updated.body.data.updated, true);
    assert.equal(state.headers[0].ATTRIBUTE3, 'Updated purpose');

    const removed = await send('delete', `/${headerId}`);
    assert.equal(removed.status, 200);
    assert.equal(removed.body.data.headerId, headerId);
    assert.deepEqual(Object.keys(removed.body.data.deleted).sort(), [...DELETE_KEYS].sort());
    assert.equal(state.headers.length, 0);
  });

  it('enforces employee scope for creation, lookup, and record visibility', async () => {
    const outOfScopeCreate = await send('post', '', sessions.staff, {
      ...BODY,
      employee: { empNo: 3001 },
    });
    assert.equal(outOfScopeCreate.status, 403);

    const outOfScopeDestination = await send('post', '', sessions.staff, {
      ...BODY,
      computerReceivedBy: '1001',
    });
    assert.equal(outOfScopeDestination.status, 400);

    const scopedLookup = await get('/lookups/employees?scope=all', sessions.staff);
    assert.equal(scopedLookup.status, 200);
    assert.equal(scopedLookup.body.data.total, 2);

    const allLookup = await get('/lookups/employees?scope=all', sessions.manager);
    assert.equal(allLookup.status, 200);
    assert.equal(allLookup.body.data.total, 3);

    const created = await send('post', '', sessions.staff, BODY);
    const hiddenRecord = await get(`/${created.body.data.headerId}`, sessions.outsider);
    assert.equal(hiddenRecord.status, 404);
  });

  it('returns lookup data and rejects unknown records with 404', async () => {
    const employee = await get('/lookups/employees/1002');
    assert.equal(employee.status, 200);
    assert.equal(employee.body.data.fullName, 'Test Employee');

    const approvers = await get('/lookups/approvers?section=department');
    assert.equal(approvers.status, 200);
    assert.equal(approvers.body.data.items[0].name, 'Test Manager');

    const destinations = await get('/lookups/computer-destinations');
    assert.equal(destinations.status, 200);
    assert.ok(destinations.body.data.some((item) => item.value === 'it'));
    assert.ok(destinations.body.data.some((item) => item.value === '2001'));
    assert.ok(!destinations.body.data.some((item) => item.value === '1001'));

    const allDestinations = await get('/lookups/computer-destinations', sessions.manager);
    assert.equal(allDestinations.status, 200);
    assert.equal(allDestinations.body.data.filter((item) => item.kind === 'employee').length, 3);

    const missing = await get('/999999');
    assert.equal(missing.status, 404);
    assert.equal(missing.body.error.code, 'RESOURCE_NOT_FOUND');
  });

  it('restricts updates and deletes to employee scope and editable statuses', async () => {
    const created = await send('post', '', sessions.staff, BODY);
    const id = created.body.data.headerId;

    const unauthorizedUpdate = await send('put', `/${id}`, sessions.outsider, BODY);
    assert.equal(unauthorizedUpdate.status, 404);
    const unauthorizedDelete = await send('delete', `/${id}`, sessions.outsider);
    assert.equal(unauthorizedDelete.status, 404);

    f.store.employeeClearance.state.headers[0].STATUS = 'Approved';
    const lockedUpdate = await send('put', `/${id}`, sessions.staff, BODY);
    assert.equal(lockedUpdate.status, 409);
    assert.equal(lockedUpdate.body.error.code, 'STATE_CONFLICT');
    const lockedDelete = await send('delete', `/${id}`);
    assert.equal(lockedDelete.status, 409);
    assert.equal(lockedDelete.body.error.code, 'STATE_CONFLICT');
  });

  it('allows a verified direct report to access their own request', async () => {
    const created = await send('post', '', sessions.staff, {
      ...BODY,
      employee: { empNo: 2001 },
      computerReceivedBy: '2001',
    });
    assert.equal(created.status, 201);

    const id = created.body.data.headerId;
    const detail = await get(`/${id}`, sessions.outsider);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.empNo, '2001');

    const updated = await send('put', `/${id}`, sessions.outsider, {
      ...BODY,
      employee: { empNo: 2001 },
      purpose: 'Updated by employee',
    });
    assert.equal(updated.status, 200);

    const removed = await send('delete', `/${id}`, sessions.outsider);
    assert.equal(removed.status, 200);
  });
});
