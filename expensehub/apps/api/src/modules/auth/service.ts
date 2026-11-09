// Implements: API §2, TRD §5 — sign-in, password set/reset by emailed link, dev quick-login.
import type { MeResponse } from '@expensehub/shared';
import type { AuthContext } from '../../auth/context';
import { loadAuthContext } from '../../auth/context';
import { hashPassword, newResetToken, sha256 } from '../../auth/password';
import type { AuthProvider, VerifiedUser } from '../../auth/provider';
import type { SessionTimes } from '../../auth/session';
import type { AppConfig } from '../../config';
import type { DataLayer } from '../../data/ports';
import { checkPrerequisites } from '../../domain/prerequisites';
import { riyadhDate, type Clock } from '../../lib/dates';
import { AppError } from '../../lib/errors';
import { enqueueEmail } from '../notifications/outbox';

/** TRD §5: set/reset links are valid for 24 h. */
export const RESET_LINK_HOURS = 24;

export class AuthService {
  constructor(
    private readonly deps: {
      data: DataLayer;
      provider: AuthProvider;
      config: AppConfig;
      clock: Clock;
    },
  ) {}

  login(username: string, password: string): Promise<VerifiedUser> {
    return this.deps.provider.verifyCredentials(username, password);
  }

  /** Dev only (D-33): sign in as a seeded user without a password. */
  async devLogin(personNumber: string): Promise<VerifiedUser> {
    if (!this.deps.config.auth.devQuickLogin) throw new AppError('NOT_FOUND', 'Not available');
    const user = await this.deps.data.read(async (r) => {
      const employee = await r.employees.getByPersonNumber(personNumber);
      const u = employee ? await r.users.getByPersonId(employee.personId) : undefined;
      return employee?.active === 'Y' && u?.active === 'Y' ? u : undefined;
    });
    if (!user) throw new AppError('NOT_FOUND', `No active demo user ${personNumber}`);
    return { userId: user.userId, personId: user.personId };
  }

  async context(userId: number): Promise<AuthContext> {
    const today = riyadhDate(this.deps.clock());
    const ctx = await this.deps.data.read((r) => loadAuthContext(r, userId, today));
    if (!ctx) throw new AppError('UNAUTHENTICATED', 'Please sign in.');
    return ctx;
  }

  /**
   * API §2: always succeeds from the caller's view (no account enumeration). For an active
   * user with an email, queues a one-time link to set or reset the password.
   */
  async requestPasswordLink(username: string): Promise<void> {
    const now = this.deps.clock();
    await this.deps.data.withTransaction(async (r) => {
      const employee = await r.employees.getByPersonNumber(username.trim());
      if (!employee || employee.active !== 'Y' || !employee.email) return;
      const user = await r.users.getByPersonId(employee.personId);
      if (!user || user.active !== 'Y') return;

      const { token, tokenHash } = newResetToken();
      const expiresAt = new Date(now.getTime() + RESET_LINK_HOURS * 3_600_000).toISOString();
      await r.users.update(
        user.userId,
        { resetTokenHash: tokenHash, resetExpiresAt: expiresAt },
        { actorId: null },
      );
      await enqueueEmail(r, employee.personId, 'PASSWORD_LINK', {
        link: `${this.deps.config.web.baseUrl}/reset?token=${encodeURIComponent(token)}`,
        expiresAt,
        firstTime: user.passwordHash === null,
      });
    });
  }

  /** Sets the new password, clears the link and any lockout; other sessions end (fingerprint). */
  async resetPassword(token: string, password: string): Promise<void> {
    const now = this.deps.clock();
    const passwordHash = await hashPassword(password, this.deps.config.auth.bcryptCost);
    await this.deps.data.withTransaction(async (r) => {
      const user = await r.users.getByResetTokenHash(sha256(token));
      if (!user || !user.resetExpiresAt || Date.parse(user.resetExpiresAt) <= now.getTime()) {
        throw new AppError('VALIDATION', 'This link is invalid or has expired. Request a new one.');
      }
      await r.users.update(
        user.userId,
        {
          passwordHash,
          resetTokenHash: null,
          resetExpiresAt: null,
          failedAttempts: 0,
          lockedUntil: null,
        },
        { actorId: user.personId },
      );
    });
  }

  toMe(ctx: AuthContext, session: SessionTimes): MeResponse {
    const e = ctx.employee;
    // D-37: the CEO's own claims have no line-manager step.
    const needsLineManager = !ctx.roles.some((g) => g.role === 'APPROVER_CEO');
    return {
      user: {
        userId: ctx.userId,
        personId: ctx.personId,
        personNumber: e.personNumber,
        fullName: e.fullName,
        email: e.email,
        businessUnit: e.businessUnit,
        jobName: e.jobName,
      },
      roles: ctx.roles,
      capabilities: ctx.capabilities,
      prerequisites: checkPrerequisites(e, { needsLineManager }),
      session: {
        expiresAt: session.expiresAt.toISOString(),
        absoluteExpiresAt: session.absoluteExpiresAt.toISOString(),
      },
      dev: { quickLogin: this.deps.config.auth.devQuickLogin },
    };
  }
}
