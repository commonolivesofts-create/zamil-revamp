import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createAuthorize } from '../src/middleware/authorize.js';
import { decide, parsePermission } from '../src/modules/access-control/authorization.service.js';
import { createAuthStore, createTestApp, DAY_MS } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';

// Supertest + in-memory RBAC/session/audit doubles. Oracle SQL is not exercised here (see
// scripts/verify-auth-sql.js for the read-only Oracle checks).

const BASE = '/api/v1/access-control';
const SEC = 'SECURITY_ADMINISTRATION';

describe('authorization decision (pure)', () => {
  const business = { moduleCode: 'PRODUCTION', resourceCode: 'WORK_ORDERS', actionCode: 'VIEW' };
  const security = { moduleCode: SEC, resourceCode: 'ROLES', actionCode: 'VIEW' };
  const facts = (overrides) => ({
    permissionId: '1',
    catalogActive: true,
    denied: false,
    allowedByOverride: false,
    allowedByRole: false,
    ...overrides,
  });
  const auth = { mfaVerified: true };

  it('denies by default, for unknown and for inactive permissions', () => {
    assert.equal(decide(facts(), business, auth).reason, 'NO_GRANT');
    assert.equal(decide(null, business, auth).reason, 'PERMISSION_UNKNOWN');
    assert.equal(
      decide(facts({ catalogActive: false, allowedByRole: true }), business, auth).reason,
      'PERMISSION_INACTIVE',
    );
  });

  it('lets an explicit DENY win over a role grant and an ALLOW override', () => {
    const decision = decide(
      facts({ denied: true, allowedByRole: true, allowedByOverride: true }),
      business,
      auth,
    );
    assert.deepEqual(decision, { allowed: false, reason: 'EXPLICIT_DENY' });
  });

  it('allows through a role grant or an ALLOW override', () => {
    assert.equal(decide(facts({ allowedByRole: true }), business, auth).allowed, true);
    assert.equal(decide(facts({ allowedByOverride: true }), business, auth).allowed, true);
  });

  it('requires an MFA-verified session for security-administration permissions only', () => {
    const granted = facts({ allowedByRole: true });
    assert.equal(decide(granted, security, { mfaVerified: false }).reason, 'MFA_REQUIRED');
    assert.equal(decide(granted, security, auth).allowed, true);
    assert.equal(decide(granted, business, { mfaVerified: false }).allowed, true);
  });

  it('rejects malformed permission declarations when the route is declared', () => {
    const authorize = createAuthorize({ authorizationService: {} });
    assert.throws(() => authorize('ROLES', 'VIEW'), /Invalid permission resource key/);
    assert.throws(() => authorize(`${SEC}.roles`, 'VIEW'), /Invalid permission resource key/);
    assert.throws(() => authorize(`${SEC}.ROLES.X`, 'VIEW'), /Invalid permission resource key/);
    assert.throws(() => authorize(`${SEC}.ROLES`, 'view'), /Invalid permission action/);
    assert.deepEqual(parsePermission(`${SEC}.ROLES`, 'VIEW'), {
      moduleCode: SEC,
      resourceCode: 'ROLES',
      actionCode: 'VIEW',
    });
  });

  it('returns 403 and never calls the handler when the service denies (MFA not verified)', async () => {
    const authorize = createAuthorize({
      authorizationService: { check: async () => ({ allowed: false, reason: 'MFA_REQUIRED' }) },
    });
    const req = { auth: { userId: '1', mfaVerified: false }, headers: {}, get: () => undefined };
    const error = await new Promise((resolve) =>
      authorize(`${SEC}.ROLES`, 'VIEW')(req, {}, resolve),
    );
    assert.equal(error.statusCode ?? error.status, 403);
    assert.equal(error.code, 'FORBIDDEN');
    assert.equal(req.permission, undefined);
  });
});

/** Fixture: security catalogue, Zaid (SUPER_ADMINISTRATOR), an administrator and an ordinary user. */
function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  const { roles } = rbac.seedSecurityCatalog();
  const production = rbac.addModule('PRODUCTION');
  const workOrders = rbac.addResource(production, 'WORK_ORDERS');
  const view = rbac.addPermission(workOrders, 'VIEW');
  const approve = rbac.addPermission(workOrders, 'APPROVE');

  const account = (employeeNumber, overrides = {}) => {
    store.addEmployee({ employeeNumber, username: `U${employeeNumber}` });
    return store.addUser(employeeNumber, { mfaEnrolledAt: store.now(), ...overrides });
  };
  const zaid = account('2172');
  const admin = account('3001');
  const user = account('4001', { mfaEnrolledAt: null });
  const other = account('4002', { mfaEnrolledAt: null });

  rbac.assign(zaid, roles.SUPER_ADMINISTRATOR);
  // The administrator holds RBAC administration (not recovery/audit) plus WORK_ORDERS:VIEW only.
  const delegated = [
    ['ROLES', ['VIEW', 'CREATE', 'UPDATE', 'DEACTIVATE']],
    ['PERMISSION_CATALOG', ['VIEW', 'MANAGE']],
    ['ROLE_PERMISSIONS', ['VIEW', 'GRANT', 'REVOKE']],
    ['USER_ROLES', ['VIEW', 'ASSIGN', 'REVOKE']],
    ['USER_PERMISSION_OVERRIDES', ['VIEW', 'GRANT', 'REVOKE']],
  ];
  for (const [resource, actions] of delegated) {
    for (const action of actions)
      rbac.grant(roles.ADMINISTRATOR, rbac.permission(SEC, resource, action));
  }
  rbac.assign(admin, roles.ADMINISTRATOR);
  const viewer = rbac.addRole('WORK_ORDER_VIEWER');
  rbac.grant(viewer, view);
  rbac.assign(admin, viewer);

  return {
    store,
    rbac,
    roles,
    view,
    approve,
    viewer,
    zaid,
    admin,
    user,
    other,
    app: createTestApp(store),
  };
}

describe('authorize middleware on RBAC routes', () => {
  let f;
  beforeEach(() => {
    f = setup();
  });
  const get = (path, session) => request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);
  const denials = () => f.store.auditEvents('ACCESS_DENIED');

  it('requires authentication', async () => {
    const res = await request(f.app).get(`${BASE}/roles`);
    assert.equal(res.status, 401);
    assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  });

  it('denies by default with a safe 403 and audits ACCESS_DENIED', async () => {
    const session = await signIn(f.store, f.user, { mfaVerified: false });
    const res = await get('/roles', session);
    assert.equal(res.status, 403);
    assert.deepEqual(res.body.error, {
      code: 'FORBIDDEN',
      message: 'You do not have permission for this action.',
    });
    const [row] = denials();
    assert.equal(row.reasonCode, 'NO_GRANT');
    assert.equal(row.subjectUserId, f.user.userId);
    assert.equal(row.targetType, 'USER_SESSION');
    assert.deepEqual(JSON.parse(row.eventDetails), { permission: `${SEC}.ROLES:VIEW` });
  });

  it('rejects a session for a security administrator that has not completed MFA', async () => {
    const session = await signIn(f.store, f.admin, { mfaVerified: false });
    const res = await get('/roles', session);
    assert.equal(res.status, 401);
  });

  it('allows a granted permission and lists paginated roles', async () => {
    const res = await get('/roles?page=1&limit=2', await signIn(f.store, f.admin));
    assert.equal(res.status, 200);
    assert.equal(res.headers['cache-control'], 'no-store');
    assert.equal(res.body.data.length, 2);
    assert.deepEqual(res.body.pagination, {
      page: 1,
      limit: 2,
      total: 4,
      totalPages: 2,
      hasNextPage: true,
      hasPreviousPage: false,
    });
  });

  it('lets an explicit DENY override win over the role grant', async () => {
    f.rbac.override(f.admin, f.rbac.permission(SEC, 'ROLES', 'VIEW'), 'DENY');
    const res = await get('/roles', await signIn(f.store, f.admin));
    assert.equal(res.status, 403);
    assert.equal(denials()[0].reasonCode, 'EXPLICIT_DENY');
  });

  it('ignores an expired DENY override and an inactive one', async () => {
    const permission = f.rbac.permission(SEC, 'ROLES', 'VIEW');
    f.rbac.override(f.admin, permission, 'DENY', {
      expiresAt: new Date(f.store.now().getTime() - 1),
    });
    assert.equal((await get('/roles', await signIn(f.store, f.admin))).status, 200);
    f.rbac.tables().overrides[0].expiresAt = null;
    f.rbac.tables().overrides[0].isActive = false;
    assert.equal((await get('/roles', await signIn(f.store, f.admin))).status, 200);
  });

  it('denies through an expired membership, an inactive role, grant or catalogue item', async () => {
    const session = await signIn(f.store, f.zaid);
    const membership = f.rbac.tables().userRoles.find((ur) => ur.userId === f.admin.userId);
    const adminSession = await signIn(f.store, f.admin);
    const permission = f.rbac.permission(SEC, 'ROLES', 'VIEW');
    const grant = f.rbac
      .tables()
      .rolePermissions.find(
        (g) =>
          g.roleId === f.roles.ADMINISTRATOR.roleId && g.permissionId === permission.permissionId,
      );

    grant.isActive = false;
    assert.equal((await get('/roles', adminSession)).status, 403);
    grant.isActive = true;
    assert.equal((await get('/roles', adminSession)).status, 200);

    // Expired membership / inactive role also end the privileged classification: the session is
    // still valid (MFA verified) but administration is denied.
    membership.expiresAt = new Date(f.store.now().getTime() - 1);
    f.rbac.syncFlags();
    assert.equal((await get('/roles', adminSession)).status, 403);
    membership.expiresAt = null;
    f.roles.ADMINISTRATOR.isActive = false;
    f.rbac.syncFlags();
    assert.equal((await get('/roles', adminSession)).status, 403);

    permission.isActive = false;
    const res = await get('/roles', session);
    assert.equal(res.status, 403);
    assert.equal(denials().at(-1).reasonCode, 'PERMISSION_INACTIVE');
  });

  it('applies a revocation on the very next request (no permission cache)', async () => {
    const session = await signIn(f.store, f.admin);
    assert.equal((await get('/roles', session)).status, 200);
    const permission = f.rbac.permission(SEC, 'ROLES', 'VIEW');
    const res = await request(f.app)
      .delete(
        `${BASE}/roles/${f.roles.ADMINISTRATOR.roleId}/permissions/${permission.permissionId}`,
      )
      .set('Cookie', (await signIn(f.store, f.zaid)).cookie)
      .set('X-CSRF-Token', (await signIn(f.store, f.zaid)).csrf);
    // CSRF is session-bound: a token from another session is rejected.
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'CSRF_REJECTED');

    const zaid = await signIn(f.store, f.zaid);
    const revoked = await request(f.app)
      .delete(
        `${BASE}/roles/${f.roles.ADMINISTRATOR.roleId}/permissions/${permission.permissionId}`,
      )
      .set('Cookie', zaid.cookie)
      .set('X-CSRF-Token', zaid.csrf);
    assert.equal(revoked.status, 200);
    assert.equal((await get('/roles', session)).status, 403);
  });

  it('reports the caller’s own effective permissions without a security permission', async () => {
    const res = await get('/me/permissions', await signIn(f.store, f.user, { mfaVerified: false }));
    assert.equal(res.status, 200);
    assert.deepEqual(res.body.data.permissions, []);

    f.rbac.assign(f.user, f.viewer);
    const after = await get(
      '/me/permissions',
      await signIn(f.store, f.user, { mfaVerified: false }),
    );
    assert.deepEqual(
      after.body.data.permissions.map((p) => `${p.moduleCode}.${p.resourceCode}:${p.actionCode}`),
      ['PRODUCTION.WORK_ORDERS:VIEW'],
    );
  });
});

describe('RBAC administration rules', () => {
  let f;
  let zaid;
  let admin;
  beforeEach(async () => {
    f = setup();
    zaid = await signIn(f.store, f.zaid);
    admin = await signIn(f.store, f.admin);
  });
  const send = (method, path, session, body) => {
    const req = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body === undefined ? req : req.send(body);
  };
  const lastDenial = () => f.store.auditEvents('ACCESS_DENIED').at(-1);
  const assertRefused = (res, code) => {
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.error.code, code);
    assert.equal(lastDenial().reasonCode, code);
  };

  describe('roles', () => {
    it('creates a role and its audit row in one transaction; duplicates are 409', async () => {
      const body = { roleCode: 'QA_LEAD', roleName: 'QA Lead', description: 'Quality' };
      const res = await send('post', '/roles', admin, body);
      assert.equal(res.status, 201);
      assert.equal(res.body.data.roleCode, 'QA_LEAD');
      const [row] = f.store.auditEvents('RBAC_ROLE_CREATED');
      assert.equal(row.targetType, 'ROLE');
      assert.equal(row.targetRecordId, res.body.data.roleId);
      assert.equal(row.createdBy, f.admin.userId);

      const duplicate = await send('post', '/roles', admin, body);
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error.code, 'CONFLICT');
    });

    it('rolls the change back when its audit row cannot be written', async () => {
      f.store.failures.auditInsert = true;
      const res = await send('post', '/roles', admin, { roleCode: 'QA_LEAD', roleName: 'QA Lead' });
      assert.equal(res.status, 500);
      assert.equal(f.rbac.role('QA_LEAD'), undefined);
    });

    it('validates input after authorization and rejects unknown fields', async () => {
      const bad = await send('post', '/roles', admin, {
        roleCode: 'qa lead',
        roleName: 'x',
        extra: 1,
      });
      assert.equal(bad.status, 400);
      assert.deepEqual(bad.body.error.details.map((d) => d.field).sort(), ['extra', 'roleCode']);

      const outsider = await signIn(f.store, f.user, { mfaVerified: false });
      const denied = await send('post', '/roles', outsider, { roleCode: 'qa lead' });
      assert.equal(denied.status, 403);
      assert.equal(denied.body.error.code, 'FORBIDDEN');

      const id = await request(f.app)
        .get(`${BASE}/roles/abc/permissions`)
        .set('Cookie', admin.cookie);
      assert.equal(id.status, 400);
    });

    it('requires the session CSRF token for changes', async () => {
      const res = await request(f.app)
        .post(`${BASE}/roles`)
        .set('Cookie', admin.cookie)
        .send({ roleCode: 'QA_LEAD', roleName: 'QA Lead' });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'CSRF_REJECTED');
      assert.equal(f.rbac.role('QA_LEAD'), undefined);
    });

    it('updates, deactivates and re-activates an ordinary role with audit events', async () => {
      const id = f.viewer.roleId;
      const updated = await send('patch', `/roles/${id}`, admin, { roleName: 'Viewers' });
      assert.equal(updated.body.data.roleName, 'Viewers');
      assert.equal(
        (await send('post', `/roles/${id}/deactivate`, admin)).body.data.isActive,
        false,
      );
      assert.equal((await send('post', `/roles/${id}/activate`, admin)).body.data.isActive, true);
      assert.deepEqual(
        f.store.state.audit.filter((r) => r.eventCode.startsWith('RBAC_')).map((r) => r.eventCode),
        ['RBAC_ROLE_UPDATED', 'RBAC_ROLE_DEACTIVATED', 'RBAC_ROLE_ACTIVATED'],
      );
    });

    it('never changes protected administrator roles, even for the Super Administrator', async () => {
      for (const role of Object.values(f.roles)) {
        assertRefused(
          await send('patch', `/roles/${role.roleId}`, zaid, { roleName: 'X' }),
          'PROTECTED_ROLE',
        );
        assertRefused(
          await send('post', `/roles/${role.roleId}/deactivate`, zaid),
          'PROTECTED_ROLE',
        );
      }
      assert.equal(f.roles.SUPER_ADMINISTRATOR.isActive, true);
    });

    it('returns 404 for an unknown role', async () => {
      const res = await send('patch', '/roles/999999', admin, { roleName: 'X' });
      assert.equal(res.status, 404);
      assert.equal(res.body.error.code, 'RESOURCE_NOT_FOUND');
    });
  });

  describe('permission catalogue', () => {
    it('lists the nested catalogue', async () => {
      const res = await request(f.app).get(`${BASE}/catalog`).set('Cookie', admin.cookie);
      assert.equal(res.status, 200);
      assert.equal(res.body.data[0].moduleCode, SEC);
      assert.equal(res.body.data[0].resources.length, 8);
    });

    it('creates modules, resources and permissions with RBAC_CATALOG_CHANGED', async () => {
      const mod = await send('post', '/modules', admin, {
        moduleCode: 'QUALITY',
        moduleName: 'Quality',
      });
      assert.equal(mod.status, 201);
      const res = await send('post', `/modules/${mod.body.data.moduleId}/resources`, admin, {
        resourceCode: 'INSPECTIONS',
        resourceName: 'Inspections',
      });
      const perm = await send('post', `/resources/${res.body.data.resourceId}/permissions`, admin, {
        actionCode: 'VIEW',
      });
      assert.equal(perm.status, 201);
      assert.deepEqual(
        f.store.auditEvents('RBAC_CATALOG_CHANGED').map((r) => r.reasonCode),
        ['MODULE_CREATED', 'RESOURCE_CREATED', 'PERMISSION_CREATED'],
      );
      const again = await send(
        'post',
        `/resources/${res.body.data.resourceId}/permissions`,
        admin,
        {
          actionCode: 'VIEW',
        },
      );
      assert.equal(again.status, 409);
    });

    it('keeps the security-administration catalogue under the Super Administrator', async () => {
      const security = f.rbac.tables().modules.find((m) => m.moduleCode === SEC);
      assertRefused(
        await send('post', `/modules/${security.moduleId}/resources`, admin, {
          resourceCode: 'BACKDOOR',
          resourceName: 'Backdoor',
        }),
        'SUPER_ADMINISTRATOR_ONLY',
      );
      assertRefused(
        await send('patch', `/modules/${security.moduleId}`, zaid, { isActive: false }),
        'PROTECTED_CATALOG',
      );
      const roles = f.rbac.permission(SEC, 'ROLES', 'VIEW');
      assertRefused(
        await send('patch', `/permissions/${roles.permissionId}`, zaid, { isActive: false }),
        'PROTECTED_CATALOG',
      );
      assert.equal(security.isActive, true);
    });

    it('deactivates a business permission, which then denies at request time', async () => {
      f.rbac.assign(f.user, f.viewer);
      const res = await send('patch', `/permissions/${f.view.permissionId}`, admin, {
        isActive: false,
      });
      assert.equal(res.status, 200);
      assert.equal(res.body.data.changed, true);
      assert.equal(
        f.store.auditEvents('RBAC_CATALOG_CHANGED')[0].reasonCode,
        'PERMISSION_DEACTIVATED',
      );
      const me = await request(f.app)
        .get(`${BASE}/me/permissions`)
        .set('Cookie', (await signIn(f.store, f.user, { mfaVerified: false })).cookie);
      assert.deepEqual(me.body.data.permissions, []);
    });
  });

  describe('role permissions', () => {
    let custom;
    beforeEach(() => {
      custom = f.rbac.addRole('CUSTOM');
    });

    it('grants a permission the actor holds and audits RBAC_PERMISSION_GRANTED', async () => {
      const res = await send(
        'put',
        `/roles/${custom.roleId}/permissions/${f.view.permissionId}`,
        admin,
      );
      assert.equal(res.status, 200);
      assert.equal(res.body.data.changed, true);
      const again = await send(
        'put',
        `/roles/${custom.roleId}/permissions/${f.view.permissionId}`,
        admin,
      );
      assert.equal(again.body.data.changed, false);
      assert.equal(f.store.auditEvents('RBAC_PERMISSION_GRANTED').length, 1);
      const list = await request(f.app)
        .get(`${BASE}/roles/${custom.roleId}/permissions`)
        .set('Cookie', admin.cookie);
      assert.equal(list.body.data[0].actionCode, 'VIEW');
    });

    it('refuses privilege escalation and security permissions for non-Super Administrators', async () => {
      assertRefused(
        await send('put', `/roles/${custom.roleId}/permissions/${f.approve.permissionId}`, admin),
        'PRIVILEGE_ESCALATION_FORBIDDEN',
      );
      const security = f.rbac.permission(SEC, 'ROLES', 'VIEW');
      assertRefused(
        await send('put', `/roles/${custom.roleId}/permissions/${security.permissionId}`, admin),
        'SUPER_ADMINISTRATOR_ONLY',
      );
      assert.equal(lastDenial().subjectUserId, f.admin.userId);
      // Zaid may.
      const ok = await send(
        'put',
        `/roles/${custom.roleId}/permissions/${f.approve.permissionId}`,
        zaid,
      );
      assert.equal(ok.status, 200);
    });

    it('reserves administrator-role grants for the Super Administrator', async () => {
      assertRefused(
        await send(
          'put',
          `/roles/${f.roles.ADMINISTRATOR.roleId}/permissions/${f.view.permissionId}`,
          admin,
        ),
        'SUPER_ADMINISTRATOR_ONLY',
      );
      const ok = await send(
        'put',
        `/roles/${f.roles.ADMINISTRATOR.roleId}/permissions/${f.view.permissionId}`,
        zaid,
      );
      assert.equal(ok.status, 200);
    });

    it('never revokes security permissions from SUPER_ADMINISTRATOR', async () => {
      const security = f.rbac.permission(SEC, 'ROLE_PERMISSIONS', 'REVOKE');
      assertRefused(
        await send(
          'delete',
          `/roles/${f.roles.SUPER_ADMINISTRATOR.roleId}/permissions/${security.permissionId}`,
          zaid,
        ),
        'PROTECTED_ROLE',
      );
    });

    it('refuses grants on an inactive role or permission', async () => {
      f.view.isActive = false;
      const res = await send(
        'put',
        `/roles/${custom.roleId}/permissions/${f.view.permissionId}`,
        zaid,
      );
      assert.equal(res.status, 409);
      assert.equal(res.body.error.code, 'INACTIVE_TARGET');
    });
  });

  describe('user roles', () => {
    it('assigns a role with an expiry and the user gains its permissions', async () => {
      const expiresAt = new Date(Date.now() + DAY_MS).toISOString();
      const res = await send('put', `/users/${f.user.userId}/roles/${f.viewer.roleId}`, admin, {
        expiresAt,
      });
      assert.equal(res.status, 200);
      const [row] = f.store.auditEvents('RBAC_ROLE_ASSIGNED');
      assert.equal(row.subjectUserId, f.user.userId);
      assert.equal(JSON.parse(row.eventDetails).roleCode, 'WORK_ORDER_VIEWER');

      const effective = await request(f.app)
        .get(`${BASE}/users/${f.user.userId}/effective-permissions`)
        .set('Cookie', admin.cookie);
      assert.equal(effective.body.data[0].actionCode, 'VIEW');

      const removed = await send(
        'delete',
        `/users/${f.user.userId}/roles/${f.viewer.roleId}`,
        admin,
      );
      assert.equal(removed.body.data.changed, true);
      assert.equal(f.store.auditEvents('RBAC_ROLE_UNASSIGNED').length, 1);
    });

    it('rejects a past expiry', async () => {
      const res = await send('put', `/users/${f.user.userId}/roles/${f.viewer.roleId}`, admin, {
        expiresAt: '2020-01-01T00:00:00Z',
      });
      assert.equal(res.status, 400);
    });

    it('refuses self-modification', async () => {
      assertRefused(
        await send('put', `/users/${f.admin.userId}/roles/${f.viewer.roleId}`, admin, {}),
        'SELF_MODIFICATION_FORBIDDEN',
      );
    });

    it('never assigns or removes SUPER_ADMINISTRATOR through the API', async () => {
      const superRole = f.roles.SUPER_ADMINISTRATOR.roleId;
      assertRefused(
        await send('put', `/users/${f.user.userId}/roles/${superRole}`, zaid, {}),
        'PROTECTED_ROLE',
      );
      assertRefused(
        await send('delete', `/users/${f.zaid.userId}/roles/${superRole}`, admin),
        'PROTECTED_ROLE',
      );
    });

    it('reserves administrator roles and protected accounts for the Super Administrator', async () => {
      const main = f.roles.MAIN_ADMINISTRATOR.roleId;
      assertRefused(
        await send('put', `/users/${f.user.userId}/roles/${main}`, admin, {}),
        'SUPER_ADMINISTRATOR_ONLY',
      );
      assertRefused(
        await send('put', `/users/${f.zaid.userId}/roles/${f.viewer.roleId}`, admin, {}),
        'PROTECTED_ACCOUNT',
      );

      const ok = await send('put', `/users/${f.other.userId}/roles/${main}`, zaid, {});
      assert.equal(ok.status, 200);
      // The new main administrator's account is now protected from other administrators.
      assertRefused(
        await send('put', `/users/${f.other.userId}/roles/${f.viewer.roleId}`, admin, {}),
        'PROTECTED_ACCOUNT',
      );
    });

    it('refuses to assign a role whose permissions the actor does not hold', async () => {
      const approver = f.rbac.addRole('APPROVER');
      f.rbac.grant(approver, f.approve);
      assertRefused(
        await send('put', `/users/${f.user.userId}/roles/${approver.roleId}`, admin, {}),
        'PRIVILEGE_ESCALATION_FORBIDDEN',
      );
      assert.equal(
        f.rbac.tables().userRoles.some((ur) => ur.roleId === approver.roleId),
        false,
      );
    });

    it('returns 404 for an unknown user', async () => {
      const res = await send('put', `/users/999999/roles/${f.viewer.roleId}`, admin, {});
      assert.equal(res.status, 404);
    });
  });

  describe('direct overrides', () => {
    const body = { effect: 'DENY', justification: 'Temporarily restricted' };

    it('sets a DENY override that wins over the role grant, then revokes it', async () => {
      f.rbac.assign(f.user, f.viewer);
      const res = await send(
        'put',
        `/users/${f.user.userId}/overrides/${f.view.permissionId}`,
        admin,
        body,
      );
      assert.equal(res.status, 200);
      const [row] = f.store.auditEvents('RBAC_OVERRIDE_SET');
      assert.equal(row.subjectUserId, f.user.userId);
      assert.equal(JSON.parse(row.eventDetails).effect, 'DENY');
      assert.equal(JSON.stringify(row).includes('Temporarily restricted'), false);

      const userSession = await signIn(f.store, f.user, { mfaVerified: false });
      const me = () =>
        request(f.app).get(`${BASE}/me/permissions`).set('Cookie', userSession.cookie);
      assert.deepEqual((await me()).body.data.permissions, []);

      const revoked = await send(
        'delete',
        `/users/${f.user.userId}/overrides/${f.view.permissionId}`,
        admin,
      );
      assert.equal(revoked.body.data.changed, true);
      assert.equal((await me()).body.data.permissions.length, 1);
    });

    it('requires a justification and a valid effect', async () => {
      const res = await send(
        'put',
        `/users/${f.user.userId}/overrides/${f.view.permissionId}`,
        admin,
        {
          effect: 'MAYBE',
          justification: '   ',
        },
      );
      assert.equal(res.status, 400);
      assert.deepEqual(res.body.error.details.map((d) => d.field).sort(), [
        'effect',
        'justification',
      ]);
    });

    it('never overrides the Super Administrator account', async () => {
      assertRefused(
        await send('put', `/users/${f.zaid.userId}/overrides/${f.view.permissionId}`, admin, body),
        'PROTECTED_ACCOUNT',
      );
    });

    it('refuses an ALLOW the actor does not hold and security overrides by others', async () => {
      assertRefused(
        await send('put', `/users/${f.user.userId}/overrides/${f.approve.permissionId}`, admin, {
          ...body,
          effect: 'ALLOW',
        }),
        'PRIVILEGE_ESCALATION_FORBIDDEN',
      );
      const security = f.rbac.permission(SEC, 'ROLES', 'VIEW');
      assertRefused(
        await send(
          'put',
          `/users/${f.user.userId}/overrides/${security.permissionId}`,
          admin,
          body,
        ),
        'SUPER_ADMINISTRATOR_ONLY',
      );
      assertRefused(
        await send('put', `/users/${f.admin.userId}/overrides/${f.view.permissionId}`, admin, body),
        'SELF_MODIFICATION_FORBIDDEN',
      );
    });

    it('treats lifting a DENY as granting access', async () => {
      f.rbac.override(f.user, f.approve, 'DENY');
      assertRefused(
        await send('delete', `/users/${f.user.userId}/overrides/${f.approve.permissionId}`, admin),
        'PRIVILEGE_ESCALATION_FORBIDDEN',
      );
    });
  });

  it('lists a user’s roles and overrides for viewers', async () => {
    f.rbac.assign(f.user, f.viewer, { expiresAt: new Date(f.store.now().getTime() - 1) });
    const roles = await request(f.app)
      .get(`${BASE}/users/${f.user.userId}/roles`)
      .set('Cookie', admin.cookie);
    assert.equal(roles.status, 200);
    assert.equal(roles.body.data[0].effective, false);
    const overrides = await request(f.app)
      .get(`${BASE}/users/${f.user.userId}/overrides`)
      .set('Cookie', admin.cookie);
    assert.deepEqual(overrides.body.data, []);
  });
});

// Phase 03/04 alignment: an account with any *effective* security-administration permission is an
// administrator account (shared PRIVILEGE_COLUMNS classification), even without an administrator
// role. Only the Super Administrator may change its roles or overrides.
describe('security-administration holders are protected accounts', () => {
  let f;
  let zaid;
  let admin;
  let auditView;
  beforeEach(async () => {
    f = setup();
    zaid = await signIn(f.store, f.zaid);
    admin = await signIn(f.store, f.admin);
    auditView = f.rbac.permission(SEC, 'SECURITY_AUDIT', 'VIEW');
  });
  const send = (method, path, session, body) => {
    const req = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body === undefined ? req : req.send(body);
  };
  const assign = (session) =>
    send('put', `/users/${f.other.userId}/roles/${f.viewer.roleId}`, session, {});
  const unassign = (session) =>
    send('delete', `/users/${f.other.userId}/roles/${f.viewer.roleId}`, session);
  const setDeny = (session) =>
    send('put', `/users/${f.other.userId}/overrides/${f.view.permissionId}`, session, {
      effect: 'DENY',
      justification: 'regression test',
    });
  const revokeDeny = (session) =>
    send('delete', `/users/${f.other.userId}/overrides/${f.view.permissionId}`, session);
  const assertProtected = async () => {
    for (const res of [
      await assign(admin),
      await unassign(admin),
      await setDeny(admin),
      await revokeDeny(admin),
    ]) {
      assert.equal(res.status, 403, JSON.stringify(res.body));
      assert.equal(res.body.error.code, 'PROTECTED_ACCOUNT');
      assert.equal(f.store.auditEvents('ACCESS_DENIED').at(-1).reasonCode, 'PROTECTED_ACCOUNT');
    }
    assert.equal(
      f.rbac
        .tables()
        .userRoles.some((ur) => ur.userId === f.other.userId && ur.roleId === f.viewer.roleId),
      false,
    );
    // The Super Administrator still may.
    assert.equal((await assign(zaid)).status, 200);
    assert.equal((await setDeny(zaid)).status, 200);
  };
  const assertOrdinary = async () => {
    assert.equal((await assign(admin)).status, 200);
    assert.equal((await setDeny(admin)).status, 200);
  };
  const auditors = () => {
    const role = f.rbac.addRole('SECURITY_AUDITORS');
    f.rbac.grant(role, auditView);
    return role;
  };

  it('protects a direct, active ALLOW override on a security permission', async () => {
    f.rbac.override(f.other, auditView, 'ALLOW');
    await assertProtected();
  });

  it('protects a role-derived security permission without an administrator role', async () => {
    f.rbac.assign(f.other, auditors());
    await assertProtected();
  });

  it('does not protect through an inactive role grant', async () => {
    const role = auditors();
    f.rbac.assign(f.other, role);
    f.rbac.tables().rolePermissions.find((g) => g.roleId === role.roleId).isActive = false;
    await assertOrdinary();
  });

  it('does not protect through an expired membership, inactive role or expired ALLOW', async () => {
    const role = auditors();
    f.rbac.assign(f.other, role, { expiresAt: new Date(f.store.now().getTime() - 1) });
    f.rbac.override(f.other, auditView, 'ALLOW', {
      expiresAt: new Date(f.store.now().getTime() - 1),
    });
    await assertOrdinary();
    f.rbac.tables().userRoles.find((ur) => ur.roleId === role.roleId).expiresAt = null;
    role.isActive = false;
    assert.equal((await unassign(admin)).status, 200);
  });

  it('does not protect through an inactive security permission', async () => {
    f.rbac.assign(f.other, auditors());
    auditView.isActive = false;
    await assertOrdinary();
  });

  it('does not protect when an effective DENY removes the security permission', async () => {
    f.rbac.assign(f.other, auditors());
    f.rbac.override(f.other, auditView, 'DENY');
    await assertOrdinary();
    // Lifting that DENY would restore security access: Super Administrator only.
    const lift = await send(
      'delete',
      `/users/${f.other.userId}/overrides/${auditView.permissionId}`,
      admin,
    );
    assert.equal(lift.status, 403);
    assert.equal(lift.body.error.code, 'SUPER_ADMINISTRATOR_ONLY');
  });

  it('protects again when an expired DENY no longer removes it', async () => {
    f.rbac.assign(f.other, auditors());
    f.rbac.override(f.other, auditView, 'DENY', {
      expiresAt: new Date(f.store.now().getTime() - 1),
    });
    await assertProtected();
  });

  it('keeps protecting administrator-role holders and the Super Administrator account', async () => {
    f.rbac.assign(f.other, f.roles.MAIN_ADMINISTRATOR);
    await assertProtected();
    const res = await send('put', `/users/${f.zaid.userId}/roles/${f.viewer.roleId}`, admin, {});
    assert.equal(res.body.error.code, 'PROTECTED_ACCOUNT');
  });
});
