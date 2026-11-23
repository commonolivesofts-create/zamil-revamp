// Alerts & Exceptions (CI3 /alerts-exceptions and /alerts-exceptions/export):
//   POST /alerts/list   { page, limit, filters }  -> summary cards + one page of exceptions
//   POST /alerts/export { filters }               -> attendance_exceptions_*.csv
import { Router } from 'express';
import {
  alertExportQuerySchema,
  alertListQuerySchema,
  pageMeta,
  toIsoDate,
  type AlertFilters,
  type AlertPage,
  type AlertRow,
} from '@attendance/shared';
import { requireAuth } from '../../auth/middleware';
import { nowDMYTime, sendCsv, type CsvExport } from '../../lib/csv';
import type { AlertsRepository, ResolvedAlertFilters } from './repository';

/** CI3 readFilters: from = 1st of this month, to = today, swapped when reversed. */
export function resolveAlertFilters(filters: AlertFilters, now = new Date()): ResolvedAlertFilters {
  let fromDate = filters.fromDate ?? toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1));
  let toDate = filters.toDate ?? toIsoDate(now);
  if (fromDate > toDate) [fromDate, toDate] = [toDate, fromDate];
  return { fromDate, toDate, type: filters.type, severity: filters.severity };
}

/** CI3 export: UTF-8 BOM, readable headers, a header-only file when nothing matches. */
export const ALERTS_EXPORT: CsvExport<AlertRow> = {
  filePrefix: 'attendance_exceptions',
  emptyMessage: '',
  allowEmpty: true,
  bom: true,
  columns: [
    { label: 'Exception Type', value: (r) => r.exceptionLabel },
    { label: 'Severity', value: (r) => r.severity },
    { label: 'Employee Number', value: (r) => r.empNo },
    { label: 'Employee Name', value: (r) => r.empName },
    { label: 'Department', value: (r) => r.department },
    { label: 'Shift', value: (r) => r.shift },
    { label: 'Attendance Date', value: (r) => r.attDateDisplay },
    { label: 'Punch In', value: (r) => r.punchIn },
    { label: 'Punch Out', value: (r) => r.punchOut },
    { label: 'Overtime', value: (r) => r.overtime },
    { label: 'Absence', value: (r) => r.absence },
    { label: 'Details', value: (r) => r.details },
  ],
};

export function alertRoutes(deps: { alerts: AlertsRepository }): Router {
  const router = Router();

  router.post('/alerts/list', requireAuth, async (req, res) => {
    const query = alertListQuerySchema.parse(req.body ?? {});
    const filters = resolveAlertFilters(query.filters);
    const [summary, total, items] = await Promise.all([
      deps.alerts.summary(filters),
      deps.alerts.count(filters),
      deps.alerts.rows(filters, query.limit, (query.page - 1) * query.limit),
    ]);
    const page: AlertPage = {
      fromDate: filters.fromDate,
      toDate: filters.toDate,
      summary,
      items,
      pagination: pageMeta(query.page, query.limit, total),
      generatedAt: nowDMYTime(),
    };
    res.json(page);
  });

  router.post('/alerts/export', requireAuth, async (req, res) => {
    const query = alertExportQuerySchema.parse(req.body ?? {});
    sendCsv(res, ALERTS_EXPORT, await deps.alerts.rows(resolveAlertFilters(query.filters), 0, 0));
  });

  return router;
}
