import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import {
  addActiveAccount,
  createAuthStore,
  createTestApp,
  DAY_MS,
  sessionCookie,
} from './helpers/authFakes.js';

// Supertest + in-memory repositories. Oracle SQL is not exercised here.

const PASSWORD = 'Correct-Horse1!';
const MINUTE_MS = 60 * 1000;
const COOKIE_NAME = config.auth.cookie.name;

const login = (app, body, headers = {}) =>
  request(app).post('/api/v1/auth/login').set(headers).send(body);

function assertGenericFailure(res) {
  assert.equal(res.status, 401);
  assert.equal(res.body.success, false);
  assert.equal(res.body.error.code, 'AUTHENTICATION_FAILED');
  assert.equal(
    res.body.error.message,
    'Sign-in failed. Check your username and password, or try again later.',
  );
  assert.equal(res.body.error.details, undefined);
  assert.equal(sessionCookie(res), undefined);
}

function lastAudit(store) {
  return store.state.audit.at(-1);
}

describe('GET /api/v1/auth/password/policy', () => {
  it('returns the locked password policy without authentication', async () => {
    const app = createTestApp(createAuthStore());
    const res = await request(app).get('/api/v1/auth/password/policy').expect(200);

    assert.equal(res.headers['cache-control'], 'no-store');
    assert.deepEqual(res.body.data, {
      minLength: 8,
      maxLength: 128,
      requireUppercase: true,
      requireLowercase: true,
      requireDigit: true,
      requireSpecialCharacter: true,
      expiryDays: 90,
      expiryReminderDays: [14, 7, 1],
    });
  });

  it('rejects unexpected query parameters', async () => {
    const app = createTestApp(createAuthStore());
    await request(app).get('/api/v1/auth/password/policy?x=1').expect(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  let store;
  let app;
  let account;

  beforeEach(async () => {
    store = createAuthStore();
    app = createTestApp(store);
    account = await addActiveAccount(store, {
      password: PASSWORD,
      employee: { username: 'Ahmed.Ali', fullName: 'Ahmed Ali' },
    });
  });

  describe('successful login', () => {
    it('issues a hashed, Secure, HttpOnly session cookie and audits the login', async () => {
      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);

      const setCookie = res.headers['set-cookie'].find((item) => item.startsWith(COOKIE_NAME));
      assert.match(setCookie, /; HttpOnly/);
      assert.match(setCookie, /; Secure/);
      assert.match(setCookie, /; SameSite=Lax/);
      assert.match(setCookie, /; Path=\//);
      assert.match(setCookie, /; Expires=/);
      assert.doesNotMatch(setCookie, /Domain=/);

      const token = sessionCookie(res).split('=')[1];
      assert.match(token, /^[A-Za-z0-9_-]{43}$/);

      const [session] = store.state.sessions;
      assert.equal(session.tokenHash, createHash('sha256').update(token).digest('hex'));
      assert.equal(session.createdBy, account.user.userId);
      assert.equal(
        session.expiresAt.getTime() - store.now().getTime(),
        8 * 60 * MINUTE_MS,
        '8-hour absolute expiry',
      );
      assert.ok(!JSON.stringify(store.state.sessions).includes(token), 'raw token never stored');

      assert.deepEqual(res.body.data.user, {
        id: account.user.userId,
        username: 'Ahmed.Ali',
        employeeNumber: account.employee.employeeNumber,
        fullName: 'Ahmed Ali',
        email: 'test.employee@example.invalid',
        jobTitle: 'Engineer',
        department: 'Engineering',
      });
      assert.equal(res.body.data.session.idleTimeoutSeconds, 1800);
      assert.equal(res.body.data.session.mfaVerified, false);
      assert.equal(res.body.data.csrf.headerName, 'X-CSRF-Token');
      assert.match(res.body.data.csrf.token, /^[A-Za-z0-9_-]{43}$/);
      assert.notEqual(res.body.data.csrf.token, token);
      assert.equal(res.headers['cache-control'], 'no-store');

      const audit = lastAudit(store);
      assert.equal(audit.eventCode, 'LOGIN_SUCCESS');
      assert.equal(audit.eventOutcome, 'SUCCESS');
      assert.equal(audit.actorType, 'USER');
      assert.equal(audit.createdBy, account.user.userId);
      assert.equal(audit.subjectUserId, account.user.userId);
      assert.equal(audit.targetType, 'USER_SESSION');
      assert.equal(audit.targetRecordId, session.sessionId);
      assert.equal(audit.correlationId, res.headers['x-request-id']);
      assert.equal(store.user(account.user.userId).lastLoginAt.getTime(), store.now().getTime());
    });

    it('matches USER_NAME case-insensitively after trimming', async () => {
      await login(app, { username: '  ahmed.ALI ', password: PASSWORD }).expect(200);
    });

    it('never returns password hashes or raw tokens in the body', async () => {
      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);
      const body = JSON.stringify(res.body);
      const token = sessionCookie(res).split('=')[1];

      assert.ok(!body.includes(token));
      assert.ok(!body.includes('argon2'));
      assert.ok(!body.includes(PASSWORD));
    });

    it('resets earlier failed attempts', async () => {
      for (let i = 0; i < 3; i += 1) {
        await login(app, { username: 'Ahmed.Ali', password: 'wrong' }).expect(401);
      }
      assert.equal(store.user(account.user.userId).failedLoginAttempts, 3);

      await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);
      assert.equal(store.user(account.user.userId).failedLoginAttempts, 0);
    });

    it('revokes the session the browser presented before logging in again', async () => {
      const first = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);
      await login(app, { username: 'Ahmed.Ali', password: PASSWORD })
        .set('Cookie', sessionCookie(first))
        .expect(200);

      const [old, current] = store.state.sessions;
      assert.ok(old.revokedAt);
      assert.equal(current.revokedAt, null);
    });
  });

  describe('identity resolution', () => {
    it('returns the same generic failure for unknown usernames and wrong passwords', async () => {
      const unknown = await login(app, { username: 'nobody', password: PASSWORD });
      const wrong = await login(app, { username: 'Ahmed.Ali', password: 'Wrong-Pass1!' });

      assertGenericFailure(unknown);
      assertGenericFailure(wrong);
      assert.deepEqual(unknown.body.error, wrong.body.error);
    });

    it('audits an unknown username anonymously without storing the attempted username', async () => {
      await login(app, { username: 'typo-or-password', password: PASSWORD }).expect(401);

      const audit = lastAudit(store);
      assert.equal(audit.eventCode, 'LOGIN_FAILED');
      assert.equal(audit.eventOutcome, 'FAILURE');
      assert.equal(audit.actorType, 'ANONYMOUS');
      assert.equal(audit.createdBy, null);
      assert.equal(audit.subjectUserId, null);
      assert.equal(audit.reasonCode, 'UNKNOWN_USERNAME');
      assert.ok(!JSON.stringify(store.state.audit).includes('typo-or-password'));
    });

    it('refuses usernames that match more than one employee', async () => {
      store.addEmployee({ username: 'AHMED.ALI ' });

      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
      assert.equal(lastAudit(store).reasonCode, 'AMBIGUOUS_USERNAME');
      assert.equal(store.state.sessions.length, 0);
    });

    it('refuses an employee number duplicated in the employee master', async () => {
      store.addEmployee({
        username: 'other.person',
        employeeNumber: account.employee.employeeNumber,
      });

      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
      assert.equal(lastAudit(store).reasonCode, 'AMBIGUOUS_EMPLOYEE_NUMBER');
    });

    it('refuses an employee without a local account', async () => {
      store.addEmployee({ username: 'no.account' });

      assertGenericFailure(await login(app, { username: 'no.account', password: PASSWORD }));
      assert.equal(lastAudit(store).reasonCode, 'NO_LOCAL_ACCOUNT');
    });
  });

  describe('account status and employee eligibility', () => {
    for (const status of ['PENDING', 'DISABLED']) {
      it(`refuses ${status} accounts even with the correct password`, async () => {
        store.user(account.user.userId).accountStatus = status;

        assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
        const audit = lastAudit(store);
        assert.equal(audit.eventCode, 'LOGIN_FAILED');
        assert.equal(audit.eventOutcome, 'DENIED');
        assert.equal(audit.reasonCode, `ACCOUNT_${status}`);
        assert.equal(audit.subjectUserId, account.user.userId);
        assert.equal(store.state.sessions.length, 0);
      });
    }

    it('refuses an account without a password hash', async () => {
      store.user(account.user.userId).passwordHash = null;

      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
      assert.equal(lastAudit(store).reasonCode, 'PASSWORD_NOT_SET');
    });

    // Decision 01. The store clock is 2026-10-19T08:00Z, i.e. 2026-10-19 11:00 in Asia/Riyadh.
    const allowedEmployees = [
      ['no termination date', 'Y', null],
      ['a termination date tomorrow (KSA)', 'Y', '2026-10-20'],
      ['a termination date next year', 'Y', '2027-01-31'],
    ];
    for (const [label, flag, terminationDate] of allowedEmployees) {
      it(`allows a current employee with ${label}`, async () => {
        Object.assign(store.state.employees[0], { currentEmployeeFlag: flag, terminationDate });
        await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);
      });
    }

    const refusedEmployees = [
      ['a termination date today (KSA)', 'Y', '2026-10-19', 'EMPLOYEE_TERMINATED'],
      ['a past termination date', 'Y', '2026-01-01', 'EMPLOYEE_TERMINATED'],
      ['flag N and a past termination date', 'N', '2026-01-01', 'EMPLOYEE_NOT_CURRENT'],
      ['flag N without a termination date', 'N', null, 'EMPLOYEE_NOT_CURRENT'],
      ['flag N and a future termination date', 'N', '2027-01-31', 'EMPLOYEE_NOT_CURRENT'],
      ['an unknown flag value', 'X', null, 'EMPLOYEE_NOT_CURRENT'],
      ['a null flag', null, null, 'EMPLOYEE_NOT_CURRENT'],
    ];
    for (const [label, flag, terminationDate, reason] of refusedEmployees) {
      it(`refuses an employee with ${label}`, async () => {
        Object.assign(store.state.employees[0], { currentEmployeeFlag: flag, terminationDate });

        assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
        const audit = lastAudit(store);
        assert.equal(audit.eventOutcome, 'DENIED');
        assert.equal(audit.reasonCode, reason);
      });
    }

    it('uses the KSA date, not the UTC date, for the termination boundary', async () => {
      // 2026-10-19T22:30Z is already 2026-10-20 01:30 in Asia/Riyadh.
      store.advance(14.5 * 60 * MINUTE_MS);
      Object.assign(store.state.employees[0], { terminationDate: '2026-10-20' });
      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
      assert.equal(lastAudit(store).reasonCode, 'EMPLOYEE_TERMINATED');

      Object.assign(store.state.employees[0], { terminationDate: '2026-10-21' });
      await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);
    });

    it('refuses a stored hash below the approved Argon2id minimum without verifying it', async () => {
      const weak = store.user(account.user.userId).passwordHash.replace('m=19456', 'm=4096');
      store.user(account.user.userId).passwordHash = weak;

      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
      assert.equal(lastAudit(store).reasonCode, 'CREDENTIAL_BELOW_MINIMUM');
      assert.equal(store.user(account.user.userId).failedLoginAttempts, 0);
    });

    it('accepts a stronger existing hash without changing it', async () => {
      // PHP password_hash default cost (m=65536, t=4) for a synthetic password.
      const strong =
        '$argon2id$v=19$m=65536,t=4,p=1$U2tmTktNYkR3NmJGYjJocw$T5QZoWwmk7WPpYrd/9XrsCYrFKBFn8rNNR79cxCQ2/M';
      store.user(account.user.userId).passwordHash = strong;

      await login(app, { username: 'Ahmed.Ali', password: 'Interop-Test-Pass1!' }).expect(200);
      assert.equal(store.user(account.user.userId).passwordHash, strong);
    });

    it('refuses an unreadable stored hash without counting a failed attempt', async () => {
      store.user(account.user.userId).passwordHash = '$2y$10$notargon2';

      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
      assert.equal(lastAudit(store).reasonCode, 'CREDENTIAL_UNREADABLE');
      assert.equal(store.user(account.user.userId).failedLoginAttempts, 0);
    });
  });

  describe('lockout', () => {
    const wrongAttempt = () => login(app, { username: 'Ahmed.Ali', password: 'Wrong-Pass1!' });

    it('counts consecutive failures and audits each one', async () => {
      assertGenericFailure(await wrongAttempt());

      const user = store.user(account.user.userId);
      assert.equal(user.failedLoginAttempts, 1);
      assert.equal(user.lockedUntil, null);
      const audit = lastAudit(store);
      assert.equal(audit.reasonCode, 'INVALID_PASSWORD');
      assert.equal(audit.eventDetails, JSON.stringify({ consecutiveFailures: 1 }));
    });

    it('locks for 15 minutes after five consecutive failures', async () => {
      for (let i = 0; i < 5; i += 1) assertGenericFailure(await wrongAttempt());

      const user = store.user(account.user.userId);
      assert.equal(user.failedLoginAttempts, 5);
      assert.equal(user.lockedUntil.getTime() - store.now().getTime(), 15 * MINUTE_MS);

      const lockEvent = store.auditEvents('ACCOUNT_LOCKED');
      assert.equal(lockEvent.length, 1);
      assert.equal(lockEvent[0].actorType, 'SYSTEM');
      assert.equal(lockEvent[0].createdBy, null);
      assert.equal(lockEvent[0].targetType, 'USER');

      // The correct password is refused while locked, with the same generic response.
      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));
      assert.equal(lastAudit(store).reasonCode, 'ACCOUNT_LOCKED');
      assert.equal(store.state.sessions.length, 0);

      store.advance(14 * MINUTE_MS);
      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: PASSWORD }));

      store.advance(1 * MINUTE_MS);
      await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);
      assert.equal(store.user(account.user.userId).failedLoginAttempts, 0);
      assert.equal(store.user(account.user.userId).lockedUntil, null);
    });

    it('restarts the count when a failure follows an expired lock', async () => {
      for (let i = 0; i < 5; i += 1) await wrongAttempt();
      store.advance(15 * MINUTE_MS);

      await wrongAttempt();
      const user = store.user(account.user.userId);
      assert.equal(user.failedLoginAttempts, 1);
      assert.equal(user.lockedUntil, null);
    });

    it('persists the failure and its audit event although the request is rejected', async () => {
      assertGenericFailure(await wrongAttempt());

      assert.equal(store.stats.rollbacks, 0);
      assert.equal(store.user(account.user.userId).failedLoginAttempts, 1);
      assert.equal(store.auditEvents('LOGIN_FAILED').length, 1);
    });

    it('records the failed attempt even when the lockout counter update fails', async () => {
      store.failures.failedAttemptUpdate = true;

      const res = await wrongAttempt().expect(500);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      assert.equal(store.stats.rollbacks, 1, 'the counter transaction rolled back');

      const [audit] = store.auditEvents('LOGIN_FAILED');
      assert.equal(audit.reasonCode, 'INVALID_PASSWORD');
      assert.equal(audit.eventDetails, JSON.stringify({ lockoutCounterUpdated: false }));
    });

    it('records a post-password denial even when clearing the failure count fails', async () => {
      store.user(account.user.userId).mfaEnrolledAt = store.now();
      store.failures.resetUpdate = true;

      await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(500);
      const [audit] = store.auditEvents('LOGIN_FAILED');
      assert.equal(audit.eventOutcome, 'DENIED');
      assert.equal(audit.reasonCode, 'MFA_REQUIRED');
      assert.equal(store.state.sessions.length, 0);
    });
  });

  describe('password expiry', () => {
    it('refuses a new login once the password is 90 days old and clears failed attempts', async () => {
      const user = store.user(account.user.userId);
      user.passwordChangedAt = new Date(store.now().getTime() - 90 * DAY_MS);
      user.failedLoginAttempts = 2;

      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(403);
      assert.equal(res.body.error.code, 'PASSWORD_EXPIRED');
      assert.equal(sessionCookie(res), undefined);
      assert.equal(store.state.sessions.length, 0);
      assert.equal(store.user(account.user.userId).failedLoginAttempts, 0);
      assert.equal(lastAudit(store).reasonCode, 'PASSWORD_EXPIRED');
    });

    it('allows login one day before expiry and reports the expiry instant', async () => {
      const changedAt = new Date(store.now().getTime() - 89 * DAY_MS);
      store.user(account.user.userId).passwordChangedAt = changedAt;

      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);
      assert.equal(res.body.data.password.expired, false);
      assert.equal(
        res.body.data.password.expiresAt,
        new Date(changedAt.getTime() + 90 * DAY_MS).toISOString(),
      );
    });

    it('blocks login when PASSWORD_CHANGED_AT is NULL', async () => {
      store.user(account.user.userId).passwordChangedAt = null;

      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(403);
      assert.equal(res.body.error.code, 'PASSWORD_EXPIRED');
      assert.equal(store.state.sessions.length, 0);
      assert.equal(lastAudit(store).reasonCode, 'PASSWORD_CHANGE_TIME_MISSING');
    });

    it('treats exactly 90 days as expired and one second less as valid', async () => {
      const user = store.user(account.user.userId);
      user.passwordChangedAt = new Date(store.now().getTime() - 90 * DAY_MS + 1000);
      await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);

      store.advance(1000);
      await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(403);
    });

    it('does not reveal password expiry to a wrong password', async () => {
      store.user(account.user.userId).passwordChangedAt = null;
      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: 'Wrong-Pass1!' }));
    });
  });

  describe('MFA restrictions (fail closed until Phase 02)', () => {
    it('issues no session to a user with enrolled MFA', async () => {
      store.user(account.user.userId).mfaEnrolledAt = store.now();

      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(403);
      assert.equal(res.body.error.code, 'MFA_REQUIRED');
      assert.equal(sessionCookie(res), undefined);
      assert.equal(store.state.sessions.length, 0);
      assert.equal(store.user(account.user.userId).lastLoginAt, null);

      const audit = lastAudit(store);
      assert.equal(audit.eventCode, 'LOGIN_FAILED');
      assert.equal(audit.eventOutcome, 'DENIED');
      assert.equal(audit.reasonCode, 'MFA_REQUIRED');
      assert.equal(audit.eventDetails, JSON.stringify({ basis: 'MFA_ENROLLED' }));
    });

    it('issues no session to Zaid (protected employee number 2172) even without grants', async () => {
      await addActiveAccount(store, {
        password: PASSWORD,
        employee: { username: 'zaid', employeeNumber: '2172' },
      });

      const res = await login(app, { username: 'zaid', password: PASSWORD }).expect(403);
      assert.equal(res.body.error.code, 'MFA_REQUIRED');
      assert.equal(sessionCookie(res), undefined);
      assert.equal(store.state.sessions.length, 0);
      assert.equal(
        lastAudit(store).eventDetails,
        JSON.stringify({ basis: 'PROTECTED_ADMINISTRATOR' }),
      );
    });

    const privilegedCases = [
      [
        'a Main Administrator / Administrator role member',
        { isPrivilegedRoleMember: true },
        'PRIVILEGED_ROLE',
      ],
      [
        'a holder of an effective security-administration permission',
        { hasSecurityAdministration: true },
        'SECURITY_ADMINISTRATION_PERMISSION',
      ],
    ];
    for (const [label, flags, basis] of privilegedCases) {
      it(`issues no session to ${label}`, async () => {
        Object.assign(store.user(account.user.userId), flags);

        const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(403);
        assert.equal(res.body.error.code, 'MFA_REQUIRED');
        assert.equal(store.state.sessions.length, 0);
        assert.equal(lastAudit(store).eventDetails, JSON.stringify({ basis }));
      });
    }

    it('does not treat a similar employee number as Zaid', async () => {
      await addActiveAccount(store, {
        password: PASSWORD,
        employee: { username: 'not.zaid', employeeNumber: '21720' },
      });
      await login(app, { username: 'not.zaid', password: PASSWORD }).expect(200);
    });

    it('issues an ordinary 30-minute session to an ordinary business-role holder without MFA', async () => {
      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(200);
      assert.equal(res.body.data.session.idleTimeoutSeconds, 1800);
    });

    it('does not reveal the MFA requirement to a wrong password', async () => {
      store.user(account.user.userId).mfaEnrolledAt = store.now();
      assertGenericFailure(await login(app, { username: 'Ahmed.Ali', password: 'Wrong-Pass1!' }));
    });
  });

  describe('request validation', () => {
    const invalidBodies = [
      ['a missing password', { username: 'Ahmed.Ali' }],
      ['a missing username', { password: PASSWORD }],
      ['an email field instead of username', { email: 'a@example.invalid', password: PASSWORD }],
      [
        'an extra employeeNumber field',
        { username: 'x', employeeNumber: 'E1', password: PASSWORD },
      ],
      ['a username over 100 characters', { username: 'u'.repeat(101), password: PASSWORD }],
      ['a password over 256 characters', { username: 'x', password: 'p'.repeat(257) }],
      ['a username with control characters', { username: 'a\u0000b', password: PASSWORD }],
      ['a blank username', { username: '   ', password: PASSWORD }],
      ['a non-string password', { username: 'x', password: 12345678 }],
    ];

    for (const [label, body] of invalidBodies) {
      it(`rejects ${label} without touching the database or audit`, async () => {
        const res = await login(app, body).expect(400);

        assert.equal(res.body.error.code, 'VALIDATION_ERROR');
        assert.ok(!JSON.stringify(res.body).includes(PASSWORD));
        assert.equal(store.state.audit.length, 0);
      });
    }
  });

  describe('origin verification (login CSRF)', () => {
    it('rejects a cross-origin login', async () => {
      const res = await login(
        app,
        { username: 'Ahmed.Ali', password: PASSWORD },
        { Origin: 'https://evil.example' },
      ).expect(403);

      assert.equal(res.body.error.code, 'CSRF_REJECTED');
      assert.equal(store.state.sessions.length, 0);
    });

    it('rejects Fetch Metadata cross-site requests and an opaque null origin', async () => {
      const body = { username: 'Ahmed.Ali', password: PASSWORD };
      await login(app, body, { 'Sec-Fetch-Site': 'cross-site' }).expect(403);
      await login(app, body, { Origin: 'null' }).expect(403);
    });

    it('accepts the API origin and allowlisted origins', async () => {
      const body = { username: 'Ahmed.Ali', password: PASSWORD };
      const allowlisted = createTestApp(store, { allowedOrigins: ['https://app.example'] });

      await login(app, body, {
        Host: 'api.example',
        Origin: 'http://api.example',
        'Sec-Fetch-Site': 'same-origin',
      }).expect(200);
      await login(allowlisted, body, { Origin: 'https://app.example' }).expect(200);
    });
  });

  describe('rate limiting', () => {
    it('allows 60 attempts per minute per IP by default and answers the 61st with 429', async () => {
      const defaults = createApp(config, {
        checkReadiness: async () => ({ LOW: true, HIGH: true }),
        api: { db: store.db, authRepository: store.authRepository },
      });
      // Invalid bodies are rejected after the limiter, so no hashing or database work is done.
      for (let i = 0; i < 60; i += 1) await login(defaults, {}).expect(400);

      const res = await login(defaults, {}).expect(429);
      assert.equal(res.body.error.code, 'RATE_LIMITED');
    });

    it('limits login attempts per client IP with Retry-After', async () => {
      const limited = createTestApp(store, { loginRateLimit: { max: 3, windowMs: 60000 } });
      for (let i = 0; i < 3; i += 1) {
        await login(limited, { username: 'nobody', password: 'x' }).expect(401);
      }

      const res = await login(limited, { username: 'Ahmed.Ali', password: PASSWORD }).expect(429);
      assert.equal(res.body.error.code, 'RATE_LIMITED');
      assert.ok(Number(res.headers['retry-after']) >= 1);
      assert.equal(store.state.sessions.length, 0);
    });
  });

  describe('audit write failures', () => {
    it('still returns the generic failure when an independent failure audit cannot be written', async () => {
      store.failures.auditInsert = true;
      assertGenericFailure(await login(app, { username: 'nobody', password: PASSWORD }));
    });

    it('rolls back the whole login when the success audit cannot be written', async () => {
      store.failures.auditInsert = true;

      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(500);
      assert.equal(res.body.error.code, 'INTERNAL_ERROR');
      assert.equal(sessionCookie(res), undefined);
      assert.equal(store.state.sessions.length, 0);
      assert.equal(store.user(account.user.userId).lastLoginAt, null);
    });

    it('issues no cookie when the session cannot be stored', async () => {
      store.failures.sessionInsert = true;

      const res = await login(app, { username: 'Ahmed.Ali', password: PASSWORD }).expect(500);
      assert.equal(sessionCookie(res), undefined);
      assert.equal(store.auditEvents('AUTH_LOGIN_SUCCEEDED').length, 0);
    });
  });
});
