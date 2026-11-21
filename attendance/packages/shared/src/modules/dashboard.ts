// Dashboard (CI3: Dashboard + Dashboard_model): the figures the CI3 overview page shows, for the
// payroll period ending on the latest processed date.
import { z } from 'zod';

export const dashboardSchema = z.object({
  period: z.object({
    /** YYYY-MM-DD, '' when nothing has been processed yet. */
    fromDate: z.string(),
    toDate: z.string(),
    /** "21 Oct 2026", '-' when nothing has been processed yet. */
    fromLabel: z.string(),
    toLabel: z.string(),
    generatedAt: z.string(),
  }),
  process: z.object({
    coverage: z.number(),
    processedEmployees: z.number(),
    assignedEmployees: z.number(),
    statusText: z.string(),
  }),
  totalEmployees: z.number(),
  missingTimetableEmployees: z.number(),
  /** CI3 counts distinct supervisors here (see the parity report). */
  blankPunchEmployees: z.number(),
  /** Sum of OVERTIME hours, rounded to 2 decimals (CI3 format_decimal). */
  overtimeHours: z.number(),
  employeesWithOvertime: z.number(),
  /** Current employees per department, largest first (CI3 department_employee_list). */
  departments: z.array(z.object({ department: z.string(), employeeCount: z.number() })),
});
export type Dashboard = z.infer<typeof dashboardSchema>;
