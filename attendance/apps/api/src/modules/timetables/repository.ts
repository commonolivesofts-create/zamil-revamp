// Employee shift assignments, XX_DIGI_TIMETABLE_PR (CI3: Timetable_model).
// Saving is versioned (CI3 saveTimetableVersion): in one transaction the edited row and any other
// ACTIVE row for the same employee and shift are set INACTIVE, then a new ACTIVE row is inserted.
// As in CI3 the new row is always ACTIVE, whatever status the form sent.
import { randomUUID } from 'node:crypto';
import type {
  EmployeeLookup,
  TimetableFilters,
  TimetableInput,
  TimetableRow,
} from '@attendance/shared';
import { num, str, type Db, type Row } from '../../db/oracle';
import { containsCi, equals, onDay, type ListSpec } from '../../db/sql';
import { AppError } from '../../lib/errors';
import { oracleReportRepository } from '../report';

const COLUMNS = `t.ID, t.UUID, TO_CHAR(t.EMP_NO) AS EMP_NO, t.EMP_NAME, t.SHIFT_ID, s.SHIFT_NAME,
  TO_CHAR(t.START_DATE, 'YYYY-MM-DD') AS START_DATE, TO_CHAR(t.END_DATE, 'YYYY-MM-DD') AS END_DATE,
  t.OVERTIME_ALLOWED, t.EXCLUDE_TIMESHEET, t.STATUS,
  TO_CHAR(t.CREATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS CREATED_AT,
  TO_CHAR(t.UPDATED_AT, 'YYYY-MM-DD HH24:MI:SS') AS UPDATED_AT`;
const FROM = 'XX_DIGI_TIMETABLE_PR t LEFT JOIN XX_DIGI_SHIFT_PR s ON s.ID = t.SHIFT_ID';

export const timetableListSpec: ListSpec<TimetableFilters> = {
  from: FROM,
  select: COLUMNS,
  filters: {
    empNo: containsCi('TO_CHAR(t.EMP_NO)'),
    empName: containsCi('t.EMP_NAME'),
    shiftId: equals('TO_CHAR(t.SHIFT_ID)'),
    status: equals("UPPER(NVL(t.STATUS, ''))", { upper: true }),
    startDate: onDay('t.START_DATE'),
    endDate: onDay('t.END_DATE'),
  },
  search: ['t.EMP_NAME', 'TO_CHAR(t.EMP_NO)', 's.SHIFT_NAME', 't.STATUS'],
  orderBy: 't.ID DESC',
};

export const mapTimetableRow = (row: Row): TimetableRow => ({
  id: num(row.ID) ?? 0,
  uuid: str(row.UUID) ?? '',
  empNo: str(row.EMP_NO),
  empName: str(row.EMP_NAME),
  shiftId: num(row.SHIFT_ID),
  shiftName: str(row.SHIFT_NAME),
  startDate: str(row.START_DATE),
  endDate: str(row.END_DATE),
  overtimeAllowed: str(row.OVERTIME_ALLOWED),
  excludeTimesheet: str(row.EXCLUDE_TIMESHEET),
  status: str(row.STATUS),
  createdAt: str(row.CREATED_AT),
  updatedAt: str(row.UPDATED_AT),
});

export interface TimetableRepository {
  findByUuid(uuid: string): Promise<TimetableRow | null>;
  shiftExists(shiftId: number): Promise<boolean>;
  /** Inserts a new version; with `sourceUuid`, the edited row is inactivated first. */
  saveVersion(input: TimetableInput, sourceUuid?: string): Promise<TimetableRow>;
  remove(uuid: string): Promise<void>;
  lookupEmployee(employeeNumber: string): Promise<EmployeeLookup | null>;
}

const notFound = () => new AppError('NOT_FOUND', 'Timetable not found.');

export function oracleTimetableRepository(db: Db): TimetableRepository {
  const findByUuid = async (uuid: string) => {
    const rows = await db.query('adw', `SELECT ${COLUMNS} FROM ${FROM} WHERE t.UUID = :uuid`, {
      uuid,
    });
    return rows[0] ? mapTimetableRow(rows[0]) : null;
  };

  return {
    findByUuid,

    async shiftExists(shiftId) {
      const rows = await db.query(
        'adw',
        'SELECT COUNT(1) AS TOTAL FROM XX_DIGI_SHIFT_PR WHERE ID = :id',
        {
          id: shiftId,
        },
      );
      return Number(rows[0]?.TOTAL ?? 0) > 0;
    },

    async saveVersion(input, sourceUuid) {
      const uuid = randomUUID();
      await db.transaction('adw', async (tx) => {
        if (sourceUuid) {
          const result = await tx.execute(
            `UPDATE XX_DIGI_TIMETABLE_PR SET STATUS = 'INACTIVE' WHERE UUID = :uuid`,
            { uuid: sourceUuid },
          );
          if (result.rowsAffected === 0) throw notFound();
        }
        await tx.execute(
          `UPDATE XX_DIGI_TIMETABLE_PR SET STATUS = 'INACTIVE'
            WHERE EMP_NO = :empNo AND SHIFT_ID = :shiftId AND UPPER(NVL(STATUS, '')) = 'ACTIVE'`,
          { empNo: Number(input.empNo), shiftId: Number(input.shiftId) },
        );
        await tx.execute(
          `INSERT INTO XX_DIGI_TIMETABLE_PR (UUID, EMP_NO, EMP_NAME, SHIFT_ID, START_DATE, END_DATE, STATUS,
             OVERTIME_ALLOWED, EXCLUDE_TIMESHEET, CREATED_AT, UPDATED_AT)
           VALUES (:uuid, :empNo, :empName, :shiftId, TO_DATE(:startDate, 'YYYY-MM-DD'),
             TO_DATE(:endDate, 'YYYY-MM-DD'), :status, :overtimeAllowed, :excludeTimesheet,
             SYSTIMESTAMP, SYSTIMESTAMP)`,
          {
            uuid,
            empNo: Number(input.empNo),
            empName: input.empName,
            shiftId: Number(input.shiftId),
            startDate: input.startDate,
            endDate: input.endDate,
            status: 'ACTIVE',
            overtimeAllowed: input.overtimeAllowed,
            excludeTimesheet: input.excludeTimesheet,
          },
        );
      });
      const saved = await findByUuid(uuid);
      if (!saved) throw new AppError('INTERNAL', 'Failed to save timetable.');
      return saved;
    },

    async remove(uuid) {
      const result = await db.execute(
        'adw',
        'DELETE FROM XX_DIGI_TIMETABLE_PR WHERE UUID = :uuid',
        { uuid },
      );
      if (result.rowsAffected === 0) throw notFound();
    },

    async lookupEmployee(employeeNumber) {
      const rows = await db.query(
        'adw',
        `SELECT EMPLOYEE_NUMBER, FULL_NAME, EMAIL_ADDRESS FROM XX_DIGI_EMP_MASTER
          WHERE EMPLOYEE_NUMBER = :emp
          ORDER BY CASE WHEN CURRENT_EMP_FLAG = 'Y' THEN 0 ELSE 1 END
          FETCH FIRST 1 ROW ONLY`,
        { emp: employeeNumber },
      );
      const row = rows[0];
      return row
        ? {
            employeeNumber: str(row.EMPLOYEE_NUMBER) ?? employeeNumber,
            fullName: str(row.FULL_NAME),
            email: str(row.EMAIL_ADDRESS),
          }
        : null;
    },
  };
}

export const timetableListRepository = (db: Db) =>
  oracleReportRepository(db, 'adw', timetableListSpec, mapTimetableRow);
