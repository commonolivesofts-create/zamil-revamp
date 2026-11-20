// POST /absences/list, POST /absences/export (CI3: absence/list, /export_absence).
import {
  ABSENCE_COLUMNS,
  absenceExportQuerySchema,
  absenceListQuerySchema,
  type AbsenceFilters,
  type AbsenceRow,
} from '@attendance/shared';
import { reportRoutes, type ReportRepository } from '../report';

export const absenceRoutes = (repository: ReportRepository<AbsenceFilters, AbsenceRow>) =>
  reportRoutes({
    path: '/absences',
    permission: 'absences:view',
    listSchema: absenceListQuerySchema,
    exportSchema: absenceExportQuerySchema,
    repository,
    columns: ABSENCE_COLUMNS,
    filePrefix: 'absence_details',
  });
