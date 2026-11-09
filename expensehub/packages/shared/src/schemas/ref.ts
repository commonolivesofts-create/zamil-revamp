// Implements: API §3 reference data (read-only).
import { z } from 'zod';
import { BUSINESS_UNITS, COA_SEGMENTS } from '../reference';
import { listOf } from './common';

export const employeeRefQuerySchema = z.object({
  q: z.string().trim().max(60).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
});

export const employeeRefSchema = z.object({
  personId: z.number().int(),
  personNumber: z.string(),
  fullName: z.string(),
  businessUnit: z.enum(BUSINESS_UNITS),
  jobName: z.string().nullable(),
});
export type EmployeeRef = z.infer<typeof employeeRefSchema>;
export const employeeRefListSchema = listOf(employeeRefSchema);

export const coaQuerySchema = z.object({
  segment: z.enum(COA_SEGMENTS),
  q: z.string().trim().max(60).optional(),
  includeDisabled: z.stringbool().optional(),
});

export const coaValueSchema = z.object({
  segment: z.enum(COA_SEGMENTS),
  value: z.string(),
  description: z.string(),
  enabled: z.boolean(),
});
export type CoaValueDto = z.infer<typeof coaValueSchema>;
export const coaValueListSchema = listOf(coaValueSchema);
