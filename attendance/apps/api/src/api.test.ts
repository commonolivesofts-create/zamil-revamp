import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { AbsenceRow, EmployeeRow } from '@attendance/shared';
import { dMY, dMYTime, oracleDate, toCsv } from './lib/csv';
import { fakeDb, fakeIdentities, fakeReport, H, identity, signIn, testApp } from './test-utils';

const employee = (n: number): EmployeeRow => ({
  userId: n,
  employeeNumber: String(1000 + n),
  fullName: `Employee ${n}`,
  email: `e${n}@example.com`,
  jobTitle: 'Operator',
  department: 'Production',
  joiningDate: '2020-01-15',
});

describe('health and transport', () => {
  it('reports database state without authentication', async () => {
    const res = await request(testApp()).get('/api/v1/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', adw: 'up', ebs: 'disabled' });
  });

  it('returns 503 when ADW is down', async () => {
    await request(testApp({ db: fakeDb(false) }))
      .get('/api/v1/health')
      .expect(503);
  });

  it('rejects writes without the CSRF header', async () => {
    const res = await request(testApp()).post('/api/v1/employees/list').send({}).expect(403);
    expect(res.body.error.code).toBe('FORBIDDEN');
  });

  it('answers unknown routes with the error envelope', async () => {
    const res = await request(testApp()).get('/api/v1/nope').expect(404);
    expect(res.body).toEqual({
      error: { code: 'NOT_FOUND', message: 'No route for GET /api/v1/nope' },
    });
  });
});

describe('single sign-on', () => {
  it('requires a session for reports', async () => {
    const res = await request(testApp()).post('/api/v1/employees/list').set(H).send({}).expect(401);
    expect(res.body.error.code).toBe('UNAUTHENTICATED');
  });

  it('exchanges the Zamil session for an attendance session', async () => {
    const app = testApp();
    const res = await request(app)
      .post('/api/v1/auth/sso')
      .set(H)
      .set('Cookie', 'zr_session=1001')
      .expect(200);
    expect(res.body).toEqual({
      userId: 501,
      userName: 'test.user',
      employeeNumber: '1001',
      fullName: 'Test Employee',
      email: 'test@example.com',
      jobTitle: 'Analyst',
      department: 'IT',
    });
    const cookie = (res.headers['set-cookie'] as unknown as string[]).join(';');
    expect(cookie).toMatch(/at_session=.+HttpOnly/i);
    expect(cookie).toMatch(/SameSite=Strict/i);

    const me = await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', await signIn(app))
      .expect(200);
    expect(me.body.fullName).toBe('Test Employee');
  });

  it('refuses Zamil users without an attendance employee record', async () => {
    const res = await request(testApp())
      .post('/api/v1/auth/sso')
      .set(H)
      .set('Cookie', 'zr_session=7777')
      .expect(403);
    expect(res.body.error.message).toContain('7777');
  });

  it('refuses sign-in without a Zamil session', async () => {
    await request(testApp()).post('/api/v1/auth/sso').set(H).expect(403);
  });

  it('ends the attendance session when the Zamil session ends or changes user', async () => {
    const app = testApp({
      identities: fakeIdentities(identity(), identity({ employeeNumber: '2002', userId: 7 })),
    });
    const [, session] = await signIn(app);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', ['zr_session=expired', session!])
      .expect(401);
    await request(app)
      .get('/api/v1/auth/me')
      .set('Cookie', ['zr_session=2002', session!])
      .expect(401);
  });

  it('signs out of both apps', async () => {
    let revoked = 0;
    const app = testApp({
      revokeZamil: async () => {
        revoked += 1;
      },
    });
    const res = await request(app)
      .post('/api/v1/auth/logout')
      .set(H)
      .set('Cookie', await signIn(app))
      .expect(204);
    expect(revoked).toBe(1);
    expect((res.headers['set-cookie'] as unknown as string[]).join(';')).toMatch(/at_session=;/);
  });
});

describe('employee details report', () => {
  it('lists with defaults and passes validated filters to the repository', async () => {
    const report = fakeReport(Array.from({ length: 23 }, (_, i) => employee(i + 1)));
    const app = testApp({ repositories: { employees: report.repository } });
    const res = await request(app)
      .post('/api/v1/employees/list')
      .set(H)
      .set('Cookie', await signIn(app))
      .send({ page: 3, filters: { department: ' Production ', fullName: '' } })
      .expect(200);
    expect(res.body.pagination).toEqual({ page: 3, limit: 10, total: 23, totalPages: 3 });
    expect(res.body.items).toHaveLength(3);
    expect(report.calls.list[0]).toEqual({
      page: 3,
      limit: 10,
      search: '',
      filters: { department: 'Production' },
    });
  });

  it('validates the request', async () => {
    const app = testApp();
    const res = await request(app)
      .post('/api/v1/employees/list')
      .set(H)
      .set('Cookie', await signIn(app))
      .send({ limit: 500, filters: { joiningDate: '15/01/2020' } })
      .expect(400);
    expect(res.body.error.code).toBe('VALIDATION');
    expect(res.body.error.details.issues.map((i: { path: string }) => i.path)).toEqual([
      'limit',
      'filters.joiningDate',
    ]);
  });

  it('exports like CI3: raw column names, Oracle date format, no BOM, CI3 file name', async () => {
    const report = fakeReport([employee(1)]);
    const app = testApp({ repositories: { employees: report.repository } });
    const res = await request(app)
      .post('/api/v1/employees/export')
      .set(H)
      .set('Cookie', await signIn(app))
      .send({ search: 'emp' })
      .expect(200);
    expect(res.headers['content-type']).toMatch(/^text\/csv/);
    expect(res.headers['content-disposition']).toMatch(
      /attachment; filename="?employee_data_\d{8}_\d{6}\.csv"?/,
    );
    expect(res.text).toBe(
      'USER_ID,EMPLOYEE_NUMBER,FULL_NAME,EMAIL_ADDRESS,JOB_TITLE,DEPARTMENT,JOINING_DATE\n' +
        '1,1001,"Employee 1",e1@example.com,Operator,Production,15-JAN-20\n',
    );
    expect(report.calls.export[0]).toEqual({ search: 'emp', filters: {} });
  });

  it('answers an empty export with the CI3 message', async () => {
    const app = testApp({
      repositories: { employees: fakeReport<never, EmployeeRow>([]).repository },
    });
    const res = await request(app)
      .post('/api/v1/employees/export')
      .set(H)
      .set('Cookie', await signIn(app))
      .send({})
      .expect(404);
    expect(res.body.error.message).toBe('No employee data found to export.');
  });
});

describe('absence report', () => {
  it('lists with date-range filters', async () => {
    const row: AbsenceRow = {
      empNo: '1001',
      departmentName: 'IT',
      empName: 'Test',
      position: 'Analyst',
      leaveStartDate: '21-10-26',
      leaveEndDate: '25-10-26',
      totalDays: 5,
      leaveType: 'Annual Leave',
      approvalStatus: 'APPROVED',
    };
    const report = fakeReport([row]);
    const app = testApp({ repositories: { absences: report.repository } });
    const res = await request(app)
      .post('/api/v1/absences/list')
      .set(H)
      .set('Cookie', await signIn(app))
      .send({
        filters: { leaveFrom: '2026-10-21', leaveTo: '2026-11-20', approvalStatus: 'APPROVED' },
      })
      .expect(200);
    expect(res.body.items).toEqual([row]);
    expect(report.calls.list[0]).toMatchObject({
      filters: { leaveFrom: '2026-10-21', leaveTo: '2026-11-20', approvalStatus: 'APPROVED' },
    });
  });
});

describe('csv', () => {
  it('quotes like PHP fputcsv (comma, quote, whitespace) with \\n line endings', () => {
    const csv = toCsv(
      [{ label: 'A', value: (r: { a: string | null }) => r.a }],
      [{ a: 'x,"y"' }, { a: 'two words' }, { a: 'plain' }, { a: null }],
    );
    expect(csv).toBe('A\n"x,""y"""\n"two words"\nplain\n\n');
  });

  it('formats values the CI3 way', () => {
    expect(dMY('2026-01-05')).toBe('05 Jan 2026');
    expect(dMYTime('2026-01-05 14:30:00')).toBe('05 Jan 2026, 02:30 PM');
    expect(dMYTime('2026-01-05 00:05:00')).toBe('05 Jan 2026, 12:05 AM');
    expect(oracleDate('2020-01-15')).toBe('15-JAN-20');
  });
});
