// Alerts & Exceptions (CI3: Alerts_exceptions + Alerts_exceptions_model): attendance problems
// found in the processed sheet, the punches and the timetables for a date range.
import { z } from 'zod';
import { paginationSchema } from '../list';

export const ALERT_TYPES = [
  { value: 'missing_punch', label: 'Missing Punch' },
  { value: 'same_punch', label: 'Same Punch' },
  { value: 'missing_shift', label: 'Missing Shift' },
  { value: 'missing_occasion', label: 'Missing Occasion' },
  { value: 'high_overtime', label: 'High Overtime' },
  { value: 'missing_timetable', label: 'Missing Timetable' },
] as const;
export type AlertType = (typeof ALERT_TYPES)[number]['value'];

export const ALERT_SEVERITIES = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
] as const;

/** CI3 page size and default overtime threshold (minutes). */
export const ALERTS_PAGE_SIZE = 15;
export const ALERTS_OVERTIME_THRESHOLD = 120;

const optionalDay = z
  .string()
  .trim()
  .optional()
  .transform((value) => (value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : undefined));
const oneOf = (values: readonly string[]) =>
  z
    .string()
    .trim()
    .toLowerCase()
    .optional()
    .transform((value) => (value && values.includes(value) ? value : ''));

/** CI3 readFilters: unknown type/severity are ignored, missing dates default on the server. */
export const alertFiltersSchema = z
  .object({
    fromDate: optionalDay,
    toDate: optionalDay,
    type: oneOf(ALERT_TYPES.map((t) => t.value)),
    severity: oneOf(ALERT_SEVERITIES.map((s) => s.value)),
  })
  .prefault({});
export type AlertFilters = z.infer<typeof alertFiltersSchema>;

export const alertListQuerySchema = z.object({
  page: z.number().int().min(1).max(100_000).default(1),
  limit: z.number().int().min(1).max(100).default(ALERTS_PAGE_SIZE),
  filters: alertFiltersSchema,
});
export const alertExportQuerySchema = z.object({ filters: alertFiltersSchema });

const text = z.string().nullable();
export const alertRowSchema = z.object({
  exceptionType: z.string(),
  exceptionLabel: z.string(),
  severity: z.string(),
  empNo: text,
  empName: text,
  department: text,
  shift: text,
  /** YYYY-MM-DD */
  attDate: text,
  /** "05 Jan 2026" */
  attDateDisplay: text,
  punchIn: text,
  punchOut: text,
  overtime: text,
  absence: text,
  details: text,
});
export type AlertRow = z.infer<typeof alertRowSchema>;

export const alertSummarySchema = z.object({
  total: z.number(),
  high: z.number(),
  medium: z.number(),
  low: z.number(),
  missingPunch: z.number(),
  samePunch: z.number(),
  missingShift: z.number(),
  missingOccasion: z.number(),
  highOvertime: z.number(),
  missingTimetable: z.number(),
});
export type AlertSummary = z.infer<typeof alertSummarySchema>;

export const alertPageSchema = z.object({
  /** The dates actually used (defaults applied, swapped when reversed). */
  fromDate: z.string(),
  toDate: z.string(),
  summary: alertSummarySchema,
  items: z.array(alertRowSchema),
  pagination: paginationSchema,
  /** "21 Nov 2026, 02:30 PM" */
  generatedAt: z.string(),
});
export type AlertPage = z.infer<typeof alertPageSchema>;
