// Absence report (CI3: Absence + Employee_model::get_absence_details).
// Source: XX_DIGI_EMP_ABSENCE_TYPE. Leave dates are stored as free-text 'DD-MM-YY' strings.
import { z } from 'zod';
import { dateFilter, exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

export const APPROVAL_STATUSES = ['APPROVED', 'AWAITING', 'DENIED'] as const;

export const absenceFiltersSchema = z
  .object({
    empNo: textFilter,
    empName: textFilter,
    departmentName: textFilter,
    position: textFilter,
    leaveType: textFilter,
    approvalStatus: textFilter,
    totalDays: textFilter,
    /** Leaves that end on or after this date (YYYY-MM-DD). */
    leaveFrom: dateFilter,
    /** Leaves that start on or before this date (YYYY-MM-DD). */
    leaveTo: dateFilter,
  })
  .prefault({});

export const absenceListQuerySchema = listQuerySchema(absenceFiltersSchema);
export const absenceExportQuerySchema = exportQuerySchema(absenceFiltersSchema);

export type AbsenceFilters = z.infer<typeof absenceFiltersSchema>;
export type AbsenceListQuery = z.infer<typeof absenceListQuerySchema>;
export type AbsenceExportQuery = z.infer<typeof absenceExportQuerySchema>;

export const absenceRowSchema = z.object({
  empNo: z.string().nullable(),
  departmentName: z.string().nullable(),
  empName: z.string().nullable(),
  position: z.string().nullable(),
  /** As stored (usually DD-MM-YY). */
  leaveStartDate: z.string().nullable(),
  leaveEndDate: z.string().nullable(),
  totalDays: z.number().nullable(),
  leaveType: z.string().nullable(),
  approvalStatus: z.string().nullable(),
});

export type AbsenceRow = z.infer<typeof absenceRowSchema>;

export const absencePageSchema = pagedSchema(absenceRowSchema);

export const ABSENCE_COLUMNS = [
  { key: 'empNo', label: 'Emp No' },
  { key: 'departmentName', label: 'Department' },
  { key: 'empName', label: 'Employee Name' },
  { key: 'position', label: 'Position' },
  { key: 'leaveStartDate', label: 'Leave Start Date' },
  { key: 'leaveEndDate', label: 'Leave End Date' },
  { key: 'totalDays', label: 'Total Days' },
  { key: 'leaveType', label: 'Leave Type' },
  { key: 'approvalStatus', label: 'Approval Status' },
] as const satisfies readonly { key: keyof AbsenceRow; label: string }[];
