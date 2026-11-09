// Implements: TRD §5 — AuthProvider interface so OQ-22 (local vs Entra ID) is swappable.
// OQ-22 proposal: local accounts now (username = HCM person number, bcrypt, lockout).
import type { DataLayer } from '../data/ports';
import type { Clock } from '../lib/dates';
import { AppError } from '../lib/errors';
import { burnPasswordCheck, verifyPassword } from './password';

export interface VerifiedUser {
  userId: number;
  personId: number;
}

export interface AuthProvider {
  readonly name: 'local' | 'entra';
  verifyCredentials(username: string, password: string): Promise<VerifiedUser>;
}

export const LOCKOUT_ATTEMPTS = 5;
export const LOCKOUT_MINUTES = 15;

const INVALID = 'Invalid person number or password.';

export class LocalAuthProvider implements AuthProvider {
  readonly name = 'local' as const;

  constructor(
    private readonly data: DataLayer,
    private readonly clock: Clock,
    private readonly bcryptCost: number,
  ) {}

  async verifyCredentials(username: string, password: string): Promise<VerifiedUser> {
    const now = this.clock();
    const found = await this.data.read(async (r) => {
      const employee = await r.employees.getByPersonNumber(username.trim());
      const user = employee ? await r.users.getByPersonId(employee.personId) : undefined;
      return employee?.active === 'Y' && user?.active === 'Y' ? user : undefined;
    });

    // Same bcrypt work for unknown users and users without a password (no enumeration by timing).
    if (!found || !found.passwordHash) {
      await burnPasswordCheck(password, this.bcryptCost);
      throw new AppError('UNAUTHENTICATED', INVALID);
    }

    if (found.lockedUntil && Date.parse(found.lockedUntil) > now.getTime()) {
      throw lockedError(found.lockedUntil, now);
    }

    const ok = await verifyPassword(password, found.passwordHash);

    // Attempt counter is committed whether or not the password matched.
    const result = await this.data.withTransaction(async (r) => {
      const user = await r.users.getOrThrow(found.userId);
      if (ok) {
        await r.users.update(
          user.userId,
          { failedAttempts: 0, lockedUntil: null, lastLoginAt: now.toISOString() },
          { actorId: user.personId },
        );
        return 'OK' as const;
      }
      const failed = user.failedAttempts + 1;
      if (failed >= LOCKOUT_ATTEMPTS) {
        const lockedUntil = new Date(now.getTime() + LOCKOUT_MINUTES * 60_000).toISOString();
        await r.users.update(user.userId, { failedAttempts: 0, lockedUntil }, { actorId: null });
        return lockedUntil;
      }
      await r.users.update(user.userId, { failedAttempts: failed }, { actorId: null });
      return 'FAILED' as const;
    });

    if (result === 'OK') return { userId: found.userId, personId: found.personId };
    if (result === 'FAILED') throw new AppError('UNAUTHENTICATED', INVALID);
    throw lockedError(result, now);
  }
}

function lockedError(lockedUntil: string, now: Date): AppError {
  const minutes = Math.max(1, Math.ceil((Date.parse(lockedUntil) - now.getTime()) / 60_000));
  return new AppError(
    'UNAUTHENTICATED',
    `Too many failed attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}, or reset your password.`,
    { locked: true, retryAfterMinutes: minutes },
  );
}
