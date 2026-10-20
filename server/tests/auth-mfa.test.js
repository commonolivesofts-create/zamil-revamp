import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { config } from '../src/config/index.js';
import { createMfaKeyring } from '../src/modules/auth/mfaSecret.js';
import { hotp, timeStep } from '../src/modules/auth/totp.js';
import {
  addActiveAccount,
  createAuthStore,
  createTestApp,
  DAY_MS,
  TEST_MFA_KEY,
} from './helpers/authFakes.js';

// Supertest + in-memory repositories (Oracle SQL is not exercised here); real TOTP and AES-GCM.

const PASSWORD = 'Correct-Horse1!';
const MINUTE_MS = 60 * 1000;
const SESSION_COOKIE = config.auth.cookie.name;
const MFA_COOKIE = config.auth.mfa.cookieName;
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

const cookieValue = (res, name) =>
  (res.headers['set-cookie'] ?? []).find((item) => item.startsWith(`${name}=`))?.split(';')[0];

describe('MFA (Phase 02)', () => {
  let store;
  let app;
  let zaid;

  const codeAt = (secret, offsetSteps = 0) =>
    hotp(secret, timeStep(store.now().getTime()) + offsetSteps);
  const login = (username = 'zaid.s', password = PASSWORD) =>
    request(app).post('/api/v1/auth/login').send({ username, password });

  async function challengeFor(username = 'zaid.s') {
    const res = await login(username).expect(200);
    assert.equal(res.body.data.authenticated, false);
    return { res, cookie: cookieValue(res, MFA_COOKIE), csrf: res.body.data.csrf.token };
  }
  const mfaPost = (path, challenge, body = {}) =>
    request(app)
      .post(`/api/v1/auth/mfa/${path}`)
      .set('Cookie', challenge.cookie)
      .set('X-CSRF-Token', challenge.csrf)
      .send(body);

  async function enrollZaid() {
    const challenge = await challengeFor();
    const start = await mfaPost('enrollment', challenge).expect(200);
    const secret = base32Decode(start.body.data.secret);
    const res = await mfaPost('enrollment/confirm', challenge, { code: codeAt(secret) }).expect(
      200,
    );
    return { secret, res };
  }

  function enrolledUser(user, secret = Buffer.alloc(20, 11)) {
    Object.assign(store.user(user.userId), {
      mfaTotpSecretEncrypted: keyring.encrypt(user.userId, secret),
      mfaEnrolledAt: store.now(),
      mfaLastUsedStep: null,
    });
    return secret;
  }

  beforeEach(async () => {
    store = createAuthStore();
    app = createTestApp(store, { mfa: { encryptionKey: TEST_MFA_KEY } });
    zaid = await addActiveAccount(store, {
      password: PASSWORD,
      employee: { username: 'zaid.s', employeeNumber: '2172', fullName: 'Zaid' },
    });
  });

  describe('login challenge', () => {
    it('issues only a short-lived MFA challenge after a correct password', async () => {
      store.user(zaid.user.userId).failedLoginAttempts = 2;
      const { res } = await challengeFor();

      assert.deepEqual(Object.keys(res.body.data).sort(), ['authenticated', 'csrf', 'mfa']);
      assert.equal(res.body.data.mfa.required, true);
      assert.equal(res.body.data.mfa.enrollmentRequired, true);
      assert.equal(cookieValue(res, SESSION_COOKIE), undefined, 'no session cookie');

      const setCookie = res.headers['set-cookie'].find((item) => item.startsWith(MFA_COOKIE));
      assert.match(setCookie, /HttpOnly/);
      assert.match(setCookie, /Secure/);
      assert.match(setCookie, /SameSite=Lax/);

      const [challenge] = store.state.sessions;
      assert.equal(challenge.mfaVerifiedAt, null);
      assert.equal(challenge.expiresAt.getTime() - challenge.createdAt.getTime(), 10 * MINUTE_MS);

      const user = store.user(zaid.user.userId);
      assert.equal(user.failedLoginAttempts, 2, 'not reset before MFA succeeds');
      assert.equal(user.lastLoginAt, null);

      // A correct password that only reaches the MFA step is neither a failure nor a completed
      // login: nothing is audited until MFA succeeds (LOGIN_SUCCESS) or a code fails.
      assert.deepEqual(store.state.audit, []);
    });

    it('writes LOGIN_SUCCESS only once the MFA-verified session exists, and only once', async () => {
      await enrollZaid();

      assert.deepEqual(
        store.state.audit.map((row) => row.eventCode),
        ['LOGIN_SUCCESS'],
      );
      const [success] = store.state.audit;
      const session = store.state.sessions.at(-1);
      assert.equal(success.targetRecordId, session.sessionId);
      assert.ok(session.mfaVerifiedAt);
    });

    it('a challenge token never authorizes API access, as a session or with its CSRF token', async () => {
      const { cookie, csrf } = await challengeFor();
      const token = cookie.split('=')[1];
      const asSession = `${SESSION_COOKIE}=${token}`;

      const me = await request(app).get('/api/v1/auth/me').set('Cookie', asSession);
      assert.equal(me.status, 401);
      assert.ok(store.state.sessions[0].revokedAt, 'revoked when misused');

      const fresh = await challengeFor();
      const freshToken = fresh.cookie.split('=')[1];
      for (const res of [
        await request(app)
          .get('/api/v1/auth/csrf')
          .set('Cookie', `${SESSION_COOKIE}=${freshToken}`),
        await request(app)
          .post('/api/v1/auth/logout')
          .set('Cookie', `${SESSION_COOKIE}=${freshToken}`)
          .set('X-CSRF-Token', fresh.csrf),
        await request(app).get('/api/v1/auth/me').set('Cookie', [fresh.cookie]),
      ]) {
        assert.equal(res.status, 401);
      }
      assert.ok(csrf);
      assert.equal(
        store.state.sessions.filter((session) => session.mfaVerifiedAt).length,
        0,
        'no MFA-verified session was ever created',
      );
    });

    it('still issues no challenge for a wrong password or an expired password', async () => {
      await login('zaid.s', 'Wrong-Pass1!').expect(401);
      store.user(zaid.user.userId).passwordChangedAt = new Date(
        store.now().getTime() - 91 * DAY_MS,
      );
      const expired = await login().expect(403);

      assert.equal(expired.body.error.code, 'PASSWORD_EXPIRED');
      assert.equal(store.state.sessions.length, 0);
    });

    it('stays fail closed (403 MFA_REQUIRED, MFA endpoints 503) without the MFA key', async () => {
      const closed = createTestApp(store);
      const res = await request(closed)
        .post('/api/v1/auth/login')
        .send({ username: 'zaid.s', password: PASSWORD });

      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'MFA_REQUIRED');
      assert.equal(store.state.sessions.length, 0);
      const mfa = await request(closed).post('/api/v1/auth/mfa/verify').send({ code: '123456' });
      assert.equal(mfa.status, 503);
      assert.equal(mfa.body.error.code, 'MFA_UNAVAILABLE');
    });

    it('issues an ordinary session without MFA to users who need none', async () => {
      await addActiveAccount(store, { password: PASSWORD, employee: { username: 'ordinary' } });
      const res = await login('ordinary').expect(200);

      assert.equal(res.body.data.authenticated, true);
      assert.equal(res.body.data.session.mfaVerified, false);
      assert.ok(cookieValue(res, SESSION_COOKIE));
    });
  });

  describe('first-time enrollment', () => {
    it('requires the challenge cookie and its CSRF token', async () => {
      const challenge = await challengeFor();

      const noCookie = await request(app)
        .post('/api/v1/auth/mfa/enrollment')
        .set('X-CSRF-Token', challenge.csrf);
      assert.equal(noCookie.status, 401);
      assert.equal(noCookie.body.error.code, 'MFA_CHALLENGE_INVALID');
      const noCsrf = await request(app)
        .post('/api/v1/auth/mfa/enrollment')
        .set('Cookie', challenge.cookie);
      assert.equal(noCsrf.status, 403);
      const crossOrigin = await mfaPost('enrollment', challenge).set(
        'Origin',
        'https://evil.example',
      );
      assert.equal(crossOrigin.status, 403);
    });

    it('returns the candidate secret once per challenge without storing anything', async () => {
      const challenge = await challengeFor();
      const first = await mfaPost('enrollment', challenge).expect(200);
      const again = await mfaPost('enrollment', challenge).expect(200);

      assert.match(first.body.data.secret, /^[A-Z2-7]{32}$/);
      assert.equal(again.body.data.secret, first.body.data.secret, 'stable within the challenge');
      const uri = new URL(first.body.data.otpauthUri);
      assert.equal(uri.searchParams.get('issuer'), 'Zamil Revamp');
      assert.equal(uri.searchParams.get('secret'), first.body.data.secret);
      assert.equal(first.body.data.digits, 6);
      assert.equal(first.body.data.periodSeconds, 30);
      assert.equal(first.headers['cache-control'], 'no-store');
      assert.equal(store.user(zaid.user.userId).mfaTotpSecretEncrypted, null);

      const other = await challengeFor();
      const otherStart = await mfaPost('enrollment', other).expect(200);
      assert.notEqual(
        otherStart.body.data.secret,
        first.body.data.secret,
        'new secret per challenge',
      );
    });

    it('refuses a wrong code, counts it toward the lockout and stores nothing', async () => {
      const challenge = await challengeFor();
      await mfaPost('enrollment', challenge).expect(200);

      const res = await mfaPost('enrollment/confirm', challenge, { code: '000000' }).expect(401);
      assert.equal(res.body.error.code, 'MFA_VERIFICATION_FAILED');
      assert.equal(store.user(zaid.user.userId).failedLoginAttempts, 1);
      assert.equal(store.user(zaid.user.userId).mfaTotpSecretEncrypted, null);
      assert.equal(store.state.audit.at(-1).reasonCode, 'MFA_ENROLLMENT_CODE_INVALID');
    });

    it('activates the authenticator after proof of possession and issues a privileged session', async () => {
      const { secret, res } = await enrollZaid();
      const user = store.user(zaid.user.userId);

      assert.equal(res.body.data.authenticated, true);
      assert.equal(res.body.data.session.mfaVerified, true);
      assert.equal(
        res.body.data.session.idleTimeoutSeconds,
        900,
        '15-minute privileged idle timeout',
      );
      assert.ok(cookieValue(res, SESSION_COOKIE));
      assert.match(
        cookieValue(res, MFA_COOKIE),
        new RegExp(`^${MFA_COOKIE}=$`),
        'challenge cookie cleared',
      );

      assert.match(user.mfaTotpSecretEncrypted, /^v1\.k1\./);
      assert.deepEqual(keyring.decrypt(user.userId, user.mfaTotpSecretEncrypted), secret);
      assert.ok(user.mfaEnrolledAt);
      assert.equal(user.mfaLastUsedStep, timeStep(store.now().getTime()));
      assert.equal(user.failedLoginAttempts, 0);
      assert.ok(user.lastLoginAt);

      const [challenge, session] = store.state.sessions;
      assert.ok(challenge.revokedAt, 'challenge revoked');
      assert.ok(session.mfaVerifiedAt, 'session carries MFA assurance');
      assert.equal(session.revokedAt, null);

      const audit = store.state.audit.at(-1);
      assert.equal(audit.eventCode, 'LOGIN_SUCCESS');
      assert.equal(audit.reasonCode, 'MFA_ENROLLMENT_COMPLETED');
      assert.equal(audit.actorType, 'USER');

      const me = await request(app)
        .get('/api/v1/auth/me')
        .set('Cookie', cookieValue(res, SESSION_COOKIE))
        .expect(200);
      assert.equal(me.body.data.session.mfaVerified, true);
      assert.equal(me.body.data.session.idleTimeoutSeconds, 900);
    });

    it('revokes every other session of the user when MFA is enrolled', async () => {
      store.state.sessions.push({
        sessionId: '4999',
        userId: zaid.user.userId,
        tokenHash: 'ff',
        lastActivityAt: store.now(),
        expiresAt: new Date(store.now().getTime() + 60 * MINUTE_MS),
        revokedAt: null,
        mfaVerifiedAt: null,
        createdAt: store.now(),
      });
      await enrollZaid();

      assert.ok(store.state.sessions.find((session) => session.sessionId === '4999').revokedAt);
    });

    it('lets only one of two concurrent confirmations enroll', async () => {
      const challenge = await challengeFor();
      const start = await mfaPost('enrollment', challenge).expect(200);
      const code = codeAt(base32Decode(start.body.data.secret));
      // Both confirmations read the not-yet-enrolled challenge before either writes.
      store.holdReads('findSessionByTokenHash', 2);

      const results = await Promise.all([
        mfaPost('enrollment/confirm', challenge, { code }),
        mfaPost('enrollment/confirm', challenge, { code }),
      ]);
      const statuses = results.map((res) => res.status).sort();

      assert.equal(statuses[0], 200);
      assert.notEqual(statuses[1], 200, 'the second confirmation must fail');
      assert.equal(store.state.sessions.filter((session) => session.mfaVerifiedAt).length, 1);
      assert.equal(store.auditEvents('LOGIN_SUCCESS').length, 1);
    });

    it('withholds the candidate secret without a fresh, valid challenge', async () => {
      const challenge = await challengeFor();

      // Expired challenge.
      store.advance(10 * MINUTE_MS);
      const expired = await mfaPost('enrollment', challenge).expect(401);
      assert.equal(expired.body.error.code, 'MFA_CHALLENGE_INVALID');
      assert.equal(expired.body.data, undefined);

      // Locked account.
      const locked = await challengeFor();
      store.user(zaid.user.userId).lockedUntil = new Date(store.now().getTime() + MINUTE_MS);
      await mfaPost('enrollment', locked).expect(401);
      store.user(zaid.user.userId).lockedUntil = null;

      // A normal session (cookie and CSRF token) of an ordinary user.
      await addActiveAccount(store, { password: PASSWORD, employee: { username: 'ordinary' } });
      const res = await login('ordinary').expect(200);
      const forged = {
        cookie: `${MFA_COOKIE}=${cookieValue(res, SESSION_COOKIE).split('=')[1]}`,
        csrf: res.body.data.csrf.token,
      };
      await mfaPost('enrollment', forged).expect(401);

      // A valid challenge with another challenge's CSRF token.
      const first = await challengeFor();
      const second = await challengeFor();
      await mfaPost('enrollment', { cookie: first.cookie, csrf: second.csrf }).expect(403);
    });

    it('never replaces an existing authenticator', async () => {
      await enrollZaid();
      store.advance(MINUTE_MS);
      const challenge = await challengeFor();
      assert.equal(challenge.res.body.data.mfa.enrollmentRequired, false);

      const start = await mfaPost('enrollment', challenge).expect(409);
      assert.equal(start.body.error.code, 'MFA_ALREADY_ENROLLED');
      await mfaPost('enrollment/confirm', challenge, { code: '123456' }).expect(409);
    });

    it('refuses to reuse a completed challenge', async () => {
      const challenge = await challengeFor();
      const start = await mfaPost('enrollment', challenge).expect(200);
      const secret = base32Decode(start.body.data.secret);
      await mfaPost('enrollment/confirm', challenge, { code: codeAt(secret) }).expect(200);

      store.advance(30 * 1000);
      const reuse = await mfaPost('verify', challenge, { code: codeAt(secret) }).expect(401);
      assert.equal(reuse.body.error.code, 'MFA_CHALLENGE_INVALID');
    });

    it('never puts the secret or its ciphertext into audit rows', async () => {
      const { secret } = await enrollZaid();
      const audit = JSON.stringify(store.state.audit);
      const stored = store.user(zaid.user.userId).mfaTotpSecretEncrypted;

      assert.ok(!audit.includes(secret.toString('base64')));
      assert.ok(!audit.includes(stored));
      const challenge = await challengeFor();
      assert.ok(!JSON.stringify(challenge.res.body).includes(stored));
    });
  });

  describe('verification', () => {
    let secret;
    beforeEach(() => {
      secret = enrolledUser(zaid.user);
    });

    it('issues an MFA-verified session for a valid code and consumes its time step', async () => {
      const challenge = await challengeFor();
      assert.equal(challenge.res.body.data.mfa.enrollmentRequired, false);

      const res = await mfaPost('verify', challenge, { code: codeAt(secret) }).expect(200);
      assert.equal(res.body.data.session.mfaVerified, true);
      assert.equal(store.user(zaid.user.userId).mfaLastUsedStep, timeStep(store.now().getTime()));
      assert.equal(store.state.audit.at(-1).reasonCode, 'MFA_VERIFIED');
    });

    it('rejects a replayed code, then accepts the next step', async () => {
      const code = codeAt(secret);
      await mfaPost('verify', await challengeFor(), { code }).expect(200);

      const replay = await mfaPost('verify', await challengeFor(), { code }).expect(401);
      assert.equal(replay.body.error.code, 'MFA_VERIFICATION_FAILED');
      assert.equal(store.state.audit.at(-1).reasonCode, 'MFA_CODE_REPLAYED');

      store.advance(30 * 1000);
      await mfaPost('verify', await challengeFor(), { code: codeAt(secret) }).expect(200);
    });

    it('tolerates one step of clock drift but not two', async () => {
      await mfaPost('verify', await challengeFor(), { code: codeAt(secret, -1) }).expect(200);
      store.advance(5 * MINUTE_MS);
      await mfaPost('verify', await challengeFor(), { code: codeAt(secret, -2) }).expect(401);
    });

    it('locks the account after five consecutive wrong codes and ends the challenge', async () => {
      const challenge = await challengeFor();
      for (let i = 0; i < 5; i += 1) {
        await mfaPost('verify', challenge, { code: '000000' }).expect(401);
      }

      assert.ok(store.user(zaid.user.userId).lockedUntil);
      assert.equal(store.auditEvents('ACCOUNT_LOCKED').length, 1);
      assert.ok(store.state.sessions[0].revokedAt);
      const after = await mfaPost('verify', challenge, { code: codeAt(secret) }).expect(401);
      assert.equal(after.body.error.code, 'MFA_CHALLENGE_INVALID');
      await login().expect(401);
    });

    it('does not let a correct password reset the count between wrong codes', async () => {
      for (let i = 0; i < 4; i += 1) {
        await mfaPost('verify', await challengeFor(), { code: '000000' }).expect(401);
      }
      await mfaPost('verify', await challengeFor(), { code: '000000' }).expect(401);

      assert.equal(store.user(zaid.user.userId).failedLoginAttempts, 5);
      assert.ok(store.user(zaid.user.userId).lockedUntil);
    });

    it('requires enrollment before verification', async () => {
      Object.assign(store.user(zaid.user.userId), {
        mfaTotpSecretEncrypted: null,
        mfaEnrolledAt: null,
      });
      const res = await mfaPost('verify', await challengeFor(), { code: '123456' }).expect(409);
      assert.equal(res.body.error.code, 'MFA_ENROLLMENT_REQUIRED');
    });

    it('lets only one of two concurrent submissions of the same code succeed', async () => {
      const code = codeAt(secret);
      const [first, second] = await Promise.all([challengeFor(), challengeFor()]);
      // Both requests read the same last-used step before either consumes it.
      store.holdReads('findMfaCredential', 2);

      const results = await Promise.all([
        mfaPost('verify', first, { code }),
        mfaPost('verify', second, { code }),
      ]);
      const statuses = results.map((res) => res.status).sort();

      assert.deepEqual(statuses, [200, 401]);
      assert.equal(store.state.sessions.filter((session) => session.mfaVerifiedAt).length, 1);
      assert.equal(store.auditEvents('LOGIN_SUCCESS').length, 1);
      const [failure] = store.auditEvents('LOGIN_FAILED');
      assert.equal(failure.reasonCode, 'MFA_CODE_REPLAYED');
    });

    it('fails closed when the account is locked while the challenge is open', async () => {
      const challenge = await challengeFor();
      store.user(zaid.user.userId).lockedUntil = new Date(store.now().getTime() + 15 * MINUTE_MS);

      const res = await mfaPost('verify', challenge, { code: codeAt(secret) }).expect(401);
      assert.equal(res.body.error.code, 'MFA_CHALLENGE_INVALID');
      assert.ok(store.state.sessions[0].revokedAt, 'challenge revoked');
      assert.equal(store.user(zaid.user.userId).mfaLastUsedStep, null, 'code not consumed');
      assert.equal(store.state.sessions.filter((session) => session.mfaVerifiedAt).length, 0);
    });

    it('expires the challenge after 10 minutes', async () => {
      const challenge = await challengeFor();
      store.advance(10 * MINUTE_MS);
      const res = await mfaPost('verify', challenge, { code: codeAt(secret) }).expect(401);
      assert.equal(res.body.error.code, 'MFA_CHALLENGE_INVALID');
    });

    it('re-checks the account during the challenge and revokes it when disabled', async () => {
      const challenge = await challengeFor();
      store.user(zaid.user.userId).accountStatus = 'DISABLED';

      await mfaPost('verify', challenge, { code: codeAt(secret) }).expect(401);
      assert.ok(store.state.sessions[0].revokedAt);
      const audit = store.state.audit.at(-1);
      assert.equal(audit.eventOutcome, 'DENIED');
      assert.equal(audit.reasonCode, 'ACCOUNT_NOT_ACTIVE');
    });

    it('refuses a normal session token presented as a challenge', async () => {
      await addActiveAccount(store, { password: PASSWORD, employee: { username: 'ordinary' } });
      const res = await login('ordinary').expect(200);
      const forged = {
        cookie: `${MFA_COOKIE}=${cookieValue(res, SESSION_COOKIE).split('=')[1]}`,
        csrf: res.body.data.csrf.token,
      };

      const attempt = await mfaPost('verify', forged, { code: '123456' }).expect(401);
      assert.equal(attempt.body.error.code, 'MFA_CHALLENGE_INVALID');
    });

    it('refuses a stale normal session as a challenge after the user became privileged', async () => {
      // An ordinary 8-hour session from an earlier password login must not stand in for the fresh,
      // 10-minute password-verified challenge, even once the user requires MFA.
      const ordinary = await addActiveAccount(store, {
        password: PASSWORD,
        employee: { username: 'ordinary' },
      });
      const res = await login('ordinary').expect(200);
      const ordinarySecret = enrolledUser(ordinary.user, Buffer.alloc(20, 13));
      store.user(ordinary.user.userId).isPrivilegedRoleMember = true;
      const forged = {
        cookie: `${MFA_COOKIE}=${cookieValue(res, SESSION_COOKIE).split('=')[1]}`,
        csrf: res.body.data.csrf.token,
      };

      const attempt = await mfaPost('verify', forged, { code: codeAt(ordinarySecret) }).expect(401);
      assert.equal(attempt.body.error.code, 'MFA_CHALLENGE_INVALID');
      assert.equal(store.user(ordinary.user.userId).mfaLastUsedStep, null, 'code not consumed');
    });

    it('refuses an MFA-verified session presented as a new challenge', async () => {
      const res = await mfaPost('verify', await challengeFor(), { code: codeAt(secret) }).expect(
        200,
      );
      store.advance(30 * 1000);
      const forged = {
        cookie: `${MFA_COOKIE}=${cookieValue(res, SESSION_COOKIE).split('=')[1]}`,
        csrf: res.body.data.csrf.token,
      };
      await mfaPost('verify', forged, { code: codeAt(secret) }).expect(401);
    });

    it('does not decrypt a ciphertext copied from another account', async () => {
      const other = await addActiveAccount(store, {
        password: PASSWORD,
        employee: { username: 'admin.b' },
        user: { isPrivilegedRoleMember: true },
      });
      Object.assign(store.user(other.user.userId), {
        mfaTotpSecretEncrypted: store.user(zaid.user.userId).mfaTotpSecretEncrypted,
        mfaEnrolledAt: store.now(),
      });

      const res = await mfaPost('verify', await challengeFor('admin.b'), {
        code: codeAt(secret),
      }).expect(503);
      assert.equal(res.body.error.code, 'MFA_UNAVAILABLE');
      assert.equal(store.state.audit.at(-1).reasonCode, 'MFA_SECRET_UNREADABLE');
    });

    it('applies MFA to a voluntarily enrolled ordinary user without the privileged timeout', async () => {
      const ordinary = await addActiveAccount(store, {
        password: PASSWORD,
        employee: { username: 'ordinary' },
      });
      const ordinarySecret = enrolledUser(ordinary.user, Buffer.alloc(20, 12));

      const challenge = await challengeFor('ordinary');
      const res = await mfaPost('verify', challenge, { code: codeAt(ordinarySecret) }).expect(200);
      assert.equal(res.body.data.session.idleTimeoutSeconds, 1800);
      assert.equal(res.body.data.session.mfaVerified, true);
    });

    it('enforces the 15-minute idle timeout on the privileged session', async () => {
      const res = await mfaPost('verify', await challengeFor(), { code: codeAt(secret) }).expect(
        200,
      );
      const cookie = cookieValue(res, SESSION_COOKIE);

      store.advance(14 * MINUTE_MS);
      await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(200);
      store.advance(15 * MINUTE_MS);
      await request(app).get('/api/v1/auth/me').set('Cookie', cookie).expect(401);
    });

    it('validates the code format', async () => {
      const challenge = await challengeFor();
      for (const body of [
        { code: '12345' },
        { code: 'abcdef' },
        { code: 123456 },
        { code: '123456', x: 1 },
        {},
      ]) {
        const res = await mfaPost('verify', challenge, body).expect(400);
        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
      }
      assert.equal(
        store.user(zaid.user.userId).failedLoginAttempts,
        0,
        'invalid input is not an attempt',
      );
    });
  });

  describe('authenticator replacement', () => {
    let oldSecret;
    let signedIn;

    const replacementPost = (path, as, body = {}) =>
      request(app)
        .post(`/api/v1/auth/mfa/${path}`)
        .set('Cookie', as.cookie)
        .set('X-CSRF-Token', as.csrf)
        .send(body);

    async function signInWithMfa(secret) {
      const challenge = await challengeFor();
      const res = await mfaPost('verify', challenge, { code: codeAt(secret) }).expect(200);
      return { cookie: cookieValue(res, SESSION_COOKIE), csrf: res.body.data.csrf.token };
    }

    async function startReplacement() {
      const start = await replacementPost('replacement', signedIn).expect(200);
      return { start, newSecret: base32Decode(start.body.data.secret) };
    }

    beforeEach(async () => {
      oldSecret = enrolledUser(zaid.user, Buffer.alloc(20, 21));
      signedIn = await signInWithMfa(oldSecret);
      store.advance(30 * 1000); // the next code is a new time step
    });

    it('returns a fresh candidate secret with a correct label, storing nothing', async () => {
      const storedBefore = store.user(zaid.user.userId).mfaTotpSecretEncrypted;
      const { start, newSecret } = await startReplacement();
      const again = await replacementPost('replacement', signedIn).expect(200);

      assert.ok(!newSecret.equals(oldSecret), 'never the old secret');
      assert.equal(again.body.data.secret, start.body.data.secret, 'stable within the session');
      assert.equal(start.body.data.issuer, 'Zamil Revamp');
      assert.equal(start.body.data.accountName, 'zaid.s');
      assert.ok(start.body.data.otpauthUri.startsWith('otpauth://totp/Zamil%20Revamp:zaid.s?'));
      assert.equal(start.headers['cache-control'], 'no-store');
      assert.equal(store.user(zaid.user.userId).mfaTotpSecretEncrypted, storedBefore);

      const enrollmentCandidate = keyring.enrollmentSecret(
        zaid.user.userId,
        store.state.sessions.at(-1).sessionId,
      );
      assert.ok(!newSecret.equals(enrollmentCandidate), 'separate derivation purpose');
    });

    it('replaces the secret, revokes every session including the current one, and audits it', async () => {
      const { newSecret } = await startReplacement();
      const step = timeStep(store.now().getTime());

      const res = await replacementPost('replacement/confirm', signedIn, {
        code: codeAt(newSecret),
      }).expect(200);
      assert.equal(res.body.data.replaced, true);
      assert.equal(res.body.data.reauthenticationRequired, true);
      assert.ok(res.body.data.sessionsRevoked >= 1);
      assert.match(cookieValue(res, SESSION_COOKIE), new RegExp(`^${SESSION_COOKIE}=$`));

      const user = store.user(zaid.user.userId);
      assert.deepEqual(keyring.decrypt(user.userId, user.mfaTotpSecretEncrypted), newSecret);
      assert.equal(user.mfaLastUsedStep, step);
      assert.ok(
        store.state.sessions.every((session) => session.revokedAt),
        'no session survives',
      );
      await request(app).get('/api/v1/auth/me').set('Cookie', signedIn.cookie).expect(401);

      const [audit] = store.state.audit.filter((row) => row.reasonCode === 'MFA_REPLACED');
      assert.equal(audit.eventCode, 'SESSION_REVOKED');
      assert.equal(audit.eventOutcome, 'SUCCESS');
      assert.equal(audit.actorType, 'USER');
      assert.equal(audit.createdBy, zaid.user.userId);
      assert.equal(audit.targetType, 'USER');
      assert.equal(
        audit.eventDetails,
        JSON.stringify({ sessionsRevoked: res.body.data.sessionsRevoked }),
      );
      const audits = JSON.stringify(store.state.audit);
      assert.ok(
        !audits.includes(newSecret.toString('base64')) &&
          !audits.includes(user.mfaTotpSecretEncrypted),
      );
    });

    it('accepts only the new authenticator afterwards, never the old one or the used code', async () => {
      const { newSecret } = await startReplacement();
      const usedCode = codeAt(newSecret);
      await replacementPost('replacement/confirm', signedIn, { code: usedCode }).expect(200);

      const replay = await mfaPost('verify', await challengeFor(), { code: usedCode }).expect(401);
      assert.equal(replay.body.error.code, 'MFA_VERIFICATION_FAILED');

      store.advance(30 * 1000);
      const old = await mfaPost('verify', await challengeFor(), { code: codeAt(oldSecret) }).expect(
        401,
      );
      assert.equal(old.body.error.code, 'MFA_VERIFICATION_FAILED');
      assert.equal(store.state.audit.at(-1).reasonCode, 'MFA_CODE_INVALID');

      await mfaPost('verify', await challengeFor(), { code: codeAt(newSecret) }).expect(200);
    });

    it('requires an authenticated session and its CSRF token', async () => {
      await request(app)
        .post('/api/v1/auth/mfa/replacement')
        .set('X-CSRF-Token', signedIn.csrf)
        .expect(401);
      const noCsrf = await request(app)
        .post('/api/v1/auth/mfa/replacement')
        .set('Cookie', signedIn.cookie)
        .expect(403);
      assert.equal(noCsrf.body.error.code, 'CSRF_REJECTED');
      assert.equal(store.state.audit.at(-1).reasonCode, 'CSRF_TOKEN_MISSING');

      const challenge = await challengeFor();
      await replacementPost('replacement', challenge).expect(401);
      await replacementPost('replacement', signedIn)
        .set('Origin', 'https://evil.example')
        .expect(403);
    });

    it('requires MFA verified on this session within the last 10 minutes', async () => {
      const { newSecret } = await startReplacement();
      store.advance(9.5 * 60 * 1000 - 30 * 1000); // keep the session active, but MFA 9.5 min ago
      await request(app).get('/api/v1/auth/me').set('Cookie', signedIn.cookie).expect(200);
      store.advance(30 * 1000);

      const res = await replacementPost('replacement/confirm', signedIn, {
        code: codeAt(newSecret),
      }).expect(403);
      assert.equal(res.body.error.code, 'MFA_RECENT_VERIFICATION_REQUIRED');
      const audit = store.state.audit.at(-1);
      assert.equal(audit.eventCode, 'ACCESS_DENIED');
      assert.equal(audit.reasonCode, 'MFA_RECENT_VERIFICATION_REQUIRED');
      await replacementPost('replacement', signedIn).expect(403);
      assert.deepEqual(
        keyring.decrypt(zaid.user.userId, store.user(zaid.user.userId).mfaTotpSecretEncrypted),
        oldSecret,
      );
    });

    it('refuses sessions without MFA verification', async () => {
      await addActiveAccount(store, { password: PASSWORD, employee: { username: 'ordinary' } });
      const res = await login('ordinary').expect(200);
      const ordinary = { cookie: cookieValue(res, SESSION_COOKIE), csrf: res.body.data.csrf.token };

      const refused = await replacementPost('replacement', ordinary).expect(403);
      assert.equal(refused.body.error.code, 'MFA_RECENT_VERIFICATION_REQUIRED');
    });

    it('counts wrong codes, keeps the old secret, and ends every session at lockout', async () => {
      await startReplacement();
      const storedBefore = store.user(zaid.user.userId).mfaTotpSecretEncrypted;

      const wrong = await replacementPost('replacement/confirm', signedIn, {
        code: codeAt(oldSecret),
      }).expect(401);
      assert.equal(wrong.body.error.code, 'MFA_VERIFICATION_FAILED');
      const audit = store.state.audit.at(-1);
      assert.equal(audit.eventCode, 'ACCESS_DENIED');
      assert.equal(audit.eventOutcome, 'DENIED');
      assert.equal(audit.actorType, 'USER');
      assert.equal(audit.reasonCode, 'MFA_REPLACEMENT_CODE_INVALID');
      assert.equal(store.user(zaid.user.userId).failedLoginAttempts, 1);

      for (let i = 0; i < 4; i += 1) {
        await replacementPost('replacement/confirm', signedIn, { code: '000000' }).expect(401);
      }
      assert.ok(store.user(zaid.user.userId).lockedUntil);
      assert.equal(store.auditEvents('ACCOUNT_LOCKED').length, 1);
      assert.ok(
        store.state.sessions.every((session) => session.revokedAt),
        'lockout ended all sessions',
      );
      assert.equal(store.user(zaid.user.userId).mfaTotpSecretEncrypted, storedBefore);
      await request(app).get('/api/v1/auth/me').set('Cookie', signedIn.cookie).expect(401);
    });

    it('lets only one of two concurrent confirmations replace the secret', async () => {
      const { newSecret } = await startReplacement();
      const code = codeAt(newSecret);
      store.holdReads('findMfaCredential', 2);

      const results = await Promise.all([
        replacementPost('replacement/confirm', signedIn, { code }),
        replacementPost('replacement/confirm', signedIn, { code }),
      ]);
      const statuses = results.map((res) => res.status).sort();

      assert.deepEqual(statuses, [200, 409]);
      assert.equal(
        results.find((res) => res.status === 409).body.error.code,
        'MFA_REPLACEMENT_CONFLICT',
      );
      assert.equal(store.state.audit.filter((row) => row.reasonCode === 'MFA_REPLACED').length, 1);
      assert.equal(store.state.audit.at(-1).reasonCode, 'MFA_REPLACEMENT_CONFLICT');
      assert.deepEqual(
        keyring.decrypt(zaid.user.userId, store.user(zaid.user.userId).mfaTotpSecretEncrypted),
        newSecret,
      );
    });

    it('validates the code format without counting an attempt', async () => {
      await startReplacement();
      await replacementPost('replacement/confirm', signedIn, { code: '12345' }).expect(400);
      await replacementPost('replacement/confirm', signedIn, { code: '123456', extra: 1 }).expect(
        400,
      );
      assert.equal(store.user(zaid.user.userId).failedLoginAttempts, 0);
    });
  });
});
