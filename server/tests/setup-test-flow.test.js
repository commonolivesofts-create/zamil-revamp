import assert from 'node:assert/strict';
import { after, before, describe, it } from 'node:test';
import { extractToken, preflightProblems, runScenario } from '../scripts/setup-test-flow.js';
import { APPROVED_TEST_RECIPIENT } from '../src/config/index.js';
import { createAuthStore, createTestApp } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { createRecordingDelivery, installRecovery } from './helpers/recoveryFakes.js';
import { installUsers } from './helpers/usersFakes.js';

// Dry run of the Oracle TEST first-password-setup operator scenario against the in-memory doubles
// over real HTTP; the "inbox" is the recording delivery. Synthetic values only.

const TOKEN = 'b'.repeat(43);
const SMTP = { testRecipientOverride: APPROVED_TEST_RECIPIENT, privilegedDeliveryEnabled: false };

describe('setup operator helpers', () => {
  const safe = {
    env: 'development',
    smtp: {
      enabled: true,
      testRecipientOverride: APPROVED_TEST_RECIPIENT,
      privilegedDeliveryEnabled: false,
      testDatabaseName: 'X_ZPADWTEST',
    },
    links: { baseUrl: 'https://revamp.example.invalid' },
  };

  it('accepts only a safe configuration on the configured TEST database', () => {
    assert.deepEqual(preflightProblems(safe, 'X_ZPADWTEST'), []);
    const cases = [
      [{ ...safe, env: 'production' }, 'X_ZPADWTEST', /production/],
      [{ ...safe, smtp: { ...safe.smtp, enabled: false } }, 'X_ZPADWTEST', /SMTP_ENABLED/],
      [{ ...safe, smtp: { ...safe.smtp, testRecipientOverride: null } }, 'X_ZPADWTEST', /override/],
      [
        { ...safe, smtp: { ...safe.smtp, privilegedDeliveryEnabled: true } },
        'X_ZPADWTEST',
        /privileged/,
      ],
      [safe, 'X_ZPADWPROD', /TEST database/],
      [safe, null, /TEST database/],
      [{ ...safe, links: { baseUrl: null } }, 'X_ZPADWTEST', /AUTH_FRONTEND_BASE_URL/],
    ];
    for (const [cfg, db, pattern] of cases)
      assert.match(preflightProblems(cfg, db).join(';'), pattern);
  });

  it('extracts the token from the e-mailed link or a bare token', () => {
    assert.equal(extractToken(`https://x.invalid/password/setup#token=${TOKEN}`), TOKEN);
    assert.equal(extractToken(`  ${TOKEN}  `), TOKEN);
    assert.equal(extractToken('https://x.invalid/password/setup#token=short'), null);
    assert.equal(extractToken('not a token'), null);
  });
});

describe('setup operator scenario (in-memory dry run)', () => {
  let server;
  let root;
  let store;
  let delivery;
  let zaid;
  let target;

  before(async () => {
    store = createAuthStore();
    const rbac = installRbac(store, { syncPrivilegeFlags: true });
    installUsers(store);
    installRecovery(store);
    delivery = createRecordingDelivery({
      testRecipientOverride: APPROVED_TEST_RECIPIENT,
      privilegedDeliveryEnabled: false,
    });
    store.delivery = delivery;
    const { roles } = rbac.seedSecurityCatalog();
    store.addEmployee({ employeeNumber: '2172', username: 'ZAID' });
    zaid = store.addUser('2172', { mfaEnrolledAt: store.now(), passwordHash: 'x' });
    rbac.assign(zaid, roles.SUPER_ADMINISTRATOR);
    store.addEmployee({
      employeeNumber: '2502',
      username: 'MUBEEN.GURMANI',
      email: 'employee@example.invalid',
    });
    target = store.addUser('2502', {
      accountStatus: 'PENDING',
      passwordHash: null,
      passwordChangedAt: null,
    });
    server = createTestApp(store).listen(0, '127.0.0.1');
    await new Promise((resolve) => server.once('listening', resolve));
    root = `http://127.0.0.1:${server.address().port}/api/v1`;
  });
  after(() => server.close());

  const client = (cookie) => {
    const jar = { cookie };
    const call = (base) =>
      async function request(method, path, { body, csrf } = {}) {
        const headers = { Accept: 'application/json' };
        if (body !== undefined) headers['Content-Type'] = 'application/json';
        if (csrf) headers['X-CSRF-Token'] = csrf;
        if (jar.cookie) headers.Cookie = jar.cookie;
        const res = await fetch(`${base}${path}`, {
          method,
          headers,
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        const set = res.headers.getSetCookie().find((c) => c.includes('='));
        if (set) jar.cookie = set.split(';')[0].endsWith('=') ? null : set.split(';')[0];
        return { status: res.status, payload: res.status === 204 ? null : await res.json() };
      };
    return { auth: call(`${root}/auth`), api: call(root) };
  };

  it('issues one TEST-mailbox e-mail, completes setup and verifies ordinary access', async () => {
    const session = await signIn(store, zaid);
    const admin = client(session.cookie);
    const answers = [
      () => 'yes',
      () => `https://revamp.example.invalid/password/setup#token=${delivery.messages[0].token}`,
      () => 'New-Passw0rd!x',
      () => 'New-Passw0rd!x',
    ];
    const lines = [];
    const failures = await runScenario({
      say: (line) => lines.push(line),
      ask: async () => answers.shift()(),
      auth: admin.auth,
      api: admin.api,
      newClient: () => client(null),
      signedIn: { csrf: session.csrf },
      employee: '2502',
      expectUsername: 'MUBEEN.GURMANI',
      smtp: SMTP,
    });
    assert.equal(failures, 0, lines.filter((l) => /^(FAIL|STOP)/.test(l)).join('\n'));
    assert.equal(delivery.messages.length, 1);
    assert.equal(delivery.messages[0].recipient.address, APPROVED_TEST_RECIPIENT);
    assert.equal(
      lines.some((l) => l.includes(delivery.messages[0].token)),
      false,
    );
    assert.equal(
      lines.some((l) => l.includes('New-Passw0rd')),
      false,
    );
    assert.equal(store.user(target.userId).accountStatus, 'ACTIVE');
    assert.equal(
      store.state.rbac.userRoles.some((ur) => ur.userId === target.userId),
      false,
    );
    assert.equal(store.state.actionTokens[0].consumedAt instanceof Date, true);
  });

  it('stops before sending when the target is no longer PENDING', async () => {
    const session = await signIn(store, zaid);
    const admin = client(session.cookie);
    const lines = [];
    const failures = await runScenario({
      say: (line) => lines.push(line),
      ask: async () => assert.fail('must not prompt'),
      auth: admin.auth,
      api: admin.api,
      newClient: () => client(null),
      signedIn: { csrf: session.csrf },
      employee: '2502',
      expectUsername: 'MUBEEN.GURMANI',
      smtp: SMTP,
    });
    assert.ok(failures > 0);
    assert.ok(lines.some((l) => l.startsWith('STOP')));
    assert.equal(delivery.messages.length, 1);
  });

  it('stops before sending when the effective recipient would be the employee', async () => {
    store.user(target.userId).accountStatus = 'PENDING';
    store.user(target.userId).passwordHash = null;
    const session = await signIn(store, zaid);
    const admin = client(session.cookie);
    const lines = [];
    const failures = await runScenario({
      say: (line) => lines.push(line),
      ask: async () => assert.fail('must not prompt'),
      auth: admin.auth,
      api: admin.api,
      newClient: () => client(null),
      signedIn: { csrf: session.csrf },
      employee: '2502',
      expectUsername: 'MUBEEN.GURMANI',
      smtp: { testRecipientOverride: null, privilegedDeliveryEnabled: false },
    });
    assert.ok(failures > 0);
    assert.ok(lines.some((l) => l.startsWith('FAIL  effective recipient')));
    assert.equal(delivery.messages.length, 1);
  });
});
