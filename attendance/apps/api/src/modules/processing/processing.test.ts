// Attendance processing: request validation, CI3 summary, insert vs update, failures.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { SheetRow } from '../../domain/processing/day';
import { H, signIn, testApp } from '../../test-utils';
import type { ProcessingRepository } from './repository';
import { leaveDateExpression } from './repository';

function fakeRepo(patch: Partial<ProcessingRepository> = {}) {
  const saved: SheetRow[][] = [];
  const repo: ProcessingRepository = {
    departments: async () => ['Finance', 'IT'],
    employeesByDepartment: async () => [{ employeeNumber: '100', fullName: 'Ali' }],
    targetEmployees: async () => [
      { employeeNumber: '100', fullName: 'Ali' },
      { employeeNumber: '200', fullName: 'Sara' },
    ],
    profileName: async () => '',
    occasions: async () => [],
    employeeData: async (empNo) => ({
      timetables: [],
      shiftDays: [],
      cards:
        empNo === '100'
          ? [{ day: '2001-01-07', empName: null, punchIn: '07:00', punchOut: '16:00' }]
          : [],
      leaves: [],
    }),
    existingDays: async (empNo) => new Set(empNo === '100' ? ['2001-01-07'] : []),
    saveRows: async (rows) => {
      saved.push(rows);
    },
    ...patch,
  };
  return { repo, saved };
}

const run = async (repo: ProcessingRepository, body: object, status: number) => {
  const app = testApp({ repositories: { processing: repo } });
  const cookies = await signIn(app);
  return request(app)
    .post('/api/v1/processing/run')
    .set(H)
    .set('Cookie', cookies)
    .send(body)
    .expect(status);
};

const valid = {
  department: 'Finance',
  employeeNumber: 'ALL',
  fromDate: '2001-01-07',
  toDate: '2001-01-08',
};

describe('POST /processing/run', () => {
  it('processes every day of every employee and returns the CI3 summary', async () => {
    const { repo, saved } = fakeRepo();
    const res = await run(repo, valid, 200);
    expect(res.body.message).toBe('Attendance process completed.');
    expect(res.body.summary).toMatchObject({
      department: 'Finance',
      employeeNumber: 'ALL',
      dateFrom: '2001-01-07',
      dateTo: '2001-01-08',
      totalEmployees: 2,
      processedRows: 4,
      insertedRows: 3,
      updatedRows: 1,
      presentRows: 1,
      absenceWithoutPermissionRows: 3,
      errorRows: 0,
    });
    expect(saved.flat().map((r) => `${r.EMP_NO} ${r.ATT_DATE} ${r.ABSENCE ?? 'present'}`)).toEqual([
      '100 2001-01-07 present',
      '100 2001-01-08 Absence without permission',
      '200 2001-01-07 Absence without permission',
      '200 2001-01-08 Absence without permission',
    ]);
  });

  it('ALL departments always processes ALL employees', async () => {
    let asked = '';
    const { repo } = fakeRepo({
      targetEmployees: async (department, employee) => {
        asked = `${department}/${employee}`;
        return [];
      },
    });
    const res = await run(repo, { ...valid, department: 'ALL', employeeNumber: '100' }, 404);
    expect(asked).toBe('ALL/ALL');
    expect(res.body.error.message).toBe('Attendance process failed.');
    expect(res.body.error.details).toEqual({ error: 'No employees found for processing.' });
  });

  it('validates with the CI3 messages', async () => {
    const { repo } = fakeRepo();
    const res = await run(
      repo,
      { department: 'IT', employeeNumber: '', fromDate: '2001-02-01', toDate: '2001-01-01' },
      400,
    );
    const messages = res.body.error.details.issues.map((i: { message: string }) => i.message);
    expect(messages).toEqual([
      'Please select employee.',
      'From date must be less than or equal to to date.',
    ]);
    const empty = await run(repo, {}, 400);
    expect(empty.body.error.details.issues.map((i: { message: string }) => i.message)).toEqual([
      'Please select department.',
      'Please select from date.',
      'Please select to date.',
    ]);
  });

  it("a failed save turns that employee's days into row errors; others still save", async () => {
    const { repo, saved } = fakeRepo({
      saveRows: async (rows) => {
        if (rows[0]?.EMP_NO === '200') throw new Error('ORA-00001');
        saved.push(rows);
      },
    });
    const res = await run(repo, valid, 200);
    expect(res.body.summary).toMatchObject({ insertedRows: 1, updatedRows: 1, errorRows: 2 });
    expect(res.body.summary.rowErrors).toEqual([
      {
        employeeNumber: '200',
        employeeName: 'Sara',
        attendanceDate: '2001-01-07',
        error: 'Save failed.',
      },
      {
        employeeNumber: '200',
        employeeName: 'Sara',
        attendanceDate: '2001-01-08',
        error: 'Save failed.',
      },
    ]);
    expect(saved).toHaveLength(1);
  });

  it('a failed lookup writes nothing for that employee and reports each day', async () => {
    const { repo } = fakeRepo({
      employeeData: async () => {
        throw new Error('ORA-01847: day of month must be between 1 and last day of month');
      },
    });
    const res = await run(repo, valid, 200);
    expect(res.body.summary).toMatchObject({
      processedRows: 4,
      errorRows: 4,
      insertedRows: 0,
      presentRows: 0,
    });
  });

  it('requires sign-in and the app header', async () => {
    const { repo } = fakeRepo();
    const app = testApp({ repositories: { processing: repo } });
    await request(app).post('/api/v1/processing/run').set(H).send(valid).expect(401);
  });
});

describe('GET /processing/departments and /processing/employees', () => {
  it('lists departments and the employees of one department', async () => {
    const { repo } = fakeRepo();
    const app = testApp({ repositories: { processing: repo } });
    const cookies = await signIn(app);
    const d = await request(app)
      .get('/api/v1/processing/departments')
      .set(H)
      .set('Cookie', cookies)
      .expect(200);
    expect(d.body.departments).toEqual(['Finance', 'IT']);
    const e = await request(app)
      .get('/api/v1/processing/employees?department=IT')
      .set(H)
      .set('Cookie', cookies)
      .expect(200);
    expect(e.body.employees).toEqual([{ employeeNumber: '100', fullName: 'Ali' }]);
    const all = await request(app)
      .get('/api/v1/processing/employees?department=ALL')
      .set(H)
      .set('Cookie', cookies)
      .expect(200);
    expect(all.body.employees).toEqual([]);
    const none = await request(app)
      .get('/api/v1/processing/employees')
      .set(H)
      .set('Cookie', cookies)
      .expect(400);
    expect(none.body.error.message).toBe('Department is required.');
  });
});

describe('leave date expression', () => {
  it('never raises on impossible dates (CI3 bug fixed)', () => {
    const sql = leaveDateExpression('LEAVE_START_DATE');
    expect(sql.match(/DEFAULT NULL ON CONVERSION ERROR/g)).toHaveLength(10);
    expect(sql).toContain("'DD-MON-RR', 'NLS_DATE_LANGUAGE=ENGLISH'");
  });
});
