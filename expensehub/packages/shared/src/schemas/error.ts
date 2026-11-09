// Implements: API §1 error envelope `{ error: { code, message, details } }`.
import { z } from 'zod';
import { ERROR_CODES } from '../errors';

export const errorEnvelopeSchema = z.object({
  error: z.object({
    code: z.enum(ERROR_CODES),
    message: z.string(),
    details: z.unknown().optional(),
  }),
});

export type ErrorEnvelope = z.infer<typeof errorEnvelopeSchema>;
