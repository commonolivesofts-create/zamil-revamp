// Timesheet (CI3 /report/timesheet): POST /timesheet/list and /timesheet/export over
// XX_DIGI_ATT_ATT_SHEET, with CI3's Total Delay and Total Overtime columns.
import type { Router } from 'express';
import {
  timesheetExportQuerySchema,
  timesheetListQuerySchema,
  type TimesheetFilters,
  type TimesheetRow,
} from '@attendance/shared';
import { clean, type Db, type Row } from '../../db/oracle';
import { containsCi, equals, fromDay, toDay, type ListSpec } from '../../db/sql';
import { dash, dMY, type CsvExport } from '../../lib/csv';
import { oracleReportRepository, reportRoutes, type ReportRepository } from '../report';

// CI3 Timesheet_model, verbatim: late not covered by overtime plus early; overtime left after late.
const TOT_DELAY = `(CASE WHEN TRIM(a.LATE) IS NOT NULL AND ((NVL(a.OVERTIME,0)*60)-(a.LATE)) < 0
    THEN ABS((NVL(a.OVERTIME,0)*60)-(a.LATE)) ELSE 0 END
  + CASE WHEN TRIM(a.EARLY) IS NOT NULL THEN TO_NUMBER(a.EARLY) ELSE 0 END)`;
const OVERTIME_HRS = `(CASE WHEN (NVL(a.OVERTIME,0)*60)-(a.LATE) >= 0
    THEN ROUND(((NVL(a.OVERTIME,0)*60)-(a.LATE))/60,2) ELSE 0 END)`;

export const timesheetListSpec: ListSpec<TimesheetFilters> = {
  from: 'XX_DIGI_ATT_ATT_SHEET a',
  // Numbers as Oracle's own text (".5"), which is what CI3 received from oci8.
  select: `a.EMP_NO, a.EMP_NAME, a.SHIFT, TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD') AS ATT_DATE,
    a.CHECK_IN, a.PUNCH_IN, a.CHECK_OUT, a.PUNCH_OUT, a.TOTAL_MINUTES, a.EARLY, a.LATE,
    a.OVERTIME, a.ABSENCE, TO_CHAR(${TOT_DELAY}) AS TOT_DELAY, TO_CHAR(${OVERTIME_HRS}) AS OVERTIME_HRS`,
  filters: {
    empNo: containsCi('a.EMP_NO'),
    empName: containsCi('a.EMP_NAME'),
    shift: equals('UPPER(TRIM(a.SHIFT))', { upper: true }),
    attDateStart: fromDay('a.ATT_DATE'),
    attDateEnd: toDay('a.ATT_DATE'),
  },
  search: [
    'a.EMP_NO',
    'a.EMP_NAME',
    'a.SHIFT',
    "TO_CHAR(a.ATT_DATE, 'YYYY-MM-DD')",
    'a.CHECK_IN',
    'a.PUNCH_IN',
    'a.CHECK_OUT',
    'a.PUNCH_OUT',
    'a.TOTAL_MINUTES',
    'a.EARLY',
    'a.LATE',
    'a.OVERTIME',
    'a.ABSENCE',
  ],
  orderBy: 'a.ATT_DATE DESC, a.EMP_NO ASC',
};

export const mapTimesheetRow = (row: Row): TimesheetRow => ({
  empNo: clean(row.EMP_NO),
  empName: clean(row.EMP_NAME),
  shift: clean(row.SHIFT),
  attDate: clean(row.ATT_DATE),
  checkIn: clean(row.CHECK_IN),
  punchIn: clean(row.PUNCH_IN),
  checkOut: clean(row.CHECK_OUT),
  punchOut: clean(row.PUNCH_OUT),
  totalMinutes: clean(row.TOTAL_MINUTES),
  early: clean(row.EARLY),
  late: clean(row.LATE),
  overtime: clean(row.OVERTIME),
  absence: clean(row.ABSENCE),
  totDelay: clean(row.TOT_DELAY),
  overtimeHrs: clean(row.OVERTIME_HRS),
});

export const timesheetRepository = (db: Db) =>
  oracleReportRepository(db, 'adw', timesheetListSpec, mapTimesheetRow);

/** CI3 export_timesheet: 13 readable columns, date as d M Y ('-' when missing). */
export const TIMESHEET_EXPORT: CsvExport<TimesheetRow> = {
  filePrefix: 'timesheet_data',
  emptyMessage: 'No timesheet data found to export.',
  columns: [
    { label: 'Employee Number', value: (r) => r.empNo },
    { label: 'Employee Name', value: (r) => r.empName },
    { label: 'Shift', value: (r) => r.shift },
    { label: 'Attendance Date', value: (r) => dash(dMY(r.attDate)) },
    { label: 'Check In', value: (r) => r.checkIn },
    { label: 'Punch In', value: (r) => r.punchIn },
    { label: 'Check Out', value: (r) => r.checkOut },
    { label: 'Punch Out', value: (r) => r.punchOut },
    { label: 'Total Minutes', value: (r) => r.totalMinutes },
    { label: 'Early', value: (r) => r.early },
    { label: 'Late', value: (r) => r.late },
    { label: 'Overtime', value: (r) => r.overtime },
    { label: 'Absence', value: (r) => r.absence },
  ],
};

export function timesheetRoutes(deps: {
  list: ReportRepository<TimesheetFilters, TimesheetRow>;
}): Router {
  return reportRoutes({
    path: '/timesheet',
    listSchema: timesheetListQuerySchema,
    repository: deps.list,
    csv: { ...TIMESHEET_EXPORT, exportSchema: timesheetExportQuerySchema },
  });
}
