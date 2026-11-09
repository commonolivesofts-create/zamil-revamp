// Implements: API §2 auth contracts (the schema file is the contract), TRD §5.
import { z } from 'zod';
import { CAPABILITIES } from '../access';
import { ASSIGNABLE_ROLES, BUSINESS_UNITS } from '../reference';

export const PASSWORD_MIN_LENGTH = 10;

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(128, 'Use at most 128 characters')
  .regex(/[A-Za-z]/, 'Include at least one letter')
  .regex(/\d/, 'Include at least one number');

const personNumber = z.string().trim().min(1, 'Enter your person number').max(30);

export const loginRequestSchema = z.object({
  username: personNumber,
  password: z.string().min(1, 'Enter your password').max(128),
});
export type LoginRequest = z.infer<typeof loginRequestSchema>;

export const passwordRequestSchema = z.object({ username: personNumber });
export type PasswordRequest = z.infer<typeof passwordRequestSchema>;

export const passwordResetSchema = z.object({
  token: z.string().min(20).max(200),
  password: passwordSchema,
});
export type PasswordReset = z.infer<typeof passwordResetSchema>;

export const devLoginRequestSchema = z.object({ personNumber });

export const okResponseSchema = z.object({ ok: z.literal(true) });

// ─── /auth/me ───────────────────────────────────────────────────────────────

export const roleGrantSchema = z.object({
  role: z.enum(ASSIGNABLE_ROLES),
  /** null = all business units. */
  businessUnit: z.enum(BUSINESS_UNITS).nullable(),
  isBackup: z.boolean(),
});
export type RoleGrant = z.infer<typeof roleGrantSchema>;

/** FR-SET-02 / FR-POL-06 / FR-APR-08. */
export const PREREQUISITE_CODES = [
  'ACTIVE_ASSIGNMENT',
  'LINE_MANAGER',
  'DEFAULT_ACCOUNT',
  'PAYEE',
] as const;
export type PrerequisiteCode = (typeof PREREQUISITE_CODES)[number];

export const prerequisiteCheckSchema = z.object({
  code: z.enum(PREREQUISITE_CODES),
  ok: z.boolean(),
  message: z.string(),
  /** Who fixes it when it fails. */
  contact: z.enum(['HR', 'FINANCE']).nullable(),
});
export type PrerequisiteCheck = z.infer<typeof prerequisiteCheckSchema>;

export const meResponseSchema = z.object({
  user: z.object({
    userId: z.number().int(),
    personId: z.number().int(),
    personNumber: z.string(),
    fullName: z.string(),
    email: z.string().nullable(),
    businessUnit: z.enum(BUSINESS_UNITS),
    jobName: z.string().nullable(),
  }),
  roles: z.array(roleGrantSchema),
  capabilities: z.array(z.enum(CAPABILITIES)),
  prerequisites: z.object({ ok: z.boolean(), checks: z.array(prerequisiteCheckSchema) }),
  session: z.object({
    expiresAt: z.iso.datetime({ offset: true }),
    absoluteExpiresAt: z.iso.datetime({ offset: true }),
  }),
  dev: z.object({ quickLogin: z.boolean() }),
});
export type MeResponse = z.infer<typeof meResponseSchema>;

// ─── Dev only (D-33) ────────────────────────────────────────────────────────

export const devUsersResponseSchema = z.object({
  password: z.string(),
  users: z.array(
    z.object({
      personNumber: z.string(),
      fullName: z.string(),
      persona: z.string(),
      scenario: z.string(),
      businessUnit: z.enum(BUSINESS_UNITS),
      jobName: z.string().nullable(),
    }),
  ),
});
export type DevUsersResponse = z.infer<typeof devUsersResponseSchema>;

export const devMailResponseSchema = z.object({
  items: z.array(
    z.object({
      id: z.number().int(),
      templateCode: z.string(),
      status: z.string(),
      createdAt: z.string(),
      to: z.object({ name: z.string(), email: z.string().nullable() }),
      subject: z.string(),
      text: z.string(),
      action: z.object({ label: z.string(), url: z.string() }).nullable(),
    }),
  ),
});
export type DevMailResponse = z.infer<typeof devMailResponseSchema>;
