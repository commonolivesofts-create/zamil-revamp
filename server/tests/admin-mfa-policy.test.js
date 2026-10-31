import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { config, isLoopbackHost, loadConfig } from '../src/config/index.js';
import { decide } from '../src/modules/access-control/authorization.service.js';
import { evaluateMfaRequirement } from '../src/modules/auth/auth.eligibility.js';
import { PRIVILEGE_CLASSIFICATION } from '../src/modules/auth/auth.policy.js';
import { createMfaKeyring } from '../src/modules/auth/mfaSecret.js';
import {
  addActiveAccount,
  createAuthStore,
  createTestApp,
  DAY_MS,
  TEST_MFA_KEY,
} from './helpers/authFakes.js';
import { installRbac } from './helpers/rbacFakes.js';

// AUTH_ADMIN_MFA_REQUIRED: configuration rules, the central policy, and the HTTP behaviour of login,
// session validation and authorization. Supertest + in-memory doubles; Oracle SQL is not exercised.

const PASSWORD = 'Correct-Horse1!';
const SEC = 'SECURITY_ADMINISTRATION';
const [PROTECTED_EMPLOYEE] = PRIVILEGE_CLASSIFICATION.protectedEmployeeNumbers;
const SESSION_COOKIE = config.auth.cookie.name;
const keyring = createMfaKeyring({ encryptionKey: TEST_MFA_KEY, keyId: config.auth.mfa.keyId });

// Synthetic values only; never real credentials.
const baseEnv = (overrides = {}) => ({
  NODE_ENV: 'development',
  ORACLE_USER: 'app_user',
  ORACLE_PASSWORD: 'db-secret',
  ORACLE_WALLET_DIR: '../secrets/oracle/Wallet_example',
  ORACLE_WALLET_PASSWORD: 'wallet-secret',
  ORACLE_LOW_ALIAS: 'example_low',
  ORACLE_HIGH_ALIAS: 'example_high',
  AUTH_MFA_ENCRYPTION_KEY: Buffer.alloc(32, 7).toString('base64'),
  ...overrides,
});

describe('AUTH_ADMIN_MFA_REQUIRED configuration', () => {
  it('defaults to true when unset (development)', () => {
    assert.equal(loadConfig(baseEnv()).auth.adminMfaRequired, true);
  });

  it('accepts true in development, UAT and production', () => {
    for (const NODE_ENV of ['development', 'uat', 'production']) {
      const loaded = loadConfig(baseEnv({ NODE_ENV, AUTH_ADMIN_MFA_REQUIRED: 'true' }));
      assert.equal(loaded.auth.adminMfaRequired, true, NODE_ENV);
    }
  });

  it('accepts false for local development on loopback without a trusted proxy', () => {
    const loaded = loadConfig(baseEnv({ AUTH_ADMIN_MFA_REQUIRED: 'false' }));
    assert.equal(loaded.auth.adminMfaRequired, false);
    assert.equal(loaded.http.host, '127.0.0.1');
    for (const HTTP_HOST of ['127.0.0.1', '127.0.0.2', '::1']) {
      assert.equal(
        loadConfig(baseEnv({ AUTH_ADMIN_MFA_REQUIRED: 'false', HTTP_HOST })).auth.adminMfaRequired,
        false,
        HTTP_HOST,
      );
    }
  });

  it('allows false in the explicit Test profile on its shared listener', () => {
    const loaded = loadConfig(baseEnv({ APP_ENV: 'Test', AUTH_ADMIN_MFA_REQUIRED: 'false' }));
    assert.equal(loaded.env, 'test');
    assert.equal(loaded.http.host, '0.0.0.0');
    assert.equal(loaded.port, 7381);
    assert.equal(loaded.auth.adminMfaRequired, false);
    assert.throws(
      () =>
        loadConfig(
          baseEnv({ APP_ENV: 'Test', AUTH_ADMIN_MFA_REQUIRED: 'false', TRUST_PROXY_HOPS: '1' }),
        ),
      /APP_ENV=Test requires HTTP_HOST=0.0.0.0 and TRUST_PROXY_HOPS=0/,
    );
  });

  it('refuses false in UAT, production and test (startup fails, nothing is overridden)', () => {
    for (const NODE_ENV of ['uat', 'production', 'test']) {
      assert.throws(
        () => loadConfig(baseEnv({ NODE_ENV, AUTH_ADMIN_MFA_REQUIRED: 'false' })),
        /may be false only in local development or APP_ENV=Test/,
        NODE_ENV,
      );
    }
  });

  it('refuses the exception on an exposed listener or behind a reverse proxy', () => {
    for (const HTTP_HOST of ['0.0.0.0', '::', '192.168.1.20', '10.0.0.5']) {
      assert.throws(
        () => loadConfig(baseEnv({ AUTH_ADMIN_MFA_REQUIRED: 'false', HTTP_HOST })),
        /requires a loopback HTTP_HOST/,
        HTTP_HOST,
      );
    }
    assert.throws(
      () => loadConfig(baseEnv({ AUTH_ADMIN_MFA_REQUIRED: 'false', TRUST_PROXY_HOPS: '1' })),
      /not allowed behind a reverse proxy/,
    );
    // The same listener settings are fine while MFA stays required.
    assert.equal(loadConfig(baseEnv({ HTTP_HOST: '0.0.0.0' })).auth.adminMfaRequired, true);
  });

  it('rejects anything other than exact true/false', () => {
    for (const value of ['TRUE', 'False', 'yes', 'no', '1', '0', '', 'off']) {
      assert.throws(
        () => loadConfig(baseEnv({ AUTH_ADMIN_MFA_REQUIRED: value })),
        /AUTH_ADMIN_MFA_REQUIRED/,
        JSON.stringify(value),
      );
    }
  });

  it('recognises loopback addresses only', () => {
    for (const host of ['127.0.0.1', '127.10.0.1', '::1', '::ffff:127.0.0.1']) {
      assert.equal(isLoopbackHost(host), true, host);
    }
    for (const host of ['0.0.0.0', '::', '128.0.0.1', '192.168.0.1', 'localhost', '', undefined]) {
      assert.equal(isLoopbackHost(host), false, String(host));
    }
  });

  it('logs the approved startup warning when the exception is active', () => {
    const server = readFileSync(new URL('../src/server.js', import.meta.url), 'utf8');
    assert.match(server, /if \(config\.auth\.adminMfaRequired === false\) \{\s*logger\.warn\(/);
    assert.ok(
      server.includes("'WARNING: Administrator MFA requirement is disabled for this environment.'"),
    );
  });
});

describe('administrator MFA policy', () => {
  const ordinary = {
    employeeNumber: '4001',
    mfaEnrolled: false,
    isPrivilegedRoleMember: false,
    hasSecurityAdministration: false,
  };
  const exception = { adminMfaRequired: false };

  it('keeps the approved requirement by default and when explicitly required', () => {
    for (const policy of [undefined, {}, { adminMfaRequired: true }]) {
      assert.deepEqual(
        evaluateMfaRequirement({ ...ordinary, isPrivilegedRoleMember: true }, policy),
        {
          required: true,
          privileged: true,
          basis: 'PRIVILEGED_ROLE',
        },
      );
    }
  });

  it('exempts every privileged basis only under the exception, still classifying it privileged', () => {
    for (const [account, basis] of [
      [{ ...ordinary, employeeNumber: PROTECTED_EMPLOYEE }, 'PROTECTED_ADMINISTRATOR'],
      [{ ...ordinary, isPrivilegedRoleMember: true }, 'PRIVILEGED_ROLE'],
      [{ ...ordinary, hasSecurityAdministration: true }, 'SECURITY_ADMINISTRATION_PERMISSION'],
      [{ ...ordinary, isPrivilegedRoleMember: true, mfaEnrolled: true }, 'PRIVILEGED_ROLE'],
    ]) {
      assert.deepEqual(evaluateMfaRequirement(account, exception), {
        required: false,
        privileged: true,
        basis,
        exempted: true,
      });
    }
  });

  it('keeps voluntary MFA for ordinary employees under the exception', () => {
    assert.deepEqual(evaluateMfaRequirement({ ...ordinary, mfaEnrolled: true }, exception), {
      required: true,
      privileged: false,
      basis: 'MFA_ENROLLED',
    });
    assert.deepEqual(evaluateMfaRequirement(ordinary, exception), {
      required: false,
      privileged: false,
    });
  });

  it('waives only the MFA condition of security authorization', () => {
    const permission = { moduleCode: SEC, resourceCode: 'ROLES', actionCode: 'VIEW' };
    const granted = {
      permissionId: '9',
      catalogActive: true,
      denied: false,
      allowedByRole: true,
      allowedByOverride: false,
    };
    const unverified = { userId: '1', mfaVerified: false };
    assert.equal(decide(granted, permission, unverified).reason, 'MFA_REQUIRED');
    assert.equal(
      decide(granted, permission, unverified, { adminMfaRequired: true }).reason,
      'MFA_REQUIRED',
    );
    assert.equal(decide(granted, permission, unverified, exception).allowed, true);
    assert.equal(
      decide({ ...granted, denied: true }, permission, unverified, exception).reason,
      'EXPLICIT_DENY',
    );
    assert.equal(
      decide({ ...granted, allowedByRole: false }, permission, unverified, exception).reason,
      'NO_GRANT',
    );
    assert.equal(
      decide({ ...granted, catalogActive: false }, permission, unverified, exception).reason,
      'PERMISSION_INACTIVE',
    );
  });
});

describe('administrator sign-in and access under AUTH_ADMIN_MFA_REQUIRED', () => {
  let store;
  let rbac;
  let roles;
  let admin;
  let employee;
  let rolesView;

  const appFor = (adminMfaRequired) =>
    createTestApp(store, { adminMfaRequired, mfa: { encryptionKey: TEST_MFA_KEY } });
  const login = (app, username, password = PASSWORD) =>
    request(app).post('/api/v1/auth/login').send({ username, password });
  const sessionCookie = (res) =>
    (res.headers['set-cookie'] ?? [])
      .find((item) => item.startsWith(`${SESSION_COOKIE}=`))
      ?.split(';')[0];
  const sessionRow = (userId) => store.state.sessions.filter((s) => s.userId === userId).at(-1);

  beforeEach(async () => {
    store = createAuthStore();
    rbac = installRbac(store, { syncPrivilegeFlags: true });
    ({ roles } = rbac.seedSecurityCatalog());
    rolesView = rbac.permission(SEC, 'ROLES', 'VIEW');
    rbac.grant(roles.ADMINISTRATOR, rolesView);
    admin = await addActiveAccount(store, {
      password: PASSWORD,
      employee: { username: 'admin.dev' },
    });
    rbac.assign(admin.user, roles.ADMINISTRATOR);
    employee = await addActiveAccount(store, {
      password: PASSWORD,
      employee: { username: 'staff.user' },
    });
  });

  it('development + false: an administrator without MFA signs in and uses permitted security administration', async () => {
    const app = appFor(false);
    const res = await login(app, 'admin.dev').expect(200);
    assert.equal(res.body.data.authenticated, true, 'no MFA challenge');
    assert.equal(res.body.data.session.mfaVerified, false, 'never reported as verified');
    assert.equal(res.body.data.session.idleTimeoutSeconds, 900, 'privileged idle timeout kept');
    const cookie = sessionCookie(res);

    const me = await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
    assert.equal(me.body.data.session.mfaVerified, false);

    const mine = await request(app)
      .get('/api/v1/access-control/me/permissions')
      .set('Cookie', cookie)
      .expect(200);
    assert.equal(mine.body.data.mfaVerified, false);
    assert.equal(mine.body.data.adminMfaRequired, false);

    await request(app).get('/api/v1/access-control/roles').set('Cookie', cookie).expect(200);
  });

  it('never records an MFA verification that did not happen', async () => {
    await login(appFor(false), 'admin.dev').expect(200);
    assert.equal(sessionRow(admin.user.userId).mfaVerifiedAt ?? null, null);
    const success = store.auditEvents('LOGIN_SUCCESS').at(-1);
    const details = JSON.parse(success.eventDetails);
    assert.equal(details.mfaVerified, false);
    assert.equal(details.mfaExemption, 'LOCAL_DEVELOPMENT');
  });

  it('development + false: an enrolled administrator signs in without a challenge and the secret is untouched', async () => {
    Object.assign(store.user(admin.user.userId), {
      mfaTotpSecretEncrypted: keyring.encrypt(admin.user.userId, Buffer.alloc(20, 3)),
      mfaEnrolledAt: store.now(),
    });
    const before = { ...store.user(admin.user.userId) };
    const res = await login(appFor(false), 'admin.dev').expect(200);
    assert.equal(res.body.data.authenticated, true);
    assert.equal(res.body.data.session.mfaVerified, false);
    const after = store.user(admin.user.userId);
    assert.equal(after.mfaTotpSecretEncrypted, before.mfaTotpSecretEncrypted);
    assert.equal(after.mfaEnrolledAt, before.mfaEnrolledAt);
    assert.equal(after.mfaLastUsedStep, before.mfaLastUsedStep);
  });

  it('development + true: administrators get the existing enrollment or verification challenge', async () => {
    const app = appFor(true);
    const first = await login(app, 'admin.dev').expect(200);
    assert.equal(first.body.data.authenticated, false);
    assert.equal(first.body.data.mfa.enrollmentRequired, true);
    assert.equal(sessionCookie(first), undefined, 'no session without MFA');

    Object.assign(store.user(admin.user.userId), {
      mfaTotpSecretEncrypted: keyring.encrypt(admin.user.userId, Buffer.alloc(20, 3)),
      mfaEnrolledAt: store.now(),
    });
    const second = await login(app, 'admin.dev').expect(200);
    assert.equal(second.body.data.authenticated, false);
    assert.equal(second.body.data.mfa.enrollmentRequired, false);
  });

  it('ordinary employees are unchanged: no challenge, and voluntary MFA is still required', async () => {
    const app = appFor(false);
    const res = await login(app, 'staff.user').expect(200);
    assert.equal(res.body.data.authenticated, true);
    assert.equal(res.body.data.session.idleTimeoutSeconds, 1800);
    await request(app)
      .get('/api/v1/access-control/roles')
      .set('Cookie', sessionCookie(res))
      .expect(403);

    Object.assign(store.user(employee.user.userId), {
      mfaTotpSecretEncrypted: keyring.encrypt(employee.user.userId, Buffer.alloc(20, 4)),
      mfaEnrolledAt: store.now(),
    });
    const enrolled = await login(app, 'staff.user').expect(200);
    assert.equal(
      enrolled.body.data.authenticated,
      false,
      'voluntarily enrolled MFA still challenged',
    );
  });

  it('password, account state and password expiry are still enforced under the exception', async () => {
    const app = appFor(false);
    const wrong = await login(app, 'admin.dev', 'Wrong-Password1!').expect(401);
    assert.equal(wrong.body.error.code, 'AUTHENTICATION_FAILED');

    store.user(admin.user.userId).passwordChangedAt = new Date(store.now().getTime() - 91 * DAY_MS);
    const expired = await login(app, 'admin.dev').expect(403);
    assert.equal(expired.body.error.code, 'PASSWORD_EXPIRED');
    store.user(admin.user.userId).passwordChangedAt = store.now();

    store.user(admin.user.userId).lockedUntil = new Date(store.now().getTime() + 60_000);
    assert.equal(
      (await login(app, 'admin.dev').expect(401)).body.error.code,
      'AUTHENTICATION_FAILED',
    );
    store.user(admin.user.userId).lockedUntil = null;

    store.user(admin.user.userId).accountStatus = 'DISABLED';
    assert.equal(
      (await login(app, 'admin.dev').expect(401)).body.error.code,
      'AUTHENTICATION_FAILED',
    );
  });

  it('RBAC still decides: missing grants and explicit DENY overrides are refused', async () => {
    const app = appFor(false);
    const cookie = sessionCookie(await login(app, 'admin.dev').expect(200));
    const catalog = await request(app)
      .get('/api/v1/access-control/catalog')
      .set('Cookie', cookie)
      .expect(403);
    assert.equal(catalog.body.error.code, 'FORBIDDEN');

    rbac.override(admin.user, rolesView, 'DENY');
    await request(app).get('/api/v1/access-control/roles').set('Cookie', cookie).expect(403);
    const denial = store.auditEvents('ACCESS_DENIED').at(-1);
    assert.equal(denial.reasonCode, 'EXPLICIT_DENY');
  });

  it('re-enabling mandatory MFA ends sessions created under the exception', async () => {
    const cookie = sessionCookie(await login(appFor(false), 'admin.dev').expect(200));
    const strict = appFor(true);
    await request(strict).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    assert.ok(sessionRow(admin.user.userId).revokedAt, 'the unverified session is revoked');
    await request(strict).get('/api/v1/access-control/roles').set('Cookie', cookie).expect(401);
    // Even if it were still accepted, the exception-free evaluator would refuse it.
    const again = await login(strict, 'admin.dev').expect(200);
    assert.equal(again.body.data.authenticated, false, 'a fresh sign-in requires MFA again');
  });

  it('sensitive actions that need a recent MFA verification stay unavailable without one', async () => {
    const app = appFor(false);
    Object.assign(store.user(admin.user.userId), {
      mfaTotpSecretEncrypted: keyring.encrypt(admin.user.userId, Buffer.alloc(20, 3)),
      mfaEnrolledAt: store.now(),
    });
    const res = await login(app, 'admin.dev').expect(200);
    const replacement = await request(app)
      .post('/api/v1/auth/mfa/replacement')
      .set('Cookie', sessionCookie(res))
      .set('X-CSRF-Token', res.body.data.csrf.token)
      .send({})
      .expect(403);
    assert.equal(replacement.body.error.code, 'MFA_RECENT_VERIFICATION_REQUIRED');
  });
});
