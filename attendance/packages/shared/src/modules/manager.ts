// Manager View (CI3: Manager + Manager_model): the signed-in manager's direct reports, today's
// punches and this period's late days / overtime (EBS), approved leave and pending requests (ADW).
import { z } from 'zod';

const text = z.string().nullable();

export const managerEmployeeSchema = z.object({
  empNo: z.string(),
  fullName: text,
  jobTitle: text,
  todayStatus: z.object({ key: z.string(), label: z.string() }),
  periodAbsenceDays: z.number(),
  periodLateDays: z.number(),
  /** CI3 format_decimal: up to 2 decimals, '' for 0. */
  periodOvertimeHours: z.string(),
  pendingCount: z.number(),
});
export type ManagerEmployee = z.infer<typeof managerEmployeeSchema>;

export const managerApprovalSchema = z.object({
  empNo: z.string(),
  fullName: text,
  leaveType: text,
  leaveStartDate: z.string(),
  leaveEndDate: z.string(),
  totalDays: text,
  approvalStatus: text,
});
export type ManagerApproval = z.infer<typeof managerApprovalSchema>;

export const managerViewSchema = z.object({
  period: z.object({ fromLabel: z.string(), toLabel: z.string(), todayLabel: z.string() }),
  summary: z.object({
    teamSize: z.number(),
    presentToday: z.number(),
    lateToday: z.number(),
    absentToday: z.number(),
    onLeaveToday: z.number(),
    pendingApprovals: z.number(),
  }),
  employees: z.array(managerEmployeeSchema),
  approvals: z.array(managerApprovalSchema),
  /** False when EBS could not be reached: punches and period figures are missing. */
  ebsAvailable: z.boolean(),
  ebsMessage: z.string().nullable(),
});
export type ManagerView = z.infer<typeof managerViewSchema>;

/** CI3 approve_absence: decide a pending request of one of the manager's team members. */
export const managerDecisionSchema = z.object({
  empNo: z
    .string({ error: 'Missing or invalid parameters.' })
    .trim()
    .min(1, 'Missing or invalid parameters.'),
  leaveStartDate: z
    .string({ error: 'Missing or invalid parameters.' })
    .trim()
    .min(1, 'Missing or invalid parameters.'),
  leaveEndDate: z
    .string({ error: 'Missing or invalid parameters.' })
    .trim()
    .min(1, 'Missing or invalid parameters.'),
  decision: z.enum(['APPROVE', 'DENY'], { error: 'Missing or invalid parameters.' }),
});
export type ManagerDecision = z.infer<typeof managerDecisionSchema>;
