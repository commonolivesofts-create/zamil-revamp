// Attendance processing (CI3: ProcessAttendance + ProcessAttendanceModel, the "Generate
// Attendance" dialog). Builds XX_DIGI_ATT_ATT_SHEET from the attendance card, timetables,
// shifts, approved leave and occasions for a department/employee and date range.
import { z } from 'zod';

/** CI3's department/employee value meaning "every department" / "every employee". */
export const ALL = 'ALL';

const requiredDate = (missing: string, invalid: string) =>
  z
    .string({ error: missing })
    .trim()
    .min(1, missing)
    .pipe(z.iso.date({ error: invalid }));

/** Same checks and messages as the CI3 dialog (and its server-side validation). */
export const processRequestSchema = z
  .object({
    department: z
      .string({ error: 'Please select department.' })
      .trim()
      .min(1, 'Please select department.'),
    employeeNumber: z.string().trim().optional().default(''),
    fromDate: requiredDate('Please select from date.', 'Valid from date is required.'),
    toDate: requiredDate('Please select to date.', 'Valid to date is required.'),
  })
  .superRefine((value, ctx) => {
    if (value.department.toUpperCase() !== ALL && value.employeeNumber === '') {
      ctx.addIssue({
        code: 'custom',
        path: ['employeeNumber'],
        message: 'Please select employee.',
      });
    }
    if (value.fromDate > value.toDate) {
      ctx.addIssue({
        code: 'custom',
        path: ['fromDate'],
        message: 'From date must be less than or equal to to date.',
      });
    }
  })
  // ALL departments always means ALL employees (CI3 forces it).
  .transform((value) => ({
    ...value,
    employeeNumber: value.department.toUpperCase() === ALL ? ALL : value.employeeNumber,
  }));
export type ProcessRequest = z.infer<typeof processRequestSchema>;

export const processRowErrorSchema = z.object({
  employeeNumber: z.string(),
  employeeName: z.string(),
  attendanceDate: z.string(),
  error: z.string(),
});
export type ProcessRowError = z.infer<typeof processRowErrorSchema>;

/** The CI3 summary, field for field. */
export const processSummarySchema = z.object({
  department: z.string(),
  employeeNumber: z.string(),
  dateFrom: z.string(),
  dateTo: z.string(),
  totalEmployees: z.number(),
  processedRows: z.number(),
  insertedRows: z.number(),
  updatedRows: z.number(),
  presentRows: z.number(),
  weeklyHolidayRows: z.number(),
  leaveRows: z.number(),
  absenceWithoutPermissionRows: z.number(),
  blankPunchRows: z.number(),
  errorRows: z.number(),
  employeeErrors: z.array(z.string()),
  rowErrors: z.array(processRowErrorSchema),
});
export type ProcessSummary = z.infer<typeof processSummarySchema>;

export const processResultSchema = z.object({
  message: z.string(),
  summary: processSummarySchema,
});
export type ProcessResult = z.infer<typeof processResultSchema>;

export const departmentListSchema = z.object({ departments: z.array(z.string()) });

export const processEmployeeSchema = z.object({
  employeeNumber: z.string(),
  fullName: z.string().nullable(),
});
export type ProcessEmployee = z.infer<typeof processEmployeeSchema>;
export const processEmployeeListSchema = z.object({
  employees: z.array(processEmployeeSchema),
});
