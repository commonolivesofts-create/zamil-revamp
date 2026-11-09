// Who is signed in: user + HCM employee + active role grants + capabilities.
// Loaded from the repositories on every request, so role changes apply at once.
import { deriveCapabilities, type Capability, type RoleGrant } from '@expensehub/shared';
import type { EmployeeRow, IsoDate } from '../data/entities';
import type { Repos } from '../data/ports';
import { passwordFingerprint } from './password';
import type { SessionTimes } from './session';

export interface AuthContext {
  userId: number;
  personId: number;
  employee: EmployeeRow;
  roles: RoleGrant[];
  isLineManager: boolean;
  capabilities: Capability[];
  /** See password.ts — must match the session claim. */
  passwordFingerprint: string;
  session?: SessionTimes;
}

declare module 'express-serve-static-core' {
  interface Request {
    /** Set by the authenticate middleware for a valid session. */
    auth?: AuthContext;
  }
}

/** Active user of an active employee, or null. */
export async function loadAuthContext(
  repos: Repos,
  userId: number,
  today: IsoDate,
): Promise<AuthContext | null> {
  const user = await repos.users.get(userId);
  if (!user || user.active !== 'Y') return null;
  const employee = await repos.employees.get(user.personId);
  if (!employee || employee.active !== 'Y') return null;

  const roles: RoleGrant[] = (await repos.roleAssignments.listByPerson(user.personId))
    .filter((a) => a.startDate <= today && (a.endDate === null || a.endDate >= today))
    .map((a) => ({ role: a.roleCode, businessUnit: a.businessUnit, isBackup: a.isBackup === 'Y' }));

  const isLineManager = (await repos.employees.listBySupervisor(user.personId)).some(
    (e) => e.active === 'Y',
  );

  return {
    userId: user.userId,
    personId: user.personId,
    employee,
    roles,
    isLineManager,
    capabilities: deriveCapabilities(roles, isLineManager),
    passwordFingerprint: passwordFingerprint(user.passwordHash),
  };
}
