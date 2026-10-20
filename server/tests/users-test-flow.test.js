import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { runScenario } from '../scripts/users-test-flow.js';
import { createAuthStore, createTestApp } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installUsers } from './helpers/usersFakes.js';

// Dry run of the Oracle TEST user-administration operator scenario against the in-memory doubles
// over real HTTP, so the tool is known to work before a real MFA sign-in is spent on it.
describe('user-administration operator scenario (in-memory dry run)', () => {
  let server;
  let root;
  let store;
  let session;

  before(async () => {
    store = createAuthStore();
    const rbac = installRbac(store, { syncPrivilegeFlags: true });
    installUsers(store);
    const { roles } = rbac.seedSecurityCatalog();
    store.addEmployee({ employeeNumber: '2172', username: 'ZAID' });
    const zaid = store.addUser('2172', { mfaEnrolledAt: store.now(), passwordHash: 'x' });
    rbac.assign(zaid, roles.SUPER_ADMINISTRATOR);
    store.addEmployee({ employeeNumber: '2502', username: 'MUBEEN.GURMANI' });
    store.addEmployee({ employeeNumber: '2600', currentEmployeeFlag: 'N' });
    session = await signIn(store, zaid);
    server = createTestApp(store).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    root = `http://127.0.0.1:${server.address().port}/api/v1`;
  });
  after(() => server.close());

  const client = (base) =>
    async function call(method, path, { body, csrf } = {}) {
      const headers = { Accept: 'application/json', Cookie: session.cookie };
      if (body !== undefined) headers['Content-Type'] = 'application/json';
      if (csrf) headers['X-CSRF-Token'] = csrf;
      const res = await fetch(`${base}${path}`, {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return { status: res.status, payload: res.status === 204 ? null : await res.json() };
    };
  const run = async () => {
    const lines = [];
    const failures = await runScenario({
      say: (line) => lines.push(line),
      api: Object.assign(client(root), { root }),
      auth: client(`${root}/auth`),
      signedIn: { csrf: session.csrf },
      employee: '2502',
      expectUsername: 'mubeen.gurmani',
    });
    return { failures, lines };
  };

  it('provisions only the named employee as PENDING and passes every check', async () => {
    const { failures, lines } = await run();
    assert.equal(failures, 0, lines.filter((l) => l.startsWith('FAIL')).join('\n'));
    const accounts = store.state.users.filter((u) => u.employeeNumber === '2502');
    assert.equal(accounts.length, 1);
    assert.equal(accounts[0].accountStatus, 'PENDING');
    assert.equal(accounts[0].passwordHash, null);
    assert.equal(store.state.users.length, 2);
    assert.equal(
      store.state.rbac.userRoles.filter((ur) => ur.userId === accounts[0].userId).length,
      0,
    );
    assert.equal(store.auditEvents('ACCOUNT_PROVISIONED').length, 1);
    assert.equal(store.auditEvents('ACCOUNT_ACTIVATED').length, 0);
    assert.ok(lines.some((l) => l.startsWith('PASS  ineligible employee refused')));
  });

  it('is safe to rerun: no second account and no further write', async () => {
    const { failures, lines } = await run();
    assert.equal(failures, 0, lines.filter((l) => l.startsWith('FAIL')).join('\n'));
    assert.ok(lines.some((l) => l.includes('not provisioning again')));
    assert.equal(store.state.users.filter((u) => u.employeeNumber === '2502').length, 1);
    assert.equal(store.auditEvents('ACCOUNT_PROVISIONED').length, 1);
  });
});
