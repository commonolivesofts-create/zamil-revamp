// Employee Details report (CI3: Employee_details + Employee_model::get_employee_details).
// Source: XX_DIGI_EMP_MASTER, current employees only.
import { z } from 'zod';
import { dateFilter, exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

export const employeeFiltersSchema = z
  .object({
    fullName: textFilter,
    userId: textFilter,
    employeeNumber: textFilter,
    email: textFilter,
    jobTitle: textFilter,
    department: textFilter,
    joiningDate: dateFilter,
  })
  .prefault({});

export const employeeListQuerySchema = listQuerySchema(employeeFiltersSchema);
export const employeeExportQuerySchema = exportQuerySchema(employeeFiltersSchema);

export type EmployeeFilters = z.infer<typeof employeeFiltersSchema>;
export type EmployeeListQuery = z.infer<typeof employeeListQuerySchema>;
export type EmployeeExportQuery = z.infer<typeof employeeExportQuerySchema>;

export const employeeRowSchema = z.object({
  userId: z.number().nullable(),
  employeeNumber: z.string().nullable(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  /** YYYY-MM-DD */
  joiningDate: z.string().nullable(),
});

export type EmployeeRow = z.infer<typeof employeeRowSchema>;

export const employeePageSchema = pagedSchema(employeeRowSchema);

/** Columns of the table and the CSV export, in order. */
export const EMPLOYEE_COLUMNS = [
  { key: 'employeeNumber', label: 'Emp No' },
  { key: 'fullName', label: 'Employee Name' },
  { key: 'email', label: 'Email' },
  { key: 'jobTitle', label: 'Job Title' },
  { key: 'department', label: 'Department' },
  { key: 'joiningDate', label: 'Joining Date' },
] as const satisfies readonly { key: keyof EmployeeRow; label: string }[];
