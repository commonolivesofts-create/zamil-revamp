import assert from 'node:assert/strict';
import { after, beforeEach, describe, it } from 'node:test';
import { runScenario as runRecovery } from '../scripts/recovery-test-flow.js';
import { runScenario as runRbac } from '../scripts/rbac-user-test-flow.js';
import { createClient } from '../scripts/mfa-test-flow.js';
import { clientFor, testEnvironmentProblems } from '../scripts/operator-session.js';
import { APPROVED_TEST_RECIPIENT } from '../src/config/index.js';
import { addActiveAccount, createAuthStore, createTestApp } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { createRecordingDelivery, installRecovery } from './helpers/recoveryFakes.js';
import { installUsers } from './helpers/usersFakes.js';

// Dry runs of the Phase 06 Oracle TEST operator scenarios against the in-memory doubles over real
// HTTP, so the tools are known to work before real credentials are used. Synthetic values only.

const PASSWORD = 'Correct-Horse1!';
const SMTP = { testRecipientOverride: APPROVED_TEST_RECIPIENT, privilegedDeliveryEnabled: false };

describe('TEST environment gate', () => {
  it('requires non-production and the configured TEST database', () => {
    const cfg = { env: 'development', smtp: { testDatabaseName: 'X_ZPADWTEST' } };
    assert.deepEqual(testEnvironmentProblems(cfg, 'X_ZPADWTEST'), []);
    assert.match(
      testEnvironmentProblems({ ...cfg, env: 'production' }, 'X_ZPADWTEST')[0],
      /production/,
    );
    assert.match(testEnvironmentProblems(cfg, 'X_ZPADWPROD')[0], /TEST database/);
    assert.match(
      testEnvironmentProblems({ env: 'development', smtp: {} }, 'X')[0],
      /not configured/,
    );
  });
});

describe('Phase 06 operator scenarios (in-memory dry runs)', () => {
  let store;
  let server;
  let root;
  let zaid;
  let user;
  let delivery;

  beforeEach(async () => {
    server?.close();
    store = createAuthStore();
    const rbac = installRbac(store, { syncPrivilegeFlags: true });
    installUsers(store);
    installRecovery(store);
    delivery = createRecordingDelivery(SMTP);
    store.delivery = delivery;
    store.backgroundTasks = new Set();
    const { roles } = rbac.seedSecurityCatalog();
    store.addEmployee({ employeeNumber: '2172', username: 'ZAID' });
    zaid = store.addUser('2172', { mfaEnrolledAt: store.now(), passwordHash: 'x' });
    rbac.assign(zaid, roles.SUPER_ADMINISTRATOR);
    user = (
      await addActiveAccount(store, {
        password: PASSWORD,
        employee: {
          employeeNumber: '2502',
          username: 'MUBEEN.GURMANI',
          email: 'employee@example.invalid',
        },
      })
    ).user;
    server = createTestApp(store).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    root = `http://127.0.0.1:${server.address().port}/api/v1`;
  });
  after(() => server?.close());

  const scripted = (answers) => async () => {
    const next = answers.shift();
    return typeof next === 'function' ? next() : next;
  };
  const run = async (scenario, args) => {
    const lines = [];
    const failures = await scenario({ say: (l) => lines.push(l), ...args });
    return { failures, lines, problems: lines.filter((l) => /^(FAIL|STOP)/.test(l)).join('\n') };
  };

  it('RBAC: grants, overrides and precedence are evaluated, then fully deactivated', async () => {
    const session = await signIn(store, zaid);
    const jar = { store() {}, header: () => session.cookie };
    const admin = { auth: createClient(`${root}/auth`, jar), api: createClient(root, jar) };
    const { failures, lines, problems } = await run(runRbac, {
      ask: scripted(['yes', 'y', PASSWORD]),
      admin,
      signedIn: { csrf: session.csrf },
      newClient: () => clientFor(root),
      employee: '2502',
      expectUsername: 'MUBEEN.GURMANI',
    });
    assert.equal(failures, 0, problems);
    assert.ok(lines.some((l) => l.startsWith('PASS  explicit DENY wins over the role grant')));
    assert.ok(lines.some((l) => l.startsWith('PASS  employee sees exactly APPROVE')));
    const t = store.state.rbac;
    assert.equal(t.modules.find((m) => m.moduleCode.startsWith('ZRV_IT_')).isActive, false);
    assert.equal(t.roles.find((r) => r.roleCode.startsWith('ZRV_IT_')).isActive, false);
    assert.equal(
      t.permissions.filter(
        (p) =>
          p.isActive &&
          t.resources.find((r) => r.resourceId === p.resourceId).resourceCode === 'ITEMS',
      ).length,
      0,
    );
    assert.equal(t.userRoles.filter((ur) => ur.userId === user.userId && ur.isActive).length, 0);
    assert.equal(t.overrides.filter((o) => o.userId === user.userId && o.isActive).length, 0);
    assert.equal(
      lines.some((l) => l.includes(PASSWORD)),
      false,
    );
  });

  it('RBAC: stops before any write when the employee already has a role', async () => {
    const role = store.state.rbac.roles.find((r) => r.roleCode === 'ADMINISTRATOR');
    store.state.rbac.userRoles.push({
      userId: user.userId,
      roleId: role.roleId,
      isActive: true,
      expiresAt: null,
    });
    const session = await signIn(store, zaid);
    const jar = { store() {}, header: () => session.cookie };
    const { failures, lines } = await run(runRbac, {
      ask: async () => assert.fail('must not prompt'),
      admin: { auth: createClient(`${root}/auth`, jar), api: createClient(root, jar) },
      signedIn: { csrf: session.csrf },
      newClient: () => clientFor(root),
      employee: '2502',
      expectUsername: 'MUBEEN.GURMANI',
    });
    assert.ok(failures > 0);
    assert.ok(lines.some((l) => l.startsWith('STOP')));
    assert.equal(
      store.state.rbac.modules.some((m) => m.moduleCode.startsWith('ZRV_IT_')),
      false,
    );
  });

  it('change: ends every session; new password works, old one is refused', async () => {
    const { failures, problems, lines } = await run(runRecovery, {
      ask: scripted([PASSWORD, 'yes', 'New-Passw0rd!x', 'New-Passw0rd!x']),
      newClient: () => clientFor(root),
      mode: 'change',
      expectUsername: 'MUBEEN.GURMANI',
      smtp: SMTP,
    });
    assert.equal(failures, 0, problems);
    assert.equal(store.auditEvents('PASSWORD_CHANGED')[0].reasonCode, 'PASSWORD_CHANGE');
    assert.equal(
      store.state.sessions.filter((s) => s.userId === user.userId && !s.revokedAt).length,
      0,
    );
    assert.equal(
      lines.some((l) => l.includes('New-Passw0rd')),
      false,
    );
  });

  it('reset: one TEST-mailbox e-mail, single-use link, new password works', async () => {
    const { failures, problems } = await run(runRecovery, {
      ask: scripted([
        PASSWORD,
        'yes',
        () => `https://revamp.example.invalid/password/reset#token=${delivery.messages[0].token}`,
        'New-Passw0rd!x',
        'New-Passw0rd!x',
      ]),
      newClient: () => clientFor(root),
      mode: 'reset',
      expectUsername: 'MUBEEN.GURMANI',
      smtp: SMTP,
      settle: () => Promise.all([...store.backgroundTasks]),
    });
    assert.equal(failures, 0, problems);
    assert.equal(delivery.messages.length, 1);
    assert.equal(delivery.messages[0].recipient.address, APPROVED_TEST_RECIPIENT);
    assert.equal(store.auditEvents('PASSWORD_CHANGED')[0].reasonCode, 'PASSWORD_RESET');
  });

  it('reset: refuses to send when the recipient would be the employee', async () => {
    const { failures, lines } = await run(runRecovery, {
      ask: scripted([PASSWORD]),
      newClient: () => clientFor(root),
      mode: 'reset',
      expectUsername: 'MUBEEN.GURMANI',
      smtp: { testRecipientOverride: null, privilegedDeliveryEnabled: false },
    });
    assert.ok(failures > 0);
    assert.ok(lines.some((l) => l.startsWith('STOP  unexpected recipient')));
    assert.equal(delivery.messages.length, 0);
  });
});
