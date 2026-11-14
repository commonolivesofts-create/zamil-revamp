// Implements: API §11 dashboards (FR-DSH-01/02/03) — every figure from real data, never samples.
import { z } from 'zod';
import { BUSINESS_UNITS } from '../reference';
import { REPORT_STATUSES } from '../status';
import { timestampSchema } from './common';

/** An amount with how many records make it up. */
export const figureSchema = z.object({ count: z.number().int(), amountSar: z.string() });
export type Figure = z.infer<typeof figureSchema>;

/** FR-DSH-01 + UI-UX §5.1. */
export const employeeDashboardSchema = z.object({
  /** Approved, not yet paid (ready for payment / invoiced). */
  onItsWay: figureSchema,
  unreported: figureSchema,
  drafts: figureSchema,
  /** Cash advances arrive in phase 2. */
  openAdvance: figureSchema.nullable(),
  quickPaysPending: figureSchema,
  paidLast90Days: figureSchema,
  /** Approved amounts of submitted lines, last 90 days, by expense type. */
  spendByCategory: z.array(
    z.object({ typeName: z.string(), icon: z.string(), amountSar: z.string() }),
  ),
  /** Last 12 months (oldest first), "YYYY-MM". */
  monthlyTrend: z.array(z.object({ month: z.string(), amountSar: z.string() })),
});
export type EmployeeDashboard = z.infer<typeof employeeDashboardSchema>;

/** FR-DSH-02. */
export const approverDashboardSchema = z.object({
  pending: figureSchema,
  oldestSince: timestampSchema.nullable(),
  flagged: z.number().int(),
  infoRequested: z.number().int(),
  /** Reports waiting in my audit (OQ-03). */
  audit: figureSchema,
  decidedThisMonth: z.number().int(),
});
export type ApproverDashboard = z.infer<typeof approverDashboardSchema>;

/** FR-DSH-03. */
export const financeDashboardSchema = z.object({
  businessUnits: z.array(z.enum(BUSINESS_UNITS)),
  readyForPayment: figureSchema,
  invoicedUnpaid: figureSchema,
  paidThisMonth: figureSchema,
  quickPaysPending: figureSchema,
  sendErrors: z.number().int(),
  /** Reports by stage (submitted and later; paid = this month). */
  pipeline: z.array(
    z.object({ status: z.enum(REPORT_STATUSES), count: z.number().int(), amountSar: z.string() }),
  ),
  /** Failed interface calls in the last 24 h and jobs whose latest run failed. */
  integrationErrors: z.object({
    last24h: z.number().int(),
    failingJobs: z.array(
      z.object({ jobName: z.string(), at: timestampSchema, error: z.string().nullable() }),
    ),
  }),
});
export type FinanceDashboard = z.infer<typeof financeDashboardSchema>;
