// Timesheet (CI3: Timesheet + Timesheet_model): the processed rows of XX_DIGI_ATT_ATT_SHEET.
import { z } from 'zod';
import { dateFilter, exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

export const timesheetFiltersSchema = z
  .object({
    empNo: textFilter,
    empName: textFilter,
    shift: textFilter,
    attDateStart: dateFilter,
    attDateEnd: dateFilter,
  })
  .prefault({});
export const timesheetListQuerySchema = listQuerySchema(timesheetFiltersSchema);
export const timesheetExportQuerySchema = exportQuerySchema(timesheetFiltersSchema);
export type TimesheetFilters = z.infer<typeof timesheetFiltersSchema>;

const text = z.string().nullable();

/** Values exactly as stored (minutes and hours are text), plus CI3's two computed columns. */
export const timesheetRowSchema = z.object({
  empNo: text,
  empName: text,
  shift: text,
  /** YYYY-MM-DD */
  attDate: text,
  checkIn: text,
  punchIn: text,
  checkOut: text,
  punchOut: text,
  totalMinutes: text,
  early: text,
  late: text,
  overtime: text,
  absence: text,
  /** Late not covered by overtime, plus early (minutes). */
  totDelay: text,
  /** Overtime left after late minutes (hours). */
  overtimeHrs: text,
});
export type TimesheetRow = z.infer<typeof timesheetRowSchema>;
export const timesheetPageSchema = pagedSchema(timesheetRowSchema);
