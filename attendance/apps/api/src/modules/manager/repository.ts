// Manager View (CI3 Manager_model::get_team_overview / update_absence_approval).
// Team, approved leave and pending requests come from ADW; today's punches and this period's late
// days / overtime from the biometric tables in EBS. CI3 pasted employee numbers into the SQL; here
// they are bind variables (same rows).
import type { EbsSource } from '../../db/ebsSource';
import { clean, num, type Db, type Row } from '../../db/oracle';
import { inBinds } from '../../db/sql';

export interface TeamMember {
  empNo: string;
  fullName: string | null;
  jobTitle: string | null;
}

export interface PendingRequest {
  empNo: string;
  fullName: string | null;
  leaveType: string | null;
  leaveStartDate: string;
  leaveEndDate: string;
  totalDays: string | null;
  approvalStatus: string | null;
}

export interface PeriodPunchRow {
  empNo: string;
  late: number;
  dutyDuration: number;
  totalWorked: number;
}

export interface ManagerRepository {
  team(userId: number): Promise<TeamMember[]>;
  todayPunches(
    day: string,
    empNos: string[],
  ): Promise<Map<string, { punchIn: string | null; punchOut: string | null }>>;
  periodPunches(from: string, to: string, empNos: string[]): Promise<PeriodPunchRow[]>;
  approvedLeaveDays(
    userId: number,
    from: string,
    to: string,
    empNos: string[],
  ): Promise<Map<string, number>>;
  pendingRequests(userId: number): Promise<PendingRequest[]>;
  /** Sets APPROVAL_STATUS on the matching request; returns the number of rows changed. */
  decide(empNo: string, start: string, end: string, status: 'APPROVED' | 'DENIED'): Promise<number>;
}

// Oracle allows 1,000 items in an IN list.
const chunks = <T>(items: T[], size = 900) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

const TEAM_OF_USER = `SELECT DISTINCT EMPLOYEE_ID FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId`;
// Fixed (as in the Absence report): unparsable leave dates no longer fail the query.
const leaveDate = (column: string) =>
  `TO_DATE(${column} DEFAULT NULL ON CONVERSION ERROR, 'DD-MM-RR')`;

export function oracleManagerRepository(db: Db, source: EbsSource): ManagerRepository {
  const t = source.tables;
  return {
    async team(userId) {
      const rows = await db.query(
        'adw',
        `SELECT TO_CHAR(EMPLOYEE_NUMBER) AS EMP_NO, FULL_NAME, JOB_TITLE, DEPARTMENT
           FROM XX_DIGI_EMP_MASTER
          WHERE SUPERVISOR_ID IN (${TEAM_OF_USER})
            AND CURRENT_EMP_FLAG = 'Y'
          ORDER BY FULL_NAME`,
        { userId },
      );
      return rows
        .map((r) => ({
          empNo: (clean(r.EMP_NO) ?? '').trim(),
          fullName: clean(r.FULL_NAME),
          jobTitle: clean(r.JOB_TITLE),
        }))
        .filter((r) => r.empNo !== '');
    },

    async todayPunches(day, empNos) {
      const result = new Map<string, { punchIn: string | null; punchOut: string | null }>();
      for (const part of chunks(empNos)) {
        const list = inBinds('e', part);
        const rows = await db.query(
          source.pool,
          `SELECT EMP_CODE AS EMP_NO, NAME, MIN(TIME) AS PUNCH_IN, MAX(TIME) AS PUNCH_OUT
             FROM (SELECT ICT.EMP_CODE, PE.FIRST_NAME || ' ' || PE.LAST_NAME AS NAME,
                          TO_CHAR(ICT.PUNCH_TIME, 'HH24:MI:SS') AS TIME
                     FROM ${t.iclockTransaction} ICT
                     JOIN ${t.personnelEmployee} PE ON PE.EMP_CODE = ICT.EMP_CODE
                    WHERE ICT.PUNCH_TIME >= TO_DATE(:day, 'YYYY-MM-DD')
                      AND ICT.PUNCH_TIME < TO_DATE(:day, 'YYYY-MM-DD') + 1
                      AND ICT.EMP_CODE IN (${list.sql}))
            GROUP BY EMP_CODE, NAME`,
          { day, ...list.binds },
        );
        for (const r of rows) {
          result.set((clean(r.EMP_NO) ?? '').trim(), {
            punchIn: clean(r.PUNCH_IN),
            punchOut: clean(r.PUNCH_OUT),
          });
        }
      }
      return result;
    },

    async periodPunches(from, to, empNos) {
      const out: PeriodPunchRow[] = [];
      for (const part of chunks(empNos)) {
        const list = inBinds('e', part);
        const rows = await db.query(
          source.pool,
          `SELECT PE.EMP_CODE AS EMP_NO, ATP.ATT_DATE, ATP.CLOCK_IN, ATP.CLOCK_OUT,
                  NVL(ATP.LATE, 0) AS LATE, NVL(ATP.DUTY_DURATION, 0) AS DUTY_DURATION,
                  NVL(ATP.TOTAL_WORKED, 0) AS TOTAL_WORKED
             FROM ${t.attPayloadbase} ATP
             JOIN ${t.personnelEmployee} PE ON PE.ID = ATP.EMP_ID
            WHERE ATP.ATT_DATE BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')
              AND PE.EMP_CODE IN (${list.sql})
            ORDER BY PE.EMP_CODE, ATP.ATT_DATE`,
          { fromDate: from, toDate: to, ...list.binds },
        );
        for (const r of rows) {
          out.push({
            empNo: (clean(r.EMP_NO) ?? '').trim(),
            late: num(r.LATE) ?? 0,
            dutyDuration: num(r.DUTY_DURATION) ?? 0,
            totalWorked: num(r.TOTAL_WORKED) ?? 0,
          });
        }
      }
      return out;
    },

    async approvedLeaveDays(userId, from, to, empNos) {
      const days = new Map<string, number>();
      for (const part of chunks(empNos)) {
        const list = inBinds('e', part);
        const rows = await db.query(
          'adw',
          `SELECT a.EMP_NO, SUM(NVL(a.TOTAL_DAYS, 0)) AS ABSENCE_DAYS
             FROM XX_DIGI_EMP_ABSENCE_TYPE a
             JOIN XX_DIGI_EMP_MASTER e ON e.EMPLOYEE_NUMBER = a.EMP_NO
            WHERE e.SUPERVISOR_ID IN (SELECT EMPLOYEE_ID FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId)
              AND UPPER(TRIM(a.APPROVAL_STATUS)) = 'APPROVED'
              AND ${leaveDate('a.LEAVE_START_DATE')} <= TO_DATE(:toDate, 'YYYY-MM-DD')
              AND ${leaveDate('a.LEAVE_END_DATE')} >= TO_DATE(:fromDate, 'YYYY-MM-DD')
              AND a.EMP_NO IN (${list.sql})
            GROUP BY a.EMP_NO`,
          { userId, fromDate: from, toDate: to, ...list.binds },
        );
        for (const r of rows) {
          const empNo = (clean(r.EMP_NO) ?? '').trim();
          if (empNo) days.set(empNo, num(r.ABSENCE_DAYS) ?? 0);
        }
      }
      return days;
    },

    async pendingRequests(userId) {
      const rows = await db.query(
        'adw',
        `SELECT a.EMP_NO, e.FULL_NAME, a.LEAVE_TYPE, a.LEAVE_START_DATE, a.LEAVE_END_DATE,
                TO_CHAR(a.TOTAL_DAYS) AS TOTAL_DAYS, a.APPROVAL_STATUS
           FROM XX_DIGI_EMP_MASTER e
           JOIN XX_DIGI_EMP_ABSENCE_TYPE a ON e.EMPLOYEE_NUMBER = a.EMP_NO
          WHERE e.SUPERVISOR_ID IN (SELECT EMPLOYEE_ID FROM XX_DIGI_EMP_MASTER WHERE USER_ID = :userId)
            AND UPPER(a.APPROVAL_STATUS) = 'AWAITING'
          ORDER BY a.LEAVE_START_DATE ASC`,
        { userId },
      );
      return rows.map((r: Row) => ({
        empNo: (clean(r.EMP_NO) ?? '').trim(),
        fullName: clean(r.FULL_NAME),
        leaveType: clean(r.LEAVE_TYPE),
        leaveStartDate: (clean(r.LEAVE_START_DATE) ?? '').trim(),
        leaveEndDate: (clean(r.LEAVE_END_DATE) ?? '').trim(),
        totalDays: clean(r.TOTAL_DAYS),
        approvalStatus: clean(r.APPROVAL_STATUS),
      }));
    },

    async decide(empNo, start, end, status) {
      const result = await db.execute(
        'adw',
        `UPDATE XX_DIGI_EMP_ABSENCE_TYPE SET APPROVAL_STATUS = :status
          WHERE TRIM(EMP_NO) = :empNo AND TRIM(LEAVE_START_DATE) = :startDate
            AND TRIM(LEAVE_END_DATE) = :endDate AND UPPER(APPROVAL_STATUS) = 'AWAITING'`,
        { status, empNo, startDate: start, endDate: end },
      );
      return result.rowsAffected;
    },
  };
}
