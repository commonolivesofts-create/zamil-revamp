// API §2 / TRD §5: sign-in, session cookie, lockout, password links, dev quick-login, 401/403.
import { meResponseSchema, prerequisitesResponseSchema } from '@expensehub/shared';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { DEV_PASSWORD } from '../../data/seed/demo-users';
import { SESSION_COOKIE } from '../../auth/session';
import { seededApp, signedIn, testClock } from '../../test-utils';

const H = { 'X-Requested-With': 'ExpenseHub' };

function login(app: Parameters<typeof request>[0], username: string, password = DEV_PASSWORD) {
  return request(app).post('/api/v1/auth/login').set(H).send({ username, password });
}

function sessionCookie(res: request.Response): string {
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const cookie = cookies.find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!cookie) throw new Error('no session cookie');
  return cookie;
}

describe('POST /auth/login', () => {
  it('signs in with person number + password and sets a hardened cookie', async () => {
    const { app } = await seededApp();
    const res = await login(app, '1011').expect(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.user).toMatchObject({
      personNumber: '1011',
      fullName: 'Ahmed Al-Subaie',
      businessUnit: 'IPP',
    });
    expect(me.capabilities).toEqual(['EMPLOYEE']);
    const cookie = sessionCookie(res);
    expect(cookie).toMatch(/HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);
    expect(cookie).not.toMatch(/Secure/i); // only in production
  });

  it('gives the same answer for a wrong password and an unknown user', async () => {
    const { app } = await seededApp();
    const wrong = await login(app, '1011', 'nope-nope-1').expect(401);
    const unknown = await login(app, '9999').expect(401);
    expect(wrong.body.error.message).toBe(unknown.body.error.message);
    expect(wrong.headers['set-cookie']).toBeUndefined();
  });

  it('refuses the inactive employee 1017 (no user) and validates input', async () => {
    const { app } = await seededApp();
    await login(app, '1017').expect(401);
    const bad = await request(app)
      .post('/api/v1/auth/login')
      .set(H)
      .send({ username: '' })
      .expect(400);
    expect(bad.body.error.code).toBe('VALIDATION');
  });

  it('requires the CSRF header like every mutating request', async () => {
    const { app } = await seededApp();
    await request(app)
      .post('/api/v1/auth/login')
      .send({ username: '1011', password: DEV_PASSWORD })
      .expect(403);
  });

  it('locks the account for 15 minutes after 5 failures, even for the right password', async () => {
    const t = testClock();
    const { app } = await seededApp({ clock: t.clock });
    for (let i = 0; i < 4; i += 1) await login(app, '1012', 'wrong-pass-1').expect(401);
    const fifth = await login(app, '1012', 'wrong-pass-1').expect(401);
    expect(fifth.body.error.details).toMatchObject({ locked: true, retryAfterMinutes: 15 });
    const locked = await login(app, '1012').expect(401);
    expect(locked.body.error.details).toMatchObject({ locked: true });

    t.advance(15 * 60_000 + 1000);
    await login(app, '1012').expect(200);
  });

  it('rate-limits sign-in to 10 a minute per IP (TRD §13)', async () => {
    const { app } = await seededApp();
    for (let i = 0; i < 10; i += 1) await login(app, '9999');
    const res = await login(app, '9999').expect(429);
    expect(res.body.error.code).toBe('RATE_LIMITED');
  });
});

describe('session (TRD §5)', () => {
  it('answers /auth/me for a signed-in user and 401 otherwise', async () => {
    const { app } = await seededApp();
    const anon = await request(app).get('/api/v1/auth/me').expect(401);
    expect(anon.body.error.code).toBe('UNAUTHENTICATED');
    const agent = await signedIn(app, '1005');
    const me = meResponseSchema.parse((await agent.get('/api/v1/auth/me').expect(200)).body);
    expect(me.capabilities).toEqual(['EMPLOYEE', 'ACCOUNTANT']);
    expect(me.roles).toEqual(
      expect.arrayContaining([
        { role: 'ACCOUNTANT', businessUnit: 'IPP', isBackup: false },
        { role: 'ACCOUNTANT', businessUnit: 'FPP', isBackup: true },
      ]),
    );
  });

  it('ignores a tampered cookie', async () => {
    const { app } = await seededApp();
    const cookie = sessionCookie(await login(app, '1011'));
    const tampered = cookie.replace(/=([^.]+)\./, '=$1x.');
    await request(app).get('/api/v1/auth/me').set('Cookie', tampered).expect(401);
  });

  it('expires after 30 minutes idle, slides on activity, ends at 8 hours', async () => {
    const t = testClock();
    const { app } = await seededApp({ clock: t.clock });
    const agent = await signedIn(app, '1011');

    // Active every 20 minutes → stays signed in (sliding refresh)…
    for (let i = 0; i < 23; i += 1) {
      t.advance(20 * 60_000);
      await agent.get('/api/v1/auth/me').expect(200);
    }
    // …until the 8-hour absolute limit.
    t.advance(20 * 60_000);
    await agent.get('/api/v1/auth/me').expect(401);

    const idle = await signedIn(app, '1012');
    t.advance(31 * 60_000);
    await idle.get('/api/v1/auth/me').expect(401);
  });

  it('signs out on logout', async () => {
    const { app } = await seededApp();
    const agent = await signedIn(app, '1011');
    await agent.post('/api/v1/auth/logout').set(H).expect(200);
    await agent.get('/api/v1/auth/me').expect(401);
  });

  it('ends the session when the user is deactivated', async () => {
    const { app, data } = await seededApp();
    const agent = await signedIn(app, '1011');
    await data.withTransaction(async (r) => {
      const e = await r.employees.getByPersonNumber('1011');
      await r.employees.upsert({ ...e!, active: 'N' });
    });
    await agent.get('/api/v1/auth/me').expect(401);
  });
});

describe('prerequisites on /auth/me (FR-SET-02, FR-POL-06)', () => {
  it.each([
    ['1011', true, []],
    ['1014', false, ['PAYEE']],
    ['1016', false, ['LINE_MANAGER']],
    ['1001', true, []], // CEO: no supervisor needed (D-37)
  ])('person %s ok=%s failing=%j', async (personNumber, ok, failing) => {
    const { app } = await seededApp();
    const res = await login(app, personNumber).expect(200);
    const me = meResponseSchema.parse(res.body);
    expect(me.prerequisites.ok).toBe(ok);
    expect(me.prerequisites.checks.filter((c) => !c.ok).map((c) => c.code)).toEqual(failing);
  });
});

describe('password set / reset by email link', () => {
  async function linkFromMail(app: Parameters<typeof request>[0]): Promise<string> {
    const mail = await request(app).get('/api/v1/dev/mail').expect(200);
    const url = mail.body.items[0].action.url as string;
    return new URL(url).searchParams.get('token')!;
  }

  it('always answers ok and only mails real users', async () => {
    const { app, data } = await seededApp();
    await request(app)
      .post('/api/v1/auth/password/request')
      .set(H)
      .send({ username: '9999' })
      .expect(200);
    expect(await data.read((r) => r.notifications.listRecent())).toHaveLength(0);
    await request(app)
      .post('/api/v1/auth/password/request')
      .set(H)
      .send({ username: '1011' })
      .expect(200);
    const mail = (await request(app).get('/api/v1/dev/mail').expect(200)).body.items;
    expect(mail).toHaveLength(1);
    expect(mail[0]).toMatchObject({
      templateCode: 'PASSWORD_LINK',
      to: { name: 'Ahmed Al-Subaie', email: 'ahmed.alsubaie@zpi-demo.test' },
      subject: 'Reset your ExpenseHub password',
    });
    expect(mail[0].action.url).toMatch(/^http:\/\/localhost:7386\/reset\?token=/);
  });

  it('stores only a hash of the token', async () => {
    const { app, data } = await seededApp();
    await request(app).post('/api/v1/auth/password/request').set(H).send({ username: '1011' });
    const token = await linkFromMail(app);
    const user = await data.read(async (r) =>
      r.users.getByPersonId((await r.employees.getByPersonNumber('1011'))!.personId),
    );
    expect(user?.resetTokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(user)).not.toContain(token);
  });

  it('resets the password once, unlocks, and signs out other sessions', async () => {
    const { app } = await seededApp();
    const other = await signedIn(app, '1011');
    await request(app).post('/api/v1/auth/password/request').set(H).send({ username: '1011' });
    const token = await linkFromMail(app);

    await request(app)
      .post('/api/v1/auth/password/reset')
      .set(H)
      .send({ token, password: 'short' })
      .expect(400);
    await request(app)
      .post('/api/v1/auth/password/reset')
      .set(H)
      .send({ token, password: 'BrandNewPass99' })
      .expect(200);

    await other.get('/api/v1/auth/me').expect(401);
    await login(app, '1011').expect(401);
    await login(app, '1011', 'BrandNewPass99').expect(200);
    const again = await request(app)
      .post('/api/v1/auth/password/reset')
      .set(H)
      .send({ token, password: 'AnotherPass99' })
      .expect(400);
    expect(again.body.error.message).toMatch(/invalid or has expired/);
  });

  it('rejects a link after 24 hours', async () => {
    const t = testClock();
    const { app } = await seededApp({ clock: t.clock });
    await request(app).post('/api/v1/auth/password/request').set(H).send({ username: '1011' });
    const token = await linkFromMail(app);
    t.advance(24 * 3_600_000 + 1000);
    await request(app)
      .post('/api/v1/auth/password/reset')
      .set(H)
      .send({ token, password: 'BrandNewPass99' })
      .expect(400);
  });
});

describe('dev quick-login (D-33)', () => {
  it('lists the 16 demo users with the dev password and signs in without one', async () => {
    const { app } = await seededApp();
    const users = await request(app).get('/api/v1/auth/dev-users').expect(200);
    expect(users.body.users).toHaveLength(16);
    expect(users.body.password).toBe(DEV_PASSWORD);
    const res = await request(app)
      .post('/api/v1/auth/dev-login')
      .set(H)
      .send({ personNumber: '1009' })
      .expect(200);
    expect(res.body.capabilities).toContain('SYS_ADMIN');
    expect(res.body.dev.quickLogin).toBe(true);
  });

  it('does not exist when disabled', async () => {
    const { app } = await seededApp({ env: { DEV_QUICK_LOGIN: 'false' } });
    await request(app).get('/api/v1/auth/dev-users').expect(404);
    await request(app)
      .post('/api/v1/auth/dev-login')
      .set(H)
      .send({ personNumber: '1009' })
      .expect(404);
    await request(app).get('/api/v1/dev/mail').expect(404);
    expect((await login(app, '1011').expect(200)).body.dev.quickLogin).toBe(false);
  });
});

describe('role guards — GET /setup/prerequisites (FR-SET-02)', () => {
  it('401 when signed out, 403 for an employee', async () => {
    const { app } = await seededApp();
    await request(app).get('/api/v1/setup/prerequisites').expect(401);
    const employee = await signedIn(app, '1011');
    const res = await employee.get('/api/v1/setup/prerequisites').expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('shows the admin every BU and failing employees only on request', async () => {
    const { app } = await seededApp();
    const admin = await signedIn(app, '1009');
    const all = prerequisitesResponseSchema.parse(
      (await admin.get('/api/v1/setup/prerequisites').expect(200)).body,
    );
    expect(all.items).toHaveLength(16);
    const failing = prerequisitesResponseSchema.parse(
      (await admin.get('/api/v1/setup/prerequisites?failingOnly=true').expect(200)).body,
    );
    expect(failing.items.map((i) => i.personNumber)).toEqual(['1014', '1016']);
  });

  it('limits a Finance user to their business units', async () => {
    const { app } = await seededApp();
    // 1006 is Accountant for FPP and backup for IPP/APP → all three.
    const acct = await signedIn(app, '1006');
    const res = await acct.get('/api/v1/setup/prerequisites?bu=FPP').expect(200);
    expect(res.body.items.every((i: { businessUnit: string }) => i.businessUnit === 'FPP')).toBe(
      true,
    );
    const bad = await acct.get('/api/v1/setup/prerequisites?bu=XYZ').expect(400);
    expect(bad.body.error.code).toBe('VALIDATION');
  });
});
