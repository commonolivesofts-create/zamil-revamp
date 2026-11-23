// Payroll File (CI3: Payroll_file + Payroll_file_model): one line per employee for a date range,
// with manual adjustments saved in XX_DIGI_ATT_PYRL_FILE_ADJ for that exact range.
import { z } from 'zod';
import { dateFilter, exportQuerySchema, listQuerySchema, pagedSchema, textFilter } from '../list';

export const payrollFileFiltersSchema = z
  .object({
    empNo: textFilter,
    empName: textFilter,
    fromDate: dateFilter,
    toDate: dateFilter,
  })
  .prefault({});
export const payrollFileListQuerySchema = listQuerySchema(payrollFileFiltersSchema);
export const payrollFileExportQuerySchema = exportQuerySchema(payrollFileFiltersSchema);
export type PayrollFileFilters = z.infer<typeof payrollFileFiltersSchema>;

const text = z.string().nullable();

/** Oracle's own text for each number (e.g. ".5"), as CI3 showed and exported it. */
export const payrollFileRowSchema = z.object({
  empNo: text,
  empName: text,
  late: text,
  early: text,
  totDelay: text,
  overtimeHrs: text,
  absenceWo: text,
});
export type PayrollFileRow = z.infer<typeof payrollFileRowSchema>;
export const payrollFilePageSchema = pagedSchema(payrollFileRowSchema);

const DECIMAL = /^\d+(\.\d{1,2})?$/;
const decimal = (message: string) => z.string({ error: message }).trim().regex(DECIMAL, message);
const isoDay = (message: string) =>
  z
    .string({ error: message })
    .trim()
    .pipe(z.iso.date({ error: message }));

/** CI3 save_adjustment rules and messages. */
export const payrollAdjustmentSchema = z
  .object({
    empNo: z
      .string({ error: 'Employee Number is required.' })
      .trim()
      .min(1, 'Employee Number is required.'),
    empName: z.string().trim().optional().default(''),
    fromDate: isoDay('Valid From Date is required.'),
    toDate: isoDay('Valid To Date is required.'),
    late: decimal('Late must be a valid number.'),
    early: decimal('Early must be a valid number.'),
    totDelay: decimal('Total Delay must be a valid number.'),
    overtimeHrs: decimal('Overtime Hours must be a valid number.'),
    absenceWo: z
      .string({ error: 'Absence WO must be a whole number.' })
      .trim()
      .regex(/^\d+$/, 'Absence WO must be a whole number.'),
  })
  .superRefine((value, ctx) => {
    if (value.fromDate > value.toDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['toDate'],
        message: 'To Date must be on or after From Date.',
      });
    }
  });
export type PayrollAdjustment = z.infer<typeof payrollAdjustmentSchema>;
