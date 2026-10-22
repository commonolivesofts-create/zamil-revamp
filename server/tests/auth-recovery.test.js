import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { config } from '../src/config/index.js';
import { createMfaKeyring } from '../src/modules/auth/mfaSecret.js';
import { hotp, timeStep } from '../src/modules/auth/totp.js';
import {
  addActiveAccount,
  createAuthStore,
  createTestApp,
  TEST_MFA_KEY,
} from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { createRecordingDelivery, installRecovery } from './helpers/recoveryFakes.js';
import { installUsers } from './helpers/usersFakes.js';

// Supertest + in-memory doubles (users, sessions, tokens, RBAC, audit); real Argon2id, TOTP and
// AES-GCM. Oracle SQL is not exercised here (see scripts/verify-auth-sql.js).

const PASSWORD = 'Correct-Horse1!';
const NEW_PASSWORD = 'New-Passw0rd!x';
const MINUTE_MS = 60 * 1000;
const SEC = 'SECURITY_ADMINISTRATION';
const keyring = createMfaKeyring({ encryptionKey: TEST_MFA_KEY, keyId: config.auth.mfa.keyId });

function base32Decode(text) {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  let bits = 0;
  let value = 0;
  const bytes = [];
  for (const char of text) {
    value = (value << 5) | alphabet.indexOf(char);
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

async function setup({ delivery = createRecordingDelivery() } = {}) {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  installUsers(store);
  installRecovery(store);
  store.delivery = delivery ?? undefined;
  store.backgroundTasks = new Set();
  const { roles } = rbac.seedSecurityCatalog();

  const account = async (employeeNumber, username, user = {}) =>
    (
      await addActiveAccount(store, {
        password: PASSWORD,
        employee: { employeeNumber, username, email: `${username}@example.invalid` },
        user,
      })
    ).user;
  const enrol = (user) => {
    const secret = randomBytes(20);
    Object.assign(user, {
      mfaTotpSecretEncrypted: keyring.encrypt(user.userId, secret),
      mfaEnrolledAt: store.now(),
    });
    return secret;
  };
  const zaid = await account('2172', 'zaid.s');
  const zaidSecret = enrol(zaid);
  const admin = await account('3001', 'admin.a');
  enrol(admin);
  const main = await account('3002', 'main.m');
  enrol(main);
  const user = await account('4001', 'sara.k');
  rbac.assign(zaid, roles.SUPER_ADMINISTRATOR);
  rbac.assign(main, roles.MAIN_ADMINISTRATOR);
  for (const [resource, action] of [
    ['USER_ACCOUNTS', 'CREATE'],
    ['ACCOUNT_RECOVERY', 'ISSUE'],
  ]) {
    rbac.grant(roles.ADMINISTRATOR, rbac.permission(SEC, resource, action));
  }
  rbac.assign(admin, roles.ADMINISTRATOR);
  // A provisioned PENDING account without a password (Phase 04).
  store.addEmployee({
    employeeNumber: '2502',
    username: 'mubeen.g',
    email: 'mubeen@example.invalid',
  });
  const pending = store.addUser('2502', { accountStatus: 'PENDING', passwordChangedAt: null });

  const app = createTestApp(store, { mfa: { encryptionKey: TEST_MFA_KEY } });
  return { store, rbac, roles, app, delivery, zaid, zaidSecret, admin, main, user, pending };
}

describe('authentication recovery', () => {
  let f;
  let admin;
  let zaid;
  beforeEach(async () => {
    f = await setup();
    admin = await signIn(f.store, f.admin);
    zaid = await signIn(f.store, f.zaid);
  });
  // Self-service requests finish in the background; the helper waits for that work.
  const post = async (path, body, session) => {
    const req = request(f.app).post(path);
    if (session) req.set('Cookie', session.cookie).set('X-CSRF-Token', session.csrf);
    const res = await req.send(body);
    await Promise.all([...f.store.backgroundTasks]);
    return res;
  };
  const issue = (session, userId, body, kind = 'recovery') =>
    post(`/api/v1/users/${userId}/${kind}`, body, session);
  const lastToken = () => f.delivery.messages.at(-1)?.token;
  const audits = (code) => f.store.auditEvents(code);
  const login = (username, password) =>
    request(f.app).post('/api/v1/auth/login').send({ username, password });
  const expectTokenInvalid = (res) => {
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.error.code, 'TOKEN_INVALID');
  };

  describe('password setup (PENDING accounts)', () => {
    const issueSetup = (session = admin, confirm = '2502') =>
      issue(session, f.pending.userId, { confirmEmployeeNumber: confirm }, 'password-setup');

    it('delivers a single-use token only to the channel and activates on verified setup', async () => {
      const res = await issueSetup();
      assert.equal(res.status, 202, JSON.stringify(res.body));
      assert.equal(res.body.data.delivered, true);
      assert.equal(res.body.data.actionType, 'PASSWORD_SETUP');
      const [message] = f.delivery.messages;
      assert.equal(message.recipient.address, 'mubeen@example.invalid');
      assert.equal(JSON.stringify(res.body).includes(message.token), false);
      const [row] = f.store.state.actionTokens;
      assert.notEqual(row.tokenHash, message.token);
      assert.equal(row.expiresAt.getTime() - row.createdAt.getTime(), 24 * 60 * MINUTE_MS);
      const issued = audits('ACTION_TOKEN_ISSUED')[0];
      assert.equal(issued.reasonCode, 'PASSWORD_SETUP');
      assert.equal(JSON.stringify(f.store.state.audit).includes(message.token), false);

      const weak = await post('/api/v1/auth/password/setup', {
        token: message.token,
        newPassword: 'weak',
      });
      assert.equal(weak.status, 400);
      assert.equal(weak.body.error.code, 'PASSWORD_POLICY_VIOLATION');

      const done = await post('/api/v1/auth/password/setup', {
        token: message.token,
        newPassword: NEW_PASSWORD,
      });
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(done.body.data.accountStatus, 'ACTIVE');
      const user = f.store.user(f.pending.userId);
      assert.equal(user.accountStatus, 'ACTIVE');
      assert.ok(user.passwordChangedAt instanceof Date);
      assert.equal(audits('PASSWORD_CHANGED')[0].reasonCode, 'PASSWORD_SETUP');
      assert.equal(audits('ACCOUNT_ACTIVATED')[0].reasonCode, 'PASSWORD_SETUP');
      assert.equal((await login('mubeen.g', NEW_PASSWORD)).status, 200);

      expectTokenInvalid(
        await post('/api/v1/auth/password/setup', {
          token: message.token,
          newPassword: NEW_PASSWORD,
        }),
      );
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'TOKEN_NOT_USABLE');
    });

    it('requires explicit confirmation, eligibility and a PENDING account without password', async () => {
      const mismatch = await issueSetup(admin, '9999');
      assert.equal(mismatch.status, 400);
      assert.equal(mismatch.body.error.code, 'CONFIRMATION_MISMATCH');
      const active = await issue(
        admin,
        f.user.userId,
        { confirmEmployeeNumber: '4001' },
        'password-setup',
      );
      assert.equal(active.status, 409);
      assert.equal(active.body.error.details[0].message, 'ACCOUNT_ACTIVE');
      f.store.state.employees.find((e) => e.employeeNumber === '2502').terminationDate =
        '2026-01-01';
      const ended = await issueSetup();
      assert.equal(ended.status, 409);
      assert.equal(ended.body.error.details[0].message, 'EMPLOYEE_TERMINATED');
      assert.equal(f.delivery.messages.length, 0);
    });

    it('refuses completion when the employee is no longer eligible', async () => {
      await issueSetup();
      f.store.state.employees.find((e) => e.employeeNumber === '2502').currentEmployeeFlag = 'N';
      const res = await post('/api/v1/auth/password/setup', {
        token: lastToken(),
        newPassword: NEW_PASSWORD,
      });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'ACCOUNT_NOT_ELIGIBLE');
      assert.equal(f.store.user(f.pending.userId).accountStatus, 'PENDING');
    });

    it('expires after 24 hours, throttles re-issue and revokes the previous token', async () => {
      await issueSetup();
      const first = lastToken();
      const throttled = await issueSetup();
      assert.equal(throttled.status, 429);
      assert.equal(throttled.body.error.code, 'RECOVERY_THROTTLED');
      f.store.advance(6 * MINUTE_MS);
      admin = await signIn(f.store, f.admin);
      assert.equal((await issueSetup()).status, 202);
      expectTokenInvalid(
        await post('/api/v1/auth/password/setup', { token: first, newPassword: NEW_PASSWORD }),
      );
      f.store.advance(24 * 60 * MINUTE_MS);
      expectTokenInvalid(
        await post('/api/v1/auth/password/setup', {
          token: lastToken(),
          newPassword: NEW_PASSWORD,
        }),
      );
    });

    it('rejects tokens of another type and malformed tokens', async () => {
      await post('/api/v1/auth/recovery/request', {
        username: 'sara.k',
        purpose: 'PASSWORD_RESET',
      });
      expectTokenInvalid(
        await post('/api/v1/auth/password/setup', {
          token: lastToken(),
          newPassword: NEW_PASSWORD,
        }),
      );
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'TOKEN_TYPE_MISMATCH');
      const bad = await post('/api/v1/auth/password/setup', {
        token: 'x',
        newPassword: NEW_PASSWORD,
      });
      assert.equal(bad.status, 400);
      const unknown = await post('/api/v1/auth/password/setup', {
        token: randomBytes(32).toString('base64url'),
        newPassword: NEW_PASSWORD,
      });
      expectTokenInvalid(unknown);
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'TOKEN_UNKNOWN');
    });
  });

  describe('self-service password reset', () => {
    const requestReset = (username) =>
      post('/api/v1/auth/recovery/request', { username, purpose: 'PASSWORD_RESET' });

    it('gives the same response for every username', async () => {
      const known = await requestReset('sara.k');
      const unknown = await requestReset('nobody.here');
      assert.equal(known.status, 202);
      assert.equal(unknown.status, 202);
      assert.deepEqual(known.body.data, unknown.body.data);
      assert.equal(f.delivery.messages.length, 1);
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'UNKNOWN_USERNAME');
    });

    it('resets, clears the lockout, revokes every session and rejects the old password', async () => {
      const session = await signIn(f.store, f.user, { mfaVerified: false });
      Object.assign(f.user, {
        failedLoginAttempts: 5,
        lockedUntil: new Date(f.store.now().getTime() + MINUTE_MS),
      });
      await requestReset('sara.k');
      const token = lastToken();
      assert.equal(
        f.store.state.actionTokens[0].expiresAt.getTime() - f.store.now().getTime(),
        30 * MINUTE_MS,
      );
      const reused = await post('/api/v1/auth/password/reset', { token, newPassword: PASSWORD });
      assert.equal(reused.body.error.code, 'PASSWORD_REUSED');

      const res = await post('/api/v1/auth/password/reset', { token, newPassword: NEW_PASSWORD });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.sessionsRevoked, 1);
      assert.equal(f.store.user(f.user.userId).lockedUntil, null);
      const me = await request(f.app).get('/api/v1/auth/me').set('Cookie', session.cookie);
      assert.equal(me.status, 401);
      assert.equal(audits('PASSWORD_CHANGED')[0].reasonCode, 'PASSWORD_RESET');
      assert.equal(audits('SESSION_REVOKED').at(-1).reasonCode, 'PASSWORD_RESET');
      assert.equal((await login('sara.k', PASSWORD)).status, 401);
      assert.equal((await login('sara.k', NEW_PASSWORD)).status, 200);
    });

    it('lets exactly one of two concurrent completions use the token', async () => {
      await requestReset('sara.k');
      const token = lastToken();
      f.store.holdReads('findToken', 2);
      const results = await Promise.all([
        post('/api/v1/auth/password/reset', { token, newPassword: NEW_PASSWORD }),
        post('/api/v1/auth/password/reset', { token, newPassword: 'Other-Passw0rd!' }),
      ]);
      assert.deepEqual(results.map((r) => r.status).sort(), [200, 400]);
      assert.equal(audits('PASSWORD_CHANGED').length, 1);
    });

    it('is not self-service for privileged accounts other than the Super Administrator', async () => {
      assert.equal((await requestReset('main.m')).status, 202);
      assert.equal(f.delivery.messages.length, 0);
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'SELF_SERVICE_NOT_PERMITTED');
    });

    it('sends the Super Administrator only to the pinned address, others to EMAIL_ADDRESS', async () => {
      await requestReset('zaid.s');
      assert.equal(f.delivery.messages[0].recipient.address, 'zaid.sayyed@zamilplastic.com');
      assert.equal(f.delivery.messages[0].recipient.source, 'PINNED');
      await requestReset('sara.k');
      assert.deepEqual(f.delivery.messages[1].recipient, {
        channel: 'EMAIL',
        address: 'sara.k@example.invalid',
        source: 'EMPLOYEE_MASTER',
      });
    });

    it('sends nothing for privileged accounts without separate approval', async () => {
      f = await setup({ delivery: createRecordingDelivery({ privilegedDeliveryEnabled: false }) });
      await requestReset('zaid.s');
      assert.equal(f.delivery.messages.length, 0);
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'RECIPIENT_UNAVAILABLE');
    });

    it('redirects ordinary accounts to the test mailbox and never privileged ones', async () => {
      const override = 'shaikh.azim@olivesofts.com';
      f = await setup({ delivery: createRecordingDelivery({ testRecipientOverride: override }) });
      await requestReset('sara.k');
      assert.deepEqual(f.delivery.messages[0].recipient, {
        channel: 'EMAIL',
        address: override,
        source: 'TEST_OVERRIDE',
      });
      assert.equal(
        JSON.parse(audits('ACTION_TOKEN_ISSUED')[0].eventDetails).recipientSource,
        'TEST_OVERRIDE',
      );
      await requestReset('zaid.s');
      await post('/api/v1/auth/recovery/request', { username: 'zaid.s', purpose: 'MFA_RECOVERY' });
      assert.equal(f.delivery.messages.length, 1);
    });

    it('persists no usable token when the provider refuses the message', async () => {
      f.delivery.fail = true;
      assert.equal((await requestReset('sara.k')).status, 202);
      assert.equal(f.store.state.actionTokens.length, 0);
      const failure = audits('ACTION_TOKEN_ISSUED').at(-1);
      assert.equal(failure.eventOutcome, 'FAILURE');
      assert.equal(failure.reasonCode, 'DELIVERY_FAILED');
    });
  });

  describe('delivery not configured (fail closed)', () => {
    it('refuses every delivery-dependent flow without creating tokens', async () => {
      f = await setup({ delivery: null });
      admin = await signIn(f.store, f.admin);
      for (const username of ['sara.k', 'nobody.here']) {
        const res = await post('/api/v1/auth/recovery/request', {
          username,
          purpose: 'PASSWORD_RESET',
        });
        assert.equal(res.status, 503);
        assert.equal(res.body.error.code, 'DELIVERY_UNAVAILABLE');
      }
      const setupRes = await issue(
        admin,
        f.pending.userId,
        { confirmEmployeeNumber: '2502' },
        'password-setup',
      );
      assert.equal(setupRes.status, 503);
      assert.equal(setupRes.body.error.details[0].message, 'NO_CHANNEL_CONFIGURED');
      assert.equal(f.store.state.actionTokens.length, 0);
      assert.equal(f.store.user(f.pending.userId).accountStatus, 'PENDING');
    });

    it('refuses an account without an employee-master e-mail address', async () => {
      f.store.state.employees.find((e) => e.employeeNumber === '2502').email = null;
      const res = await issue(
        admin,
        f.pending.userId,
        { confirmEmployeeNumber: '2502' },
        'password-setup',
      );
      assert.equal(res.status, 503);
      assert.equal(res.body.error.details[0].message, 'RECIPIENT_UNAVAILABLE');
      assert.equal(f.store.state.actionTokens.length, 0);
    });
  });

  describe('authenticated password change', () => {
    let session;
    beforeEach(async () => {
      session = await signIn(f.store, f.user, { mfaVerified: false });
    });
    const change = (body, s = session) => post('/api/v1/auth/password/change', body, s);

    it('requires the current password and counts failures toward the lockout', async () => {
      const res = await change({ currentPassword: 'Wrong-Passw0rd!', newPassword: NEW_PASSWORD });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'CURRENT_PASSWORD_INVALID');
      assert.equal(f.store.user(f.user.userId).failedLoginAttempts, 1);
    });

    it('applies the policy and refuses reuse', async () => {
      assert.equal(
        (await change({ currentPassword: PASSWORD, newPassword: 'short' })).body.error.code,
        'PASSWORD_POLICY_VIOLATION',
      );
      assert.equal(
        (await change({ currentPassword: PASSWORD, newPassword: PASSWORD })).body.error.code,
        'PASSWORD_REUSED',
      );
    });

    it('changes the password, ends every session including this one and clears the cookie', async () => {
      const other = await signIn(f.store, f.user, { mfaVerified: false });
      const res = await change({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.data.sessionsRevoked, 2);
      assert.match(res.headers['set-cookie'].join(';'), new RegExp(`${config.auth.cookie.name}=;`));
      for (const s of [session, other]) {
        assert.equal(
          (await request(f.app).get('/api/v1/auth/me').set('Cookie', s.cookie)).status,
          401,
        );
      }
      assert.equal(audits('PASSWORD_CHANGED')[0].reasonCode, 'PASSWORD_CHANGE');
      assert.equal((await login('sara.k', NEW_PASSWORD)).status, 200);
    });

    it('requires a session and the CSRF token', async () => {
      const anonymous = await request(f.app)
        .post('/api/v1/auth/password/change')
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      assert.equal(anonymous.status, 401);
      const noCsrf = await request(f.app)
        .post('/api/v1/auth/password/change')
        .set('Cookie', session.cookie)
        .send({ currentPassword: PASSWORD, newPassword: NEW_PASSWORD });
      assert.equal(noCsrf.body.error.code, 'CSRF_REJECTED');
    });
  });

  describe('MFA recovery', () => {
    const requestMfa = (username) =>
      post('/api/v1/auth/recovery/request', { username, purpose: 'MFA_RECOVERY' });
    const start = (body) => post('/api/v1/auth/mfa/recovery/start', body);
    const confirm = (body) => post('/api/v1/auth/mfa/recovery/confirm', body);

    it('is self-service only for the Super Administrator', async () => {
      await requestMfa('sara.k');
      await requestMfa('main.m');
      assert.equal(f.delivery.messages.length, 0);
      await requestMfa('zaid.s');
      assert.equal(f.delivery.messages[0].purpose, 'MFA_RECOVERY');
      assert.equal(f.delivery.messages[0].recipient.source, 'PINNED');
    });

    it('needs token, password and a code from the new authenticator; never leaves MFA off', async () => {
      await requestMfa('zaid.s');
      const token = lastToken();
      const oldCipher = f.store.user(f.zaid.userId).mfaTotpSecretEncrypted;

      const wrongPassword = await start({ token, password: 'Wrong-Passw0rd!' });
      assert.equal(wrongPassword.status, 401);
      assert.equal(wrongPassword.body.error.code, 'RECOVERY_FAILED');
      assert.equal(f.store.user(f.zaid.userId).failedLoginAttempts, 1);

      const started = await start({ token, password: PASSWORD });
      assert.equal(started.status, 200, JSON.stringify(started.body));
      const secret = base32Decode(started.body.data.secret);
      assert.equal(f.store.user(f.zaid.userId).mfaTotpSecretEncrypted, oldCipher); // nothing stored yet

      const step = timeStep(f.store.now().getTime());
      const wrongCode = await confirm({
        token,
        password: PASSWORD,
        code: hotp(f.zaidSecret, step),
      });
      assert.equal(wrongCode.status, 401);
      assert.equal(wrongCode.body.error.code, 'MFA_VERIFICATION_FAILED');

      const done = await confirm({ token, password: PASSWORD, code: hotp(secret, step) });
      assert.equal(done.status, 200, JSON.stringify(done.body));
      assert.equal(done.body.data.sessionsRevoked, 1); // Zaid's test session
      const user = f.store.user(f.zaid.userId);
      assert.notEqual(user.mfaTotpSecretEncrypted, oldCipher);
      assert.ok(user.mfaEnrolledAt instanceof Date);
      assert.deepEqual(keyring.decrypt(user.userId, user.mfaTotpSecretEncrypted), secret);
      assert.equal(audits('MFA_RECOVERED').length, 1);
      assert.equal(audits('SESSION_REVOKED').at(-1).reasonCode, 'MFA_RECOVERED');
      expectTokenInvalid(await confirm({ token, password: PASSWORD, code: hotp(secret, step) }));

      // The password alone still leads only to an MFA challenge (no enrollment bypass).
      const relogin = await login('zaid.s', PASSWORD);
      assert.equal(relogin.status, 200);
      assert.equal(relogin.body.data.authenticated, false);
      assert.equal(relogin.body.data.mfa.enrollmentRequired, false);
    });

    it('expires after 15 minutes', async () => {
      await requestMfa('zaid.s');
      f.store.advance(16 * MINUTE_MS);
      expectTokenInvalid(await start({ token: lastToken(), password: PASSWORD }));
    });
  });

  describe('administrator-issued recovery', () => {
    const reset = (session, target, confirmEmployeeNumber) =>
      issue(session, target.userId, { purpose: 'PASSWORD_RESET', confirmEmployeeNumber });

    it('lets an authorized administrator help an ordinary employee', async () => {
      const res = await reset(admin, f.user, '4001');
      assert.equal(res.status, 202, JSON.stringify(res.body));
      assert.equal(res.body.data.authorizedBySuperAdministrator, false);
      assert.equal(audits('ACTION_TOKEN_ISSUED')[0].createdBy, f.admin.userId);
      const mfa = await issue(admin, f.user.userId, {
        purpose: 'MFA_RECOVERY',
        confirmEmployeeNumber: '4001',
      });
      assert.equal(mfa.status, 409);
      assert.equal(mfa.body.error.details[0].message, 'MFA_NOT_ENROLLED');
    });

    it('requires the permission', async () => {
      const ordinary = await signIn(f.store, f.user, { mfaVerified: false });
      const res = await reset(ordinary, f.pending, '2502');
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
    });

    it('reserves other administrators for the Super Administrator with recent MFA', async () => {
      const refused = await reset(admin, f.main, '3002');
      assert.equal(refused.body.error.code, 'PROTECTED_ACCOUNT');
      const ok = await reset(zaid, f.main, '3002');
      assert.equal(ok.status, 202, JSON.stringify(ok.body));
      assert.equal(ok.body.data.authorizedBySuperAdministrator, true);
      assert.equal(
        JSON.parse(audits('ACTION_TOKEN_ISSUED').at(-1).eventDetails)
          .authorizedBySuperAdministrator,
        true,
      );

      // Recent verification is 5 minutes: the MFA sign-in above is now at least 5 minutes old.
      f.store.advance(5 * MINUTE_MS);
      const stale = await issue(zaid, f.main.userId, {
        purpose: 'MFA_RECOVERY',
        confirmEmployeeNumber: '3002',
      });
      assert.equal(stale.status, 403);
      assert.equal(stale.body.error.code, 'MFA_RECENT_VERIFICATION_REQUIRED');
    });

    it('never issues for the Super Administrator account or the actor’s own account', async () => {
      assert.equal((await reset(admin, f.zaid, '2172')).body.error.code, 'PROTECTED_ACCOUNT');
      assert.equal(
        (await reset(admin, f.admin, '3001')).body.error.code,
        'SELF_MODIFICATION_FORBIDDEN',
      );
      assert.equal(f.delivery.messages.length, 0);
    });
  });
});
