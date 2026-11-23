// Phase 6: Timesheet, Payroll File, Alerts & Exceptions, Dashboard.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type {
  AlertRow,
  PayrollFileFilters,
  PayrollFileRow,
  TimesheetFilters,
  TimesheetRow,
} from '@attendance/shared';
import { fakeReport, H, scriptedDb, signIn, testApp } from '../test-utils';
import type { AlertsRepository } from './alerts/repository';
import { oracleAlertsRepository } from './alerts/repository';
import { resolveAlertFilters } from './alerts/routes';
import { departmentHeadcount, normalizeEmpNo, periodEndingOn } from './dashboard/repository';
import { oraclePayrollFileRepository, type PayrollFileRepository } from './payrollFile/repository';
import { timesheetRepository } from './timesheet/routes';

const query = (filters: object, page = 1, limit = 30) => ({ page, limit, search: '', filters });

describe('timesheet', () => {
  it('selects CI3 delay and overtime as Oracle text, with escaped filters', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.sql.startsWith('SELECT COUNT') ? [{ TOTAL: 0 }] : [],
    );
    await timesheetRepository(db).list(
      query(
        {
          empNo: '10%',
          shift: 'day shift',
          attDateStart: '2026-01-01',
          attDateEnd: '2026-01-31',
        },
        1,
        50,
      ),
    );
    const list = statements.find((s) => s.sql.includes('OFFSET'))!;
    expect(list.sql).toContain('TO_CHAR((CASE WHEN TRIM(a.LATE) IS NOT NULL');
    expect(list.sql).toContain("UPPER(a.EMP_NO) LIKE :b0 ESCAPE '\\'");
    expect(list.sql).toContain('UPPER(TRIM(a.SHIFT)) = :b1');
    expect(list.sql).toContain('ORDER BY a.ATT_DATE DESC, a.EMP_NO ASC');
    expect(list.binds).toMatchObject({
      b0: '%10\\%%',
      b1: 'DAY SHIFT',
      b2: '2026-01-01',
      b3: '2026-01-31',
    });
  });

  it('exports the 13 CI3 columns with the date as d M Y', async () => {
    const app = testApp({
      repositories: {
        timesheet: fakeReport<TimesheetFilters, TimesheetRow>([
          {
            empNo: '100',
            empName: 'Ali, M',
            shift: 'Day',
            attDate: '2026-01-05',
            checkIn: '07:00',
            punchIn: '07:20',
            checkOut: '16:00',
            punchOut: '17:30',
            totalMinutes: '610',
            early: '0',
            late: '5',
            overtime: '1.5',
            absence: null,
            totDelay: '0',
            overtimeHrs: '1.42',
          },
        ]).repository,
      },
    });
    const cookies = await signIn(app);
    const res = await request(app)
      .post('/api/v1/timesheet/export')
      .set(H)
      .set('Cookie', cookies)
      .send({ filters: {} })
      .expect(200);
    expect(res.headers['content-disposition']).toMatch(/timesheet_data_\d{8}_\d{6}\.csv/);
    expect(res.text).toBe(
      '"Employee Number","Employee Name",Shift,"Attendance Date","Check In","Punch In","Check Out","Punch Out","Total Minutes",Early,Late,Overtime,Absence\n' +
        '100,"Ali, M",Day,"05 Jan 2026",07:00,07:20,16:00,17:30,610,0,5,1.5,\n',
    );
  });
});

describe('payroll file', () => {
  it('joins saved adjustments only when both dates are set (CI3 branches)', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.sql.startsWith('SELECT COUNT') ? [{ TOTAL: 1 }] : [],
    );
    const repo = oraclePayrollFileRepository(db);
    await repo.list(query({ fromDate: '2026-01-21', toDate: '2026-02-20', empNo: '100' }));
    const withAdj = statements.find((s) => s.sql.includes('OFFSET'))!;
    expect(withAdj.sql).toContain('LEFT JOIN XX_DIGI_ATT_PYRL_FILE_ADJ adj');
    expect(withAdj.sql).toContain('a.EMP_NO = :b0');
    expect(withAdj.sql).toContain('GROUP BY a.EMP_NO, a.EMP_NAME');
    expect(withAdj.binds).toMatchObject({
      b0: '100',
      b1: '2026-01-21',
      b2: '2026-02-20',
      b3: '2026-01-21',
      b4: '2026-02-20',
    });

    statements.length = 0;
    await repo.list(query({ fromDate: '2026-01-21' }));
    const noAdj = statements.find((s) => s.sql.includes('OFFSET'))!;
    expect(noAdj.sql).not.toContain('PYRL_FILE_ADJ');
    expect(noAdj.sql).toContain('TO_CHAR(CASE WHEN (b.OVERTIME_HRS * 60 - b.LATE) >= 0 THEN 0');
  });

  it('saves an adjustment with the CI3 MERGE and validates like CI3', async () => {
    const { db, statements } = scriptedDb();
    const app = testApp({ repositories: { payroll: oraclePayrollFileRepository(db) } });
    const cookies = await signIn(app);
    const ok = await request(app)
      .post('/api/v1/payroll-file/adjustment')
      .set(H)
      .set('Cookie', cookies)
      .send({
        empNo: '100',
        empName: 'Ali',
        fromDate: '2026-01-21',
        toDate: '2026-02-20',
        late: '10',
        early: '0',
        totDelay: '10.00',
        overtimeHrs: '2.5',
        absenceWo: '1',
      })
      .expect(200);
    expect(ok.body.message).toBe('Payroll adjustment saved successfully.');
    const merge = statements.find((s) => s.sql.startsWith('MERGE'))!;
    expect(merge.inTransaction).toBe(true);
    expect(merge.binds).toMatchObject({
      empNo: '100',
      late: '10',
      overtimeHrs: '2.5',
      absenceWo: '1',
    });

    const bad = await request(app)
      .post('/api/v1/payroll-file/adjustment')
      .set(H)
      .set('Cookie', cookies)
      .send({
        empNo: '',
        fromDate: '2026-02-20',
        toDate: '2026-01-21',
        late: '.5',
        early: '1.234',
        totDelay: 'x',
        overtimeHrs: '-1',
        absenceWo: '1.5',
      })
      .expect(400);
    expect(bad.body.error.details.issues.map((i: { message: string }) => i.message)).toEqual([
      'Employee Number is required.',
      'Late must be a valid number.',
      'Early must be a valid number.',
      'Total Delay must be a valid number.',
      'Overtime Hours must be a valid number.',
      'Absence WO must be a whole number.',
      'To Date must be on or after From Date.',
    ]);
  });

  it('exports the values exactly as listed (Oracle text such as ".5")', async () => {
    const rows: PayrollFileRow[] = [
      {
        empNo: '100',
        empName: 'Ali',
        late: '.2',
        early: '0',
        totDelay: '.2',
        overtimeHrs: '4.2133333333333333333333333333333333333',
        absenceWo: '2',
      },
    ];
    const payroll: PayrollFileRepository = {
      ...fakeReport<PayrollFileFilters, PayrollFileRow>(rows).repository,
      saveAdjustment: async () => {},
    };
    const app = testApp({ repositories: { payroll } });
    const cookies = await signIn(app);
    const res = await request(app)
      .post('/api/v1/payroll-file/export')
      .set(H)
      .set('Cookie', cookies)
      .send({ filters: {} })
      .expect(200);
    expect(res.text).toBe(
      '"Emp No","Emp Name",Late,Early,"Total Delay","Overtime Hours","Absence WO"\n100,Ali,.2,0,.2,4.2133333333333333333333333333333333333,2\n',
    );
  });
});

describe('alerts & exceptions', () => {
  it('defaults to the 1st of this month to today and swaps reversed dates', () => {
    const now = new Date(2026, 10, 21);
    expect(
      resolveAlertFilters({ fromDate: undefined, toDate: undefined, type: '', severity: '' }, now),
    ).toEqual({
      fromDate: '2026-11-01',
      toDate: '2026-11-21',
      type: '',
      severity: '',
    });
    expect(
      resolveAlertFilters(
        { fromDate: '2026-02-01', toDate: '2026-01-01', type: 'same_punch', severity: '' },
        now,
      ),
    ).toMatchObject({
      fromDate: '2026-01-01',
      toDate: '2026-02-01',
    });
  });

  it('compares overtime in minutes with the minutes threshold (CI3 bug fixed)', async () => {
    const { db, statements } = scriptedDb(() => []);
    await oracleAlertsRepository(db).rows(
      { fromDate: '2026-01-01', toDate: '2026-01-31', type: 'high_overtime', severity: 'medium' },
      15,
      0,
    );
    const sql = statements[0]!.sql;
    expect(sql).toContain('ELSE 0 END) * 60 >= :threshold');
    expect(sql).toContain("'Overtime is ' || TO_CHAR((CASE WHEN");
    expect(sql).toContain('EXCEPTION_TYPE = :type AND UPPER(SEVERITY) = :severity');
    expect(sql).toContain(
      'ORDER BY SEVERITY_SORT, ATT_DATE_VALUE DESC, EMP_NAME, EMP_NO OFFSET :offset ROWS',
    );
    expect(statements[0]!.binds).toMatchObject({
      threshold: 120,
      type: 'high_overtime',
      severity: 'MEDIUM',
      offset: 0,
      limit: 15,
    });
  });

  it('lists with the summary (dates only) and exports a BOM file, even when empty', async () => {
    let summaryFilters: unknown;
    const row: AlertRow = {
      exceptionType: 'same_punch',
      exceptionLabel: 'Same Punch',
      severity: 'Medium',
      empNo: '100',
      empName: 'Ali',
      department: 'IT',
      shift: 'Day',
      attDate: '2026-11-02',
      attDateDisplay: '02 Nov 2026',
      punchIn: '08:00',
      punchOut: '08:00',
      overtime: '0',
      absence: null,
      details: 'Punch-in and punch-out contain the same time.',
    };
    const alerts: AlertsRepository = {
      summary: async (filters) => {
        summaryFilters = filters;
        return {
          total: 1,
          high: 0,
          medium: 1,
          low: 0,
          missingPunch: 0,
          samePunch: 1,
          missingShift: 0,
          missingOccasion: 0,
          highOvertime: 0,
          missingTimetable: 0,
        };
      },
      count: async () => 1,
      rows: async (_f, limit) => (limit === 0 ? [] : [row]),
    };
    const app = testApp({ repositories: { alerts } });
    const cookies = await signIn(app);
    const res = await request(app)
      .post('/api/v1/alerts/list')
      .set(H)
      .set('Cookie', cookies)
      .send({
        filters: { fromDate: '2026-11-01', toDate: '2026-11-21', type: 'bogus', severity: 'HIGH' },
      })
      .expect(200);
    expect(res.body).toMatchObject({
      fromDate: '2026-11-01',
      toDate: '2026-11-21',
      items: [row],
      pagination: { limit: 15, total: 1 },
    });
    expect(summaryFilters).toEqual({
      fromDate: '2026-11-01',
      toDate: '2026-11-21',
      type: '',
      severity: 'high',
    });
    expect(res.body.generatedAt).toMatch(/^\d{2} [A-Z][a-z]{2} \d{4}, \d{2}:\d{2} [AP]M$/);

    const csv = await request(app)
      .post('/api/v1/alerts/export')
      .set(H)
      .set('Cookie', cookies)
      .send({ filters: {} })
      .expect(200);
    expect(csv.headers['content-disposition']).toMatch(/attendance_exceptions_\d{8}_\d{6}\.csv/);
    expect(csv.text).toBe(
      '﻿"Exception Type",Severity,"Employee Number","Employee Name",Department,Shift,"Attendance Date","Punch In","Punch Out",Overtime,Absence,Details\n',
    );
  });
});

describe('dashboard', () => {
  it('period ends on the latest processed date and starts on the 21st of the month before', () => {
    expect(periodEndingOn('2026-11-20')).toMatchObject({
      fromDate: '2026-10-21',
      toDate: '2026-11-20',
      fromLabel: '21 Oct 2026',
      toLabel: '20 Nov 2026',
    });
    // PHP modify('-1 month') overflow: 31 Mar -> 3 Mar, so the period starts 21 Mar.
    expect(periodEndingOn('2026-03-31')).toMatchObject({ fromDate: '2026-03-21' });
    expect(periodEndingOn(null)).toMatchObject({
      fromDate: '',
      toDate: '',
      fromLabel: '-',
      toLabel: '-',
    });
  });

  it('counts current employees per department like CI3 (normalised numbers, largest first)', () => {
    expect(normalizeEmpNo('00123')).toBe('123');
    expect(normalizeEmpNo('ab1')).toBe('AB1');
    expect(
      departmentHeadcount([
        { empNo: '1', department: 'IT' },
        { empNo: '2', department: ' Finance ' },
        { empNo: '3', department: 'Finance' },
        { empNo: '001', department: 'HR' }, // same employee as "1": the later row wins
        { empNo: '4', department: null },
      ]),
    ).toEqual(
      [
        { department: 'HR', employeeCount: 1 },
        { department: 'Finance', employeeCount: 2 },
        { department: 'Unassigned', employeeCount: 1 },
      ].sort((a, b) => b.employeeCount - a.employeeCount),
    );
  });
});
