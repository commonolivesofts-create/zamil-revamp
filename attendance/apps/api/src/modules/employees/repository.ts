// Employee Details (CI3 Employee_model::get_employee_details): current employees from
// XX_DIGI_EMP_MASTER, newest first. Only the displayed fields leave the database (CI3 returned
// SELECT d.*, salaries included).
import type { EmployeeFilters, EmployeeRow } from '@attendance/shared';
import { num, str, type Db, type Row } from '../../db/oracle';
import { containsCi, onDay, type ListSpec } from '../../db/sql';
import { oracleReportRepository } from '../report';

export const employeeListSpec: ListSpec<EmployeeFilters> = {
  from: 'XX_DIGI_EMP_MASTER d',
  select: `d.USER_ID, d.EMPLOYEE_NUMBER, d.FULL_NAME, d.EMAIL_ADDRESS, d.JOB_TITLE, d.DEPARTMENT,
    TO_CHAR(d.JOINING_DATE, 'YYYY-MM-DD') AS JOINING_DATE`,
  where: ["d.CURRENT_EMP_FLAG = 'Y'"],
  filters: {
    fullName: containsCi('d.FULL_NAME'),
    userId: containsCi('TO_CHAR(d.USER_ID)'),
    employeeNumber: containsCi('d.EMPLOYEE_NUMBER'),
    email: containsCi('d.EMAIL_ADDRESS'),
    jobTitle: containsCi('d.JOB_TITLE'),
    department: containsCi('d.DEPARTMENT'),
    joiningDate: onDay('d.JOINING_DATE'),
  },
  search: [
    'TO_CHAR(d.USER_ID)',
    'd.FULL_NAME',
    'd.EMPLOYEE_NUMBER',
    'd.EMAIL_ADDRESS',
    'd.JOB_TITLE',
    'd.DEPARTMENT',
  ],
  // HEADER_ID DESC as in CI3; EMPLOYEE_NUMBER keeps paging stable.
  orderBy: 'd.HEADER_ID DESC, d.EMPLOYEE_NUMBER',
};

export const mapEmployeeRow = (row: Row): EmployeeRow => ({
  userId: num(row.USER_ID),
  employeeNumber: str(row.EMPLOYEE_NUMBER),
  fullName: str(row.FULL_NAME),
  email: str(row.EMAIL_ADDRESS),
  jobTitle: str(row.JOB_TITLE),
  department: str(row.DEPARTMENT),
  joiningDate: str(row.JOINING_DATE),
});

export const employeeRepository = (db: Db) =>
  oracleReportRepository(db, 'adw', employeeListSpec, mapEmployeeRow);
