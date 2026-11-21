// Phases 7-8: EBS connection setup, Daily Attendance, Leave Requests, Manager View, Contractors.
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { ebsDescriptor, loadConfig } from '../config';
import { EBS_ADW_MIRROR, EBS_DIRECT } from '../db/ebsSource';
import { isUnreachable } from '../db/oracle';
import { AppError } from '../lib/errors';
import { H, scriptedDb, signIn, testApp } from '../test-utils';
import {
  oracleContractorRepository,
  oracleContractorSummaryRepository,
} from './contractors/repository';
import {
  dailyAttendanceRepository,
  dailyAttendanceSql,
  type DailyAttendanceRepository,
} from './dailyAttendance/repository';
import type { LeaveRequestRepository } from './leaveRequests/routes';
import type { ManagerRepository } from './manager/repository';
import { buildManagerView } from './manager/routes';

const baseEnv = {
  SESSION_SECRET: 'x'.repeat(40),
  ADW_USER: 'u',
  ADW_PASSWORD: 'p',
  ADW_WALLET_DIR: 'w',
};

describe('EBS connection (same setup as CI3)', () => {
  it('builds the CI3 descriptor from the zamil-attendance keys', () => {
    const config = loadConfig(
      {
        ...baseEnv,
        EBS_DB_HOST: 'ebs.local',
        EBS_DB_SID: 'ZPIL',
        EBS_DB_USERNAME: 'APPS',
        EBS_DB_PASSWORD: 's',
      },
      '/root',
    );
    expect(config.ebs?.connectString).toBe(
      '(DESCRIPTION=(CONNECT_TIMEOUT=10)(ADDRESS=(PROTOCOL=TCP)(HOST=ebs.local)(PORT=1521))(CONNECT_DATA=(SID=ZPIL)))',
    );
    expect(config.ebs).toMatchObject({ user: 'APPS', connectTimeout: 10 });
    expect(config.ebs?.unreachableMessage).toContain('Connect to the Zamil VPN');
    expect(config.ebsSource).toBe('ebs');
    expect(ebsDescriptor('h', 1522, 'S', 5)).toContain('(CONNECT_TIMEOUT=5)');
  });

  it('is off without a host, and needs the account when a host is set', () => {
    expect(loadConfig(baseEnv, '/root').ebs).toBeNull();
    expect(() => loadConfig({ ...baseEnv, EBS_DB_HOST: 'h' }, '/root')).toThrow(/EBS_DB_USERNAME/);
  });

  it('tells network failures (VPN off) apart from SQL errors', () => {
    expect(
      isUnreachable({ code: 'NJS-503', message: 'connection to host could not be established' }),
    ).toBe(true);
    expect(isUnreachable(new Error('ORA-12170: TNS:Connect timeout occurred'))).toBe(true);
    expect(isUnreachable(new Error('ORA-00942: table or view does not exist'))).toBe(false);
  });

  it('EBS_SOURCE=adw reads the ADW copies instead (EBS-CONNECTIVITY.md, Option B)', () => {
    const direct = dailyAttendanceSql(EBS_DIRECT, {
      fromDate: '2026-11-01',
      toDate: '2026-11-01',
      search: '',
    });
    const mirror = dailyAttendanceSql(EBS_ADW_MIRROR, {
      fromDate: '2026-11-01',
      toDate: '2026-11-01',
      search: '',
    });
    expect(direct.sql).toContain('ZPI.ICLOCK_TRANSACTION');
    expect(mirror.sql).toContain('XX_EBS_ICLOCK_TRANSACTION');
    expect(mirror.sql).not.toContain('ZPI.');
    expect(EBS_ADW_MIRROR.pool).toBe('adw');
  });
});

describe('daily attendance', () => {
  it('pages with ROWNUM on EBS and escapes the search', async () => {
    const { db, statements } = scriptedDb(() => []);
    await dailyAttendanceRepository(db, EBS_DIRECT).page(
      { fromDate: '2026-11-01', toDate: '2026-11-02', search: '50%' },
      2,
      15,
    );
    expect(statements[0]!.sql).toContain('ROWNUM <= :rnTo');
    expect(statements[0]!.binds).toMatchObject({
      rnTo: 30,
      rnFrom: 15,
      searchLike: '%50\\%%',
      searchExact: '50%',
    });
  });

  const fake: DailyAttendanceRepository = {
    total: async () => 2,
    page: async () => [
      {
        empNo: '100',
        empName: 'Ali',
        attDateDisplay: '21-NOV-2026',
        punchIn: '07:00:00',
        punchOut: '16:00:00',
        workTime: '9',
      },
    ],
    all: async () => [],
    summary: async () => ({ checkedIn: 2, missingPunch: 1, scheduled: 5 }),
  };

  it('returns the CI3 summary and refuses a reversed range', async () => {
    const app = testApp({ repositories: { daily: fake } });
    const cookies = await signIn(app);
    const res = await request(app)
      .post('/api/v1/daily-attendance/list')
      .set(H)
      .set('Cookie', cookies)
      .send({ filters: { fromDate: '2026-11-21', toDate: '2026-11-21' } })
      .expect(200);
    expect(res.body.summary).toMatchObject({
      scheduledEmployees: 5,
      checkedIn: 2,
      onTime: 2,
      notCheckedIn: 3,
      missingPunch: 1,
      late: 0,
    });
    const bad = await request(app)
      .post('/api/v1/daily-attendance/list')
      .set(H)
      .set('Cookie', cookies)
      .send({ filters: { fromDate: '2026-11-22', toDate: '2026-11-21' } })
      .expect(400);
    expect(bad.body.error.message).toBe('From date must be less than or equal to To date.');
  });

  it('exports daily_attendance_FROM_to_TO.csv with a BOM, even when empty', async () => {
    const app = testApp({ repositories: { daily: fake } });
    const cookies = await signIn(app);
    const res = await request(app)
      .post('/api/v1/daily-attendance/export')
      .set(H)
      .set('Cookie', cookies)
      .send({ filters: { fromDate: '2026-11-01', toDate: '2026-11-21' } })
      .expect(200);
    expect(res.headers['content-disposition']).toContain(
      'daily_attendance_20261101_to_20261121.csv',
    );
    expect(res.text).toBe('﻿"Employee ID","First Name",Date,"First Punch","Last Punch"\n');
  });

  it('says to connect the VPN when EBS cannot be reached', async () => {
    const down: DailyAttendanceRepository = {
      ...fake,
      summary: async () => {
        throw new AppError(
          'UNAVAILABLE',
          'The E-Business Suite database cannot be reached. Connect to the Zamil VPN (or office network) and try again.',
        );
      },
    };
    const app = testApp({ repositories: { daily: down } });
    const cookies = await signIn(app);
    const res = await request(app)
      .post('/api/v1/daily-attendance/list')
      .set(H)
      .set('Cookie', cookies)
      .send({})
      .expect(503);
    expect(res.body.error.message).toContain('Connect to the Zamil VPN');
  });
});

describe('leave requests', () => {
  const leave: LeaveRequestRepository = {
    summary: async () => ({ approved: 1, pending: 2, denied: 0, total: 3 }),
    total: async () => 3,
    page: async () => [],
    latestProcessedDate: async () => '2026-11-20',
  };

  it('opens on the period of the latest processed date and validates like CI3', async () => {
    const app = testApp({ repositories: { leave } });
    const cookies = await signIn(app);
    const d = await request(app)
      .get('/api/v1/leave-requests/defaults')
      .set(H)
      .set('Cookie', cookies)
      .expect(200);
    expect(d.body).toEqual({ fromDate: '2026-10-21', toDate: '2026-11-20' });
    const ok = await request(app)
      .post('/api/v1/leave-requests/list')
      .set(H)
      .set('Cookie', cookies)
      .send({ filters: { fromDate: '2026-10-21', toDate: '2026-11-20' } })
      .expect(200);
    expect(ok.body.period).toEqual({
      fromDate: '2026-10-21',
      toDate: '2026-11-20',
      fromLabel: '21 Oct 2026',
      toLabel: '20 Nov 2026',
    });
    expect(ok.body.summary).toEqual({ approved: 1, pending: 2, denied: 0, total: 3 });
    const bad = await request(app)
      .post('/api/v1/leave-requests/list')
      .set(H)
      .set('Cookie', cookies)
      .send({ filters: { fromDate: '2026-11-20', toDate: '2026-10-21' } })
      .expect(400);
    expect(bad.body.error.message).toBe('From Date cannot be greater than To Date.');
  });
});

describe('manager view', () => {
  const repo = (patch: Partial<ManagerRepository> = {}): ManagerRepository => ({
    team: async () => [
      { empNo: '100', fullName: 'Ali Khan', jobTitle: 'Operator' },
      { empNo: '200', fullName: 'Sara Ahmed', jobTitle: 'Operator' },
    ],
    todayPunches: async () => new Map([['100', { punchIn: '07:01:00', punchOut: '07:01:00' }]]),
    periodPunches: async () => [
      { empNo: '200', late: 5, dutyDuration: 32400, totalWorked: 37800 },
      { empNo: '200', late: 0, dutyDuration: 32400, totalWorked: 32400 },
    ],
    approvedLeaveDays: async () => new Map([['100', 2]]),
    pendingRequests: async () => [
      {
        empNo: '200',
        fullName: 'Sara Ahmed',
        leaveType: 'Annual',
        leaveStartDate: '01-12-26',
        leaveEndDate: '03-12-26',
        totalDays: '3',
        approvalStatus: 'AWAITING',
      },
    ],
    decide: async () => 1,
    ...patch,
  });

  it('builds the CI3 figures', async () => {
    const view = await buildManagerView(repo(), 501, new Date(2026, 10, 21));
    expect(view.period).toEqual({
      fromLabel: '21 Oct 2026',
      toLabel: '20 Nov 2026',
      todayLabel: '21 Nov 2026',
    });
    expect(view.summary).toEqual({
      teamSize: 2,
      presentToday: 1,
      lateToday: 0,
      absentToday: 1,
      onLeaveToday: 0,
      pendingApprovals: 1,
    });
    expect(view.employees[0]).toMatchObject({
      empNo: '100',
      periodAbsenceDays: 2,
      todayStatus: { key: 'present' },
    });
    expect(view.employees[1]).toMatchObject({
      empNo: '200',
      periodLateDays: 1,
      periodOvertimeHours: '1.5',
      pendingCount: 1,
    });
  });

  it('still shows the team and approvals when EBS is unreachable', async () => {
    const down = () => {
      throw new AppError('UNAVAILABLE', 'EBS down.');
    };
    const view = await buildManagerView(repo({ todayPunches: down, periodPunches: down }), 501);
    expect(view).toMatchObject({ ebsAvailable: false, ebsMessage: 'EBS down.' });
    expect(view.employees).toHaveLength(2);
    expect(view.approvals).toHaveLength(1);
  });

  it("decides only requests of the manager's own team", async () => {
    const app = testApp({ repositories: { manager: repo() } });
    const cookies = await signIn(app);
    const ok = await request(app)
      .post('/api/v1/manager/decision')
      .set(H)
      .set('Cookie', cookies)
      .send({
        empNo: '200',
        leaveStartDate: '01-12-26',
        leaveEndDate: '03-12-26',
        decision: 'APPROVE',
      })
      .expect(200);
    expect(ok.body.message).toBe('Request approved.');
    const other = await request(app)
      .post('/api/v1/manager/decision')
      .set(H)
      .set('Cookie', cookies)
      .send({
        empNo: '999',
        leaveStartDate: '01-12-26',
        leaveEndDate: '03-12-26',
        decision: 'DENY',
      })
      .expect(404);
    expect(other.body.error.message).toBe('Request not found or already actioned.');
  });
});

describe('contractors', () => {
  it('validates with the CI3 messages and refuses a duplicate number on the field', async () => {
    const { db } = scriptedDb((s) => (s.sql.includes('COUNT(1) AS TOTAL') ? [{ TOTAL: 1 }] : []));
    const app = testApp({
      repositories: { contractors: oracleContractorRepository(db, EBS_DIRECT) },
    });
    const cookies = await signIn(app);
    const bad = await request(app)
      .post('/api/v1/contractors')
      .set(H)
      .set('Cookie', cookies)
      .send({
        conNumber: '',
        conName: '',
        status: 'Maybe',
        rate: 'abc',
        startDate: '2026-02-01',
        endDate: '2026-01-01',
      })
      .expect(400);
    expect(bad.body.error.details.issues.map((i: { message: string }) => i.message)).toEqual([
      'The Contractor Number field is required.',
      'The Contractor Name field is required.',
      'The Status field must be one of: ACTIVE, INACTIVE.',
      'The Rate field must contain only numbers.',
      'End Date must be on or after Start Date.',
    ]);
    const dup = await request(app)
      .post('/api/v1/contractors')
      .set(H)
      .set('Cookie', cookies)
      .send({ conNumber: 'C1', conName: 'Acme', status: 'Active', rate: '12.5' })
      .expect(400);
    expect(dup.body.error.details.issues).toEqual([
      {
        path: ['conNumber'],
        message: 'The Contractor Number already exists. Please use a unique value.',
      },
    ]);
  });

  it('inserts with the next id in one transaction and the signed-in user as creator', async () => {
    const { db, statements, outcomes } = scriptedDb((s) =>
      s.sql.includes('COUNT(1) AS TOTAL')
        ? [{ TOTAL: 0 }]
        : s.sql.includes('MAX(CON_ID)')
          ? [{ ID: 7 }]
          : [],
    );
    const app = testApp({
      repositories: { contractors: oracleContractorRepository(db, EBS_DIRECT) },
    });
    const cookies = await signIn(app);
    await request(app)
      .post('/api/v1/contractors')
      .set(H)
      .set('Cookie', cookies)
      .send({
        conNumber: 'C1',
        conName: 'Acme',
        status: 'Active',
        rate: '12.5',
        startDate: '01/02/2026',
      })
      .expect(201);
    const insert = statements.find((s) => s.sql.startsWith('INSERT'))!;
    expect(insert.sql).toContain('INSERT INTO XXZP.XX_CONTRACTOR_INFO');
    expect(insert.binds).toMatchObject({
      id: 7,
      conNumber: 'C1',
      rate: 12.5,
      status: 'Active',
      startDate: '2026-02-01',
      userId: '501',
    });
    expect(outcomes).toEqual(['commit']);
  });

  it('summary: division filter on the stored code; report: department filter outside the inner query', async () => {
    const { db, statements } = scriptedDb(() => []);
    const repo = oracleContractorSummaryRepository(db, EBS_DIRECT);
    const q = { from: '2026-11-01', to: '2026-11-30', dept: 'Molding', cont: '', div: 'IBM' };
    await repo.summary(q);
    await repo.detail(q);
    expect(statements[0]!.sql).toContain('WHERE DIV_CODE = :div AND DEP = :dept');
    expect(statements[1]!.sql).toMatch(
      /ORDER BY CO\.CON_NUMBER, CE\.EMPLOYEE_NUMBER\) WHERE DEP = :dept$/,
    );
    expect(statements[1]!.binds).toMatchObject({ div: 'IBM', dept: 'Molding' });
  });
});
