// Absence report (CI3 Employee_model::get_absence_details): XX_DIGI_EMP_ABSENCE_TYPE.
// Leave dates are free-text 'DD-MM-YY' strings. CI3 used TO_DATE(...) directly, so one badly
// formatted row broke the whole report (ORA-01861); here unparsable dates become NULL.
import type { AbsenceFilters, AbsenceRow } from '@attendance/shared';
import { num, str, type Db, type Row } from '../../db/oracle';
import { contains, containsCi, type Binder, type ListSpec } from '../../db/sql';
import { oracleReportRepository } from '../report';

const leaveDate = (column: string) =>
  `TO_DATE(TRIM(${column}) DEFAULT NULL ON CONVERSION ERROR, 'DD-MM-RR')`;
const START = leaveDate('a.LEAVE_START_DATE');
const END = leaveDate('a.LEAVE_END_DATE');

export const absenceListSpec: ListSpec<AbsenceFilters> = {
  from: 'XX_DIGI_EMP_ABSENCE_TYPE a',
  select: `a.EMP_NO, a.DEPARTMENT_NAME, a.EMP_NAME, a.POSITION, a.LEAVE_START_DATE,
    a.LEAVE_END_DATE, a.TOTAL_DAYS, a.LEAVE_TYPE, a.APPROVAL_STATUS`,
  filters: {
    empNo: contains('a.EMP_NO'),
    empName: containsCi('a.EMP_NAME'),
    departmentName: containsCi('a.DEPARTMENT_NAME'),
    position: containsCi('a.POSITION'),
    leaveType: containsCi('a.LEAVE_TYPE'),
    approvalStatus: containsCi('a.APPROVAL_STATUS'),
    totalDays: contains('TO_CHAR(a.TOTAL_DAYS)'),
    // Overlap with the selected range: ends on/after "from", starts on/before "to" (as CI3).
    leaveFrom: (value: string, b: Binder) => `${END} >= TO_DATE(${b.add(value)}, 'YYYY-MM-DD')`,
    leaveTo: (value: string, b: Binder) => `${START} <= TO_DATE(${b.add(value)}, 'YYYY-MM-DD')`,
  },
  search: [
    'a.EMP_NO',
    'a.DEPARTMENT_NAME',
    'a.EMP_NAME',
    'a.POSITION',
    'a.LEAVE_TYPE',
    'a.APPROVAL_STATUS',
  ],
  orderBy: `${START} DESC NULLS LAST, a.EMP_NO`,
};

export const mapAbsenceRow = (row: Row): AbsenceRow => ({
  empNo: str(row.EMP_NO),
  departmentName: str(row.DEPARTMENT_NAME),
  empName: str(row.EMP_NAME),
  position: str(row.POSITION),
  leaveStartDate: str(row.LEAVE_START_DATE),
  leaveEndDate: str(row.LEAVE_END_DATE),
  totalDays: num(row.TOTAL_DAYS),
  leaveType: str(row.LEAVE_TYPE),
  approvalStatus: str(row.APPROVAL_STATUS),
});

export const absenceRepository = (db: Db) =>
  oracleReportRepository(db, 'adw', absenceListSpec, mapAbsenceRow);
