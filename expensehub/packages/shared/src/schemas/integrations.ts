// Implements: API §10 admin/integrations contracts, FR-SET-03 (log view phase 1).
import { z } from 'zod';
import { FUSION_MODES } from '../modes';
import { INTERFACE_CODES } from '../reference';
import { INTEGRATION_LOG_STATUSES, JOB_RUN_STATUSES } from '../status';
import { listOf, timestampSchema } from './common';

export const JOB_NAMES = [
  'sync-hcm',
  'sync-coa',
  'sync-trips-quickpays',
  'sync-rates',
  'send-invoices',
  'poll-invoice-status',
] as const;
export type JobName = (typeof JOB_NAMES)[number];

export const jobRunSchema = z.object({
  runId: z.number().int(),
  jobName: z.string(),
  startedAt: timestampSchema,
  endedAt: timestampSchema.nullable(),
  status: z.enum(JOB_RUN_STATUSES),
  rowsRead: z.number().int().nullable(),
  rowsChanged: z.number().int().nullable(),
  errorText: z.string().nullable(),
  durationMs: z.number().int().nullable(),
});
export type JobRunDto = z.infer<typeof jobRunSchema>;

export const jobSchema = z.object({
  jobName: z.enum(JOB_NAMES),
  interfaces: z.array(z.enum(INTERFACE_CODES)),
  /** Riyadh schedule: "HH:MM" daily, or "hourly HH:MM–HH:MM". */
  dailyAt: z.string(),
  nextRunAt: timestampSchema.nullable(),
  lastRun: jobRunSchema.nullable(),
  lastSuccessAt: timestampSchema.nullable(),
});
export type JobDto = z.infer<typeof jobSchema>;

export const interfaceStatusSchema = z.object({
  interface: z.enum(INTERFACE_CODES),
  direction: z.enum(['IN', 'OUT']),
  jobName: z.enum(JOB_NAMES).nullable(),
  /** Milestone that builds it, for interfaces not running yet. */
  milestone: z.string().nullable(),
  lastAt: timestampSchema.nullable(),
  lastStatus: z.enum(INTEGRATION_LOG_STATUSES).nullable(),
  lastError: z.string().nullable(),
});
export type InterfaceStatusDto = z.infer<typeof interfaceStatusSchema>;

export const integrationsResponseSchema = z.object({
  fusionMode: z.enum(FUSION_MODES),
  canRun: z.boolean(),
  jobs: z.array(jobSchema),
  interfaces: z.array(interfaceStatusSchema),
});
export type IntegrationsResponse = z.infer<typeof integrationsResponseSchema>;

export const integrationLogQuerySchema = z.object({
  interface: z.enum(INTERFACE_CODES).optional(),
  status: z.enum(INTEGRATION_LOG_STATUSES).optional(),
  limit: z.coerce.number().int().min(1).max(500).optional(),
});

export const integrationLogItemSchema = z.object({
  logId: z.number().int(),
  interface: z.enum(INTERFACE_CODES),
  direction: z.enum(['IN', 'OUT']),
  refType: z.string().nullable(),
  refId: z.string().nullable(),
  httpMethod: z.string().nullable(),
  url: z.string().nullable(),
  httpStatus: z.number().int().nullable(),
  status: z.enum(INTEGRATION_LOG_STATUSES),
  retries: z.number().int(),
  durationMs: z.number().int().nullable(),
  at: timestampSchema,
  request: z.unknown(),
  response: z.string().nullable(),
});
export type IntegrationLogItem = z.infer<typeof integrationLogItemSchema>;
export const integrationLogListSchema = listOf(integrationLogItemSchema);

export const jobRunResponseSchema = z.object({ run: jobRunSchema });
