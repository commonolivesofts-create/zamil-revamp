// Payroll File (CI3 Payroll_file_model::get_payroll_file_list and save_payroll_adjustment).
// The SQL is CI3's, verbatim, including its netting of overtime against late minutes (first per
// day, then again on the totals and on saved adjustments; see docs/parity/payroll-file.md).
import {
  pageMeta,
  type PayrollAdjustment,
  type PayrollFileFilters,
  type PayrollFileRow,
} from '@attendance/shared';
import { clean, type Db, type Row } from '../../db/oracle';
import {
  Binder,
  buildWhere,
  containsCi,
  equals,
  fromDay,
  toDay,
  type ListQuery,
  type ListSpec,
} from '../../db/sql';
import type { ReportRepository } from '../report';

const baseSpec: ListSpec<PayrollFileFilters> = {
  from: 'XX_DIGI_ATT_ATT_SHEET a',
  select: '',
  filters: {
    empNo: equals('a.EMP_NO'),
    empName: containsCi('a.EMP_NAME'),
    fromDate: fromDay('a.ATT_DATE'),
    toDate: toDay('a.ATT_DATE'),
  },
  search: ['TO_CHAR(a.EMP_NO)', 'a.EMP_NAME'],
  orderBy: '',
};

const baseSql = (where: string) => `
  SELECT a.EMP_NO, a.EMP_NAME,
    SUM(CASE WHEN TRIM(a.LATE) IS NOT NULL AND ((NVL(a.OVERTIME,0)*60)-(a.LATE)) < 0
             THEN ABS((NVL(a.OVERTIME,0)*60)-(a.LATE)) ELSE 0 END) AS LATE,
    SUM(CASE WHEN TRIM(a.EARLY) IS NOT NULL THEN TO_NUMBER(a.EARLY) ELSE 0 END) AS EARLY,
    SUM(CASE WHEN TRIM(a.LATE) IS NOT NULL AND ((NVL(a.OVERTIME,0)*60)-(a.LATE)) < 0
             THEN ABS((NVL(a.OVERTIME,0)*60)-(a.LATE)) ELSE 0 END
        + CASE WHEN TRIM(a.EARLY) IS NOT NULL THEN TO_NUMBER(a.EARLY) ELSE 0 END) AS TOT_DELAY,
    SUM(CASE WHEN (NVL(a.OVERTIME,0)*60)-(a.LATE) >= 0
             THEN ROUND(((NVL(a.OVERTIME,0)*60)-(a.LATE))/60,2) ELSE 0 END) AS OVERTIME_HRS,
    SUM(CASE WHEN UPPER(TRIM(a.ABSENCE)) = 'ABSENCE WITHOUT PERMISSION' THEN 1 ELSE 0 END) AS ABSENCE_WO
  FROM XX_DIGI_ATT_ATT_SHEET a${where}
  GROUP BY a.EMP_NO, a.EMP_NAME`;

/** Outer netting with a saved adjustment for exactly this date range (CI3 "date range" branch). */
const withAdjustment = (base: string, from: string, to: string) => {
  const ot = 'NVL(TO_NUMBER(adj.OVERTIME_HRS), b.OVERTIME_HRS)';
  const late = 'NVL(TO_NUMBER(adj.LATE), b.LATE)';
  const early = 'NVL(TO_NUMBER(adj.EARLY), b.EARLY)';
  const net = `(${ot} * 60 - ${late})`;
  const newLate = `CASE WHEN ${net} >= 0 THEN 0 ELSE ABS(${net}) END`;
  return `
  SELECT b.EMP_NO, NVL(adj.EMP_NAME, b.EMP_NAME) AS EMP_NAME,
    TO_CHAR(${newLate}) AS LATE,
    TO_CHAR(${early}) AS EARLY,
    TO_CHAR(${newLate} + ${early}) AS TOT_DELAY,
    TO_CHAR(CASE WHEN ${net} >= 0 THEN ${net} / 60 ELSE 0 END) AS OVERTIME_HRS,
    TO_CHAR(NVL(TO_NUMBER(adj.ABSENCE_WO), b.ABSENCE_WO)) AS ABSENCE_WO
  FROM (${base}) b
  LEFT JOIN XX_DIGI_ATT_PYRL_FILE_ADJ adj
    ON adj.EMP_NO = b.EMP_NO
   AND TRUNC(adj.FROM_DATE) = TO_DATE(${from}, 'YYYY-MM-DD')
   AND TRUNC(adj.TO_DATE) = TO_DATE(${to}, 'YYYY-MM-DD')
  ORDER BY b.EMP_NO`;
};

/** Outer netting without adjustments (CI3 "no date range" branch). */
const withoutAdjustment = (base: string) => {
  const net = '(b.OVERTIME_HRS * 60 - b.LATE)';
  const newLate = `CASE WHEN ${net} >= 0 THEN 0 ELSE ABS(${net}) END`;
  return `
  SELECT b.EMP_NO, b.EMP_NAME,
    TO_CHAR(${newLate}) AS LATE,
    TO_CHAR(b.EARLY) AS EARLY,
    TO_CHAR(${newLate} + b.EARLY) AS TOT_DELAY,
    TO_CHAR(CASE WHEN ${net} >= 0 THEN ${net} / 60 ELSE 0 END) AS OVERTIME_HRS,
    TO_CHAR(b.ABSENCE_WO) AS ABSENCE_WO
  FROM (${base}) b
  ORDER BY b.EMP_NO`;
};

function buildPayrollSql(query: ListQuery<PayrollFileFilters>) {
  const b = new Binder();
  const base = baseSql(buildWhere(baseSpec, query, b));
  const countSql = `SELECT COUNT(1) AS TOTAL FROM (${base}) x`;
  const countBinds = { ...b.binds };
  const { fromDate, toDate } = query.filters;
  const sql =
    fromDate && toDate
      ? withAdjustment(base, b.add(fromDate), b.add(toDate))
      : withoutAdjustment(base);
  return { countSql, countBinds, sql, b };
}

export const mapPayrollRow = (row: Row): PayrollFileRow => ({
  empNo: clean(row.EMP_NO),
  empName: clean(row.EMP_NAME),
  late: clean(row.LATE),
  early: clean(row.EARLY),
  totDelay: clean(row.TOT_DELAY),
  overtimeHrs: clean(row.OVERTIME_HRS),
  absenceWo: clean(row.ABSENCE_WO),
});

export interface PayrollFileRepository extends ReportRepository<
  PayrollFileFilters,
  PayrollFileRow
> {
  saveAdjustment(input: PayrollAdjustment): Promise<void>;
}

export function oraclePayrollFileRepository(db: Db): PayrollFileRepository {
  return {
    async list(query) {
      const { countSql, countBinds, sql, b } = buildPayrollSql(query);
      const offset = b.add((query.page - 1) * query.limit);
      const limit = b.add(query.limit);
      const [countRows, rows] = await Promise.all([
        db.query('adw', countSql, countBinds),
        db.query('adw', `${sql} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`, b.binds),
      ]);
      return {
        items: rows.map(mapPayrollRow),
        pagination: pageMeta(query.page, query.limit, Number(countRows[0]?.TOTAL ?? 0)),
      };
    },

    async exportRows(query) {
      const { sql, b } = buildPayrollSql(query);
      return (await db.query('adw', sql, b.binds)).map(mapPayrollRow);
    },

    async saveAdjustment(input) {
      await db.transaction('adw', async (tx) => {
        await tx.execute('ALTER SESSION DISABLE PARALLEL DML');
        await tx.execute(
          `MERGE INTO XX_DIGI_ATT_PYRL_FILE_ADJ t
           USING (SELECT :empNo AS EMP_NO, :empName AS EMP_NAME,
                         TO_DATE(:fromDate, 'YYYY-MM-DD') AS FROM_DATE, TO_DATE(:toDate, 'YYYY-MM-DD') AS TO_DATE,
                         :late AS LATE, :early AS EARLY, :totDelay AS TOT_DELAY,
                         :overtimeHrs AS OVERTIME_HRS, :absenceWo AS ABSENCE_WO FROM DUAL) s
           ON (t.EMP_NO = s.EMP_NO AND TRUNC(t.FROM_DATE) = s.FROM_DATE AND TRUNC(t.TO_DATE) = s.TO_DATE)
           WHEN MATCHED THEN UPDATE SET t.EMP_NAME = s.EMP_NAME, t.LATE = s.LATE, t.EARLY = s.EARLY,
             t.TOT_DELAY = s.TOT_DELAY, t.OVERTIME_HRS = s.OVERTIME_HRS, t.ABSENCE_WO = s.ABSENCE_WO,
             t.UPDATED_AT = SYSTIMESTAMP
           WHEN NOT MATCHED THEN INSERT (EMP_NO, EMP_NAME, FROM_DATE, TO_DATE, LATE, EARLY, TOT_DELAY,
             OVERTIME_HRS, ABSENCE_WO, CREATED_AT, UPDATED_AT)
           VALUES (s.EMP_NO, s.EMP_NAME, s.FROM_DATE, s.TO_DATE, s.LATE, s.EARLY, s.TOT_DELAY,
             s.OVERTIME_HRS, s.ABSENCE_WO, SYSTIMESTAMP, SYSTIMESTAMP)`,
          {
            empNo: input.empNo,
            empName: input.empName,
            fromDate: input.fromDate,
            toDate: input.toDate,
            late: input.late,
            early: input.early,
            totDelay: input.totDelay,
            overtimeHrs: input.overtimeHrs,
            absenceWo: input.absenceWo,
          },
        );
      });
    },
  };
}
