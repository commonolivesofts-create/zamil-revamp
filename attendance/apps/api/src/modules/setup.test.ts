import request from 'supertest';
import { describe, expect, it } from 'vitest';
import type { ShiftInput, TimetableInput, UploadRow } from '@attendance/shared';
import { fakeIdentities, H, identity, scriptedDb, signIn, testApp } from '../test-utils';
import { oracleAttendanceImporter } from './attendanceCard/repository';
import { oracleOccasionRepository } from './occasions/repository';
import { oracleShiftRepository } from './shifts/repository';
import { oracleTimetableRepository } from './timetables/repository';

const UUID = '11111111-2222-4333-8444-555555555555';
const shiftRow = {
  ID: 7,
  UUID,
  SHIFT_NAME: 'Morning',
  START_DATE: '2026-01-01',
  END_DATE: '2026-12-31',
  STATUS: 'ACTIVE',
  CHECK_IN: '07:00',
  CHECK_OUT: '16:00',
  WEEKDAY_OVRTM_CAP: null,
  WEEKEND_OVRTM_CAP: '4',
};
const shiftInput: ShiftInput = {
  shiftName: 'Morning',
  status: 'ACTIVE',
  startDate: '2026-01-01',
  endDate: '2026-12-31',
  checkIn: '07:00',
  checkOut: '16:00',
  weekdayOvertimeCap: null,
  weekendOvertimeCap: '4',
};

describe('shift repository', () => {
  it('reports "no changes" when nothing changed, treating empty and NULL as equal', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.sql.startsWith('SELECT') ? [shiftRow] : undefined,
    );
    const result = await oracleShiftRepository(db).update(UUID, shiftInput);
    expect(result.changed).toBe(false);
    expect(statements.filter((s) => s.kind === 'execute')).toHaveLength(0);
  });

  it('updates only the changed columns', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.sql.startsWith('SELECT') ? [shiftRow] : undefined,
    );
    await oracleShiftRepository(db).update(UUID, {
      ...shiftInput,
      checkOut: '17:00',
      endDate: '2027-01-31',
    });
    const update = statements.find((s) => s.kind === 'execute')!;
    expect(update.sql).toBe(
      "UPDATE XX_DIGI_SHIFT_PR SET END_DATE = TO_DATE(:endDate, 'YYYY-MM-DD'), CHECK_OUT = :checkOut, UPDATED_AT = SYSTIMESTAMP WHERE UUID = :uuid",
    );
    expect(update.binds).toEqual({ uuid: UUID, endDate: '2027-01-31', checkOut: '17:00' });
  });

  it('refuses to delete a shift used by active timetables, and rolls back', async () => {
    const { db, statements, outcomes } = scriptedDb((s) =>
      s.sql.includes('FROM XX_DIGI_TIMETABLE_PR')
        ? [{ TOTAL: 2 }]
        : s.sql.startsWith('SELECT')
          ? [shiftRow]
          : undefined,
    );
    await expect(oracleShiftRepository(db).remove(UUID)).rejects.toThrow(
      /assigned in 2 active timetables/,
    );
    expect(outcomes).toEqual(['rollback']);
    expect(statements.some((s) => s.sql.startsWith('DELETE'))).toBe(false);
  });

  it('deletes the weekly detail with the shift in one transaction', async () => {
    const { db, statements, outcomes } = scriptedDb((s) =>
      s.sql.includes('FROM XX_DIGI_TIMETABLE_PR')
        ? [{ TOTAL: 0 }]
        : s.sql.startsWith('SELECT')
          ? [shiftRow]
          : undefined,
    );
    await oracleShiftRepository(db).remove(UUID);
    expect(statements.filter((s) => s.kind === 'execute').map((s) => s.sql)).toEqual([
      'DELETE FROM XX_DIGI_SHIFT_PR_DTL WHERE SHIFT_PR_ID = :id',
      'DELETE FROM XX_DIGI_SHIFT_PR WHERE ID = :id',
    ]);
    expect(outcomes).toEqual(['commit']);
  });

  it('upserts the 7 weekdays and copies the header status', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.sql.startsWith('SELECT DAY_NO')
        ? [{ DAY_NO: 1 }]
        : s.sql.startsWith('SELECT')
          ? [shiftRow]
          : undefined,
    );
    const days = Array.from({ length: 7 }, (_, i) =>
      i < 5
        ? { punchIn: '07:00', punchOut: '16:00', grossTime: '00:10' }
        : { punchIn: '', punchOut: '', grossTime: '' },
    );
    const result = await oracleShiftRepository(db).saveWeek(UUID, { days });
    expect(result.existed).toBe(true);
    const writes = statements.filter((s) => s.kind === 'execute');
    expect(writes.map((s) => s.sql.split(' ')[0])).toEqual(['UPDATE', ...Array(6).fill('INSERT')]);
    expect(writes[6]!.binds).toMatchObject({
      dayNo: 7,
      weekdayName: 'Saturday',
      punchIn: null,
      status: 'ACTIVE',
    });
  });
});

describe('timetable repository', () => {
  const input: TimetableInput = {
    empNo: '1001',
    empName: 'Ali',
    shiftId: '7',
    status: 'ACTIVE',
    startDate: '2026-01-01',
    endDate: null,
    overtimeAllowed: 'Y',
    excludeTimesheet: 'N',
  };

  it('versions an edit: inactivate source, inactivate other active rows, insert with both flags', async () => {
    const { db, statements, outcomes } = scriptedDb((s) =>
      s.sql.startsWith('SELECT') ? [{ ID: 9, UUID: 'new', EMP_NO: '1001' }] : undefined,
    );
    await oracleTimetableRepository(db).saveVersion(input, UUID);
    const writes = statements.filter((s) => s.kind === 'execute');
    expect(writes).toHaveLength(3);
    expect(writes[0]!.binds).toEqual({ uuid: UUID });
    expect(writes[1]!.sql).toContain('WHERE EMP_NO = :empNo AND SHIFT_ID = :shiftId');
    expect(writes[2]!.binds).toMatchObject({
      overtimeAllowed: 'Y',
      excludeTimesheet: 'N',
      status: 'ACTIVE',
      empNo: 1001,
    });
    expect(outcomes).toEqual(['commit']);
  });

  it('always saves the new version as ACTIVE, whatever status was chosen (CI3)', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.sql.startsWith('SELECT') ? [{ ID: 9, UUID: 'new' }] : undefined,
    );
    await oracleTimetableRepository(db).saveVersion({ ...input, status: 'INACTIVE' });
    const writes = statements.filter((s) => s.kind === 'execute');
    expect(writes.map((s) => s.sql.split(' ')[0])).toEqual(['UPDATE', 'INSERT']);
    expect(writes[0]!.sql).not.toContain('UPDATED_AT');
    expect(writes[1]!.binds).toMatchObject({ status: 'ACTIVE' });
  });

  it('rolls back when the edited row does not exist', async () => {
    const { db, outcomes } = scriptedDb((s) =>
      s.kind === 'execute' ? { rowsAffected: 0 } : undefined,
    );
    await expect(oracleTimetableRepository(db).saveVersion(input, UUID)).rejects.toThrow(
      'Timetable not found.',
    );
    expect(outcomes).toEqual(['rollback']);
  });
});

describe('occasion repository', () => {
  it('stores the shift list normalised and the signed-in employee as author', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.kind === 'execute' ? { outBinds: { newId: 12 } } : [{ OCCASION_ID: 12, SHIFT_ID: '3,1' }],
    );
    const occasion = await oracleOccasionRepository(db).insert(
      {
        occasionName: 'National Day',
        fromDate: '2026-09-23',
        toDate: '2026-09-24',
        occasionType: null,
        countAsPresent: 'Y',
        paidHoliday: 'Y',
        isActive: 'Y',
        shiftIds: ['3', ' 1', '3'],
        remarks: null,
      },
      '1001',
    );
    expect(statements[0]!.binds).toMatchObject({
      shiftIds: '3,1',
      userName: '1001',
      newId: { out: 'number' },
    });
    expect(occasion.shiftIds).toEqual(['3', '1']);
  });
});

describe('attendance importer', () => {
  const rows: UploadRow[] = [
    {
      row: 2,
      empNo: '1001',
      empName: 'file name',
      attDate: '2024-01-15',
      punchIn: '08:00',
      punchOut: '17:00',
    },
    {
      row: 3,
      empNo: '1002',
      empName: 'x',
      attDate: '2024-01-15',
      punchIn: '08:00',
      punchOut: '17:00',
    },
    {
      row: 4,
      empNo: '1001',
      empName: 'file name',
      attDate: '2024-01-16',
      punchIn: '08:00',
      punchOut: '17:00',
    },
  ];

  it('skips inactive employees, uses master names, counts inserts and updates, merges in one transaction', async () => {
    const { db, statements, outcomes } = scriptedDb((s) => {
      if (s.sql.includes('FROM XX_DIGI_EMP_MASTER'))
        return [{ EMP_NO: '1001', FULL_NAME: 'Ali Master ' }];
      if (s.sql.includes('FROM XX_DIGI_ATT_ATT_CARD'))
        return [{ EMP_NO: '1001', ATT_DATE: '2024-01-15' }];
      return undefined;
    });
    const outcome = await oracleAttendanceImporter(db).importRows(rows);
    expect(outcome).toEqual({
      insertedRows: 1,
      updatedRows: 1,
      skipped: [
        {
          row: 3,
          empNo: '1002',
          message: 'Employee is inactive or not found in the employee master.',
        },
      ],
    });
    const merge = statements.find((s) => s.sql.startsWith('MERGE'))!;
    expect(merge.inTransaction).toBe(true);
    expect(merge.binds).toMatchObject({ n0: '1001', m0: 'Ali Master', d1: '2024-01-16' });
    expect(outcomes).toEqual(['commit']);
  });
});

describe('setup routes', () => {
  const admin = identity({ employeeNumber: '9001', userId: 1 });

  it('lets every signed-in user change setup data, as in CI3 (no roles)', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.sql.includes('COUNT(1)')
        ? [{ TOTAL: 0 }]
        : s.sql.startsWith('SELECT')
          ? [shiftRow]
          : undefined,
    );
    const app = testApp({ repositories: { shifts: oracleShiftRepository(db) } });
    const res = await request(app)
      .post('/api/v1/shifts')
      .set(H)
      .set('Cookie', await signIn(app))
      .send(shiftInput)
      .expect(201);
    expect(res.body.message).toBe('Shift added successfully.');
    expect(statements.some((s) => s.sql.startsWith('INSERT INTO XX_DIGI_SHIFT_PR'))).toBe(true);
  });

  it('records the user name as occasion author (what CI3 meant; it wrote SYSTEM)', async () => {
    const { db, statements } = scriptedDb((s) =>
      s.kind === 'execute' ? { outBinds: { newId: 5 } } : [{ OCCASION_ID: 5 }],
    );
    const app = testApp({ repositories: { occasions: oracleOccasionRepository(db) } });
    await request(app)
      .post('/api/v1/occasions')
      .set(H)
      .set('Cookie', await signIn(app))
      .send({
        occasionName: 'Eid',
        fromDate: '2026-03-20',
        toDate: '2026-03-22',
        countAsPresent: 'Y',
        paidHoliday: 'Y',
        isActive: 'Y',
      })
      .expect(201);
    expect(statements[0]!.binds).toMatchObject({ userName: 'test.user' });
  });

  it('validates with the CI3 messages and reports duplicate shift names on the field', async () => {
    const { db } = scriptedDb((s) => (s.sql.includes('COUNT(1)') ? [{ TOTAL: 1 }] : []));
    const app = testApp({
      identities: fakeIdentities(admin),
      repositories: { shifts: oracleShiftRepository(db) },
    });
    const cookies = await signIn(app, '9001');
    const invalid = await request(app)
      .post('/api/v1/shifts')
      .set(H)
      .set('Cookie', cookies)
      .send({ ...shiftInput, shiftName: '', checkIn: '7am', endDate: '2025-01-01' })
      .expect(400);
    expect(invalid.body.error.details.issues).toEqual([
      { path: 'shiftName', message: 'The Shift Name field is required.' },
      { path: 'checkIn', message: 'The Check In field must be a valid time (HH:MM).' },
      { path: 'endDate', message: 'End Date must be on or after Start Date.' },
    ]);
    const duplicate = await request(app)
      .post('/api/v1/shifts')
      .set(H)
      .set('Cookie', cookies)
      .send(shiftInput)
      .expect(400);
    expect(duplicate.body.error.details.issues).toEqual([
      { path: 'shiftName', message: 'The Shift Name already exists. Please use a unique value.' },
    ]);
  });

  it('previews an upload without writing anything', async () => {
    const app = testApp({ identities: fakeIdentities(admin) });
    const res = await request(app)
      .post('/api/v1/attendance-card/upload')
      .set(H)
      .set('Cookie', await signIn(app, '9001'))
      .field('mode', 'preview')
      .attach(
        'file',
        Buffer.from(
          'Employee ID,Date,First Punch,Last Punch\n1001,15/01/2024,8.30,17:00\n1002,bad,08:00,17:00\n',
        ),
        'a.csv',
      )
      .expect(200);
    expect(res.body.summary).toEqual({ totalDataRows: 2, validRows: 1, invalidRows: 1 });
    expect(res.body.rows[0]).toMatchObject({ punchIn: '08:30', attDate: '2024-01-15' });
  });

  it('refuses unsupported files with the CI3 message', async () => {
    const app = testApp({ identities: fakeIdentities(admin) });
    const res = await request(app)
      .post('/api/v1/attendance-card/upload')
      .set(H)
      .set('Cookie', await signIn(app, '9001'))
      .attach('file', Buffer.from('x'), 'old.xls')
      .expect(400);
    expect(res.body.error.message).toBe(
      'Only CSV and XLSX files are supported. Please save old XLS files as XLSX.',
    );
  });
});
