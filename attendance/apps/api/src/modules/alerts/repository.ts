// Alerts & Exceptions (CI3 Alerts_exceptions_model): six exception queries over the processed
// sheet, the punches and the timetables, unioned and filtered. SQL as CI3 except the high-overtime
// rule, which compared OVERTIME (hours) with a threshold in minutes and so never fired (Fixed).
import { ALERTS_OVERTIME_THRESHOLD, type AlertRow, type AlertSummary } from '@attendance/shared';
import { clean, num, type Binds, type Db, type Row } from '../../db/oracle';

export interface ResolvedAlertFilters {
  fromDate: string;
  toDate: string;
  type: string;
  severity: string;
}

const NUMERIC_OVERTIME = `CASE WHEN REGEXP_LIKE(TRIM(NVL(s.OVERTIME, '0')), '^-{0,1}[0-9]+(\\.[0-9]+){0,1}$')
  THEN TO_NUMBER(TRIM(s.OVERTIME)) ELSE 0 END`;
// Fixed: OVERTIME is stored in hours; the threshold and the message are in minutes.
const OVERTIME_MINUTES = `(${NUMERIC_OVERTIME}) * 60`;

const sheetColumns = (
  type: string,
  label: string,
  severity: string,
  sort: number,
  shift: string,
) => `
  SELECT '${type}' AS EXCEPTION_TYPE, '${label}' AS EXCEPTION_LABEL, '${severity}' AS SEVERITY,
         ${sort} AS SEVERITY_SORT, s.HEADER_ID AS SOURCE_ID, TO_CHAR(s.EMP_NO) AS EMP_NO,
         NVL(TRIM(s.EMP_NAME), TRIM(e.FULL_NAME)) AS EMP_NAME,
         NVL(TRIM(e.DEPARTMENT), 'Not Assigned') AS DEPARTMENT, ${shift} AS SHIFT,
         TRUNC(s.ATT_DATE) AS ATT_DATE_VALUE, TO_CHAR(TRUNC(s.ATT_DATE), 'DD Mon YYYY') AS ATT_DATE_DISPLAY,
         s.PUNCH_IN, s.PUNCH_OUT, s.LATE, s.OVERTIME, s.ABSENCE`;
const SHEET_FROM = `
  FROM XX_DIGI_ATT_ATT_SHEET s
  LEFT JOIN XX_DIGI_EMP_MASTER e ON TO_CHAR(e.EMPLOYEE_NUMBER) = TO_CHAR(s.EMP_NO)
  WHERE TRUNC(s.ATT_DATE) BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')`;
const SHIFT_OR_DASH = "NVL(TRIM(s.SHIFT), '-')";

const EXCEPTIONS_SQL = `
  ${sheetColumns('missing_punch', 'Missing Punch', 'High', 1, SHIFT_OR_DASH)},
    'Only one attendance punch is available.' AS DETAILS
  ${SHEET_FROM}
    AND ((s.PUNCH_IN IS NULL AND s.PUNCH_OUT IS NOT NULL) OR (s.PUNCH_IN IS NOT NULL AND s.PUNCH_OUT IS NULL))
  UNION ALL
  ${sheetColumns('same_punch', 'Same Punch', 'Medium', 2, SHIFT_OR_DASH)},
    'Punch-in and punch-out contain the same time.'
  ${SHEET_FROM}
    AND s.PUNCH_IN IS NOT NULL AND s.PUNCH_OUT IS NOT NULL AND TRIM(s.PUNCH_IN) = TRIM(s.PUNCH_OUT)
  UNION ALL
  ${sheetColumns('missing_shift', 'Missing Shift', 'High', 1, "'-'")},
    'Attendance row does not contain a shift.'
  ${SHEET_FROM}
    AND (s.SHIFT IS NULL OR TRIM(s.SHIFT) IS NULL)
  UNION ALL
  ${sheetColumns('missing_occasion', 'Missing Occasion', 'High', 1, SHIFT_OR_DASH)},
    'Attendance is marked as holiday or occasion, ' || 'but no active occasion covers this date.'
  ${SHEET_FROM}
    AND (UPPER(TRIM(s.ABSENCE)) LIKE '%OCCASION%' OR UPPER(TRIM(s.ABSENCE)) LIKE '%HOLIDAY%')
    AND NOT EXISTS (SELECT 1 FROM XX_DIGI_ATT_OCCASIONS o
                     WHERE UPPER(TRIM(NVL(o.IS_ACTIVE, 'N'))) = 'Y'
                       AND TRUNC(s.ATT_DATE) BETWEEN TRUNC(o.FROM_DATE) AND TRUNC(o.TO_DATE))
  UNION ALL
  ${sheetColumns('high_overtime', 'High Overtime', 'Medium', 2, SHIFT_OR_DASH)},
    'Overtime is ' || TO_CHAR(${OVERTIME_MINUTES}) || ' minute(s).'
  ${SHEET_FROM}
    AND ${OVERTIME_MINUTES} >= :threshold
  UNION ALL
  SELECT 'missing_timetable', 'Missing Timetable', 'High', 1, a.HEADER_ID, TO_CHAR(a.EMP_NO),
         NVL(TRIM(a.EMP_NAME), TRIM(e.FULL_NAME)), NVL(TRIM(e.DEPARTMENT), 'Not Assigned'), '-',
         TRUNC(a.ATT_DATE), TO_CHAR(TRUNC(a.ATT_DATE), 'DD Mon YYYY'), a.PUNCH_IN, a.PUNCH_OUT,
         NULL, NULL, NULL,
         'No active timetable assignment exists ' || 'for this employee and attendance date.'
    FROM XX_DIGI_ATT_ATT_CARD a
    LEFT JOIN XX_DIGI_EMP_MASTER e ON TO_CHAR(e.EMPLOYEE_NUMBER) = TO_CHAR(a.EMP_NO)
   WHERE TRUNC(a.ATT_DATE) BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')
     AND NOT EXISTS (SELECT 1 FROM XX_DIGI_TIMETABLE_PR t
                      WHERE TO_CHAR(t.EMP_NO) = TO_CHAR(a.EMP_NO)
                        AND UPPER(TRIM(NVL(t.STATUS, 'ACTIVE'))) = 'ACTIVE'
                        AND (t.START_DATE IS NULL OR TRUNC(t.START_DATE) <= TRUNC(a.ATT_DATE))
                        AND (t.END_DATE IS NULL OR TRUNC(t.END_DATE) >= TRUNC(a.ATT_DATE)))`;

/** The union with the type/severity filters (CI3 build_query with detailed filters). */
function filtered(filters: ResolvedAlertFilters, detailed: boolean) {
  const binds: Binds = {
    fromDate: filters.fromDate,
    toDate: filters.toDate,
    threshold: ALERTS_OVERTIME_THRESHOLD,
  };
  const where: string[] = [];
  if (detailed && filters.type) {
    where.push('EXCEPTION_TYPE = :type');
    binds.type = filters.type;
  }
  if (detailed && filters.severity) {
    where.push('UPPER(SEVERITY) = :severity');
    binds.severity = filters.severity.toUpperCase();
  }
  const sql = where.length
    ? `SELECT * FROM (${EXCEPTIONS_SQL}) all_exceptions WHERE ${where.join(' AND ')}`
    : EXCEPTIONS_SQL;
  return { sql, binds };
}

const mapAlertRow = (row: Row): AlertRow => ({
  exceptionType: String(row.EXCEPTION_TYPE),
  exceptionLabel: String(row.EXCEPTION_LABEL),
  severity: String(row.SEVERITY),
  empNo: clean(row.EMP_NO),
  empName: clean(row.EMP_NAME),
  department: clean(row.DEPARTMENT),
  shift: clean(row.SHIFT),
  attDate: clean(row.ATT_DATE),
  attDateDisplay: clean(row.ATT_DATE_DISPLAY),
  punchIn: clean(row.PUNCH_IN),
  punchOut: clean(row.PUNCH_OUT),
  overtime: clean(row.OVERTIME),
  absence: clean(row.ABSENCE),
  details: clean(row.DETAILS),
});

export interface AlertsRepository {
  summary(filters: ResolvedAlertFilters): Promise<AlertSummary>;
  count(filters: ResolvedAlertFilters): Promise<number>;
  /** limit 0 = every row (export). */
  rows(filters: ResolvedAlertFilters, limit: number, offset: number): Promise<AlertRow[]>;
}

export function oracleAlertsRepository(db: Db): AlertsRepository {
  return {
    async summary(filters) {
      // CI3 get_summary: dates only; the type and severity filters do not change the cards.
      const { sql, binds } = filtered(filters, false);
      const count = (condition: string) => `NVL(SUM(CASE WHEN ${condition} THEN 1 ELSE 0 END), 0)`;
      const [row = {}] = await db.query(
        'adw',
        `SELECT COUNT(1) AS TOTAL,
                ${count("SEVERITY = 'High'")} AS HIGH_COUNT,
                ${count("SEVERITY = 'Medium'")} AS MEDIUM_COUNT,
                ${count("SEVERITY = 'Low'")} AS LOW_COUNT,
                ${count("EXCEPTION_TYPE = 'missing_punch'")} AS MISSING_PUNCH,
                ${count("EXCEPTION_TYPE = 'same_punch'")} AS SAME_PUNCH,
                ${count("EXCEPTION_TYPE = 'missing_shift'")} AS MISSING_SHIFT,
                ${count("EXCEPTION_TYPE = 'missing_occasion'")} AS MISSING_OCCASION,
                ${count("EXCEPTION_TYPE = 'high_overtime'")} AS HIGH_OVERTIME,
                ${count("EXCEPTION_TYPE = 'missing_timetable'")} AS MISSING_TIMETABLE
           FROM (${sql}) exception_data`,
        binds,
      );
      const n = (key: string) => num(row[key]) ?? 0;
      return {
        total: n('TOTAL'),
        high: n('HIGH_COUNT'),
        medium: n('MEDIUM_COUNT'),
        low: n('LOW_COUNT'),
        missingPunch: n('MISSING_PUNCH'),
        samePunch: n('SAME_PUNCH'),
        missingShift: n('MISSING_SHIFT'),
        missingOccasion: n('MISSING_OCCASION'),
        highOvertime: n('HIGH_OVERTIME'),
        missingTimetable: n('MISSING_TIMETABLE'),
      };
    },

    async count(filters) {
      const { sql, binds } = filtered(filters, true);
      const [row] = await db.query(
        'adw',
        `SELECT COUNT(1) AS CNT FROM (${sql}) exception_count`,
        binds,
      );
      return num(row?.CNT) ?? 0;
    },

    async rows(filters, limit, offset) {
      const { sql, binds } = filtered(filters, true);
      const page = limit > 0 ? ' OFFSET :offset ROWS FETCH NEXT :limit ROWS ONLY' : '';
      const rows = await db.query(
        'adw',
        `SELECT exception_data.*, TO_CHAR(ATT_DATE_VALUE, 'YYYY-MM-DD') AS ATT_DATE
           FROM (${sql}) exception_data
          ORDER BY SEVERITY_SORT, ATT_DATE_VALUE DESC, EMP_NAME, EMP_NO${page}`,
        limit > 0 ? { ...binds, offset, limit } : binds,
      );
      return rows.map(mapAlertRow);
    },
  };
}
