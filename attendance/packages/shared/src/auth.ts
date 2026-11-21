import { z } from 'zod';

/** GET /auth/me: the signed-in employee (from XX_DIGI_EMP_MASTER). */
export const meSchema = z.object({
  userId: z.number(),
  userName: z.string().nullable(),
  employeeNumber: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
});

export type Me = z.infer<typeof meSchema>;
