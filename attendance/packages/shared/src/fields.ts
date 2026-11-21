// Field schemas reused by every create/update form (API validation and web forms).
// Messages follow the CI3 form_validation wording so users see the same texts.
import { z } from 'zod';

/** Required trimmed text with a maximum length. */
export const requiredText = (label: string, max: number) =>
  z
    .string({ error: `The ${label} field is required.` })
    .trim()
    .min(1, `The ${label} field is required.`)
    .max(max, `The ${label} field cannot exceed ${max} characters in length.`);

/** Optional trimmed text; '' becomes null. */
export const optionalText = (label: string, max: number) =>
  z
    .string()
    .trim()
    .max(max, `The ${label} field cannot exceed ${max} characters in length.`)
    .transform((value) => (value === '' ? null : value))
    .nullable()
    .optional()
    .transform((value) => value ?? null);

/** YYYY-MM-DD (native date inputs). */
export const dateField = (label: string) =>
  z.iso.date({ error: `The ${label} field must be a valid date.` });

export const optionalDateField = (label: string) =>
  z
    .union([z.iso.date({ error: `The ${label} field must be a valid date.` }), z.literal('')])
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

/** Time of day as 'HH:MM' (24 h), the format stored in every attendance table. */
export const HHMM = /^(?:[01]\d|2[0-3]):[0-5]\d$/;
export const hhmm = (label: string) =>
  z.string().trim().regex(HHMM, `The ${label} field must be a valid time (HH:MM).`);
export const optionalHhmm = (label: string) =>
  z
    .union([hhmm(label), z.literal('')])
    .nullable()
    .optional()
    .transform((value) => (value ? value : null));

export const STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type Status = (typeof STATUSES)[number];
export const status = z.enum(STATUSES, { error: 'The Status field must be ACTIVE or INACTIVE.' });

export const YES_NO = ['Y', 'N'] as const;
export type YesNo = (typeof YES_NO)[number];
export const yesNo = (label: string) =>
  z.enum(YES_NO, { error: `The ${label} field must be Y or N.` });

/** Rejects an end date earlier than the start date (both YYYY-MM-DD, compared as text). */
export function endNotBeforeStart<T extends Record<string, unknown>>(
  startKey: keyof T & string,
  endKey: keyof T & string,
  message: string,
) {
  return (value: T, ctx: z.RefinementCtx) => {
    const start = value[startKey];
    const end = value[endKey];
    if (typeof start === 'string' && typeof end === 'string' && start && end && end < start) {
      ctx.addIssue({ code: 'custom', path: [endKey], message });
    }
  };
}

/** Result of a create/update/delete. */
export const mutationResultSchema = z.object({ message: z.string() });
export type MutationResult = z.infer<typeof mutationResultSchema>;
