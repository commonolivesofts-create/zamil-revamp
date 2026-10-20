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
import { createFailureRecorder } from './auth.lockout.js';
import { SESSION_POLICY } from './auth.policy.js';
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
    'This account requires multi-factor verification, which is not available right now. Contact your administrator.',
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

/**
 * Issues a normal authenticated session inside the caller's transaction: re-checks that the
 * account is ACTIVE, has a password and is not locked (resetting the failure counter and setting
 * LAST_LOGIN_AT), revokes any session cookie the browser presented, inserts the session (with
 * MFA_VERIFIED_AT when MFA was verified) and records LOGIN_SUCCESS. Returns null when the account no
 * longer qualifies; the caller must then roll back and refuse.
 */
export async function issueSessionInTransaction(
  connection,
  { authRepository, sessionRepository, auditService },
  { userId, presentedToken, mfaVerified, privileged, reasonCode = null, context },
) {
  if (!(await authRepository.recordLoginSuccess(connection, userId))) return null;

  if (isWellFormedToken(presentedToken)) {
    await sessionRepository.revokeSessionByTokenHash(connection, {
      tokenHash: hashSessionToken(presentedToken),
      actorUserId: userId,
    });
  }

  const token = generateSessionToken();
  const created = await sessionRepository.insertSession(connection, {
    userId,
    tokenHash: hashSessionToken(token),
    absoluteSeconds: SESSION_POLICY.absoluteLifetimeMs / 1000,
    ipAddress: context.ipAddress?.slice(0, 45) ?? null,
    userAgent: context.userAgent?.slice(0, 512) ?? null,
    mfaVerified,
  });
  const idleTimeoutMs = privileged
    ? SESSION_POLICY.privilegedIdleTimeoutMs
    : SESSION_POLICY.idleTimeoutMs;

  await auditService.record(connection, {
    eventCode: AUDIT_EVENTS.LOGIN_SUCCESS,
    outcome: AUDIT_OUTCOMES.SUCCESS,
    actorType: ACTOR_TYPES.USER,
    actorUserId: userId,
    subjectUserId: userId,
    target: { type: 'USER_SESSION', id: created.sessionId },
    reasonCode,
    details: { idleTimeoutMinutes: idleTimeoutMs / 60000, mfaVerified },
    context,
  });

  return { token, sessionId: created.sessionId, expiresAt: created.expiresAt, idleTimeoutMs };
}

/** Response model shared by password login and MFA completion. */
export function sessionResult(
  { userId, employeeNumber, employee },
  issued,
  passwordState,
  mfaVerified,
) {
  return {
    kind: 'SESSION',
    token: issued.token,
    csrfToken: deriveCsrfToken(issued.token),
    user: toUserProfile(userId, employeeNumber, employee),
    session: {
      expiresAt: issued.expiresAt,
      idleTimeoutSeconds: issued.idleTimeoutMs / 1000,
      mfaVerified,
    },
    password: { expired: false, expiresAt: passwordState.expiresAt },
  };
}

export function createAuthService({
  authRepository = defaultAuthRepository,
  sessionRepository = defaultSessionRepository,
  auditService,
  mfaService = null,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  argon2Cost,
}) {
  const recordAuthenticationFailure = createFailureRecorder({
    authRepository,
    auditService,
    withTransaction,
  });

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

  async function denyAfterPassword(account, reasonCode, details, context) {
    // The password was correct and no further factor can follow, so the consecutive-failure state
    // is cleared even though no session is issued. The denial is recorded even if the reset fails.
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

  async function denyExpiredPassword(account, passwordState, context) {
    const reason = passwordState.missing ? 'PASSWORD_CHANGE_TIME_MISSING' : 'PASSWORD_EXPIRED';
    await denyAfterPassword(account, reason, null, context);
    throw passwordExpired();
  }

  return {
    /**
     * Password login. Returns `{ kind: 'SESSION', ... }` for a completed login, or
     * `{ kind: 'MFA_CHALLENGE', ... }` when MFA must still be verified. Throws AppError on every
     * failure; persists failed/denied events and the lockout state before throwing.
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
        await recordAuthenticationFailure(account.userId, 'INVALID_PASSWORD', context);
        throw authenticationFailed();
      }

      const mfa = evaluateMfaRequirement(account);
      const passwordState = evaluatePasswordExpiry(account.passwordChangedAt, candidate.dbNow);

      if (mfa.required) {
        // Without the MFA key ring, MFA cannot be completed: fail closed exactly as in Phase 01.
        if (!mfaService) {
          await denyAfterPassword(account, 'MFA_REQUIRED', { basis: mfa.basis }, context);
          throw mfaRequired();
        }
        if (passwordState.expired) await denyExpiredPassword(account, passwordState, context);
        // The failure counter is deliberately not reset here: only a completed MFA resets it.
        return mfaService.issueChallenge(candidate, mfa, context);
      }

      if (passwordState.expired) await denyExpiredPassword(account, passwordState, context);

      const issued = await withTransaction(POOLS.LOW, (connection) =>
        issueSessionInTransaction(
          connection,
          { authRepository, sessionRepository, auditService },
          {
            userId: account.userId,
            presentedToken,
            mfaVerified: false,
            privileged: false,
            context,
          },
        ),
      );
      if (!issued) {
        // Disabled or locked between the lookup and the transaction.
        await loginFailed('ACCOUNT_STATE_CHANGED', context, {
          subjectUserId: account.userId,
          outcome: AUDIT_OUTCOMES.DENIED,
        });
        throw authenticationFailed();
      }

      return sessionResult(
        {
          userId: account.userId,
          employeeNumber: candidate.employeeNumber,
          employee: candidate.employee,
        },
        issued,
        passwordState,
        false,
      );
    },
  };
}
