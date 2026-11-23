// Occasions / public holidays (CI3: Occasion + Occasion_model). XX_DIGI_ATT_OCCASIONS.
// SHIFT_ID is stored as a comma-separated list of shift IDs.
import { z } from 'zod';
import { endNotBeforeStart, dateField, optionalText, requiredText, YES_NO, yesNo } from '../fields';
import { dateFilter, exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

const ynFilter = z
  .union([z.enum(YES_NO), z.literal('')])
  .transform((value) => (value ? value : undefined))
  .optional();

export const occasionFiltersSchema = z
  .object({
    occasionName: textFilter,
    occasionType: textFilter,
    /** Occasions starting on or after this date. */
    fromDate: dateFilter,
    /** Occasions ending on or before this date. */
    toDate: dateFilter,
    countAsPresent: ynFilter,
    paidHoliday: ynFilter,
    isActive: ynFilter,
    shiftId: textFilter,
  })
  .prefault({});

export const occasionListQuerySchema = listQuerySchema(occasionFiltersSchema);
export const occasionExportQuerySchema = exportQuerySchema(occasionFiltersSchema);
export type OccasionFilters = z.infer<typeof occasionFiltersSchema>;

export const occasionRowSchema = z.object({
  occasionId: z.number(),
  occasionName: z.string().nullable(),
  fromDate: z.string().nullable(),
  toDate: z.string().nullable(),
  shiftIds: z.array(z.string()),
  shiftNames: z.string().nullable(),
  occasionType: z.string().nullable(),
  countAsPresent: z.string(),
  paidHoliday: z.string(),
  isActive: z.string(),
  remarks: z.string().nullable(),
  createdBy: z.string().nullable(),
  /** YYYY-MM-DD HH24:MI:SS */
  createdAt: z.string().nullable(),
  updatedBy: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type OccasionRow = z.infer<typeof occasionRowSchema>;
export const occasionPageSchema = pagedSchema(occasionRowSchema);

export const occasionInputSchema = z
  .object({
    occasionName: requiredText('Occasion Name', 255),
    fromDate: dateField('From Date'),
    toDate: dateField('To Date'),
    occasionType: optionalText('Occasion Type', 100),
    countAsPresent: yesNo('Count As Present'),
    paidHoliday: yesNo('Paid Holiday'),
    isActive: yesNo('Is Active'),
    shiftIds: z.array(z.string().regex(/^\d+$/, 'Invalid shift.')).max(200).default([]),
    remarks: optionalText('Remarks', 500),
  })
  .superRefine(endNotBeforeStart('fromDate', 'toDate', 'To Date must be on or after From Date.'));
export type OccasionInput = z.infer<typeof occasionInputSchema>;

export const shiftOptionSchema = z.object({ id: z.number(), name: z.string() });
export type ShiftOption = z.infer<typeof shiftOptionSchema>;
export const shiftOptionsSchema = z.array(shiftOptionSchema);

/** Trim, drop blanks and duplicates (first wins); null when empty (CI3 normalizeShiftIds). */
export function normalizeShiftIds(ids: readonly string[]): string | null {
  const clean = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  return clean.length ? clean.join(',') : null;
}
