// Oracle reads and writes for attendance processing (CI3: ProcessAttendanceModel).
// CI3 ran ~6 queries per employee-day; here each employee's range is loaded once and the day
// rules in domain/processing pick the same row CI3's ORDER BY ... ROWNUM = 1 picked.
import { ALL, type ProcessEmployee } from '@attendance/shared';
import { num, str, type Db, type Row } from '../../db/oracle';
import type {
  CardRow,
  EmployeeData,
  LeaveRow,
  OccasionRow,
  SheetRow,
  ShiftDay,
  TimetableShift,
} from '../../domain/processing/day';

export interface TargetEmployee {
  employeeNumber: string;
  fullName: string;
}

export interface ProcessingRepository {
  departments(): Promise<string[]>;
  employeesByDepartment(department: string): Promise<ProcessEmployee[]>;
  targetEmployees(
    department: string,
    employeeNumber: string,
    from: string,
    to: string,
  ): Promise<TargetEmployee[]>;
  /** FULL_NAME of the employee master row (CI3 get_employee_profile). */
  profileName(empNo: string): Promise<string>;
  /** Active occasions overlapping the range (shared by every employee). */
  occasions(from: string, to: string): Promise<OccasionRow[]>;
  employeeData(empNo: string, from: string, to: string): Promise<Omit<EmployeeData, 'occasions'>>;
  /** Days (YYYY-MM-DD) that already have a sheet row. */
  existingDays(empNo: string, from: string, to: string): Promise<Set<string>>;
  /** Inserts new days and updates existing ones, all or nothing for this employee. */
  saveRows(rows: SheetRow[]): Promise<void>;
}

const DAY_RANGE = `>= TO_DATE(:fromDate, 'YYYY-MM-DD') AND {col} < TO_DATE(:toDate, 'YYYY-MM-DD') + 1`;
const inRange = (column: string) => `${column} ${DAY_RANGE.replace('{col}', column)}`;

/**
 * CI3 build_leave_date_expression: the leave dates are free text in many formats.
 * Fixed: DEFAULT NULL ON CONVERSION ERROR, so one impossible date (e.g. 31-02-2024) no longer
 * fails processing for the employee (CI3 raised ORA-01847 for every day).
 */
export function leaveDateExpression(column: string): string {
  const c = `TRIM(${column})`;
  const toDate = (value: string, format: string, nls = false) =>
    `TO_DATE(${value} DEFAULT NULL ON CONVERSION ERROR, '${format}'${nls ? ", 'NLS_DATE_LANGUAGE=ENGLISH'" : ''})`;
  return `CASE
    WHEN REGEXP_LIKE(${c}, '^\\d{4}-\\d{2}-\\d{2}$') THEN ${toDate(c, 'YYYY-MM-DD')}
    WHEN REGEXP_LIKE(${c}, '^\\d{4}/\\d{2}/\\d{2}$') THEN ${toDate(c, 'YYYY/MM/DD')}
    WHEN REGEXP_LIKE(${c}, '^\\d{2}-\\d{2}-\\d{4}$') THEN ${toDate(c, 'DD-MM-YYYY')}
    WHEN REGEXP_LIKE(${c}, '^\\d{2}/\\d{2}/\\d{4}$') THEN ${toDate(c, 'DD/MM/YYYY')}
    WHEN REGEXP_LIKE(${c}, '^\\d{2}-\\d{2}-\\d{2}$') THEN ${toDate(c, 'DD-MM-RR')}
    WHEN REGEXP_LIKE(${c}, '^\\d{2}/\\d{2}/\\d{2}$') THEN ${toDate(c, 'DD/MM/RR')}
    WHEN REGEXP_LIKE(${c}, '^\\d{2}-[A-Z]{3}-\\d{4}$', 'i') THEN ${toDate(`UPPER(${c})`, 'DD-MON-YYYY', true)}
    WHEN REGEXP_LIKE(${c}, '^\\d{2}-[A-Z]{3}-\\d{2}$', 'i') THEN ${toDate(`UPPER(${c})`, 'DD-MON-RR', true)}
    WHEN REGEXP_LIKE(${c}, '^\\d{2}-[A-Z]+-\\d{4}$', 'i') THEN ${toDate(`UPPER(${c})`, 'DD-MONTH-YYYY', true)}
    WHEN REGEXP_LIKE(${c}, '^\\d{2}-[A-Z]+-\\d{2}$', 'i') THEN ${toDate(`UPPER(${c})`, 'DD-MONTH-RR', true)}
    ELSE NULL END`;
}

const text = (value: unknown) => (str(value) ?? '').trim();

export function oracleProcessingRepository(db: Db): ProcessingRepository {
  return {
    async departments() {
      // CI3 Attendance_card_model::get_departments (the list both CI3 pages use).
      const rows = await db.query(
        'adw',
        `SELECT DISTINCT DEPARTMENT FROM XX_DIGI_EMP_MASTER
          WHERE DEPARTMENT IS NOT NULL ORDER BY DEPARTMENT ASC`,
      );
      return rows.map((r) => String(r.DEPARTMENT));
    },

    async employeesByDepartment(department) {
      const rows = await db.query(
        'adw',
        `SELECT TO_CHAR(EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER, FULL_NAME FROM XX_DIGI_EMP_MASTER
          WHERE DEPARTMENT = :department AND EMPLOYEE_NUMBER IS NOT NULL
          ORDER BY EMPLOYEE_NUMBER ASC`,
        { department },
      );
      return rows.map((r) => ({
        employeeNumber: String(r.EMPLOYEE_NUMBER),
        fullName: str(r.FULL_NAME),
      }));
    },

    async targetEmployees(department, employeeNumber, from, to) {
      const dept = department.trim().toUpperCase();
      const emp = employeeNumber.trim().toUpperCase();
      let rows: Row[];
      if (dept === ALL && emp === ALL) {
        rows = await db.query(
          'adw',
          `SELECT TO_CHAR(a.EMP_NO) AS EMPLOYEE_NUMBER,
                  NVL(MAX(m.FULL_NAME), MAX(a.EMP_NAME)) AS FULL_NAME
             FROM XX_DIGI_ATT_ATT_CARD a
             LEFT JOIN XX_DIGI_EMP_MASTER m ON TO_CHAR(m.EMPLOYEE_NUMBER) = TO_CHAR(a.EMP_NO)
            WHERE a.EMP_NO IS NOT NULL AND ${inRange('a.ATT_DATE')}
            GROUP BY TO_CHAR(a.EMP_NO)
            ORDER BY TO_CHAR(a.EMP_NO) ASC`,
          { fromDate: from, toDate: to },
        );
      } else if (dept !== ALL && emp === ALL) {
        rows = await db.query(
          'adw',
          `SELECT TO_CHAR(EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER, FULL_NAME FROM XX_DIGI_EMP_MASTER
            WHERE DEPARTMENT = :department AND EMPLOYEE_NUMBER IS NOT NULL
            ORDER BY EMPLOYEE_NUMBER ASC`,
          { department },
        );
      } else if (dept !== ALL && emp !== '') {
        rows = await db.query(
          'adw',
          `SELECT TO_CHAR(EMPLOYEE_NUMBER) AS EMPLOYEE_NUMBER, FULL_NAME FROM XX_DIGI_EMP_MASTER
            WHERE DEPARTMENT = :department AND TO_CHAR(EMPLOYEE_NUMBER) = :employeeNumber`,
          { department, employeeNumber: emp },
        );
      } else {
        rows = [];
      }
      return rows.map((r) => ({
        employeeNumber: text(r.EMPLOYEE_NUMBER),
        fullName: text(r.FULL_NAME),
      }));
    },

    async profileName(empNo) {
      const rows = await db.query(
        'adw',
        `SELECT FULL_NAME FROM XX_DIGI_EMP_MASTER WHERE TO_CHAR(EMPLOYEE_NUMBER) = :empNo`,
        { empNo },
      );
      return rows.length ? text(rows[0]!.FULL_NAME) : '';
    },

    async occasions(from, to) {
      const rows = await db.query(
        'adw',
        `SELECT OCCASION_ID, OCCASION_NAME,
                TO_CHAR(TRUNC(FROM_DATE), 'YYYY-MM-DD') AS FROM_DAY,
                TO_CHAR(TRUNC(TO_DATE), 'YYYY-MM-DD') AS TO_DAY,
                TO_CHAR(FROM_DATE, 'YYYY-MM-DD HH24:MI:SS') AS FROM_STAMP,
                ',' || REGEXP_REPLACE(TRIM(SHIFT_ID), '[[:space:]]+', '') || ',' AS SHIFT_LIST
           FROM XX_DIGI_ATT_OCCASIONS
          WHERE UPPER(TRIM(IS_ACTIVE)) = 'Y'
            AND TRUNC(FROM_DATE) <= TO_DATE(:toDate, 'YYYY-MM-DD')
            AND TRUNC(TO_DATE) >= TO_DATE(:fromDate, 'YYYY-MM-DD')`,
        { fromDate: from, toDate: to },
      );
      return rows.map((r): OccasionRow => ({
        occasionId: num(r.OCCASION_ID) ?? 0,
        occasionName: str(r.OCCASION_NAME),
        fromDay: String(r.FROM_DAY),
        toDay: String(r.TO_DAY),
        fromStamp: String(r.FROM_STAMP),
        shiftList: str(r.SHIFT_LIST) ?? ',,',
      }));
    },

    async employeeData(empNo, from, to) {
      const range = { empNo, fromDate: from, toDate: to };
      const timetableRows = await db.query(
        'adw',
        `SELECT tp.ID AS TIMETABLE_ID,
                TO_CHAR(TRUNC(tp.START_DATE), 'YYYY-MM-DD') AS START_DAY,
                TO_CHAR(TRUNC(tp.END_DATE), 'YYYY-MM-DD') AS END_DAY,
                TO_CHAR(tp.START_DATE, 'YYYY-MM-DD HH24:MI:SS') AS START_STAMP,
                sp.ID AS SHIFT_ID, sp.SHIFT_NAME, sp.WEEKDAY_OVRTM_CAP, sp.WEEKEND_OVRTM_CAP,
                tp.OVERTIME_ALLOWED, tp.EXCLUDE_TIMESHEET
           FROM XX_DIGI_TIMETABLE_PR tp
           LEFT JOIN XX_DIGI_SHIFT_PR sp ON sp.ID = tp.SHIFT_ID
          WHERE TO_CHAR(tp.EMP_NO) = :empNo
            AND tp.STATUS = 'ACTIVE'
            AND (tp.START_DATE IS NULL OR TRUNC(tp.START_DATE) <= TO_DATE(:toDate, 'YYYY-MM-DD'))
            AND (tp.END_DATE IS NULL OR TRUNC(tp.END_DATE) >= TO_DATE(:fromDate, 'YYYY-MM-DD'))
            AND (sp.STATUS = 'ACTIVE' OR sp.STATUS IS NULL)`,
        range,
      );
      const timetables = timetableRows.map((r): TimetableShift => ({
        timetableId: num(r.TIMETABLE_ID) ?? 0,
        startDay: str(r.START_DAY),
        endDay: str(r.END_DAY),
        startStamp: str(r.START_STAMP),
        shiftId: num(r.SHIFT_ID),
        shiftName: str(r.SHIFT_NAME),
        weekdayOvertimeCap: str(r.WEEKDAY_OVRTM_CAP),
        weekendOvertimeCap: str(r.WEEKEND_OVRTM_CAP),
        overtimeAllowed: str(r.OVERTIME_ALLOWED),
        excludeTimesheet: str(r.EXCLUDE_TIMESHEET),
      }));

      const shiftIds = [...new Set(timetables.map((t) => t.shiftId).filter((id) => id !== null))];
      let shiftDays: ShiftDay[] = [];
      if (shiftIds.length) {
        const binds = Object.fromEntries(shiftIds.map((id, i) => [`s${i}`, id]));
        const rows = await db.query(
          'adw',
          `SELECT SHIFT_PR_ID, DAY_NO, PUNCH_IN, PUNCH_OUT, GROSS_TIME FROM XX_DIGI_SHIFT_PR_DTL
            WHERE SHIFT_PR_ID IN (${shiftIds.map((_, i) => `:s${i}`).join(', ')})
              AND (STATUS = 'ACTIVE' OR STATUS IS NULL)
            ORDER BY SHIFT_PR_ID, DAY_NO, ID`,
          binds,
        );
        shiftDays = rows.map((r) => ({
          shiftId: num(r.SHIFT_PR_ID) ?? 0,
          dayNo: num(r.DAY_NO) ?? 0,
          punchIn: str(r.PUNCH_IN),
          punchOut: str(r.PUNCH_OUT),
          grossTime: str(r.GROSS_TIME),
        }));
      }

      const cardRows = await db.query(
        'adw',
        `SELECT TO_CHAR(ATT_DATE, 'YYYY-MM-DD') AS DAY, EMP_NAME, PUNCH_IN, PUNCH_OUT
           FROM XX_DIGI_ATT_ATT_CARD
          WHERE TO_CHAR(EMP_NO) = :empNo AND ${inRange('ATT_DATE')}
          ORDER BY ATT_DATE ASC, HEADER_ID ASC`,
        range,
      );
      const cards: CardRow[] = [];
      for (const r of cardRows) {
        const day = String(r.DAY);
        // ROWNUM = 1 after ORDER BY ATT_DATE, HEADER_ID: the first row of the day wins.
        if (!cards.some((c) => c.day === day))
          cards.push({
            day,
            empName: str(r.EMP_NAME),
            punchIn: str(r.PUNCH_IN),
            punchOut: str(r.PUNCH_OUT),
          });
      }

      const start = leaveDateExpression('LEAVE_START_DATE');
      const end = leaveDateExpression('LEAVE_END_DATE');
      const leaveRows = await db.query(
        'adw',
        `SELECT LEAVE_TYPE, START_DAY, END_DAY FROM (
           SELECT LEAVE_TYPE,
                  TO_CHAR(${start}, 'YYYY-MM-DD') AS START_DAY,
                  TO_CHAR(${end}, 'YYYY-MM-DD') AS END_DAY
             FROM XX_DIGI_EMP_ABSENCE_TYPE
            WHERE TO_CHAR(EMP_NO) = :empNo AND APPROVAL_STATUS = 'APPROVED')
          WHERE START_DAY <= :toDate AND END_DAY >= :fromDate`,
        range,
      );
      const leaves = leaveRows.map((r): LeaveRow => ({
        leaveType: str(r.LEAVE_TYPE),
        startDay: str(r.START_DAY),
        endDay: str(r.END_DAY),
      }));

      return { timetables, shiftDays, cards, leaves };
    },

    async existingDays(empNo, from, to) {
      const rows = await db.query(
        'adw',
        `SELECT DISTINCT TO_CHAR(TRUNC(ATT_DATE), 'YYYY-MM-DD') AS DAY FROM XX_DIGI_ATT_ATT_SHEET
          WHERE EMP_NO = :empNo AND ${inRange('ATT_DATE')}`,
        { empNo, fromDate: from, toDate: to },
      );
      return new Set(rows.map((r) => String(r.DAY)));
    },

    async saveRows(rows) {
      if (!rows.length) return;
      await db.transaction('adw', async (tx) => {
        await tx.execute('ALTER SESSION DISABLE PARALLEL DML');
        for (let offset = 0; offset < rows.length; offset += 100) {
          const batch = rows.slice(offset, offset + 100);
          const binds: Record<string, string | null> = {};
          const source = batch
            .map((row, i) => {
              const cols = Object.entries(row).map(([key, value]) => {
                binds[`${key.toLowerCase()}${i}`] = value;
                return key === 'ATT_DATE'
                  ? `TO_DATE(:att_date${i}, 'YYYY-MM-DD') AS ATT_DATE`
                  : `CAST(:${key.toLowerCase()}${i} AS VARCHAR2(240)) AS ${key}`;
              });
              return `SELECT ${cols.join(', ')} FROM DUAL`;
            })
            .join(' UNION ALL ');
          await tx.execute(
            `MERGE INTO XX_DIGI_ATT_ATT_SHEET t
             USING (${source}) s
             ON (t.EMP_NO = s.EMP_NO AND TRUNC(t.ATT_DATE) = s.ATT_DATE)
             WHEN MATCHED THEN UPDATE SET t.EMP_NAME = s.EMP_NAME, t.SHIFT = s.SHIFT,
               t.CHECK_IN = s.CHECK_IN, t.PUNCH_IN = s.PUNCH_IN, t.CHECK_OUT = s.CHECK_OUT,
               t.PUNCH_OUT = s.PUNCH_OUT, t.TOTAL_MINUTES = s.TOTAL_MINUTES, t.EARLY = s.EARLY,
               t.LATE = s.LATE, t.OVERTIME = s.OVERTIME, t.ABSENCE = s.ABSENCE
             WHEN NOT MATCHED THEN INSERT (EMP_NO, EMP_NAME, SHIFT, ATT_DATE, CHECK_IN, PUNCH_IN,
               CHECK_OUT, PUNCH_OUT, TOTAL_MINUTES, EARLY, LATE, OVERTIME, ABSENCE)
             VALUES (s.EMP_NO, s.EMP_NAME, s.SHIFT, s.ATT_DATE, s.CHECK_IN, s.PUNCH_IN,
               s.CHECK_OUT, s.PUNCH_OUT, s.TOTAL_MINUTES, s.EARLY, s.LATE, s.OVERTIME, s.ABSENCE)`,
            binds,
          );
        }
      });
    },
  };
}
