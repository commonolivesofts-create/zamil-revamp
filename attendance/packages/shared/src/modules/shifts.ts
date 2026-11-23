// Shifts (CI3: Shifts + Shift_model) and their weekly detail, "Sub Shifts" (CI3: Shift_details +
// Shift_detail_model). Tables XX_DIGI_SHIFT_PR and XX_DIGI_SHIFT_PR_DTL. Times are 'HH:MM' strings.
import { z } from 'zod';
import {
  endNotBeforeStart,
  hhmm,
  HHMM,
  dateField,
  requiredText,
  status,
  STATUSES,
} from '../fields';
import { dateFilter, exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

const statusFilter = z
  .union([z.enum(STATUSES), z.literal('')])
  .transform((value) => (value ? value : undefined))
  .optional();

const timeFilter = z
  .union([z.string().regex(HHMM), z.literal('')])
  .transform((value) => (value ? value : undefined))
  .optional();

/* ---- Shifts ---- */

export const shiftFiltersSchema = z
  .object({
    shiftName: textFilter,
    status: statusFilter,
    startDate: dateFilter,
    endDate: dateFilter,
    checkIn: timeFilter,
    checkOut: timeFilter,
  })
  .prefault({});
export const shiftListQuerySchema = listQuerySchema(shiftFiltersSchema);
export const shiftExportQuerySchema = exportQuerySchema(shiftFiltersSchema);
export type ShiftFilters = z.infer<typeof shiftFiltersSchema>;

export const shiftRowSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  shiftName: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  status: z.string().nullable(),
  checkIn: z.string().nullable(),
  checkOut: z.string().nullable(),
  weekdayOvertimeCap: z.string().nullable(),
  weekendOvertimeCap: z.string().nullable(),
  /** YYYY-MM-DD HH24:MI:SS */
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type ShiftRow = z.infer<typeof shiftRowSchema>;
export const shiftPageSchema = pagedSchema(shiftRowSchema);

/** Overtime cap: free text up to 20 characters, as in CI3 (processing reads hours or H:MM). */
const overtimeCap = (label: string) =>
  z
    .string()
    .trim()
    .max(20, `The ${label} field cannot exceed 20 characters in length.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

export const shiftInputSchema = z
  .object({
    shiftName: requiredText('Shift Name', 100),
    status,
    startDate: dateField('Start Date'),
    endDate: dateField('End Date'),
    checkIn: hhmm('Check In'),
    checkOut: hhmm('Check Out'),
    weekdayOvertimeCap: overtimeCap('Weekday Overtime Cap'),
    weekendOvertimeCap: overtimeCap('Weekend Overtime Cap'),
  })
  .superRefine(
    endNotBeforeStart('startDate', 'endDate', 'End Date must be on or after Start Date.'),
  );
export type ShiftInput = z.infer<typeof shiftInputSchema>;

/* ---- Sub Shifts (weekly detail) ---- */

/** DAY_NO 1 = Sunday ... 7 = Saturday (CI3). */
export const WEEKDAYS = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const shiftDetailFiltersSchema = z
  .object({ shiftName: textFilter, status: statusFilter })
  .prefault({});
export const shiftDetailListQuerySchema = listQuerySchema(shiftDetailFiltersSchema);
export type ShiftDetailFilters = z.infer<typeof shiftDetailFiltersSchema>;

export const dayTimesSchema = z.object({
  punchIn: z.string().nullable(),
  punchOut: z.string().nullable(),
  grossTime: z.string().nullable(),
});
export type DayTimes = z.infer<typeof dayTimesSchema>;

export const shiftDetailRowSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  shiftName: z.string().nullable(),
  status: z.string().nullable(),
  /** Index 0 = Sunday ... 6 = Saturday. */
  days: z.array(dayTimesSchema).length(7),
});
export type ShiftDetailRow = z.infer<typeof shiftDetailRowSchema>;
export const shiftDetailPageSchema = pagedSchema(shiftDetailRowSchema);

/** The weekly editor's data for one shift. */
export const shiftWeekSchema = z.object({
  shift: shiftRowSchema,
  days: z.array(dayTimesSchema.extend({ dayNo: z.number(), weekdayName: z.string() })).length(7),
  hasExistingDetails: z.boolean(),
});
export type ShiftWeek = z.infer<typeof shiftWeekSchema>;

const optionalTime = z
  .string()
  .trim()
  .optional()
  .transform((value) => value ?? '');

export const shiftWeekInputSchema = z.object({
  days: z
    .array(z.object({ punchIn: optionalTime, punchOut: optionalTime, grossTime: optionalTime }))
    .length(7, 'Invalid shift detail rows.')
    .superRefine((days, ctx) => {
      days.forEach((day, index) => {
        const issue = (field: 'punchIn' | 'punchOut' | 'grossTime', message: string) =>
          ctx.addIssue({ code: 'custom', path: [index, field], message });
        // Same order and texts as CI3 validatePayload: the format check wins over pairing.
        if (day.punchIn && !HHMM.test(day.punchIn))
          issue('punchIn', 'Punch In must be in HH:MM format.');
        else if (!day.punchIn && day.punchOut)
          issue('punchIn', 'Punch In is required when Punch Out is entered.');
        if (day.punchOut && !HHMM.test(day.punchOut))
          issue('punchOut', 'Punch Out must be in HH:MM format.');
        else if (day.punchIn && !day.punchOut)
          issue('punchOut', 'Punch Out is required when Punch In is entered.');
        if (day.grossTime && !HHMM.test(day.grossTime))
          issue('grossTime', 'Gross Time must be in HH:MM format.');
      });
    }),
});
export type ShiftWeekInput = z.infer<typeof shiftWeekInputSchema>;

/** All shifts for dropdowns (inactive included, as in CI3). */
export const shiftChoiceSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  name: z.string(),
  status: z.string().nullable(),
});
export type ShiftChoice = z.infer<typeof shiftChoiceSchema>;
export const shiftChoicesSchema = z.array(shiftChoiceSchema);
