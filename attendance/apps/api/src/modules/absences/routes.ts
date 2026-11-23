// POST /absences/list, POST /absences/export (CI3: absence/list, /export_absence).
import {
  absenceExportQuerySchema,
  absenceListQuerySchema,
  type AbsenceFilters,
  type AbsenceRow,
} from '@attendance/shared';
import type { CsvExport } from '../../lib/csv';
import { reportRoutes, type ReportRepository } from '../report';

/** CI3 export: the nine selected columns with their raw names and stored values. */
export const ABSENCE_EXPORT: CsvExport<AbsenceRow> = {
  filePrefix: 'absence_data',
  emptyMessage: 'No absence data found to export.',
  columns: [
    { label: 'EMP_NO', value: (r) => r.empNo },
    { label: 'DEPARTMENT_NAME', value: (r) => r.departmentName },
    { label: 'EMP_NAME', value: (r) => r.empName },
    { label: 'POSITION', value: (r) => r.position },
    { label: 'LEAVE_START_DATE', value: (r) => r.leaveStartDate },
    { label: 'LEAVE_END_DATE', value: (r) => r.leaveEndDate },
    { label: 'TOTAL_DAYS', value: (r) => r.totalDays },
    { label: 'LEAVE_TYPE', value: (r) => r.leaveType },
    { label: 'APPROVAL_STATUS', value: (r) => r.approvalStatus },
  ],
};

export const absenceRoutes = (repository: ReportRepository<AbsenceFilters, AbsenceRow>) =>
  reportRoutes({
    path: '/absences',
    listSchema: absenceListQuerySchema,
    repository,
    csv: { ...ABSENCE_EXPORT, exportSchema: absenceExportQuerySchema },
  });
