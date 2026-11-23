// Dashboard (CI3 Dashboard_model::get_dashboard_payload), limited to what the CI3 overview page
// shows. Counts are CI3's queries; row loops CI3 ran in PHP are aggregated in SQL, same results.
import { phpRound, type Dashboard } from '@attendance/shared';
import { num, str, type Db } from '../../db/oracle';
import { dMY, nowDMYTime } from '../../lib/csv';

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/**
 * CI3 build_current_payroll_period: ends on the latest processed date and starts on the 21st of
 * the month before it. PHP's modify('-1 month') overflows (31 Mar -> 3 Mar) like JS dates do.
 */
export function periodEndingOn(maxDate: string | null): Dashboard['period'] {
  const generatedAt = nowDMYTime();
  if (!maxDate) return { fromDate: '', toDate: '', fromLabel: '-', toLabel: '-', generatedAt };
  const [y, m, d] = maxDate.split('-').map(Number) as [number, number, number];
  const monthBefore = new Date(y, m - 2, d);
  const start = new Date(monthBefore.getFullYear(), monthBefore.getMonth(), 21);
  return {
    fromDate: iso(start),
    toDate: maxDate,
    fromLabel: dMY(iso(start))!,
    toLabel: dMY(maxDate)!,
    generatedAt,
  };
}

/** CI3 normalize_emp_no: digits lose leading zeros, anything else is upper-cased. */
export const normalizeEmpNo = (value: string) => {
  const text = value.trim();
  if (text === '') return '';
  return /^\d+$/.test(text) ? text.replace(/^0+(?=\d)/, '') : text.toUpperCase();
};

/** CI3 build_department_employee_list over the employee map (later rows win, first position kept). */
export function departmentHeadcount(rows: { empNo: string; department: string | null }[]) {
  const departmentOf = new Map<string, string>();
  for (const row of rows) {
    const empNo = normalizeEmpNo(row.empNo);
    if (empNo === '') continue;
    const department = (row.department ?? '').trim();
    departmentOf.set(empNo, department !== '' ? department : 'Unassigned');
  }
  const counts = new Map<string, number>();
  for (const department of departmentOf.values())
    counts.set(department, (counts.get(department) ?? 0) + 1);
  // usort by count descending; PHP 8 sorting is stable, like Array.prototype.sort.
  return [...counts]
    .map(([department, employeeCount]) => ({ department, employeeCount }))
    .sort((a, b) => b.employeeCount - a.employeeCount);
}

const SAFE_NUMERIC_OT = `CASE WHEN REGEXP_LIKE(TRIM(OVERTIME), '^-?[0-9]+(\\.[0-9]+)?$') THEN TO_NUMBER(TRIM(OVERTIME)) ELSE 0 END`;

export interface DashboardRepository {
  load(): Promise<Dashboard>;
}

export function oracleDashboardRepository(db: Db): DashboardRepository {
  const scalar = async (sql: string, binds = {}) => {
    const [row] = await db.query('adw', sql, binds);
    return row ? (num(Object.values(row)[0]) ?? 0) : 0;
  };

  return {
    async load() {
      const [maxRow] = await db.query(
        'adw',
        `SELECT TO_CHAR(MAX(TRUNC(ATT_DATE)), 'YYYY-MM-DD') AS MAX_DATE FROM XX_DIGI_ATT_ATT_SHEET`,
      );
      const period = periodEndingOn(str(maxRow?.MAX_DATE));
      const range = { fromDate: period.fromDate, toDate: period.toDate };
      const inPeriod = `TRUNC(ATT_DATE) BETWEEN TO_DATE(:fromDate, 'YYYY-MM-DD') AND TO_DATE(:toDate, 'YYYY-MM-DD')`;

      const [
        totalEmployees,
        assignedEmployees,
        missingTimetableEmployees,
        blankPunchEmployees,
        sheetRows,
        masterRows,
      ] = await Promise.all([
        scalar(`SELECT COUNT(1) AS TOTAL FROM XX_DIGI_EMP_MASTER WHERE CURRENT_EMP_FLAG = 'Y'`),
        // CI3 "employees_with_timetable" counts current employees.
        scalar(
          `SELECT COUNT(DISTINCT TO_CHAR(EMPLOYEE_NUMBER)) AS TOTAL FROM XX_DIGI_EMP_MASTER WHERE CURRENT_EMP_FLAG = 'Y'`,
        ),
        scalar(
          `SELECT COUNT(*) AS TOTAL FROM XX_DIGI_EMP_MASTER e
              WHERE e.CURRENT_EMP_FLAG = 'Y'
                AND NOT EXISTS (SELECT 1 FROM XX_DIGI_TIMETABLE_PR t
                                 WHERE TO_CHAR(t.EMP_NO) = TO_CHAR(e.EMPLOYEE_NUMBER)
                                   AND UPPER(TRIM(NVL(t.STATUS, 'ACTIVE'))) = 'ACTIVE')`,
        ),
        // CI3 "blank_punch_employees" counts distinct supervisors (kept; see the parity report).
        scalar(
          `SELECT COUNT(DISTINCT SUPERVISOR_NAME) AS TOTAL FROM XX_DIGI_EMP_MASTER
              WHERE CURRENT_EMP_FLAG = 'Y' AND SUPERVISOR_NAME IS NOT NULL`,
        ),
        db.query(
          'adw',
          `SELECT COUNT(DISTINCT TRIM(TO_CHAR(EMP_NO))) AS PROCESSED,
                    SUM(${SAFE_NUMERIC_OT}) AS OVERTIME_HOURS,
                    COUNT(DISTINCT CASE WHEN ${SAFE_NUMERIC_OT} > 0 THEN TRIM(TO_CHAR(EMP_NO)) END) AS WITH_OVERTIME
               FROM XX_DIGI_ATT_ATT_SHEET WHERE ${inPeriod}`,
          range,
        ),
        db.query(
          'adw',
          `SELECT TO_CHAR(EMPLOYEE_NUMBER) AS EMP_NO, FULL_NAME, DEPARTMENT
               FROM XX_DIGI_EMP_MASTER WHERE CURRENT_EMP_FLAG = 'Y'`,
        ),
      ]);

      const sheet = sheetRows[0] ?? {};
      const processedEmployees = num(sheet.PROCESSED) ?? 0;
      const coverage = Math.min(
        100,
        Math.round((processedEmployees / Math.max(1, assignedEmployees)) * 100),
      );
      const overtime = num(sheet.OVERTIME_HOURS) ?? 0;

      return {
        period,
        process: {
          coverage,
          processedEmployees,
          assignedEmployees,
          statusText: coverage >= 95 ? 'Ready for payroll review' : 'Processing attention required',
        },
        totalEmployees,
        missingTimetableEmployees,
        blankPunchEmployees,
        overtimeHours: phpRound(overtime, 2),
        employeesWithOvertime: num(sheet.WITH_OVERTIME) ?? 0,
        departments: departmentHeadcount(
          masterRows.map((r) => ({ empNo: str(r.EMP_NO) ?? '', department: str(r.DEPARTMENT) })),
        ),
      };
    },
  };
}
