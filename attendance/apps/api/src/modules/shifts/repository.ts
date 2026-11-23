// Shifts (XX_DIGI_SHIFT_PR) and their weekly detail (XX_DIGI_SHIFT_PR_DTL).
// CI3: Shift_model, Shift_detail_model.
import { randomUUID } from 'node:crypto';
import {
  WEEKDAYS,
  type DayTimes,
  type ShiftChoice,
  type ShiftDetailFilters,
  type ShiftDetailRow,
  type ShiftFilters,
  type ShiftInput,
  type ShiftRow,
  type ShiftWeek,
  type ShiftWeekInput,
} from '@attendance/shared';
import { num, str, type Db, type Row, type Tx } from '../../db/oracle';
import { containsCi, equals, onDay, type ListSpec } from '../../db/sql';
import { AppError } from '../../lib/errors';
import { oracleReportRepository } from '../report';

const SHIFT_COLUMNS = `s.ID, s.UUID, s.SHIFT_NAME,
  TO_CHAR(s.START_DATE, 'YYYY-MM-DD') AS START_DATE, TO_CHAR(s.END_DATE, 'YYYY-MM-DD') AS END_DATE,
  s.STATUS, s.CHECK_IN, s.CHECK_OUT, s.WEEKDAY_OVRTM_CAP, s.WEEKEND_OVRTM_CAP,
  TO_CHAR(s.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
  TO_CHAR(s.UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT`;

export const shiftListSpec: ListSpec<ShiftFilters> = {
  from: 'XX_DIGI_SHIFT_PR s',
  select: SHIFT_COLUMNS,
  filters: {
    shiftName: containsCi('s.SHIFT_NAME'),
    status: equals('UPPER(s.STATUS)', { upper: true }),
    startDate: onDay('s.START_DATE'),
    endDate: onDay('s.END_DATE'),
    checkIn: equals('s.CHECK_IN'),
    checkOut: equals('s.CHECK_OUT'),
  },
  search: [
    's.SHIFT_NAME',
    's.STATUS',
    "TO_CHAR(s.START_DATE, 'YYYY-MM-DD')",
    "TO_CHAR(s.END_DATE, 'YYYY-MM-DD')",
    's.CHECK_IN',
    's.CHECK_OUT',
  ],
  orderBy: 's.ID DESC',
};

export const mapShiftRow = (row: Row): ShiftRow => ({
  id: num(row.ID) ?? 0,
  uuid: str(row.UUID) ?? '',
  shiftName: str(row.SHIFT_NAME),
  startDate: str(row.START_DATE),
  endDate: str(row.END_DATE),
  status: str(row.STATUS),
  checkIn: str(row.CHECK_IN),
  checkOut: str(row.CHECK_OUT),
  weekdayOvertimeCap: str(row.WEEKDAY_OVRTM_CAP),
  weekendOvertimeCap: str(row.WEEKEND_OVRTM_CAP),
  createdAt: str(row.CREATED_AT),
  updatedAt: str(row.UPDATED_AT),
});

/* Weekly pivot: one row per shift, 7 x (punch in, punch out, gross). */
const DAY_KEYS = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'] as const;
const PIVOT = DAY_KEYS.flatMap((key, index) => [
  `MAX(CASE WHEN d.DAY_NO = ${index + 1} THEN d.PUNCH_IN END) AS ${key}_PUNCH_IN`,
  `MAX(CASE WHEN d.DAY_NO = ${index + 1} THEN d.PUNCH_OUT END) AS ${key}_PUNCH_OUT`,
  `MAX(CASE WHEN d.DAY_NO = ${index + 1} THEN d.GROSS_TIME END) AS ${key}_GROSS_TIME`,
]).join(', ');

export const shiftDetailListSpec: ListSpec<ShiftDetailFilters> = {
  from: 'XX_DIGI_SHIFT_PR s LEFT JOIN XX_DIGI_SHIFT_PR_DTL d ON d.SHIFT_PR_ID = s.ID',
  select: `s.ID, s.UUID, s.SHIFT_NAME, s.STATUS, ${PIVOT}`,
  filters: {
    shiftName: containsCi('s.SHIFT_NAME'),
    status: equals('UPPER(s.STATUS)', { upper: true }),
  },
  search: ['s.SHIFT_NAME', 's.STATUS'],
  groupBy: 's.ID, s.UUID, s.SHIFT_NAME, s.STATUS',
  orderBy: 's.ID DESC',
};

export const mapShiftDetailRow = (row: Row): ShiftDetailRow => ({
  id: num(row.ID) ?? 0,
  uuid: str(row.UUID) ?? '',
  shiftName: str(row.SHIFT_NAME),
  status: str(row.STATUS),
  days: DAY_KEYS.map((key) => ({
    punchIn: str(row[`${key}_PUNCH_IN`]),
    punchOut: str(row[`${key}_PUNCH_OUT`]),
    grossTime: str(row[`${key}_GROSS_TIME`]),
  })),
});

export interface ShiftRepository {
  findByUuid(uuid: string): Promise<ShiftRow | null>;
  nameExists(name: string, exceptUuid?: string): Promise<boolean>;
  insert(input: ShiftInput): Promise<ShiftRow>;
  /** Writes only the columns that changed; `changed: false` when nothing did. */
  update(uuid: string, input: ShiftInput): Promise<{ shift: ShiftRow; changed: boolean }>;
  /** Deletes the shift and its weekly detail; refuses while timetables use it. */
  remove(uuid: string): Promise<void>;
  choices(): Promise<ShiftChoice[]>;
  week(uuid: string): Promise<ShiftWeek>;
  saveWeek(uuid: string, input: ShiftWeekInput): Promise<{ existed: boolean }>;
}

const notFound = () => new AppError('NOT_FOUND', 'Shift not found.');

/** Comparable form of a column value (Oracle stores '' as NULL). */
const same = (a: string | null | undefined, b: string | null | undefined) =>
  (a || null) === (b || null);

export function oracleShiftRepository(db: Db): ShiftRepository {
  const findByUuid = async (uuid: string, tx?: Tx) => {
    const sql = `SELECT ${SHIFT_COLUMNS} FROM XX_DIGI_SHIFT_PR s WHERE s.UUID = :uuid`;
    const rows = tx ? await tx.query(sql, { uuid }) : await db.query('adw', sql, { uuid });
    return rows[0] ? mapShiftRow(rows[0]) : null;
  };

  return {
    findByUuid: (uuid) => findByUuid(uuid),

    async nameExists(name, exceptUuid) {
      const rows = await db.query(
        'adw',
        `SELECT COUNT(1) AS TOTAL FROM XX_DIGI_SHIFT_PR
          WHERE UPPER(TRIM(SHIFT_NAME)) = UPPER(TRIM(:name))${exceptUuid ? ' AND UUID <> :exceptUuid' : ''}`,
        { name, ...(exceptUuid && { exceptUuid }) },
      );
      return Number(rows[0]?.TOTAL ?? 0) > 0;
    },

    async insert(input) {
      const uuid = randomUUID();
      await db.execute(
        'adw',
        `INSERT INTO XX_DIGI_SHIFT_PR (UUID, SHIFT_NAME, START_DATE, END_DATE, STATUS, CHECK_IN, CHECK_OUT,
           WEEKDAY_OVRTM_CAP, WEEKEND_OVRTM_CAP, CREATED_AT, UPDATED_AT)
         VALUES (:uuid, :name, TO_DATE(:startDate, 'YYYY-MM-DD'), TO_DATE(:endDate, 'YYYY-MM-DD'), :status,
           :checkIn, :checkOut, :weekdayCap, :weekendCap, SYSTIMESTAMP, SYSTIMESTAMP)`,
        {
          uuid,
          name: input.shiftName,
          startDate: input.startDate,
          endDate: input.endDate,
          status: input.status,
          checkIn: input.checkIn,
          checkOut: input.checkOut,
          weekdayCap: input.weekdayOvertimeCap,
          weekendCap: input.weekendOvertimeCap,
        },
      );
      const shift = await findByUuid(uuid);
      if (!shift) throw new AppError('INTERNAL', 'Failed to add shift.');
      return shift;
    },

    async update(uuid, input) {
      const current = await findByUuid(uuid);
      if (!current) throw notFound();
      const columns: [string, string, string | null, boolean][] = [
        ['SHIFT_NAME', 'name', input.shiftName, !same(current.shiftName, input.shiftName)],
        ['START_DATE', 'startDate', input.startDate, !same(current.startDate, input.startDate)],
        ['END_DATE', 'endDate', input.endDate, !same(current.endDate, input.endDate)],
        ['STATUS', 'status', input.status, !same(current.status, input.status)],
        ['CHECK_IN', 'checkIn', input.checkIn, !same(current.checkIn, input.checkIn)],
        ['CHECK_OUT', 'checkOut', input.checkOut, !same(current.checkOut, input.checkOut)],
        [
          'WEEKDAY_OVRTM_CAP',
          'weekdayCap',
          input.weekdayOvertimeCap,
          !same(current.weekdayOvertimeCap, input.weekdayOvertimeCap),
        ],
        [
          'WEEKEND_OVRTM_CAP',
          'weekendCap',
          input.weekendOvertimeCap,
          !same(current.weekendOvertimeCap, input.weekendOvertimeCap),
        ],
      ];
      const changed = columns.filter(([, , , isChanged]) => isChanged);
      if (changed.length === 0) return { shift: current, changed: false };
      const assignments = changed.map(([column, bind]) =>
        column.endsWith('_DATE')
          ? `${column} = TO_DATE(:${bind}, 'YYYY-MM-DD')`
          : `${column} = :${bind}`,
      );
      await db.execute(
        'adw',
        `UPDATE XX_DIGI_SHIFT_PR SET ${assignments.join(', ')}, UPDATED_AT = SYSTIMESTAMP WHERE UUID = :uuid`,
        { uuid, ...Object.fromEntries(changed.map(([, bind, value]) => [bind, value])) },
      );
      return { shift: (await findByUuid(uuid)) ?? current, changed: true };
    },

    async remove(uuid) {
      await db.transaction('adw', async (tx) => {
        const shift = await findByUuid(uuid, tx);
        if (!shift) throw notFound();
        const [usage] = await tx.query(
          `SELECT COUNT(1) AS TOTAL FROM XX_DIGI_TIMETABLE_PR
            WHERE SHIFT_ID = :id AND UPPER(NVL(STATUS, 'ACTIVE')) = 'ACTIVE'`,
          { id: shift.id },
        );
        const timetables = Number(usage?.TOTAL ?? 0);
        if (timetables > 0) {
          throw new AppError(
            'INVALID_STATE',
            `This shift is assigned in ${timetables} active timetable${timetables === 1 ? '' : 's'}. Set the shift to INACTIVE instead, or end those assignments first.`,
          );
        }
        await tx.execute('DELETE FROM XX_DIGI_SHIFT_PR_DTL WHERE SHIFT_PR_ID = :id', {
          id: shift.id,
        });
        await tx.execute('DELETE FROM XX_DIGI_SHIFT_PR WHERE ID = :id', { id: shift.id });
      });
    },

    async choices() {
      const rows = await db.query(
        'adw',
        `SELECT ID, UUID, SHIFT_NAME, STATUS FROM XX_DIGI_SHIFT_PR
          WHERE SHIFT_NAME IS NOT NULL ORDER BY SHIFT_NAME ASC`,
      );
      return rows.map((row) => ({
        id: num(row.ID) ?? 0,
        uuid: str(row.UUID) ?? '',
        name: str(row.SHIFT_NAME) ?? '',
        status: str(row.STATUS),
      }));
    },

    async week(uuid) {
      const shift = await findByUuid(uuid);
      if (!shift) throw new AppError('NOT_FOUND', 'Selected shift was not found.');
      const rows = await db.query(
        'adw',
        `SELECT DAY_NO, PUNCH_IN, PUNCH_OUT, GROSS_TIME FROM XX_DIGI_SHIFT_PR_DTL
          WHERE SHIFT_PR_ID = :id ORDER BY DAY_NO`,
        { id: shift.id },
      );
      const byDay = new Map(rows.map((row) => [num(row.DAY_NO), row]));
      return {
        shift,
        hasExistingDetails: rows.length > 0,
        days: WEEKDAYS.map((weekdayName, index) => {
          const row = byDay.get(index + 1);
          const times: DayTimes = {
            punchIn: str(row?.PUNCH_IN),
            punchOut: str(row?.PUNCH_OUT),
            grossTime: str(row?.GROSS_TIME),
          };
          return { dayNo: index + 1, weekdayName, ...times };
        }),
      };
    },

    async saveWeek(uuid, input) {
      return db.transaction('adw', async (tx) => {
        const shift = await findByUuid(uuid, tx);
        if (!shift) throw new AppError('NOT_FOUND', 'Selected shift was not found.');
        const existing = await tx.query(
          'SELECT DAY_NO FROM XX_DIGI_SHIFT_PR_DTL WHERE SHIFT_PR_ID = :id',
          {
            id: shift.id,
          },
        );
        const existingDays = new Set(existing.map((row) => num(row.DAY_NO)));
        const status = shift.status?.trim() || 'ACTIVE';
        for (const [index, day] of input.days.entries()) {
          const binds = {
            id: shift.id,
            dayNo: index + 1,
            weekdayName: WEEKDAYS[index]!,
            punchIn: day.punchIn || null,
            punchOut: day.punchOut || null,
            grossTime: day.grossTime || null,
            status,
          };
          if (existingDays.has(index + 1)) {
            await tx.execute(
              `UPDATE XX_DIGI_SHIFT_PR_DTL SET WEEKDAY_NAME = :weekdayName, PUNCH_IN = :punchIn,
                 PUNCH_OUT = :punchOut, GROSS_TIME = :grossTime, STATUS = :status, UPDATED_AT = SYSTIMESTAMP
               WHERE SHIFT_PR_ID = :id AND DAY_NO = :dayNo`,
              binds,
            );
          } else {
            await tx.execute(
              `INSERT INTO XX_DIGI_SHIFT_PR_DTL (SHIFT_PR_ID, UUID, DAY_NO, WEEKDAY_NAME, PUNCH_IN, PUNCH_OUT,
                 GROSS_TIME, STATUS, CREATED_AT, UPDATED_AT)
               VALUES (:id, :uuid, :dayNo, :weekdayName, :punchIn, :punchOut, :grossTime, :status,
                 SYSTIMESTAMP, SYSTIMESTAMP)`,
              { ...binds, uuid: randomUUID() },
            );
          }
        }
        return { existed: existingDays.size > 0 };
      });
    },
  };
}

export const shiftListRepository = (db: Db) =>
  oracleReportRepository(db, 'adw', shiftListSpec, mapShiftRow);
export const shiftDetailListRepository = (db: Db) =>
  oracleReportRepository(db, 'adw', shiftDetailListSpec, mapShiftDetailRow);
