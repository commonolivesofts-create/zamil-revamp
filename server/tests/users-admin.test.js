import assert from 'node:assert/strict';
import { beforeEach, describe, it } from 'node:test';
import request from 'supertest';
import { createAuthStore, createTestApp } from './helpers/authFakes.js';
import { installRbac, signIn } from './helpers/rbacFakes.js';
import { installUsers } from './helpers/usersFakes.js';

// Supertest + in-memory doubles (users, sessions, RBAC, audit). Oracle SQL is not exercised here
// (see scripts/verify-auth-sql.js for the read-only Oracle checks). Store "today" is 2026-10-19 KSA.

const BASE = '/api/v1/users';
const SEC = 'SECURITY_ADMINISTRATION';

function setup() {
  const store = createAuthStore();
  const rbac = installRbac(store, { syncPrivilegeFlags: true });
  installUsers(store);
  const { roles } = rbac.seedSecurityCatalog();

  const person = (employeeNumber, employee = {}, user) => {
    store.addEmployee({ employeeNumber, username: `user.${employeeNumber}`, ...employee });
    return user === null
      ? null
      : store.addUser(employeeNumber, {
          passwordHash: 'argon2-hash-placeholder',
          createdAt: store.now(),
          ...user,
        });
  };
  const zaid = person('2172', {}, { mfaEnrolledAt: store.now() });
  const admin = person('3001', {}, { mfaEnrolledAt: store.now() });
  const main = person('3002', {}, { mfaEnrolledAt: store.now() });
  const user = person('4001', { fullName: 'Sara Khan' }, {});
  // Employees without accounts (provisioning candidates).
  person('5001', { fullName: 'Eligible Person' }, null);
  person('5002', { terminationDate: '2026-01-01' }, null);
  person('5003', { currentEmployeeFlag: 'N' }, null);
  person('5004', { terminationDate: '2026-10-19' }, null); // today in KSA: ended
  person('5005', { terminationDate: '2026-12-31' }, null); // future: still eligible
  person('5006', {}, null);
  store.addEmployee({ employeeNumber: '5006', username: 'user.5006b' }); // duplicate source row
  person('5007', { username: null }, null);
  person('5008', { username: 'shared.name' }, null);
  person('5009', { username: ' SHARED.NAME' }, null);

  rbac.assign(zaid, roles.SUPER_ADMINISTRATOR);
  rbac.assign(main, roles.MAIN_ADMINISTRATOR);
  for (const action of ['VIEW', 'CREATE', 'ACTIVATE', 'DISABLE', 'REVOKE_SESSIONS']) {
    rbac.grant(roles.ADMINISTRATOR, rbac.permission(SEC, 'USER_ACCOUNTS', action));
  }
  rbac.assign(admin, roles.ADMINISTRATOR);
  return { store, rbac, roles, zaid, admin, main, user, app: createTestApp(store) };
}

describe('user administration API', () => {
  let f;
  let zaid;
  let admin;
  beforeEach(async () => {
    f = setup();
    zaid = await signIn(f.store, f.zaid);
    admin = await signIn(f.store, f.admin);
  });
  const get = (path, session = admin) =>
    request(f.app).get(`${BASE}${path}`).set('Cookie', session.cookie);
  const send = (method, path, session = admin, body) => {
    const req = request(f.app)
      [method](`${BASE}${path}`)
      .set('Cookie', session.cookie)
      .set('X-CSRF-Token', session.csrf);
    return body === undefined ? req : req.send(body);
  };
  const audits = (code) => f.store.auditEvents(code);
  const assertRefused = (res, code) => {
    assert.equal(res.status, 403, JSON.stringify(res.body));
    assert.equal(res.body.error.code, code);
    assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, code);
  };
  const setPassword = (user) =>
    Object.assign(user, {
      passwordHash: 'argon2-hash-placeholder',
      passwordChangedAt: f.store.now(),
    });

  describe('authorization', () => {
    it('requires a session and the USER_ACCOUNTS permission', async () => {
      assert.equal((await request(f.app).get(BASE)).status, 401);
      const ordinary = await signIn(f.store, f.user, { mfaVerified: false });
      const res = await get('', ordinary);
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'FORBIDDEN');
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'NO_GRANT');
    });

    it('checks each action separately (DENY override on DISABLE)', async () => {
      f.rbac.override(f.admin, f.rbac.permission(SEC, 'USER_ACCOUNTS', 'DISABLE'), 'DENY');
      admin = await signIn(f.store, f.admin);
      assert.equal((await get('')).status, 200);
      const res = await send('post', `/${f.user.userId}/disable`);
      assert.equal(res.status, 403);
      assert.equal(audits('ACCESS_DENIED').at(-1).reasonCode, 'EXPLICIT_DENY');
      assert.equal(f.user.accountStatus, 'ACTIVE');
    });

    it('requires the CSRF token for changes', async () => {
      const res = await request(f.app)
        .post(BASE)
        .set('Cookie', admin.cookie)
        .send({ employeeNumber: '5001' });
      assert.equal(res.status, 403);
      assert.equal(res.body.error.code, 'CSRF_REJECTED');
    });
  });

  describe('listing and details', () => {
    it('lists accounts with pagination, search, filters and sorting', async () => {
      const all = await get('?limit=2');
      assert.equal(all.status, 200);
      assert.equal(all.headers['cache-control'], 'no-store');
      assert.equal(all.body.pagination.total, 4);
      assert.equal(all.body.pagination.totalPages, 2);
      assert.deepEqual(
        all.body.data.map((u) => u.employeeNumber),
        ['2172', '3001'],
      );

      const search = await get('?search=sara');
      assert.deepEqual(
        search.body.data.map((u) => u.employeeNumber),
        ['4001'],
      );
      assert.equal((await get('?search=%25_')).body.pagination.total, 0);

      f.user.lockedUntil = new Date(f.store.now().getTime() + 60_000);
      assert.deepEqual(
        (await get('?locked=true')).body.data.map((u) => u.employeeNumber),
        ['4001'],
      );
      assert.equal((await get('?mfaEnrolled=true')).body.pagination.total, 3);
      assert.equal((await get('?status=PENDING')).body.pagination.total, 0);
      const desc = await get('?sortBy=employeeNumber&sortOrder=desc');
      assert.equal(desc.body.data[0].employeeNumber, '4001');
    });

    it('rejects unknown filters and invalid values', async () => {
      assert.equal((await get('?status=LOCKED')).status, 400);
      assert.equal((await get('?sortBy=password_hash')).status, 400);
      assert.equal((await get('?search=a')).status, 400);
      assert.equal((await get('/abc')).status, 400);
    });

    it('returns account, employee, eligibility, roles and sessions without secrets', async () => {
      Object.assign(f.user, {
        mfaTotpSecretEncrypted: 'encrypted-secret',
        mfaEnrolledAt: f.store.now(),
      });
      await signIn(f.store, f.user);
      const res = await get(`/${f.user.userId}`);
      assert.equal(res.status, 200);
      const body = res.body.data;
      assert.equal(body.account.status, 'ACTIVE');
      assert.equal(body.password.set, true);
      assert.equal(body.mfa.enrolled, true);
      assert.equal(body.employee.fullName, 'Sara Khan');
      assert.deepEqual(body.eligibility, { eligible: true, reason: null });
      assert.equal(body.classification.mfaRequired, true);
      assert.equal(body.activeSessions.length, 1);
      assert.deepEqual(body.roles, []);
      const text = JSON.stringify(res.body);
      for (const secret of [
        'argon2-hash-placeholder',
        'encrypted-secret',
        'tokenHash',
        'passwordHash',
      ]) {
        assert.equal(text.includes(secret), false, secret);
      }

      const zaidDetail = await get(`/${f.zaid.userId}`);
      assert.equal(zaidDetail.body.data.classification.protectedSuperAdministrator, true);
      assert.equal(zaidDetail.body.data.roles[0].roleCode, 'SUPER_ADMINISTRATOR');
      assert.equal((await get('/999999')).status, 404);
    });

    it('lists provisioning candidates with eligibility', async () => {
      const res = await get('/candidates?hasAccount=false&limit=100');
      assert.equal(res.status, 200);
      const byNumber = Object.fromEntries(res.body.data.map((c) => [c.employeeNumber, c]));
      assert.equal(byNumber['5001'].provisionable, true);
      assert.equal(byNumber['5005'].provisionable, true);
      assert.equal(byNumber['5002'].ineligibilityReason, 'EMPLOYEE_TERMINATED');
      assert.equal(byNumber['5003'].ineligibilityReason, 'EMPLOYEE_NOT_CURRENT');
      assert.equal(byNumber['5004'].ineligibilityReason, 'EMPLOYEE_TERMINATED');
      assert.equal(byNumber['5006'].ineligibilityReason, 'EMPLOYEE_AMBIGUOUS');
      assert.equal(byNumber['5007'].ineligibilityReason, 'USERNAME_MISSING');
      assert.equal(byNumber['5008'].ineligibilityReason, 'USERNAME_AMBIGUOUS');
      assert.equal(byNumber['4001'], undefined);
    });
  });

  describe('provisioning', () => {
    it('creates a PENDING account without a password and audits it in the transaction', async () => {
      const res = await send('post', '', admin, { employeeNumber: '5001' });
      assert.equal(res.status, 201);
      const body = res.body.data;
      assert.equal(body.account.status, 'PENDING');
      assert.equal(body.password.set, false);
      assert.deepEqual(body.activation, { ready: false, unmetPrerequisites: ['PASSWORD_NOT_SET'] });
      assert.deepEqual(body.roles, []);
      const [row] = audits('ACCOUNT_PROVISIONED');
      assert.equal(row.subjectUserId, body.userId);
      assert.equal(row.createdBy, f.admin.userId);
      assert.equal(JSON.stringify(res.body).includes('password":"'), false);

      const duplicate = await send('post', '', admin, { employeeNumber: '5001' });
      assert.equal(duplicate.status, 409);
      assert.equal(duplicate.body.error.code, 'ACCOUNT_EXISTS');
    });

    it('accepts a future termination date', async () => {
      assert.equal((await send('post', '', admin, { employeeNumber: '5005' })).status, 201);
    });

    it('refuses ineligible employees with the reason', async () => {
      const cases = {
        5002: 'EMPLOYEE_TERMINATED',
        5003: 'EMPLOYEE_NOT_CURRENT',
        5004: 'EMPLOYEE_TERMINATED',
        5006: 'EMPLOYEE_AMBIGUOUS',
        5007: 'USERNAME_MISSING',
        5009: 'USERNAME_AMBIGUOUS',
      };
      for (const [employeeNumber, reason] of Object.entries(cases)) {
        const res = await send('post', '', admin, { employeeNumber });
        assert.equal(res.status, 409, employeeNumber);
        assert.equal(res.body.error.code, 'EMPLOYEE_NOT_ELIGIBLE');
        assert.equal(res.body.error.details[0].message, reason, employeeNumber);
      }
      assert.equal(audits('ACCOUNT_PROVISIONED').length, 0);
      assert.equal((await send('post', '', admin, { employeeNumber: '9999' })).status, 404);
      assert.equal((await send('post', '', admin, { employeeNumber: '' })).status, 400);
      assert.equal(
        (await send('post', '', admin, { employeeNumber: '5001', role: 'X' })).status,
        400,
      );
    });

    it('rolls the account back when the audit row cannot be written', async () => {
      f.store.failures.auditInsert = true;
      const res = await send('post', '', admin, { employeeNumber: '5001' });
      assert.equal(res.status, 500);
      assert.equal(
        f.store.state.users.some((u) => u.employeeNumber === '5001'),
        false,
      );
    });
  });

  describe('activation', () => {
    it('refuses until the password has been set, then activates', async () => {
      const created = await send('post', '', admin, { employeeNumber: '5001' });
      const id = created.body.data.userId;
      const refused = await send('post', `/${id}/activate`);
      assert.equal(refused.status, 409);
      assert.equal(refused.body.error.code, 'ACTIVATION_PREREQUISITES_NOT_MET');
      assert.deepEqual(
        refused.body.error.details.map((d) => d.message),
        ['PASSWORD_NOT_SET'],
      );

      setPassword(f.store.user(id)); // as the (pending) password-setup flow would
      const ok = await send('post', `/${id}/activate`);
      assert.equal(ok.status, 200);
      assert.equal(ok.body.data.account.status, 'ACTIVE');
      assert.equal(ok.body.data.changed, true);
      assert.equal(
        JSON.parse(audits('ACCOUNT_ACTIVATED')[0].eventDetails).previousStatus,
        'PENDING',
      );

      const again = await send('post', `/${id}/activate`);
      assert.equal(again.body.data.changed, false);
      assert.equal(audits('ACCOUNT_ACTIVATED').length, 1);
    });

    it('refuses to activate a terminated employee even with a password', async () => {
      const ended = f.store.addUser('5002', { accountStatus: 'DISABLED', passwordHash: 'x' });
      const res = await send('post', `/${ended.userId}/activate`);
      assert.equal(res.status, 409);
      assert.deepEqual(
        res.body.error.details.map((d) => d.message),
        ['EMPLOYEE_TERMINATED'],
      );
      assert.equal(ended.accountStatus, 'DISABLED');
    });

    it('re-activates a disabled account', async () => {
      f.user.accountStatus = 'DISABLED';
      const res = await send('post', `/${f.user.userId}/activate`);
      assert.equal(res.status, 200);
      assert.equal(f.user.accountStatus, 'ACTIVE');
    });
  });

  describe('disabling and sessions', () => {
    it('disables, revokes every session and outstanding token in one audited transaction', async () => {
      const userSession = await signIn(f.store, f.user, { mfaVerified: false });
      await signIn(f.store, f.user, { mfaVerified: false });
      f.store.state.actionTokens.push(
        { userId: f.user.userId, consumedAt: null, revokedAt: null },
        { userId: f.user.userId, consumedAt: f.store.now(), revokedAt: null },
      );
      const res = await send('post', `/${f.user.userId}/disable`);
      assert.equal(res.status, 200);
      assert.equal(res.body.data.account.status, 'DISABLED');
      assert.equal(res.body.data.sessionsRevoked, 2);
      assert.deepEqual(res.body.data.activeSessions, []);
      assert.equal(f.store.state.actionTokens[0].revokedAt instanceof Date, true);
      assert.equal(f.store.state.actionTokens[1].revokedAt, null);
      const disabled = JSON.parse(audits('ACCOUNT_DISABLED')[0].eventDetails);
      assert.deepEqual(disabled, {
        previousStatus: 'ACTIVE',
        sessionsRevoked: 2,
        tokensRevoked: 1,
      });
      assert.equal(audits('SESSION_REVOKED')[0].reasonCode, 'ACCOUNT_DISABLED');

      const me = await request(f.app).get('/api/v1/auth/me').set('Cookie', userSession.cookie);
      assert.equal(me.status, 401);
      const again = await send('post', `/${f.user.userId}/disable`);
      assert.equal(again.body.data.changed, false);
      assert.equal(audits('ACCOUNT_DISABLED').length, 1);
    });

    it('keeps the account and sessions unchanged when the audit row fails', async () => {
      await signIn(f.store, f.user, { mfaVerified: false });
      f.store.failures.auditInsert = true;
      assert.equal((await send('post', `/${f.user.userId}/disable`)).status, 500);
      assert.equal(f.store.user(f.user.userId).accountStatus, 'ACTIVE');
      assert.equal(
        f.store.state.sessions.some((s) => s.userId === f.user.userId && !s.revokedAt),
        true,
      );
    });

    it('revokes one session or all sessions of a user', async () => {
      const first = await signIn(f.store, f.user, { mfaVerified: false });
      await signIn(f.store, f.user, { mfaVerified: false });
      const sessions = f.store.state.sessions.filter((s) => s.userId === f.user.userId);

      const one = await send('delete', `/${f.user.userId}/sessions/${sessions[0].sessionId}`);
      assert.equal(one.status, 200);
      assert.equal(one.body.data.changed, true);
      const row = audits('SESSION_REVOKED')[0];
      assert.equal(row.reasonCode, 'ADMIN_REVOKED');
      assert.equal(row.targetType, 'USER_SESSION');
      const meFirst = await request(f.app).get('/api/v1/auth/me').set('Cookie', first.cookie);
      assert.equal(meFirst.status, 401);
      assert.equal(sessions[1].revokedAt, null);

      const repeat = await send('delete', `/${f.user.userId}/sessions/${sessions[0].sessionId}`);
      assert.equal(repeat.body.data.changed, false);
      // A session of another user is not found under this user.
      const zaidSession = f.store.state.sessions.find((s) => s.userId === f.zaid.userId);
      assert.equal(
        (await send('delete', `/${f.user.userId}/sessions/${zaidSession.sessionId}`)).status,
        404,
      );

      const all = await send('delete', `/${f.user.userId}/sessions`);
      assert.equal(all.body.data.sessionsRevoked, 1);
      assert.equal(f.user.accountStatus, 'ACTIVE');
    });
  });

  describe('administrator protection', () => {
    it('never changes the Super Administrator account', async () => {
      assertRefused(await send('post', `/${f.zaid.userId}/disable`), 'PROTECTED_ACCOUNT');
      assertRefused(await send('delete', `/${f.zaid.userId}/sessions`), 'PROTECTED_ACCOUNT');
      assertRefused(
        await send('post', `/${f.zaid.userId}/disable`, zaid),
        'SELF_MODIFICATION_FORBIDDEN',
      );
      assert.equal(f.zaid.accountStatus, 'ACTIVE');
    });

    it('reserves administrator accounts for the Super Administrator', async () => {
      assertRefused(await send('post', `/${f.main.userId}/disable`), 'PROTECTED_ACCOUNT');
      assert.equal(f.main.accountStatus, 'ACTIVE');
      const ok = await send('post', `/${f.main.userId}/disable`, zaid);
      assert.equal(ok.status, 200);
      assert.equal(f.main.accountStatus, 'DISABLED');
    });

    it('treats any security-administration permission holder as an administrator', async () => {
      const auditors = f.rbac.addRole('SECURITY_AUDITORS');
      f.rbac.grant(auditors, f.rbac.permission(SEC, 'SECURITY_AUDIT', 'VIEW'));
      f.rbac.assign(f.user, auditors);
      assertRefused(await send('post', `/${f.user.userId}/disable`), 'PROTECTED_ACCOUNT');
    });

    it('refuses changes to the actor’s own account', async () => {
      assertRefused(
        await send('post', `/${f.admin.userId}/disable`),
        'SELF_MODIFICATION_FORBIDDEN',
      );
      assertRefused(
        await send('delete', `/${f.admin.userId}/sessions`),
        'SELF_MODIFICATION_FORBIDDEN',
      );
    });
  });
});
