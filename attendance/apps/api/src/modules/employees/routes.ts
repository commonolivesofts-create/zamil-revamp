// POST /employees/list, POST /employees/export (CI3: employee_details/list, /export_employee).
import {
  EMPLOYEE_COLUMNS,
  employeeExportQuerySchema,
  employeeListQuerySchema,
  type EmployeeFilters,
  type EmployeeRow,
} from '@attendance/shared';
import { reportRoutes, type ReportRepository } from '../report';

export const employeeRoutes = (repository: ReportRepository<EmployeeFilters, EmployeeRow>) =>
  reportRoutes({
    path: '/employees',
    permission: 'employees:view',
    listSchema: employeeListQuerySchema,
    exportSchema: employeeExportQuerySchema,
    repository,
    columns: EMPLOYEE_COLUMNS,
    filePrefix: 'employee_details',
  });
