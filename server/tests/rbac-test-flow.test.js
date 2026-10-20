import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { runScenario, tempRoleCode } from '../scripts/rbac-test-flow.js';
import { createAuthStore, createTestApp } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';

// Dry run of the Oracle TEST operator scenario against the in-memory doubles over real HTTP, so
// the tool is known to work before a real MFA sign-in is spent on it.
describe('RBAC integration operator scenario (in-memory dry run)', () => {
  let server;
  let root;
  let store;
  let rbac;
  let zaid;
  let session;

  before(async () => {
    store = createAuthStore();
    rbac = installRbac(store, { syncPrivilegeFlags: true });
    const { roles } = rbac.seedSecurityCatalog();
    store.addEmployee({ employeeNumber: '2172', username: 'ZAID' });
    zaid = store.addUser('2172', { mfaEnrolledAt: store.now() });
    rbac.assign(zaid, roles.SUPER_ADMINISTRATOR);
    session = await signIn(store, zaid);
    server = createTestApp(store).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    root = `http://127.0.0.1:${server.address().port}/api/v1`;
  });
  after(() => server.close());

  const client = (base, cookie) =>
    async function call(method, path, { body, csrf } = {}) {
      const headers = { Accept: 'application/json' };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (csrf) headers['X-CSRF-Token'] = csrf;
      if (cookie) headers.Cookie = cookie;
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, payload: res.status === 204 ? null : await res.json() };
    };

  it('passes every check and leaves only an inactive, member-less temporary role', async () => {
    const lines = [];
    const failures = await runScenario({
      say: (line) => lines.push(line),
      auth: client(`${root}/auth`, session.cookie),
      rbac: Object.assign(client(root, session.cookie), { root }),
      signedIn: { csrf: session.csrf },
      now: new Date('2026-10-20T10:11:12Z'),
    });
    assert.equal(failures, 0, lines.filter((l) => l.startsWith('FAIL')).join('\n'));

    const temp = rbac.role(tempRoleCode(new Date('2026-10-20T10:11:12Z')));
    assert.equal(temp.roleCode, 'ZRV_IT_TEMP_20261020101112');
    assert.equal(temp.isActive, false);
    const tables = rbac.tables();
    assert.equal(
      tables.rolePermissions.filter((g) => g.roleId === temp.roleId && g.isActive).length,
      0,
    );
    assert.equal(
      tables.userRoles.some((ur) => ur.roleId === temp.roleId),
      false,
    );
    assert.deepEqual(
      store.state.audit
        .filter((r) => r.targetType === 'ROLE' && r.targetRecordId === temp.roleId)
        .map((r) => r.eventCode),
      [
        'RBAC_ROLE_CREATED',
        'RBAC_ROLE_UPDATED',
        'RBAC_PERMISSION_GRANTED',
        'RBAC_PERMISSION_REVOKED',
        'RBAC_ROLE_DEACTIVATED',
      ],
    );
    assert.ok(store.auditEvents('ACCESS_DENIED').length >= 7);
    assert.equal(tables.overrides.length, 0);
  });
});
