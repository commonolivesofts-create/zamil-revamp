import { z } from 'zod';
import { ROLES } from './roles';

/** GET /auth/me: the signed-in employee (from XX_DIGI_EMP_MASTER) and their roles. */
export const meSchema = z.object({
  userId: z.number(),
  employeeNumber: z.string(),
  fullName: z.string(),
  email: z.string().nullable(),
  jobTitle: z.string().nullable(),
  department: z.string().nullable(),
  roles: z.array(z.enum(ROLES)),
});

export type Me = z.infer<typeof meSchema>;
