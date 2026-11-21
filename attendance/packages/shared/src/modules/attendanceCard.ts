// Attendance Card (CI3: Attendance_card + Attendance_card_model): raw daily punches in
// XX_DIGI_ATT_ATT_CARD, loaded from the biometric export files.
import { z } from 'zod';
import { dateFilter, exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

export const attendanceCardFiltersSchema = z
  .object({ empNo: textFilter, empName: textFilter, attDate: dateFilter })
  .prefault({});
export const attendanceCardListQuerySchema = listQuerySchema(attendanceCardFiltersSchema);
export const attendanceCardExportQuerySchema = exportQuerySchema(attendanceCardFiltersSchema);
export type AttendanceCardFilters = z.infer<typeof attendanceCardFiltersSchema>;

export const attendanceCardRowSchema = z.object({
  empNo: z.string().nullable(),
  empName: z.string().nullable(),
  /** YYYY-MM-DD */
  attDate: z.string().nullable(),
  /** HH:MM, or null when missing/unreadable. */
  punchIn: z.string().nullable(),
  punchOut: z.string().nullable(),
});
export type AttendanceCardRow = z.infer<typeof attendanceCardRowSchema>;
export const attendanceCardPageSchema = pagedSchema(attendanceCardRowSchema);

function validTime(hours: number, minutes: number): string | null {
  if (hours > 23 || minutes > 59) return null;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
}

/**
 * A time of day as 'HH:MM' (24 h), from the formats found in stored punches and upload files:
 * 'H:MM', 'HH:MM', 'HH:MM:SS', 'HMM'/'HHMM', '8.30', 'hh:mm AM/PM'. Null when unreadable.
 * (CI3 formatTime returned 'H:MM' unpadded and accepted anything strtotime understood.)
 */
export function formatPunch(value: string | null | undefined): string | null {
  const text = (value ?? '').trim();
  if (!text) return null;
  const digits = /^(\d{3,4})$/.exec(text);
  if (digits) {
    const padded = digits[1]!.padStart(4, '0');
    return validTime(+padded.slice(0, 2), +padded.slice(2));
  }
  const match = /^(\d{1,2})[:.](\d{2})(?:[:.]\d{2})?\s*([AaPp][Mm])?$/.exec(text);
  if (!match) return null;
  let hours = +match[1]!;
  const minutes = +match[2]!;
  const meridiem = match[3]?.toUpperCase();
  if (meridiem) {
    if (hours < 1 || hours > 12) return null;
    hours = (hours % 12) + (meridiem === 'PM' ? 12 : 0);
  }
  return validTime(hours, minutes);
}

export const ATTENDANCE_CARD_EXPORT_COLUMNS = [
  { key: 'empNo', label: 'Employee Number' },
  { key: 'empName', label: 'Employee Name' },
  { key: 'attDate', label: 'Attendance Date' },
  { key: 'punchIn', label: 'Punch In' },
  { key: 'punchOut', label: 'Punch Out' },
] as const satisfies readonly { key: keyof AttendanceCardRow; label: string }[];

/* ---- File upload (preview / import) ---- */

export const UPLOAD_MAX_BYTES = 10 * 1024 * 1024;
export const UPLOAD_PREVIEW_LIMIT = 100;

export const uploadRowSchema = z.object({
  row: z.number(),
  empNo: z.string(),
  empName: z.string(),
  attDate: z.string(),
  punchIn: z.string(),
  punchOut: z.string(),
});
export type UploadRow = z.infer<typeof uploadRowSchema>;

export const uploadErrorSchema = z.object({
  row: z.number(),
  employeeId: z.string(),
  errors: z.string(),
});
export type UploadError = z.infer<typeof uploadErrorSchema>;

export const uploadPreviewSchema = z.object({
  message: z.string(),
  summary: z.object({ totalDataRows: z.number(), validRows: z.number(), invalidRows: z.number() }),
  rows: z.array(uploadRowSchema),
  errors: z.array(uploadErrorSchema),
});
export type UploadPreview = z.infer<typeof uploadPreviewSchema>;

export const uploadImportSchema = z.object({
  message: z.string(),
  totalRows: z.number(),
  insertedRows: z.number(),
  updatedRows: z.number(),
  /** Valid file rows refused because the employee is not active in the employee master. */
  skippedRows: z.number(),
  skipped: z.array(z.object({ row: z.number(), empNo: z.string(), message: z.string() })),
  invalidRows: z.number(),
  validationErrors: z.array(uploadErrorSchema),
});
export type UploadImport = z.infer<typeof uploadImportSchema>;
