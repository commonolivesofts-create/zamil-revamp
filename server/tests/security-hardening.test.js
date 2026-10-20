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

// Phase 06 security regression tests (in-memory doubles; real Argon2id/TOTP/AES-GCM).

const PASSWORD = 'Correct-Horse1!';
const MINUTE_MS = 60 * 1000;
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

async function setup(delivery = createRecordingDelivery()) {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  installUsers(store);
  installRecovery(store);
  store.delivery = delivery;
  store.backgroundTasks = new Set();
  const { roles } = rbac.seedSecurityCatalog();
  const account = async (employeeNumber, username) =>
    (
      await addActiveAccount(store, {
        password: PASSWORD,
        employee: { employeeNumber, username, email: `${username}@example.invalid` },
      })
    ).user;
  const zaid = await account('2172', 'zaid.s');
  const secret = randomBytes(20);
  Object.assign(zaid, {
    mfaTotpSecretEncrypted: keyring.encrypt(zaid.userId, secret),
    mfaEnrolledAt: store.now(),
  });
  rbac.assign(zaid, roles.SUPER_ADMINISTRATOR);
  const user = await account('4001', 'sara.k');
  const app = createTestApp(store, { mfa: { encryptionKey: TEST_MFA_KEY } });
  return { store, rbac, roles, app, delivery, zaid, zaidSecret: secret, user };
}
const settle = (store) => Promise.all([...store.backgroundTasks]);

describe('self-service recovery: no account-dependent response or timing', () => {
  it('answers before any lookup, token or SMTP work completes', async () => {
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const delivery = createRecordingDelivery();
    const original = delivery.deliver;
    delivery.deliver = async (message) => {
      await gate; // the provider is still "sending"
      return original(message);
    };
    const f = await setup(delivery);
    const res = await request(f.app)
      .post('/api/v1/auth/recovery/request')
      .send({ username: 'sara.k', purpose: 'PASSWORD_RESET' });
    assert.equal(res.status, 202);
    assert.equal(delivery.messages.length, 0); // response sent while delivery is pending
    release();
    await settle(f.store);
    assert.equal(delivery.messages.length, 1);
  });

  it('returns byte-identical bodies for known, unknown, ineligible and privileged accounts', async () => {
    const f = await setup();
    const bodies = [];
    for (const [username, purpose] of [
      ['sara.k', 'PASSWORD_RESET'],
      ['nobody.here', 'PASSWORD_RESET'],
      ['sara.k', 'MFA_RECOVERY'],
      ['zaid.s', 'PASSWORD_RESET'],
    ]) {
      const res = await request(f.app)
        .post('/api/v1/auth/recovery/request')
        .send({ username, purpose });
      assert.equal(res.status, 202);
      bodies.push(JSON.stringify(res.body.data));
      assert.deepEqual(
        Object.keys(res.headers).filter((h) => h === 'set-cookie'),
        [],
      );
    }
    await settle(f.store);
    assert.equal(new Set(bodies).size, 1);
  });
});

describe('token handling and session revocation', () => {
  let f;
  beforeEach(async () => {
    f = await setup();
  });
  const post = async (path, body, session) => {
    const req = request(f.app).post(path);
    if (session) req.set('Cookie', session.cookie).set('X-CSRF-Token', session.csrf);
    const res = await req.send(body);
    await settle(f.store);
    return res;
  };
  const requestReset = () =>
    post('/api/v1/auth/recovery/request', { username: 'sara.k', purpose: 'PASSWORD_RESET' });

  it('records how many earlier tokens a re-issue revoked', async () => {
    await requestReset();
    f.store.advance(6 * MINUTE_MS);
    await requestReset();
    const issued = f.store
      .auditEvents('ACTION_TOKEN_ISSUED')
      .map((r) => JSON.parse(r.eventDetails));
    assert.deepEqual(
      issued.map((d) => d.previousTokensRevoked),
      [0, 1],
    );
    assert.equal(f.store.state.actionTokens.filter((t) => !t.revokedAt && !t.consumedAt).length, 1);
  });

  it('records revoked sessions and reset tokens with the password change', async () => {
    await requestReset(); // an outstanding reset token
    const session = await signIn(f.store, f.user, { mfaVerified: false });
    const res = await post(
      '/api/v1/auth/password/change',
      { currentPassword: PASSWORD, newPassword: 'New-Passw0rd!x' },
      session,
    );
    assert.equal(res.status, 200);
    const changed = f.store.auditEvents('PASSWORD_CHANGED')[0];
    assert.deepEqual(JSON.parse(changed.eventDetails), {
      sessionsRevoked: 1,
      resetTokensRevoked: 1,
    });
    // The outstanding reset link no longer works.
    const token = f.delivery.messages[0].token;
    const reset = await post('/api/v1/auth/password/reset', {
      token,
      newPassword: 'Other-Passw0rd!',
    });
    assert.equal(reset.body.error.code, 'TOKEN_INVALID');
  });

  it('ends and audits every session when password-change attempts lock the account', async () => {
    const session = await signIn(f.store, f.user, { mfaVerified: false });
    await signIn(f.store, f.user, { mfaVerified: false });
    for (let i = 0; i < 5; i += 1) {
      const res = await post(
        '/api/v1/auth/password/change',
        { currentPassword: `Wrong-Passw0rd!${i}`, newPassword: 'New-Passw0rd!x' },
        session,
      );
      assert.equal(res.body.error.code, 'CURRENT_PASSWORD_INVALID');
    }
    assert.ok(f.store.user(f.user.userId).lockedUntil instanceof Date);
    assert.equal(
      f.store.state.sessions.filter((s) => s.userId === f.user.userId && !s.revokedAt).length,
      0,
    );
    const revoked = f.store.auditEvents('SESSION_REVOKED').at(-1);
    assert.equal(revoked.reasonCode, 'ACCOUNT_LOCKED');
    assert.equal(revoked.actorType, 'SYSTEM');
    assert.deepEqual(JSON.parse(revoked.eventDetails), { sessionsRevoked: 2 });
    assert.equal(f.store.auditEvents('ACCOUNT_LOCKED').length, 1);
  });

  it('lets exactly one of two concurrent MFA recovery confirmations succeed', async () => {
    await post('/api/v1/auth/recovery/request', { username: 'zaid.s', purpose: 'MFA_RECOVERY' });
    const token = f.delivery.messages[0].token;
    const started = await post('/api/v1/auth/mfa/recovery/start', { token, password: PASSWORD });
    const code = hotp(base32Decode(started.body.data.secret), timeStep(f.store.now().getTime()));
    f.store.holdReads('findToken', 2);
    const results = await Promise.all([
      post('/api/v1/auth/mfa/recovery/confirm', { token, password: PASSWORD, code }),
      post('/api/v1/auth/mfa/recovery/confirm', { token, password: PASSWORD, code }),
    ]);
    // The loser is refused either as a used token (400) or, if it read the already replaced
    // secret, as a wrong code (401); never a second success.
    const [winner, loser] = results.map((r) => r.status).sort();
    assert.equal(winner, 200);
    assert.ok([400, 401].includes(loser), String(loser));
    assert.equal(f.store.auditEvents('MFA_RECOVERED').length, 1);
  });

  it('refuses an expired MFA recovery token at confirmation even after a valid start', async () => {
    await post('/api/v1/auth/recovery/request', { username: 'zaid.s', purpose: 'MFA_RECOVERY' });
    const token = f.delivery.messages[0].token;
    const started = await post('/api/v1/auth/mfa/recovery/start', { token, password: PASSWORD });
    const secret = base32Decode(started.body.data.secret);
    f.store.advance(16 * MINUTE_MS);
    const code = hotp(secret, timeStep(f.store.now().getTime()));
    const res = await post('/api/v1/auth/mfa/recovery/confirm', {
      token,
      password: PASSWORD,
      code,
    });
    assert.equal(res.body.error.code, 'TOKEN_INVALID');
    assert.equal(f.store.auditEvents('MFA_RECOVERED').length, 0);
  });
});

describe('RBAC precedence through the API (effective permissions)', () => {
  let f;
  let zaid;
  let business;
  beforeEach(async () => {
    f = await setup();
    zaid = await signIn(f.store, f.zaid);
    const module = f.rbac.addModule('PRODUCTION');
    const orders = f.rbac.addResource(module, 'WORK_ORDERS');
    business = {
      view: f.rbac.addPermission(orders, 'VIEW'),
      approve: f.rbac.addPermission(orders, 'APPROVE'),
      export: f.rbac.addPermission(orders, 'EXPORT'),
    };
  });
  const effective = async () => {
    const res = await request(f.app)
      .get(`/api/v1/access-control/users/${f.user.userId}/effective-permissions`)
      .set('Cookie', zaid.cookie);
    assert.equal(res.status, 200);
    return res.body.data.map((p) => p.actionCode).sort();
  };

  it('is deny-by-default, additive across roles, ALLOW adds and DENY wins', async () => {
    assert.deepEqual(await effective(), []);
    const viewer = f.rbac.addRole('VIEWER');
    const approver = f.rbac.addRole('APPROVER');
    f.rbac.grant(viewer, business.view);
    f.rbac.grant(approver, business.approve);
    f.rbac.assign(f.user, viewer);
    f.rbac.assign(f.user, approver);
    assert.deepEqual(await effective(), ['APPROVE', 'VIEW']);
    f.rbac.override(f.user, business.export, 'ALLOW');
    assert.deepEqual(await effective(), ['APPROVE', 'EXPORT', 'VIEW']);
    f.rbac.override(f.user, business.view, 'DENY');
    // One override per user and permission (UQ_ZRV_UPO_USER_PERM): EXPORT's ALLOW becomes DENY.
    f.rbac.tables().overrides.find((o) => o.permissionId === business.export.permissionId).effect =
      'DENY';
    assert.deepEqual(await effective(), ['APPROVE']);
  });

  it('ignores expired and inactive grants, memberships and overrides', async () => {
    const past = new Date(f.store.now().getTime() - 1);
    const role = f.rbac.addRole('MIXED');
    f.rbac.grant(role, business.view);
    f.rbac.grant(role, business.approve, { isActive: false });
    f.rbac.assign(f.user, role, { expiresAt: past });
    f.rbac.override(f.user, business.export, 'ALLOW', { expiresAt: past });
    assert.deepEqual(await effective(), []);
    f.rbac.tables().userRoles.at(-1).expiresAt = null;
    assert.deepEqual(await effective(), ['VIEW']);
    business.view.isActive = false;
    assert.deepEqual(await effective(), []);
  });
});
