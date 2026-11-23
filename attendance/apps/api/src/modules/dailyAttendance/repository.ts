// Daily Attendance (CI3 Daily_attendance_model::get_daily_attendance / get_summary) over the
// biometric tables in EBS. The SQL is CI3's; the summary is counted in SQL instead of loading every
// row into PHP (same figures).
import type { DailyAttendanceRow } from '@attendance/shared';
import type { EbsSource } from '../../db/ebsSource';
import { clean, num, type Binds, type Db, type Row } from '../../db/oracle';
import { escapeLike, rownumPage } from '../../db/sql';

export interface DailyAttendanceQuery {
  fromDate: string;
  toDate: string;
  search: string;
}

export interface DailyAttendanceRepository {
  total(query: DailyAttendanceQuery): Promise<number>;
  page(query: DailyAttendanceQuery, page: number, limit: number): Promise<DailyAttendanceRow[]>;
  all(query: DailyAttendanceQuery): Promise<DailyAttendanceRow[]>;
  summary(
    query: DailyAttendanceQuery,
  ): Promise<{ checkedIn: number; missingPunch: number; scheduled: number }>;
}

export function dailyAttendanceSql(source: EbsSource, query: DailyAttendanceQuery) {
  const t = source.tables;
  const binds: Binds = { fromDate: query.fromDate, toDate: query.toDate };
  let search = '';
  if (query.search) {
    // Fixed: LIKE wildcards in the search match literally (CI3 let % and _ act as wildcards).
    search = ` AND (UPPER(NAME) LIKE UPPER(:searchLike) ESCAPE '\\' OR TO_CHAR(EMP_CODE) = :searchExact)`;
    binds.searchLike = `%${escapeLike(query.search)}%`;
    binds.searchExact = query.search;
  }
  const sql = `
    SELECT EMP_CODE AS EMP_NO, NAME AS EMP_NAME, TO_CHAR(TDATE, 'DD-MON-YYYY') AS ATT_DATE_DISPLAY,
           MIN(TIME) AS PUNCH_IN, MAX(TIME) AS PUNCH_OUT, TO_CHAR(WORK_TIME) AS WORK_TIME
      FROM (
        SELECT DISTINCT ICT.EMP_CODE,
               (SELECT FIRST_NAME || ' ' || LAST_NAME FROM ${t.personnelEmployee} WHERE EMP_CODE = ICT.EMP_CODE) AS NAME,
               TRUNC(ICT.PUNCH_TIME) AS TDATE,
               TO_CHAR(ICT.PUNCH_TIME, 'HH24:MI:SS') AS TIME,
               ATP.DUTY_DURATION / 3600 AS WORK_TIME
          FROM ${t.iclockTransaction} ICT
          JOIN ${t.personnelEmployee} PE ON ICT.EMP_CODE = PE.EMP_CODE
          LEFT JOIN ${t.xxTimetable} XTM ON PE.EMP_CODE = XTM.EMP_CODE
          LEFT JOIN ${t.attPayloadbase} ATP ON PE.ID = ATP.EMP_ID
               AND TO_CHAR(ICT.PUNCH_TIME, 'DD-MON-YY') = ATP.ATT_DATE
      )
     WHERE TDATE BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')${search}
     GROUP BY EMP_CODE, NAME, TDATE, WORK_TIME
     ORDER BY TDATE ASC, EMP_CODE ASC`;
  return { sql, binds };
}

const mapRow = (row: Row): DailyAttendanceRow => ({
  empNo: clean(row.EMP_NO),
  empName: clean(row.EMP_NAME),
  attDateDisplay: clean(row.ATT_DATE_DISPLAY),
  punchIn: clean(row.PUNCH_IN),
  punchOut: clean(row.PUNCH_OUT),
  workTime: clean(row.WORK_TIME),
});

export function dailyAttendanceRepository(db: Db, source: EbsSource): DailyAttendanceRepository {
  return {
    async total(query) {
      const { sql, binds } = dailyAttendanceSql(source, query);
      const [row] = await db.query(source.pool, `SELECT COUNT(*) AS TOTAL FROM (${sql})`, binds);
      return num(row?.TOTAL) ?? 0;
    },
    async page(query, page, limit) {
      const { sql, binds } = dailyAttendanceSql(source, query);
      const paged = rownumPage(sql, page, limit);
      return (await db.query(source.pool, paged.sql, { ...binds, ...paged.binds })).map(mapRow);
    },
    async all(query) {
      const { sql, binds } = dailyAttendanceSql(source, query);
      return (await db.query(source.pool, sql, binds)).map(mapRow);
    },
    async summary(query) {
      const { sql, binds } = dailyAttendanceSql(source, query);
      const [counts, scheduled] = await Promise.all([
        db.query(
          source.pool,
          `SELECT COUNT(*) AS CHECKED_IN,
                  SUM(CASE WHEN PUNCH_IN IS NOT NULL AND PUNCH_IN = PUNCH_OUT THEN 1 ELSE 0 END) AS MISSING_PUNCH
             FROM (${sql})`,
          binds,
        ),
        db.query(
          source.pool,
          `SELECT COUNT(DISTINCT EMP_CODE) AS CNT FROM ${source.tables.xxTimetable}`,
        ),
      ]);
      return {
        checkedIn: num(counts[0]?.CHECKED_IN) ?? 0,
        missingPunch: num(counts[0]?.MISSING_PUNCH) ?? 0,
        scheduled: num(scheduled[0]?.CNT) ?? 0,
      };
    },
  };
}
