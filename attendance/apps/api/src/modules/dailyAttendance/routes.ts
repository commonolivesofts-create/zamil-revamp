// Daily Attendance (CI3 /daily-attendance): POST /daily-attendance/list and /daily-attendance/export.
import { Router } from 'express';
import {
  dailyAttendanceExportQuerySchema,
  dailyAttendanceListQuerySchema,
  pageMeta,
  toIsoDate,
  type DailyAttendanceFilters,
  type DailyAttendancePage,
  type DailyAttendanceRow,
} from '@attendance/shared';
import { requireAuth } from '../../auth/middleware';
import { sendCsv, type CsvExport } from '../../lib/csv';
import { AppError } from '../../lib/errors';
import type { DailyAttendanceQuery, DailyAttendanceRepository } from './repository';

/** CI3: missing dates mean today; a reversed range is refused. */
function resolve(filters: DailyAttendanceFilters, reversedMessage: string): DailyAttendanceQuery {
  const fromDate = filters.fromDate ?? toIsoDate(new Date());
  const toDate = filters.toDate ?? fromDate;
  if (fromDate > toDate) throw new AppError('VALIDATION', reversedMessage);
  return { fromDate, toDate, search: filters.search ?? '' };
}

/** CI3 export: UTF-8 BOM, file daily_attendance_YYYYMMDD_to_YYYYMMDD.csv, header-only when empty. */
export const DAILY_ATTENDANCE_EXPORT: CsvExport<DailyAttendanceRow> = {
  filePrefix: 'daily_attendance',
  emptyMessage: '',
  allowEmpty: true,
  bom: true,
  columns: [
    { label: 'Employee ID', value: (r) => r.empNo },
    { label: 'First Name', value: (r) => r.empName },
    { label: 'Date', value: (r) => r.attDateDisplay },
    { label: 'First Punch', value: (r) => r.punchIn },
    { label: 'Last Punch', value: (r) => r.punchOut },
  ],
};

export function dailyAttendanceRoutes(deps: { daily: DailyAttendanceRepository }): Router {
  const router = Router();

  router.post('/daily-attendance/list', requireAuth, async (req, res) => {
    const body = dailyAttendanceListQuerySchema.parse(req.body ?? {});
    const query = resolve(body.filters, 'From date must be less than or equal to To date.');
    const [summary, total, items] = await Promise.all([
      deps.daily.summary(query),
      deps.daily.total(query),
      deps.daily.page(query, body.page, body.limit),
    ]);
    // CI3 get_summary: everyone with a punch counts as "on time"; late, absent and leave are not
    // computed there and stay 0.
    const page: DailyAttendancePage = {
      fromDate: query.fromDate,
      toDate: query.toDate,
      summary: {
        scheduledEmployees: summary.scheduled,
        checkedIn: summary.checkedIn,
        onTime: summary.checkedIn,
        late: 0,
        totalLateMinutes: 0,
        notCheckedIn: Math.max(0, summary.scheduled - summary.checkedIn),
        absent: 0,
        missingPunch: summary.missingPunch,
        approvedLeave: 0,
        weekend: 0,
        occasion: 0,
      },
      items,
      pagination: pageMeta(body.page, body.limit, total),
    };
    res.json(page);
  });

  router.post('/daily-attendance/export', requireAuth, async (req, res) => {
    const body = dailyAttendanceExportQuerySchema.parse(req.body ?? {});
    const query = resolve(body.filters, 'From date cannot be greater than To date.');
    const day = (iso: string) => iso.replace(/-/g, '');
    sendCsv(
      res,
      DAILY_ATTENDANCE_EXPORT,
      await deps.daily.all(query),
      `daily_attendance_${day(query.fromDate)}_to_${day(query.toDate)}.csv`,
    );
  });

  return router;
}
