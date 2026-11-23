// POST /employees/list, POST /employees/export (CI3: employee_details/list, /export_employee).
import {
  employeeExportQuerySchema,
  employeeListQuerySchema,
  type EmployeeFilters,
  type EmployeeRow,
} from '@attendance/shared';
import { oracleDate, type CsvExport } from '../../lib/csv';
import { reportRoutes, type ReportRepository } from '../report';

// CI3 exported `SELECT d.*` with the raw column names. The headers and formats are kept; the
// salary, document and other HR columns of XX_DIGI_EMP_MASTER are left out (see parity report).
export const EMPLOYEE_EXPORT: CsvExport<EmployeeRow> = {
  filePrefix: 'employee_data',
  emptyMessage: 'No employee data found to export.',
  columns: [
    { label: 'USER_ID', value: (r) => r.userId },
    { label: 'EMPLOYEE_NUMBER', value: (r) => r.employeeNumber },
    { label: 'FULL_NAME', value: (r) => r.fullName },
    { label: 'EMAIL_ADDRESS', value: (r) => r.email },
    { label: 'JOB_TITLE', value: (r) => r.jobTitle },
    { label: 'DEPARTMENT', value: (r) => r.department },
    { label: 'JOINING_DATE', value: (r) => oracleDate(r.joiningDate) },
  ],
};

export const employeeRoutes = (repository: ReportRepository<EmployeeFilters, EmployeeRow>) =>
  reportRoutes({
    path: '/employees',
    listSchema: employeeListQuerySchema,
    repository,
    csv: { ...EMPLOYEE_EXPORT, exportSchema: employeeExportQuerySchema },
  });
