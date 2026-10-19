import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
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

function assertUnauthenticated(res) {
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHENTICATED');
  assert.equal(res.body.error.message, 'Authentication is required');
}

describe('authenticated session', () => {
  let store;
  let app;
  let account;
  let cookie;
  let csrfToken;

  const me = () => request(app).get('/api/v1/auth/me').set('Cookie', cookie);
  const session = () => store.state.sessions.at(-1);

  beforeEach(async () => {
    store = createAuthStore();
    app = createTestApp(store);
    account = await addActiveAccount(store, {
      password: PASSWORD,
      employee: { username: 'sara.k', fullName: 'Sara K' },
    });

    const res = await request(app)
      .post('/api/v1/auth/login')
      .send({ username: 'sara.k', password: PASSWORD })
      .expect(200);
    cookie = sessionCookie(res);
    csrfToken = res.body.data.csrf.token;
  });

  describe('GET /api/v1/auth/me', () => {
    it('returns the safe profile and session state', async () => {
      const res = await me().expect(200);

      assert.equal(res.headers['cache-control'], 'no-store');
      assert.equal(res.body.data.user.id, account.user.userId);
      assert.equal(res.body.data.user.username, 'sara.k');
      assert.equal(res.body.data.session.idleTimeoutSeconds, 1800);
      assert.equal(res.body.data.session.mfaVerified, false);
      assert.equal(res.body.data.password.expired, false);
      assert.deepEqual(Object.keys(res.body.data.user).sort(), [
        'department',
        'email',
        'employeeNumber',
        'fullName',
        'id',
        'jobTitle',
        'username',
      ]);
    });

    it('requires a session cookie', async () => {
      assertUnauthenticated(await request(app).get('/api/v1/auth/me'));
    });

    it('rejects malformed and unknown tokens and clears the cookie', async () => {
      for (const value of ['abc', 'x'.repeat(43), `${'A'.repeat(42)}!`]) {
        const res = await request(app)
          .get('/api/v1/auth/me')
          .set('Cookie', `${COOKIE_NAME}=${value}`);

        assertUnauthenticated(res);
        assert.ok(res.headers['set-cookie'].some((item) => item.startsWith(`${COOKIE_NAME}=;`)));
      }
    });

    it('does not accept the session ID or the token hash as a credential', async () => {
      const current = session();
      for (const value of [current.sessionId, current.tokenHash]) {
        assertUnauthenticated(
          await request(app).get('/api/v1/auth/me').set('Cookie', `${COOKIE_NAME}=${value}`),
        );
      }
    });
  });

  describe('expiry', () => {
    it('slides the 30-minute idle timeout with activity', async () => {
      store.advance(29 * MINUTE_MS);
      await me().expect(200);
      assert.equal(session().lastActivityAt.getTime(), store.now().getTime());

      store.advance(29 * MINUTE_MS);
      await me().expect(200);

      store.advance(30 * MINUTE_MS);
      assertUnauthenticated(await me());

      const [audit] = store.auditEvents('SESSION_EXPIRED');
      assert.equal(audit.eventOutcome, 'DENIED');
      assert.equal(audit.reasonCode, 'IDLE_TIMEOUT');
      assert.equal(audit.targetRecordId, session().sessionId);
      assert.equal(session().revokedAt, null, 'expiry is derived, not written');
    });

    it('persists activity at most once per touch interval', async () => {
      const issuedAt = session().lastActivityAt.getTime();
      store.advance(30 * 1000);
      await me().expect(200);
      assert.equal(session().lastActivityAt.getTime(), issuedAt);
    });

    it('enforces the 8-hour absolute expiry regardless of activity', async () => {
      for (let elapsed = 0; elapsed < 8 * 60; elapsed += 20) {
        await me().expect(200);
        store.advance(20 * MINUTE_MS);
      }
      assertUnauthenticated(await me());

      const [audit] = store.auditEvents('SESSION_EXPIRED');
      assert.equal(audit.reasonCode, 'ABSOLUTE_EXPIRY');
      assert.equal(audit.actorType, 'SYSTEM');
    });

    it('does not audit unknown or already-revoked tokens', async () => {
      session().revokedAt = store.now();
      assertUnauthenticated(await me());
      assert.equal(
        store.state.audit.filter((row) => row.eventCode.startsWith('SESSION')).length,
        0,
      );
    });

    it('keeps a valid session when the password expires during it', async () => {
      store.user(account.user.userId).passwordChangedAt = new Date(
        store.now().getTime() - 91 * DAY_MS,
      );

      const res = await me().expect(200);
      assert.equal(res.body.data.password.expired, true);
    });
  });

  describe('server-side revalidation on every request', () => {
    const rejectionCases = [
      [
        'the account is disabled',
        (s, a) => (s.user(a.user.userId).accountStatus = 'DISABLED'),
        'ACCOUNT_NOT_ACTIVE',
      ],
      [
        'the account returns to PENDING',
        (s, a) => (s.user(a.user.userId).accountStatus = 'PENDING'),
        'ACCOUNT_NOT_ACTIVE',
      ],
      [
        'the employee is no longer current in Fusion',
        (s) => {
          s.state.employees[0].currentEmployeeFlag = 'N';
          s.state.employees[0].terminationDate = '2026-10-01';
        },
        'EMPLOYEE_NOT_CURRENT',
      ],
      [
        'a termination date is set to today (KSA)',
        (s) => (s.state.employees[0].terminationDate = '2026-10-19'),
        'EMPLOYEE_TERMINATED',
      ],
      [
        'the employee record disappears',
        (s) => s.state.employees.splice(0, 1),
        'EMPLOYEE_NOT_FOUND',
      ],
      [
        'MFA is enrolled after login',
        (s, a) => (s.user(a.user.userId).mfaEnrolledAt = s.now()),
        'MFA_REQUIRED',
      ],
      [
        'a security-administration permission is granted after login (stale session must not gain privilege)',
        (s, a) => (s.user(a.user.userId).hasSecurityAdministration = true),
        'MFA_REQUIRED',
      ],
      [
        'an administrator role is assigned after login',
        (s, a) => (s.user(a.user.userId).isPrivilegedRoleMember = true),
        'MFA_REQUIRED',
      ],
    ];

    for (const [label, mutate, reason] of rejectionCases) {
      it(`rejects, revokes and audits the session when ${label}`, async () => {
        mutate(store, account);

        assertUnauthenticated(await me());
        assert.ok(session().revokedAt, 'session revoked');

        const [audit] = store.auditEvents('SESSION_REVOKED');
        assert.equal(audit.eventOutcome, 'SUCCESS');
        assert.equal(audit.actorType, 'SYSTEM');
        assert.equal(audit.reasonCode, reason);
        assert.equal(audit.targetRecordId, session().sessionId);
      });
    }

    it('does not end a session because the account was locked by someone else', async () => {
      store.user(account.user.userId).lockedUntil = new Date(store.now().getTime() + MINUTE_MS);
      await me().expect(200);
    });

    it('ends the session when the termination date becomes today at KSA midnight', async () => {
      // Log in at 2026-10-19T20:50Z (23:50 in Asia/Riyadh) with a termination date of tomorrow.
      const lateStore = createAuthStore({ start: new Date('2026-10-19T20:50:00Z') });
      const lateApp = createTestApp(lateStore);
      await addActiveAccount(lateStore, {
        password: PASSWORD,
        employee: { username: 'late.shift', terminationDate: '2026-10-20' },
      });
      const res = await request(lateApp)
        .post('/api/v1/auth/login')
        .send({ username: 'late.shift', password: PASSWORD })
        .expect(200);
      const lateMe = () =>
        request(lateApp).get('/api/v1/auth/me').set('Cookie', sessionCookie(res));

      lateStore.advance(9 * MINUTE_MS); // 23:59 KSA: still before the termination date
      await lateMe().expect(200);

      lateStore.advance(2 * MINUTE_MS); // 00:01 KSA on 2026-10-20 (21:01Z on 2026-10-19)
      assertUnauthenticated(await lateMe());
      assert.equal(lateStore.auditEvents('SESSION_REVOKED')[0].reasonCode, 'EMPLOYEE_TERMINATED');
    });

    it('still denies, and records the denial independently, when revocation fails', async () => {
      store.user(account.user.userId).accountStatus = 'DISABLED';
      store.failures.revokeUpdate = true;

      assertUnauthenticated(await me());
      assert.equal(session().revokedAt, null);
      assert.equal(store.auditEvents('SESSION_REVOKED').length, 0);

      const [audit] = store.auditEvents('ACCESS_DENIED');
      assert.equal(audit.eventOutcome, 'DENIED');
      assert.equal(audit.reasonCode, 'ACCOUNT_NOT_ACTIVE');
      assert.equal(audit.eventDetails, JSON.stringify({ sessionRevoked: false }));
    });

    it('still denies when no audit row can be written at all', async () => {
      store.user(account.user.userId).accountStatus = 'DISABLED';
      store.failures.auditInsert = true;

      assertUnauthenticated(await me());
    });
  });

  describe('CSRF', () => {
    it('GET /api/v1/auth/csrf returns the session-bound token', async () => {
      const res = await request(app).get('/api/v1/auth/csrf').set('Cookie', cookie).expect(200);

      assert.deepEqual(res.body.data, { token: csrfToken, headerName: 'X-CSRF-Token' });
    });

    it('requires authentication to obtain a CSRF token', async () => {
      assertUnauthenticated(await request(app).get('/api/v1/auth/csrf'));
    });

    it('binds the token to the session', async () => {
      const other = await request(app)
        .post('/api/v1/auth/login')
        .send({ username: 'sara.k', password: PASSWORD })
        .expect(200);

      assert.notEqual(other.body.data.csrf.token, csrfToken);
      const res = await request(app)
        .post('/api/v1/auth/logout')
        .set('Cookie', sessionCookie(other))
        .set('X-CSRF-Token', csrfToken)
        .expect(403);
      assert.equal(res.body.error.code, 'CSRF_REJECTED');
    });
  });

  describe('POST /api/v1/auth/logout', () => {
    const logout = () => request(app).post('/api/v1/auth/logout').set('Cookie', cookie);

    it('rejects logout without a CSRF token or with a wrong one', async () => {
      const missing = await logout().expect(403);
      assert.equal(missing.body.error.code, 'CSRF_REJECTED');
      const tampered = csrfToken.slice(0, -1) + (csrfToken.endsWith('A') ? 'B' : 'A');
      await logout().set('X-CSRF-Token', tampered).expect(403);
      await logout().set('X-CSRF-Token', 'short').expect(403);

      assert.equal(session().revokedAt, null);

      const denials = store.auditEvents('ACCESS_DENIED');
      assert.deepEqual(
        denials.map((row) => row.reasonCode),
        ['CSRF_TOKEN_MISSING', 'CSRF_TOKEN_INVALID', 'CSRF_TOKEN_INVALID'],
      );
      assert.equal(denials[0].actorType, 'USER');
      assert.equal(denials[0].createdBy, account.user.userId);
      assert.ok(!JSON.stringify(denials).includes(csrfToken), 'token never audited');
    });

    it('rejects a cross-origin logout before checking the session', async () => {
      await logout()
        .set('X-CSRF-Token', csrfToken)
        .set('Origin', 'https://evil.example')
        .expect(403);
      assert.equal(session().revokedAt, null);
      assert.equal(store.auditEvents('ACCESS_DENIED').length, 0, 'forgeable; logged only');
    });

    it('revokes the session server-side, clears the cookie and audits the logout', async () => {
      const res = await logout().set('X-CSRF-Token', csrfToken).expect(204);

      assert.equal(res.text, '');
      const cleared = res.headers['set-cookie'].find((item) => item.startsWith(`${COOKIE_NAME}=;`));
      assert.match(cleared, /Expires=Thu, 01 Jan 1970/);
      assert.match(cleared, /HttpOnly/);
      assert.match(cleared, /Secure/);

      assert.ok(session().revokedAt);
      const [audit] = store.auditEvents('LOGOUT');
      assert.equal(audit.actorType, 'USER');
      assert.equal(audit.createdBy, account.user.userId);
      assert.equal(audit.targetType, 'USER_SESSION');

      // Replaying the old cookie no longer works.
      assertUnauthenticated(await me());
      assertUnauthenticated(await logout().set('X-CSRF-Token', csrfToken));
    });

    it('requires a session', async () => {
      assertUnauthenticated(
        await request(app).post('/api/v1/auth/logout').set('X-CSRF-Token', csrfToken),
      );
    });
  });
});
