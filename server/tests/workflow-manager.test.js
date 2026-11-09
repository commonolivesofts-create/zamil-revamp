/*
 * Workflow Manager M1 API tests: Form Registry, Data Source Registry, lookups and overview,
 * through the real Express app, authentication, CSRF, RBAC guards and Joi validation, with the
 * in-memory repository double (helpers/workflowManagerFakes.js). The SQL itself is checked
 * statically below (write targets, no runtime tables) and read-only against Oracle TEST by the
 * dictionary inspection recorded in the feature handoff; it is not executed here.
 */
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';

import { createApp } from '../src/app.js';
import { loadOpenApiSpec } from '../src/routes/docs.routes.js';
import { createAuthStore, testAuthConfig } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installWorkflowManager } from './helpers/workflowManagerFakes.js';

const BASE = '/api/v1/workflow-manager';

const DICTIONARY = [
  { ownerName: 'XXZP', objectName: 'XXZP_SICK_LEAVE_T', objectType: 'TABLE', status: 'VALID' },
  { ownerName: 'XXZP', objectName: 'XXZP_SICK_LEAVE_V', objectType: 'VIEW', status: 'VALID' },
  { ownerName: 'XXZP', objectName: 'XXZP_BROKEN_V', objectType: 'VIEW', status: 'INVALID' },
  { ownerName: 'XXZP', objectName: 'XX_ZRV_USERS', objectType: 'TABLE', status: 'VALID' },
  { ownerName: 'OTHER', objectName: 'OTHER_T', objectType: 'TABLE', status: 'VALID' },
];

const FORM = {
  formCode: 'SICK_LEAVE',
  formName: 'Sick Leave Request',
  moduleCode: 'HR_FORMS',
  detailRoute: '/hr/talent-management/sick-leave/:leaveId',
  description: 'Employee sick leave request form.',
};

const SOURCE = {
  sourceCode: 'SICK_LEAVE_HEADER',
  sourceName: 'Sick leave header table',
  sourceKind: 'TABLE',
  ownerName: 'XXZP',
  objectName: 'XXZP_SICK_LEAVE_T',
};

const ACTIONS = ['VIEW', 'CREATE', 'UPDATE', 'ACTIVATE', 'DEACTIVATE'];

function setup({ registerCatalog = true } = {}) {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });

  const person = (employeeNumber, fullName) => {
    store.addEmployee({ employeeNumber, username: `user.${employeeNumber}`, fullName });
    return store.addUser(employeeNumber, { passwordHash: 'argon2-hash-placeholder' });
  };
  const admin = person('2001', 'Ava Admin');
  const viewer = person('2002', 'Vic Viewer');
  const editor = person('2003', 'Eli Editor');
  const nobody = person('2004', 'Nia None');

  // Business modules a form may belong to, plus the protected ones.
  rbac.addModule('HR_FORMS', { moduleName: 'HR Forms' });
  rbac.addModule('RETIRED_MODULE', { isActive: false });
  rbac.addModule('SECURITY_ADMINISTRATION');

  const permissions = {};
  if (registerCatalog) {
    // Mirrors client/src/config/registry/modules/workflowManager.module.js; in memory only.
    const module = rbac.addModule('WORKFLOW_MANAGER', { moduleName: 'Workflow Manager' });
    const overview = rbac.addResource(module, 'OVERVIEW');
    permissions.OVERVIEW_VIEW = rbac.addPermission(overview, 'VIEW');
    for (const resourceCode of ['FORM_REGISTRY', 'DATA_SOURCE_REGISTRY']) {
      const resource = rbac.addResource(module, resourceCode);
      for (const action of ACTIONS) {
        permissions[`${resourceCode}_${action}`] = rbac.addPermission(resource, action);
      }
    }
    const adminRole = rbac.addRole('WORKFLOW_ADMIN');
    for (const p of Object.values(permissions)) rbac.grant(adminRole, p);
    rbac.assign(admin, adminRole);

    const viewerRole = rbac.addRole('WORKFLOW_VIEWER');
    rbac.grant(viewerRole, permissions.OVERVIEW_VIEW);
    rbac.grant(viewerRole, permissions.FORM_REGISTRY_VIEW);
    rbac.assign(viewer, viewerRole);

    const editorRole = rbac.addRole('WORKFLOW_EDITOR');
    rbac.grant(editorRole, permissions.FORM_REGISTRY_VIEW);
    rbac.grant(editorRole, permissions.FORM_REGISTRY_UPDATE);
    rbac.assign(editor, editorRole);
  }

  const wm = installWorkflowManager(store, { dictionary: DICTIONARY });
  const app = createApp(testAuthConfig(), {
    checkReadiness: async () => ({ LOW: true, HIGH: true }),
    api: {
      db: store.db,
      authRepository: store.authRepository,
      sessionRepository: store.sessionRepository,
      auditRepository: store.auditRepository,
      authorizationRepository: store.authorizationRepository,
      rbacRepository: store.rbacRepository,
      workflowManagerRepository: store.workflowManagerRepository,
    },
  });
  return { store, rbac, wm, app, admin, viewer, editor, nobody, permissions };
}

describe('workflow manager M1 API', () => {
  let f;
  let admin;
  let viewer;
  let editor;
  let nobody;

  beforeEach(async () => {
    f = setup();
    admin = await signIn(f.store, f.admin);
    viewer = await signIn(f.store, f.viewer);
    editor = await signIn(f.store, f.editor);
    nobody = await signIn(f.store, f.nobody);
  });

  const get = (path, session = admin) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);
  const send = (method, path, body, session = admin) =>
    request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf)
      .send(body);
  const audits = (code) => f.store.auditEvents(code);
  const assertForbidden = (res, reasonCode) => {
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'FORBIDDEN');
    if (reasonCode) assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, reasonCode);
  };
  const createForm = async (body = FORM) => {
    const res = await send('post', '/forms', body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  };
  const createSource = async (body = SOURCE) => {
    const res = await send('post', '/data-sources', body);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    return res.body.data;
  };

  describe('authentication, CSRF and authorization', () => {
    it('rejects unauthenticated callers with 401 on every route family', async () => {
      for (const path of ['/overview', '/forms', '/forms/1', '/data-sources', '/lookups/modules']) {
        assert.equal((await request(f.app).get(`${BASE}${path}`)).status, 401, path);
      }
      assert.equal((await request(f.app).post(`${BASE}/forms`).send(FORM)).status, 401);
      assert.equal((await request(f.app).put(`${BASE}/data-sources/1`).send({})).status, 401);
    });

    it('requires the session CSRF token on every change', async () => {
      const res = await request(f.app).post(`${BASE}/forms`).set('Cookie', admin.cookie).send(FORM);
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'CSRF_REJECTED');
      assert.equal(f.wm.tables().forms.length, 0);
    });

    it('denies users without a grant (default deny) and audits NO_GRANT', async () => {
      assertForbidden(await get('/forms', nobody), 'NO_GRANT');
      assertForbidden(await get('/data-sources', nobody), 'NO_GRANT');
      assertForbidden(await get('/overview', nobody), 'NO_GRANT');
      assertForbidden(await send('post', '/forms', FORM, nobody), 'NO_GRANT');
    });

    it('enforces each action separately', async () => {
      const form = await createForm();
      // Viewer: read only.
      assert.equal((await get('/forms', viewer)).status, 200);
      assertForbidden(await send('post', '/forms', { ...FORM, formCode: 'X' }, viewer), 'NO_GRANT');
      assertForbidden(await get('/data-sources', viewer), 'NO_GRANT');
      // Editor: UPDATE but neither CREATE nor DEACTIVATE.
      const { formId, rowVersion } = form;
      const update = { formName: 'Renamed', moduleCode: 'HR_FORMS', rowVersion };
      assert.equal((await send('put', `/forms/${formId}`, update, editor)).status, 200);
      assertForbidden(
        await send('post', `/forms/${formId}/deactivate`, { rowVersion: 2 }, editor),
        'NO_GRANT',
      );
      assertForbidden(await send('post', '/forms', { ...FORM, formCode: 'Y' }, editor), 'NO_GRANT');
    });

    it('denies everyone while the catalogue is not registered (PERMISSION_UNKNOWN)', async () => {
      f = setup({ registerCatalog: false });
      const session = await signIn(f.store, f.admin);
      assertForbidden(await get('/forms', session), 'PERMISSION_UNKNOWN');
    });

    it('lets an explicit DENY override win over the role grant', async () => {
      f.rbac.override(f.admin, f.permissions.FORM_REGISTRY_CREATE, 'DENY');
      assertForbidden(await send('post', '/forms', FORM), 'EXPLICIT_DENY');
    });
  });

  describe('form registry', () => {
    it('registers a form with verified module and returns the stored record', async () => {
      const form = await createForm();
      assert.match(form.formId, /^[1-9][0-9]*$/);
      assert.equal(form.formCode, 'SICK_LEAVE');
      assert.equal(form.moduleName, 'HR Forms');
      assert.equal(form.isActive, true);
      assert.equal(form.rowVersion, 1);
      assert.equal(form.versionCount, 0);
      assert.equal(form.createdBy, f.admin.userId);
      assert.equal(form.createdByName, 'Ava Admin');
    });

    it('rejects a duplicate form code with 409 FORM_CODE_EXISTS', async () => {
      await createForm();
      const res = await send('post', '/forms', { ...FORM, formName: 'Another' });
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'FORM_CODE_EXISTS');
      assert.equal(f.wm.tables().forms.length, 1);
    });

    it('maps a concurrent duplicate insert (ORA-00001) to 409 and rolls back', async () => {
      await createForm();
      const original = f.wm.repository.findFormIdByCode;
      f.wm.repository.findFormIdByCode = async () => null; // the other insert committed after the check
      const res = await send('post', '/forms', FORM);
      f.wm.repository.findFormIdByCode = original;
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'FORM_CODE_EXISTS');
      assert.equal(f.wm.tables().forms.length, 1);
    });

    it('accepts only active business modules of the permission catalog', async () => {
      for (const [moduleCode, message] of [
        ['UNKNOWN_MODULE', 'The module is not an active module of the permission catalog.'],
        ['RETIRED_MODULE', 'The module is not an active module of the permission catalog.'],
        ['SECURITY_ADMINISTRATION', 'This module cannot own workflow forms.'],
        ['WORKFLOW_MANAGER', 'This module cannot own workflow forms.'],
      ]) {
        const res = await send('post', '/forms', { ...FORM, moduleCode });
        assert.equal(res.status, 400, moduleCode);
        assert.deepEqual(res.body.error.details, [{ field: 'moduleCode', message }]);
      }
      assert.equal(f.wm.tables().forms.length, 0);
    });

    it('validates codes, lengths and the internal detail route', async () => {
      const cases = [
        { formCode: 'sick leave' },
        { formCode: 'A'.repeat(81) },
        { formName: '' },
        { formName: 'x'.repeat(201) },
        { detailRoute: 'https://evil.example/x' },
        { detailRoute: '//evil.example' },
        { detailRoute: '/hr/../admin' },
        { description: 'x'.repeat(1001) },
        { isActive: false },
      ];
      for (const change of cases) {
        const res = await send('post', '/forms', { ...FORM, ...change });
        assert.equal(res.status, 400, JSON.stringify(change));
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        assert.ok(!JSON.stringify(res.body).includes('evil.example'), 'input is never echoed');
      }
    });

    it('stores an empty optional detail route and description as null', async () => {
      const form = await createForm({ ...FORM, detailRoute: '', description: '' });
      assert.equal(form.detailRoute, null);
      assert.equal(form.description, null);
    });

    it('lists with search, filters, sort and pagination', async () => {
      await createForm();
      await createForm({ ...FORM, formCode: 'IDEA', formName: 'Idea Submission' });
      const third = await createForm({
        ...FORM,
        formCode: 'REWARD',
        formName: 'Reward Nomination',
      });
      await send('post', `/forms/${third.formId}/deactivate`, { rowVersion: 1 });

      const all = await get('/forms?pageSize=2&sortBy=FORM_NAME&sortDir=desc');
      assert.equal(all.status, 200);
      assert.deepEqual(
        all.body.data.map((x) => x.formCode),
        ['SICK_LEAVE', 'REWARD'],
      );
      assert.deepEqual(all.body.pagination, {
        page: 1,
        limit: 2,
        total: 3,
        totalPages: 2,
        hasNextPage: true,
        hasPreviousPage: false,
      });
      const search = await get('/forms?search=idea');
      assert.deepEqual(
        search.body.data.map((x) => x.formCode),
        ['IDEA'],
      );
      const inactive = await get('/forms?status=INACTIVE');
      assert.deepEqual(
        inactive.body.data.map((x) => x.formCode),
        ['REWARD'],
      );
      const byModule = await get('/forms?moduleCode=HR_FORMS&status=ACTIVE');
      assert.equal(byModule.body.pagination.total, 2);
      assert.equal((await get('/forms?sortBy=CREATED_BY')).status, 400);
      assert.equal((await get('/forms?pageSize=101')).status, 400);
    });

    it('returns 404 for a missing form and 400 for a malformed id', async () => {
      const missing = await get('/forms/999');
      assert.equal(missing.status, 404);
      assert.equal(missing.body.error.code, 'RESOURCE_NOT_FOUND');
      assert.equal((await get('/forms/abc')).status, 400);
      assert.equal((await get('/forms/0')).status, 400);
    });

    it('updates with optimistic locking and keeps the form code immutable', async () => {
      const form = await createForm();
      const body = {
        formName: 'Sick Leave',
        moduleCode: 'HR_FORMS',
        detailRoute: null,
        description: 'Updated',
        rowVersion: 1,
      };
      const ok = await send('put', `/forms/${form.formId}`, body);
      assert.equal(ok.status, 200, JSON.stringify(ok.body));
      assert.equal(ok.body.data.formName, 'Sick Leave');
      assert.equal(ok.body.data.rowVersion, 2);
      assert.equal(ok.body.data.updatedBy, f.admin.userId);

      const stale = await send('put', `/forms/${form.formId}`, body);
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error.code, 'STALE_RECORD');
      assert.equal(f.wm.tables().forms[0].formName, 'Sick Leave');

      const code = await send('put', `/forms/${form.formId}`, {
        ...body,
        rowVersion: 2,
        formCode: 'X',
      });
      assert.equal(code.status, 400);
      assert.equal((await send('put', '/forms/999', { ...body, rowVersion: 1 })).status, 404);
      const noVersion = { ...body };
      delete noVersion.rowVersion;
      assert.equal((await send('put', `/forms/${form.formId}`, noVersion)).status, 400);
    });

    it('re-verifies the module only when it changes', async () => {
      const form = await createForm();
      f.rbac.tables().modules.find((m) => m.moduleCode === 'HR_FORMS').isActive = false;
      const keep = await send('put', `/forms/${form.formId}`, {
        formName: 'Kept',
        moduleCode: 'HR_FORMS',
        rowVersion: 1,
      });
      assert.equal(keep.status, 200);
      const change = await send('put', `/forms/${form.formId}`, {
        formName: 'Kept',
        moduleCode: 'RETIRED_MODULE',
        rowVersion: 2,
      });
      assert.equal(change.status, 400);
    });

    it('deactivates and activates with the row version, never deleting', async () => {
      const form = await createForm();
      const off = await send('post', `/forms/${form.formId}/deactivate`, { rowVersion: 1 });
      assert.equal(off.status, 200);
      assert.equal(off.body.data.isActive, false);
      assert.equal(off.body.data.rowVersion, 2);
      const staleOn = await send('post', `/forms/${form.formId}/activate`, { rowVersion: 1 });
      assert.equal(staleOn.status, 409);
      const on = await send('post', `/forms/${form.formId}/activate`, { rowVersion: 2 });
      assert.equal(on.body.data.isActive, true);
      assert.equal((await send('post', '/forms/999/activate', { rowVersion: 1 })).status, 404);
      assert.equal((await send('delete', `/forms/${form.formId}`, {})).status, 404);
      assert.equal(f.wm.tables().forms.length, 1);
    });

    it('lists read-only mapping versions without configuration payloads', async () => {
      const form = await createForm();
      const source = await createSource();
      const sv = f.wm.addSourceVersion(source.sourceId);
      f.wm.addFormVersion(form.formId, sv.sourceVersionId, { versionNo: 2 });
      const res = await get(`/forms/${form.formId}/versions`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.length, 1);
      assert.equal(res.body.data[0].versionNo, 2);
      assert.equal(res.body.data[0].headerSource.sourceCode, 'SICK_LEAVE_HEADER');
      assert.ok(!('configJson' in res.body.data[0]));
      assert.equal((await get('/forms/999/versions')).status, 404);
      assert.equal((await get(`/forms/${form.formId}`)).body.data.versionCount, 1);
    });

    it('returns 500 without internal details and rolls back on an Oracle failure', async () => {
      f.wm.failNext('insertForm');
      const res = await send('post', '/forms', FORM);
      assert.equal(res.status, 500);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      assert.ok(!JSON.stringify(res.body).includes('ORA-'));
      assert.equal(f.wm.tables().forms.length, 0);
      f.wm.failNext('listForms');
      assert.equal((await get('/forms')).status, 500);
    });

    it('lists active business modules for registration', async () => {
      const res = await get('/lookups/modules');
      assert.equal(res.status, 200);
      const codes = res.body.data.map((m) => m.moduleCode);
      assert.ok(codes.includes('HR_FORMS'));
      assert.ok(!codes.includes('RETIRED_MODULE'));
      assert.ok(!codes.includes('SECURITY_ADMINISTRATION'));
      assert.ok(!codes.includes('WORKFLOW_MANAGER'));
    });
  });

  describe('data source registry', () => {
    it('registers a verified table source', async () => {
      const source = await createSource();
      assert.equal(source.sourceKind, 'TABLE');
      assert.equal(source.ownerName, 'XXZP');
      assert.equal(source.handlerCode, null);
      assert.equal(source.rowVersion, 1);
    });

    it('normalizes owner and object names to the dictionary form', async () => {
      const source = await createSource({
        ...SOURCE,
        ownerName: 'xxzp',
        objectName: ' xxzp_sick_leave_t ',
      });
      assert.equal(source.objectName, 'XXZP_SICK_LEAVE_T');
    });

    it('refuses objects outside the allowlist or not in the dictionary', async () => {
      const cases = [
        [{ objectName: 'XXZP_MISSING_T' }, 'objectName', 'SOURCE_OBJECT_NOT_FOUND'],
        [{ objectName: 'XXZP_SICK_LEAVE_V' }, 'objectName', 'SOURCE_OBJECT_TYPE_MISMATCH'],
        [{ objectName: 'XX_ZRV_USERS' }, 'objectName', 'SOURCE_OBJECT_PROTECTED'],
        [{ ownerName: 'OTHER', objectName: 'OTHER_T' }, 'ownerName', 'SOURCE_OWNER_NOT_ALLOWED'],
        [
          { sourceKind: 'VIEW', objectName: 'XXZP_BROKEN_V' },
          'objectName',
          'SOURCE_OBJECT_INVALID',
        ],
      ];
      for (const [change, field, message] of cases) {
        const res = await send('post', '/data-sources', { ...SOURCE, ...change });
        assert.equal(res.status, 400, JSON.stringify(change));
        assert.deepEqual(res.body.error.details, [{ field, message }]);
      }
      assert.equal(f.wm.tables().sources.length, 0);
    });

    it('accepts a view of the matching type', async () => {
      const source = await createSource({
        ...SOURCE,
        sourceCode: 'SICK_LEAVE_VIEW',
        sourceKind: 'VIEW',
        objectName: 'XXZP_SICK_LEAVE_V',
      });
      assert.equal(source.sourceKind, 'VIEW');
    });

    it('enforces the kind/identity shape and refuses unregistered handlers', async () => {
      const shapes = [
        { sourceKind: 'HANDLER', handlerCode: 'X' },
        { sourceKind: 'TABLE', ownerName: undefined },
        { sourceKind: 'TABLE', handlerCode: 'SOME_HANDLER' },
        { sourceKind: 'QUERY' },
        { objectName: 'XXZP_SICK; DROP TABLE X' },
      ];
      for (const change of shapes) {
        const res = await send('post', '/data-sources', { ...SOURCE, ...change });
        assert.equal(res.status, 400, JSON.stringify(change));
      }
      const handler = await send('post', '/data-sources', {
        sourceCode: 'HANDLER_SOURCE',
        sourceName: 'Handler',
        sourceKind: 'HANDLER',
        handlerCode: 'UNREGISTERED_HANDLER',
      });
      assert.equal(handler.status, 400);
      assert.deepEqual(handler.body.error.details, [
        { field: 'handlerCode', message: 'SOURCE_HANDLER_NOT_ALLOWED' },
      ]);
    });

    it('rejects a duplicate source code with 409 SOURCE_CODE_EXISTS', async () => {
      await createSource();
      const res = await send('post', '/data-sources', SOURCE);
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'SOURCE_CODE_EXISTS');
    });

    it('re-verifies a changed identity and locks it once versions exist', async () => {
      const source = await createSource();
      const base = {
        sourceName: SOURCE.sourceName,
        sourceKind: 'VIEW',
        ownerName: 'XXZP',
        objectName: 'XXZP_SICK_LEAVE_V',
      };
      const moved = await send('put', `/data-sources/${source.sourceId}`, {
        ...base,
        rowVersion: 1,
      });
      assert.equal(moved.status, 200, JSON.stringify(moved.body));
      assert.equal(moved.body.data.objectName, 'XXZP_SICK_LEAVE_V');

      const bad = await send('put', `/data-sources/${source.sourceId}`, {
        ...base,
        objectName: 'XX_ZRV_USERS',
        sourceKind: 'TABLE',
        rowVersion: 2,
      });
      assert.equal(bad.status, 400);

      f.wm.addSourceVersion(source.sourceId);
      const locked = await send('put', `/data-sources/${source.sourceId}`, {
        ...SOURCE,
        sourceCode: undefined,
        rowVersion: 2,
      });
      assert.equal(locked.status, 409);
      assert.equal(locked.body.error.code, 'SOURCE_IDENTITY_LOCKED');

      const renamed = await send('put', `/data-sources/${source.sourceId}`, {
        ...base,
        sourceName: 'Renamed view',
        rowVersion: 2,
      });
      assert.equal(renamed.status, 200);
      assert.equal(renamed.body.data.sourceName, 'Renamed view');
      assert.equal(renamed.body.data.versionCount, 1);

      const stale = await send('put', `/data-sources/${source.sourceId}`, {
        ...base,
        rowVersion: 2,
      });
      assert.equal(stale.status, 409);
      assert.equal(stale.body.error.code, 'STALE_RECORD');
    });

    it('lists, filters, reads, versions and toggles sources', async () => {
      const table = await createSource();
      await createSource({
        ...SOURCE,
        sourceCode: 'SICK_LEAVE_VIEW',
        sourceName: 'View',
        sourceKind: 'VIEW',
        objectName: 'XXZP_SICK_LEAVE_V',
      });
      const views = await get('/data-sources?sourceKind=VIEW');
      assert.deepEqual(
        views.body.data.map((s) => s.sourceCode),
        ['SICK_LEAVE_VIEW'],
      );
      const search = await get('/data-sources?search=sick_leave_t');
      assert.deepEqual(
        search.body.data.map((s) => s.sourceCode),
        ['SICK_LEAVE_HEADER'],
      );
      assert.equal(
        (await get(`/data-sources/${table.sourceId}`)).body.data.sourceName,
        SOURCE.sourceName,
      );
      assert.equal((await get('/data-sources/999')).status, 404);
      f.wm.addSourceVersion(table.sourceId, {
        versionNo: 3,
        lifecycleState: 'PUBLISHED',
        isDefault: true,
      });
      const versions = await get(`/data-sources/${table.sourceId}/versions`);
      assert.equal(versions.body.data[0].lifecycleState, 'PUBLISHED');
      assert.ok(!('configJson' in versions.body.data[0]));
      const off = await send('post', `/data-sources/${table.sourceId}/deactivate`, {
        rowVersion: 1,
      });
      assert.equal(off.body.data.isActive, false);
      const inactive = await get('/data-sources?status=INACTIVE');
      assert.equal(inactive.body.pagination.total, 1);
    });

    it('lists only allowlisted, valid dictionary objects and the source policy', async () => {
      const tables = await get('/lookups/source-objects?objectType=TABLE');
      assert.equal(tables.status, 200);
      assert.deepEqual(
        tables.body.data.map((o) => o.objectName),
        ['XXZP_SICK_LEAVE_T'],
      );
      const views = await get('/lookups/source-objects?objectType=VIEW&search=sick');
      assert.deepEqual(
        views.body.data.map((o) => o.objectName),
        ['XXZP_SICK_LEAVE_V'],
      );
      assert.equal((await get('/lookups/source-objects')).status, 400);
      assert.equal((await get("/lookups/source-objects?objectType=TABLE&search=X'--")).status, 400);
      const policy = await get('/lookups/source-policy');
      assert.deepEqual(policy.body.data, {
        sourceKinds: ['TABLE', 'VIEW', 'HANDLER'],
        allowedOwners: ['XXZP'],
        protectedObjectPrefixes: ['XX_ZRV_'],
        handlers: [],
      });
    });
  });

  describe('overview', () => {
    it('returns live counts only for the registries the user may view', async () => {
      await createForm();
      await createSource();
      const full = await get('/overview');
      assert.equal(full.status, 200);
      assert.deepEqual(full.body.data.forms, { total: 1, active: 1 });
      assert.equal(full.body.data.dataSources.total, 1);
      assert.deepEqual(full.body.data.dataSources.byKind.TABLE, { total: 1, active: 1 });
      assert.deepEqual(full.body.data.dataSources.byKind.HANDLER, { total: 0, active: 0 });

      const partial = await get('/overview', viewer);
      assert.equal(partial.status, 200);
      assert.deepEqual(partial.body.data.forms, { total: 1, active: 1 });
      assert.equal(partial.body.data.dataSources, null);
    });
  });
});

describe('workflow manager M1 SQL boundaries (static)', () => {
  it('writes only the two M1 registry tables and never touches runtime tables', async () => {
    const source = await readFile(
      new URL('../src/modules/workflow-manager/workflowManager.repository.js', import.meta.url),
      'utf8',
    );
    // Code only: comments may name the tables and columns they explain.
    const sql = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    const writes = [
      ...sql.matchAll(/\b(INSERT\s+INTO|UPDATE|DELETE\s+FROM|MERGE\s+INTO)\s+([a-z_$.]+)/gi),
    ]
      .map((m) => m[2].toLowerCase())
      .filter((name) => name.startsWith('xx_'));
    assert.deepEqual([...new Set(writes)].sort(), ['xx_zrv_wf_data_sources', 'xx_zrv_wf_forms']);
    assert.doesNotMatch(sql, /\bDELETE\b/i);
    for (const runtime of [
      'INSTANCES',
      'STAGE_INSTANCES',
      'TASKS',
      'ACTIONS',
      'EVENTS',
      'OUTBOX',
      'EXCEPTIONS',
      'RFI',
      'FYI',
      'DELEGATIONS',
    ]) {
      assert.doesNotMatch(sql, new RegExp(`xx_zrv_wf_${runtime}\\b`, 'i'), runtime);
    }
    assert.doesNotMatch(sql, /config_json/i, 'configuration payloads are not read in M1');
  });
});

describe('workflow manager M1 OpenAPI contract', () => {
  it('documents every route with session security, and CSRF on every change', () => {
    const { paths } = loadOpenApiSpec();
    const base = '/api/v1/workflow-manager';
    const expected = [
      ['get', '/overview'],
      ['get', '/lookups/modules'],
      ['get', '/forms'],
      ['post', '/forms'],
      ['get', '/forms/{formId}'],
      ['put', '/forms/{formId}'],
      ['post', '/forms/{formId}/activate'],
      ['post', '/forms/{formId}/deactivate'],
      ['get', '/forms/{formId}/versions'],
      ['get', '/lookups/source-policy'],
      ['get', '/lookups/source-objects'],
      ['get', '/data-sources'],
      ['post', '/data-sources'],
      ['get', '/data-sources/{sourceId}'],
      ['put', '/data-sources/{sourceId}'],
      ['post', '/data-sources/{sourceId}/activate'],
      ['post', '/data-sources/{sourceId}/deactivate'],
      ['get', '/data-sources/{sourceId}/versions'],
      // M2-A source version mapping (detailed in workflow-source-mapping.test.js).
      ['get', '/data-sources/{sourceId}/dictionary'],
      ['get', '/data-sources/{sourceId}/mapping-versions'],
      ['post', '/data-sources/{sourceId}/mapping-versions'],
      ['get', '/data-sources/{sourceId}/mapping-versions/{versionId}'],
      ['put', '/data-sources/{sourceId}/mapping-versions/{versionId}'],
      ['delete', '/data-sources/{sourceId}/mapping-versions/{versionId}'],
      ['post', '/data-sources/{sourceId}/mapping-versions/{versionId}/revalidate'],
      ['get', '/data-sources/{sourceId}/mapping-versions/{versionId}/drift'],
      ['post', '/data-sources/{sourceId}/mapping-versions/{versionId}/clone'],
    ];
    const documented = Object.keys(paths).filter((path) => path.startsWith(base));
    assert.equal(
      documented.flatMap((path) => Object.keys(paths[path]).filter((k) => k !== 'parameters'))
        .length,
      expected.length,
      'no undocumented or extra operations',
    );
    for (const [method, path] of expected) {
      const operation = paths[`${base}${path}`]?.[method];
      assert.ok(operation, `${method.toUpperCase()} ${path} is documented`);
      assert.deepEqual(operation.security, [{ sessionCookie: [] }], `${path} security`);
      assert.match(operation.description, /WORKFLOW_MANAGER\.[A-Z_]+:[A-Z]+/, `${path} permission`);
      const csrf = (operation.parameters ?? []).some(
        (p) => p.$ref === '#/components/parameters/CsrfToken',
      );
      assert.equal(csrf, method !== 'get', `${method} ${path} CSRF header`);
    }
  });
});
