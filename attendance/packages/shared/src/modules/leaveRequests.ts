// Leave Requests (CI3: Leave_request + Leave_model): leave records of XX_DIGI_EMP_ABSENCE_TYPE whose
// start date falls in the selected period, with approved / pending / denied counts.
import { z } from 'zod';
import { dateFilter, paginationSchema } from '../list';

export const LEAVE_REQUESTS_PAGE_SIZE = 10;

export const leaveRequestFiltersSchema = z
  .object({ fromDate: dateFilter, toDate: dateFilter })
  .prefault({});
export type LeaveRequestFilters = z.infer<typeof leaveRequestFiltersSchema>;

export const leaveRequestListQuerySchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  limit: z.number().int().min(1).max(100).default(LEAVE_REQUESTS_PAGE_SIZE),
  filters: leaveRequestFiltersSchema,
});

const text = z.string().nullable();
export const leaveRequestRowSchema = z.object({
  empName: text,
  leaveType: text,
  /** As stored, e.g. "21-10-26". */
  leaveStartDate: text,
  leaveEndDate: text,
  totalDays: text,
  approvalStatus: text,
});
export type LeaveRequestRow = z.infer<typeof leaveRequestRowSchema>;

export const leaveRequestPageSchema = z.object({
  period: z.object({
    fromDate: z.string(),
    toDate: z.string(),
    fromLabel: z.string(),
    toLabel: z.string(),
  }),
  summary: z.object({
    approved: z.number(),
    pending: z.number(),
    denied: z.number(),
    total: z.number(),
  }),
  items: z.array(leaveRequestRowSchema),
  pagination: paginationSchema,
});
export type LeaveRequestPage = z.infer<typeof leaveRequestPageSchema>;

/** The dates the CI3 page opened on (the dashboard's latest processed payroll period). */
export const leaveRequestDefaultsSchema = z.object({ fromDate: z.string(), toDate: z.string() });
