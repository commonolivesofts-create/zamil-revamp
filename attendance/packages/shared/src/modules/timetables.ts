// Employee shift assignments (CI3: Timetable + Timetable_model). XX_DIGI_TIMETABLE_PR.
// Saves are versioned: an edit inactivates the edited row and inserts a new row.
import { z } from 'zod';
import { optionalDateField, dateField, requiredText, status, STATUSES, yesNo } from '../fields';
import { dateFilter, exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

export const timetableFiltersSchema = z
  .object({
    empNo: textFilter,
    empName: textFilter,
    shiftId: textFilter,
    status: z
      .union([z.enum(STATUSES), z.literal('')])
      .transform((value) => (value ? value : undefined))
      .optional(),
    startDate: dateFilter,
    endDate: dateFilter,
  })
  .prefault({});
export const timetableListQuerySchema = listQuerySchema(timetableFiltersSchema);
export const timetableExportQuerySchema = exportQuerySchema(timetableFiltersSchema);
export type TimetableFilters = z.infer<typeof timetableFiltersSchema>;

export const timetableRowSchema = z.object({
  id: z.number(),
  uuid: z.string(),
  empNo: z.string().nullable(),
  empName: z.string().nullable(),
  shiftId: z.number().nullable(),
  shiftName: z.string().nullable(),
  startDate: z.string().nullable(),
  endDate: z.string().nullable(),
  overtimeAllowed: z.string().nullable(),
  excludeTimesheet: z.string().nullable(),
  status: z.string().nullable(),
  /** YYYY-MM-DD HH24:MI:SS */
  createdAt: z.string().nullable(),
  updatedAt: z.string().nullable(),
});
export type TimetableRow = z.infer<typeof timetableRowSchema>;
export const timetablePageSchema = pagedSchema(timetableRowSchema);

export const timetableInputSchema = z
  .object({
    empNo: z
      .string({ error: 'The Employee Number field is required.' })
      .trim()
      .min(1, 'The Employee Number field is required.')
      .regex(/^0*[1-9]\d{0,14}$/, 'The Employee Number field must be a valid positive number.'),
    empName: requiredText('Employee Name', 150),
    shiftId: z
      .string({ error: 'The Shift field is required.' })
      .trim()
      .min(1, 'The Shift field is required.')
      .regex(/^[1-9]\d*$/, 'Please select a valid shift.'),
    status,
    startDate: dateField('Start Date'),
    endDate: optionalDateField('End Date'),
    overtimeAllowed: yesNo('Overtime Allowed'),
    excludeTimesheet: yesNo('Exclude Timesheet'),
  })
  .superRefine((value, ctx) => {
    if (value.endDate && value.endDate < value.startDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['endDate'],
        message: 'End Date must be on or after Start Date.',
      });
    }
  });
export type TimetableInput = z.infer<typeof timetableInputSchema>;

export const employeeLookupSchema = z.object({
  employeeNumber: z.string(),
  fullName: z.string().nullable(),
  email: z.string().nullable(),
});
export type EmployeeLookup = z.infer<typeof employeeLookupSchema>;
