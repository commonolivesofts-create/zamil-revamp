// Daily Attendance (CI3: Daily_attendance + Daily_attendance_model): first and last biometric punch
// per employee per day, read live from the device tables in EBS (ZPI.*).
import { z } from 'zod';
import { dateFilter, paginationSchema, textFilter } from '../list';

export const DAILY_ATTENDANCE_PAGE_SIZE = 15;

export const dailyAttendanceFiltersSchema = z
  .object({ fromDate: dateFilter, toDate: dateFilter, search: textFilter })
  .prefault({});
export type DailyAttendanceFilters = z.infer<typeof dailyAttendanceFiltersSchema>;

export const dailyAttendanceListQuerySchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  limit: z.number().int().min(1).max(100).default(DAILY_ATTENDANCE_PAGE_SIZE),
  filters: dailyAttendanceFiltersSchema,
});
export const dailyAttendanceExportQuerySchema = z.object({ filters: dailyAttendanceFiltersSchema });

const text = z.string().nullable();
export const dailyAttendanceRowSchema = z.object({
  empNo: text,
  empName: text,
  /** "21-NOV-2026" (Oracle DD-MON-YYYY, as CI3 showed it) */
  attDateDisplay: text,
  punchIn: text,
  punchOut: text,
  /** Device duty hours (DUTY_DURATION / 3600), Oracle text. */
  workTime: text,
});
export type DailyAttendanceRow = z.infer<typeof dailyAttendanceRowSchema>;

/** CI3 get_summary, field for field (several are always 0 in CI3). */
export const dailyAttendanceSummarySchema = z.object({
  scheduledEmployees: z.number(),
  checkedIn: z.number(),
  onTime: z.number(),
  late: z.number(),
  totalLateMinutes: z.number(),
  notCheckedIn: z.number(),
  absent: z.number(),
  missingPunch: z.number(),
  approvedLeave: z.number(),
  weekend: z.number(),
  occasion: z.number(),
});

export const dailyAttendancePageSchema = z.object({
  fromDate: z.string(),
  toDate: z.string(),
  summary: dailyAttendanceSummarySchema,
  items: z.array(dailyAttendanceRowSchema),
  pagination: paginationSchema,
});
export type DailyAttendancePage = z.infer<typeof dailyAttendancePageSchema>;
