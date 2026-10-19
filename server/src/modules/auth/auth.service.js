import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../database/oracle.js';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/logger/index.js';
import { ACTOR_TYPES, AUDIT_EVENTS, AUDIT_OUTCOMES } from '../audit/securityAudit.service.js';
import * as defaultAuthRepository from './auth.repository.js';
import {
  evaluateEmployeeEligibility,
  evaluateMfaRequirement,
  evaluatePasswordExpiry,
} from './auth.eligibility.js';
import { LOCKOUT_POLICY, SESSION_POLICY } from './auth.policy.js';
import { hashPassword, verifyPassword } from './password.js';
import * as defaultSessionRepository from './session.repository.js';
import {
  deriveCsrfToken,
  generateSessionToken,
  hashSessionToken,
  isWellFormedToken,
} from './session.service.js';

// One message for every credential, account-state and eligibility failure, so responses never
// reveal whether a username exists, is linked, pending, disabled, locked or ineligible.
const authenticationFailed = () =>
  new AppError(
    401,
    'AUTHENTICATION_FAILED',
    'Sign-in failed. Check your username and password, or try again later.',
  );

// Returned only after the correct password was supplied, so they do not enable enumeration.
const mfaRequired = () =>
  new AppError(
    403,
    'MFA_REQUIRED',
    'This account requires multi-factor verification, which is not yet available. Contact your administrator.',
  );

const passwordExpired = () =>
  new AppError(
    403,
    'PASSWORD_EXPIRED',
    'Your password has expired and must be changed before you can sign in.',
  );

// One dummy hash per cost, shared by service instances (hashing at the approved cost is slow).
const dummyHashes = new Map();

export function toUserProfile(userId, employeeNumber, employee) {
  return {
    id: userId,
    username: employee.username,
    employeeNumber,
    fullName: employee.fullName,
    email: employee.email,
    jobTitle: employee.jobTitle,
    department: employee.department,
  };
}

/**
 * Resolves the submitted username to exactly one employee with exactly one linked local account.
 * Anything else is reported as an anonymous failure without identifying an account.
 */
function resolveIdentity(candidates) {
  if (candidates.length === 0) return { reason: 'UNKNOWN_USERNAME' };
  if (candidates.length > 1) return { reason: 'AMBIGUOUS_USERNAME' };

  const [candidate] = candidates;
  if (!candidate.account) return { reason: 'NO_LOCAL_ACCOUNT' };
  if (candidate.employee.employeeRowCount !== 1) return { reason: 'AMBIGUOUS_EMPLOYEE_NUMBER' };
  return { candidate };
}

/** Account-state checks applied before the password is verified. */
function preVerificationDenial(candidate) {
  const { account, employee, dbNow } = candidate;

  if (account.lockedUntil instanceof Date && account.lockedUntil.getTime() > dbNow.getTime()) {
    return 'ACCOUNT_LOCKED';
  }
  if (account.accountStatus !== 'ACTIVE') return `ACCOUNT_${account.accountStatus}`;
  if (!account.passwordHash) return 'PASSWORD_NOT_SET';

  const eligibility = evaluateEmployeeEligibility(employee);
  return eligibility.eligible ? null : eligibility.reason;
}

export function createAuthService({
  authRepository = defaultAuthRepository,
  sessionRepository = defaultSessionRepository,
  auditService,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  argon2Cost,
}) {
  // Verifying against a fixed dummy hash when no real hash is available keeps the response time
  // of unknown, unlinked and ineligible usernames close to that of a wrong password.
  async function burnVerification(password) {
    const key = JSON.stringify(argon2Cost);
    if (!dummyHashes.has(key)) {
      dummyHashes.set(key, hashPassword('zr-dummy-password-not-a-credential', argon2Cost));
    }
    await verifyPassword(password, await dummyHashes.get(key));
  }

  /**
   * LOGIN_FAILED in its own transaction (Decision 03), so it persists although the request is
   * rejected and whether or not any other authentication write succeeded. FAILURE is a credential
   * failure; DENIED is a policy refusal (account state, eligibility, MFA, password age).
   */
  const loginFailed = (reasonCode, context, { subjectUserId = null, outcome, details } = {}) =>
    auditService.recordIndependently({
      eventCode: AUDIT_EVENTS.LOGIN_FAILED,
      outcome: outcome ?? AUDIT_OUTCOMES.FAILURE,
      actorType: ACTOR_TYPES.ANONYMOUS,
      subjectUserId,
      reasonCode,
      details,
      context,
    });

  async function handleWrongPassword(account, context) {
    let attempt;
    try {
      attempt = await withTransaction(POOLS.LOW, (connection) =>
        authRepository.recordFailedAttempt(connection, {
          userId: account.userId,
          maxFailures: LOCKOUT_POLICY.maxConsecutiveFailures,
          lockSeconds: LOCKOUT_POLICY.lockDurationMs / 1000,
        }),
      );
    } catch (error) {
      // The counter could not be updated; the failed attempt is still recorded.
      await loginFailed('INVALID_PASSWORD', context, {
        subjectUserId: account.userId,
        details: { lockoutCounterUpdated: false },
      });
      throw error;
    }

    await loginFailed(attempt ? 'INVALID_PASSWORD' : 'ACCOUNT_LOCKED', context, {
      subjectUserId: account.userId,
      outcome: attempt ? AUDIT_OUTCOMES.FAILURE : AUDIT_OUTCOMES.DENIED,
      details: attempt ? { consecutiveFailures: attempt.failedAttempts } : undefined,
    });

    if (attempt?.locked) {
      await auditService.recordIndependently({
        eventCode: AUDIT_EVENTS.ACCOUNT_LOCKED,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        actorType: ACTOR_TYPES.SYSTEM,
        subjectUserId: account.userId,
        target: { type: 'USER', id: account.userId },
        reasonCode: 'CONSECUTIVE_FAILED_LOGINS',
        details: {
          consecutiveFailures: attempt.failedAttempts,
          lockMinutes: LOCKOUT_POLICY.lockDurationMs / 60000,
        },
        context,
      });
    }
  }

  async function denyAfterPassword(account, reasonCode, details, context) {
    // The password was correct, so the consecutive-failure state is cleared even though no
    // session is issued. The denial is recorded even if that reset fails.
    try {
      await withTransaction(POOLS.LOW, (connection) =>
        authRepository.resetFailedAttempts(connection, account.userId),
      );
    } finally {
      await loginFailed(reasonCode, context, {
        subjectUserId: account.userId,
        outcome: AUDIT_OUTCOMES.DENIED,
        details,
      });
    }
  }

  async function issueSession(candidate, presentedToken, context) {
    const { account } = candidate;
    const token = generateSessionToken();

    const session = await withTransaction(POOLS.LOW, async (connection) => {
      if (!(await authRepository.recordLoginSuccess(connection, account.userId))) return null;

      // A cookie from an earlier session in this browser is revoked rather than left usable.
      if (isWellFormedToken(presentedToken)) {
        await sessionRepository.revokeSessionByTokenHash(connection, {
          tokenHash: hashSessionToken(presentedToken),
          actorUserId: account.userId,
        });
      }

      const created = await sessionRepository.insertSession(connection, {
        userId: account.userId,
        tokenHash: hashSessionToken(token),
        absoluteSeconds: SESSION_POLICY.absoluteLifetimeMs / 1000,
        ipAddress: context.ipAddress?.slice(0, 45) ?? null,
        userAgent: context.userAgent?.slice(0, 512) ?? null,
      });

      await auditService.record(connection, {
        eventCode: AUDIT_EVENTS.LOGIN_SUCCESS,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        actorType: ACTOR_TYPES.USER,
        actorUserId: account.userId,
        subjectUserId: account.userId,
        target: { type: 'USER_SESSION', id: created.sessionId },
        // Sessions issued here are never privileged: privileged users require MFA (Phase 02).
        details: { idleTimeoutMinutes: SESSION_POLICY.idleTimeoutMs / 60000 },
        context,
      });

      return created;
    });

    return session && { token, ...session };
  }

  return {
    /**
     * Password login. Throws AppError on every failure; persists failed/denied events and the
     * lockout state before throwing.
     *
     * @param {{ username: string, password: string }} credentials Joi-validated input.
     * @param {{ requestId: string, ipAddress?: string, userAgent?: string }} context
     * @param {string | undefined} presentedToken Session cookie already sent by the browser.
     */
    async login({ username, password }, context, presentedToken) {
      const candidates = await withConnection(POOLS.LOW, (connection) =>
        authRepository.findLoginCandidates(connection, username),
      );

      const identity = resolveIdentity(candidates);
      if (!identity.candidate) {
        await burnVerification(password);
        await loginFailed(identity.reason, context);
        throw authenticationFailed();
      }

      const { candidate } = identity;
      const { account } = candidate;

      const denial = preVerificationDenial(candidate);
      if (denial) {
        await burnVerification(password);
        await loginFailed(denial, context, {
          subjectUserId: account.userId,
          outcome: AUDIT_OUTCOMES.DENIED,
        });
        throw authenticationFailed();
      }

      const verification = await verifyPassword(password, account.passwordHash);
      if (verification === 'UNREADABLE' || verification === 'BELOW_MINIMUM') {
        logger.error(
          { correlationId: context.requestId, verification },
          'Stored password hash is not an Argon2id hash meeting the approved minimum',
        );
        await loginFailed(
          verification === 'UNREADABLE' ? 'CREDENTIAL_UNREADABLE' : 'CREDENTIAL_BELOW_MINIMUM',
          context,
          { subjectUserId: account.userId },
        );
        throw authenticationFailed();
      }
      if (verification === 'MISMATCH') {
        await handleWrongPassword(account, context);
        throw authenticationFailed();
      }

      // Phase 01 cannot verify MFA, so a required MFA step always fails closed.
      const mfa = evaluateMfaRequirement(account);
      if (mfa.required) {
        await denyAfterPassword(account, 'MFA_REQUIRED', { basis: mfa.basis }, context);
        throw mfaRequired();
      }

      const passwordState = evaluatePasswordExpiry(account.passwordChangedAt, candidate.dbNow);
      if (passwordState.expired) {
        const reason = passwordState.missing ? 'PASSWORD_CHANGE_TIME_MISSING' : 'PASSWORD_EXPIRED';
        await denyAfterPassword(account, reason, null, context);
        throw passwordExpired();
      }

      const session = await issueSession(candidate, presentedToken, context);
      if (!session) {
        // Disabled or locked between the lookup and the transaction.
        await loginFailed('ACCOUNT_STATE_CHANGED', context, {
          subjectUserId: account.userId,
          outcome: AUDIT_OUTCOMES.DENIED,
        });
        throw authenticationFailed();
      }

      return {
        token: session.token,
        csrfToken: deriveCsrfToken(session.token),
        user: toUserProfile(account.userId, candidate.employeeNumber, candidate.employee),
        session: {
          expiresAt: session.expiresAt,
          idleTimeoutSeconds: SESSION_POLICY.idleTimeoutMs / 1000,
          mfaVerified: false,
        },
        password: { expired: false, expiresAt: passwordState.expiresAt },
      };
    },
  };
}
