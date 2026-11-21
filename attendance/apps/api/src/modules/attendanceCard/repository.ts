// Attendance Card list and import into XX_DIGI_ATT_ATT_CARD (CI3: Attendance_card_model).
import {
  formatPunch,
  type AttendanceCardFilters,
  type AttendanceCardRow,
  type UploadRow,
} from '@attendance/shared';
import { str, type Db, type Row } from '../../db/oracle';
import { containsCi, onDay, type ListSpec } from '../../db/sql';
import { oracleReportRepository } from '../report';

export const attendanceCardListSpec: ListSpec<AttendanceCardFilters> = {
  from: 'XX_DIGI_ATT_ATT_CARD a',
  select: `TO_CHAR(a.EMP_NO) AS EMP_NO, a.EMP_NAME, TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD') AS ATT_DATE,
    a.PUNCH_IN, a.PUNCH_OUT`,
  filters: {
    empNo: containsCi('TO_CHAR(a.EMP_NO)'),
    empName: containsCi('a.EMP_NAME'),
    attDate: onDay('a.ATT_DATE'),
  },
  search: ['TO_CHAR(a.EMP_NO)', 'a.EMP_NAME', "TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD')"],
  orderBy: 'a.ATT_DATE DESC, a.EMP_NO ASC',
};

export const mapAttendanceCardRow = (row: Row): AttendanceCardRow => ({
  empNo: str(row.EMP_NO),
  empName: str(row.EMP_NAME),
  attDate: str(row.ATT_DATE),
  punchIn: formatPunch(str(row.PUNCH_IN)),
  punchOut: formatPunch(str(row.PUNCH_OUT)),
});

export const attendanceCardListRepository = (db: Db) =>
  oracleReportRepository(db, 'adw', attendanceCardListSpec, mapAttendanceCardRow);

export interface ImportOutcome {
  insertedRows: number;
  updatedRows: number;
  skipped: { row: number; empNo: string; message: string }[];
}

export interface AttendanceImporter {
  importRows(rows: UploadRow[]): Promise<ImportOutcome>;
}

const CHUNK = 500;
const BATCH = 200;

const chunks = <T>(items: T[], size: number) =>
  Array.from({ length: Math.ceil(items.length / size) }, (_, i) =>
    items.slice(i * size, (i + 1) * size),
  );

const inList = (prefix: string, values: string[]) => {
  const binds = Object.fromEntries(values.map((value, i) => [`${prefix}${i}`, value]));
  return { sql: values.map((_, i) => `:${prefix}${i}`).join(', '), binds };
};

/**
 * Same steps as CI3 import_attendance_card_rows: keep only employees active in the employee
 * master (their master name replaces the file name), then MERGE on employee + date in batches of
 * 200, all in one transaction (any failure rolls back the whole file).
 */
export function oracleAttendanceImporter(db: Db): AttendanceImporter {
  return {
    async importRows(rows) {
      const employeeNumbers = [...new Set(rows.map((r) => r.empNo))];

      const activeNames = new Map<string, string>();
      for (const part of chunks(employeeNumbers, CHUNK)) {
        const list = inList('e', part);
        const found = await db.query(
          'adw',
          `SELECT TO_CHAR(EMPLOYEE_NUMBER) AS EMP_NO, MAX(FULL_NAME) AS FULL_NAME FROM XX_DIGI_EMP_MASTER
            WHERE TO_CHAR(EMPLOYEE_NUMBER) IN (${list.sql})
              AND UPPER(TRIM(NVL(CURRENT_EMP_FLAG, 'N'))) = 'Y'
            GROUP BY TO_CHAR(EMPLOYEE_NUMBER)`,
          list.binds,
        );
        for (const row of found)
          activeNames.set(String(row.EMP_NO), (str(row.FULL_NAME) ?? '').trim());
      }

      const skipped: ImportOutcome['skipped'] = [];
      const accepted: UploadRow[] = [];
      for (const row of rows) {
        const name = activeNames.get(row.empNo);
        if (name === undefined) {
          skipped.push({
            row: row.row,
            empNo: row.empNo,
            message: 'Employee is inactive or not found in the employee master.',
          });
        } else {
          accepted.push({ ...row, empName: name || row.empName });
        }
      }
      if (accepted.length === 0) return { insertedRows: 0, updatedRows: 0, skipped };

      const dates = accepted.map((r) => r.attDate).sort();
      const existing = new Set<string>();
      for (const part of chunks([...new Set(accepted.map((r) => r.empNo))], CHUNK)) {
        const list = inList('e', part);
        const found = await db.query(
          'adw',
          `SELECT TO_CHAR(EMP_NO) AS EMP_NO, TO_CHAR(ATT_DATE, 'YYYY-MM-DD') AS ATT_DATE
             FROM XX_DIGI_ATT_ATT_CARD
            WHERE ATT_DATE >= TO_DATE(:fromDate, 'YYYY-MM-DD') AND ATT_DATE < TO_DATE(:toDate, 'YYYY-MM-DD') + 1
              AND TO_CHAR(EMP_NO) IN (${list.sql})`,
          { ...list.binds, fromDate: dates[0]!, toDate: dates[dates.length - 1]! },
        );
        for (const row of found) existing.add(`${row.EMP_NO}|${row.ATT_DATE}`);
      }
      const updatedRows = accepted.filter((r) => existing.has(`${r.empNo}|${r.attDate}`)).length;

      await db.transaction('adw', async (tx) => {
        await tx.execute('ALTER SESSION DISABLE PARALLEL DML');
        for (const batch of chunks(accepted, BATCH)) {
          const binds: Record<string, string> = {};
          const source = batch
            .map((r, i) => {
              Object.assign(binds, {
                [`n${i}`]: r.empNo,
                [`m${i}`]: r.empName,
                [`d${i}`]: r.attDate,
                [`i${i}`]: r.punchIn,
                [`o${i}`]: r.punchOut,
              });
              return `SELECT :n${i} AS EMP_NO, :m${i} AS EMP_NAME, TO_DATE(:d${i}, 'YYYY-MM-DD') AS ATT_DATE, :i${i} AS PUNCH_IN, :o${i} AS PUNCH_OUT FROM DUAL`;
            })
            .join(' UNION ALL ');
          await tx.execute(
            `MERGE INTO XX_DIGI_ATT_ATT_CARD target
             USING (${source}) source
             ON (TO_CHAR(target.EMP_NO) = source.EMP_NO AND target.ATT_DATE >= source.ATT_DATE
                 AND target.ATT_DATE < source.ATT_DATE + 1)
             WHEN MATCHED THEN UPDATE SET target.EMP_NAME = source.EMP_NAME,
               target.PUNCH_IN = source.PUNCH_IN, target.PUNCH_OUT = source.PUNCH_OUT
             WHEN NOT MATCHED THEN INSERT (EMP_NO, EMP_NAME, ATT_DATE, PUNCH_IN, PUNCH_OUT)
               VALUES (source.EMP_NO, source.EMP_NAME, source.ATT_DATE, source.PUNCH_IN, source.PUNCH_OUT)`,
            binds,
          );
        }
      });

      return { insertedRows: accepted.length - updatedRows, updatedRows, skipped };
    },
  };
}
