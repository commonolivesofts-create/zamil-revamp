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
import { createFailureRecorder, revokeSessionsAfterLockout } from './auth.lockout.js';
import { MFA_POLICY } from './auth.policy.js';
import { issueSessionInTransaction, sessionResult } from './auth.service.js';
import { MfaSecretUnreadable } from './mfaSecret.js';
import * as defaultSessionRepository from './session.repository.js';
import {
  deriveCsrfToken,
  generateSessionToken,
  hashSessionToken,
  isWellFormedToken,
} from './session.service.js';
import { base32Encode, otpauthUri, verifyTotp } from './totp.js';

const challengeInvalid = () =>
  new AppError(
    401,
    'MFA_CHALLENGE_INVALID',
    'Your sign-in has expired or is no longer valid. Sign in again.',
  );
const verificationFailed = () =>
  new AppError(
    401,
    'MFA_VERIFICATION_FAILED',
    'The verification code is incorrect, expired or already used.',
  );
const enrollmentRequired = () =>
  new AppError(409, 'MFA_ENROLLMENT_REQUIRED', 'Set up your authenticator app to continue.');
const alreadyEnrolled = () =>
  new AppError(409, 'MFA_ALREADY_ENROLLED', 'An authenticator is already set up for this account.');
const recentVerificationRequired = () =>
  new AppError(
    403,
    'MFA_RECENT_VERIFICATION_REQUIRED',
    'Sign in again with your authenticator, then make this change within 5 minutes.',
  );
const replacementConflict = () =>
  new AppError(
    409,
    'MFA_REPLACEMENT_CONFLICT',
    'The authenticator was changed by another request. Sign in again.',
  );
const mfaUnavailable = () =>
  new AppError(
    503,
    'MFA_UNAVAILABLE',
    'Multi-factor verification is temporarily unavailable. Contact your administrator.',
  );

class CompletionAborted extends Error {
  constructor(reason) {
    super(reason);
    this.reason = reason;
  }
}

// A normal session (8 h) can never be presented as an MFA challenge (5 min).
const CHALLENGE_TOLERANCE_MS = 1000;

/**
 * Evaluates a session row as an MFA login challenge. `deny` reasons are security-state changes
 * that revoke the challenge and are audited; `invalid` reasons are simply refused.
 */
function evaluateChallenge(row, policy) {
  const now = row.dbNow.getTime();
  const invalid = (reason) => ({ valid: false, reason, revoke: false });
  const deny = (reason) => ({ valid: false, reason, revoke: true });

  if (row.revokedAt || row.mfaVerifiedAt) return invalid('CHALLENGE_NOT_ACTIVE');
  if (row.expiresAt.getTime() <= now) return invalid('CHALLENGE_EXPIRED');
  if (
    row.expiresAt.getTime() - row.createdAt.getTime() >
    MFA_POLICY.challengeLifetimeMs + CHALLENGE_TOLERANCE_MS
  ) {
    return invalid('NOT_A_CHALLENGE');
  }
  if (row.accountStatus !== 'ACTIVE') return deny('ACCOUNT_NOT_ACTIVE');
  if (row.lockedUntil instanceof Date && row.lockedUntil.getTime() > now) {
    return deny('ACCOUNT_LOCKED');
  }

  const eligibility = evaluateEmployeeEligibility(row.employee);
  if (!eligibility.eligible) return deny(eligibility.reason);

  const mfa = evaluateMfaRequirement(row, policy);
  if (!mfa.required) return invalid('MFA_NOT_REQUIRED');

  const password = evaluatePasswordExpiry(row.passwordChangedAt, row.dbNow);
  if (password.expired) {
    return deny(password.missing ? 'PASSWORD_CHANGE_TIME_MISSING' : 'PASSWORD_EXPIRED');
  }
  return { valid: true, mfa, password };
}

/**
 * Phase 02 MFA: login challenge after a correct password, first-time authenticator enrollment for
 * mandatory-MFA users, and TOTP verification. A normal session is issued only after a verified code.
 *
 * @param {{ keyring: ReturnType<import('./mfaSecret.js').createMfaKeyring>, issuer: string }} options
 */
export function createMfaService({
  keyring,
  issuer,
  authRepository = defaultAuthRepository,
  sessionRepository = defaultSessionRepository,
  auditService,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  // config.auth.adminMfaRequired; false only for a validated non-production exception.
  adminMfaRequired = true,
}) {
  const mfaPolicy = { adminMfaRequired };
  const sessionDeps = { authRepository, sessionRepository, auditService };
  const recordAuthenticationFailure = createFailureRecorder({
    authRepository,
    auditService,
    withTransaction,
  });

  /** Setup material shown once to add an authenticator (enrollment or replacement). */
  function setupPayload(secret, { employee, employeeNumber }, expiresAt) {
    const accountName = employee?.username ?? employeeNumber;
    return {
      secret: base32Encode(secret),
      otpauthUri: otpauthUri({ issuer, accountName, secret }),
      issuer,
      accountName,
      algorithm: MFA_POLICY.algorithm,
      digits: MFA_POLICY.digits,
      periodSeconds: MFA_POLICY.periodSeconds,
      expiresAt,
    };
  }

  const loginFailed = (reasonCode, userId, context, outcome, details = null) =>
    auditService.recordIndependently({
      eventCode: AUDIT_EVENTS.LOGIN_FAILED,
      outcome,
      actorType: ACTOR_TYPES.ANONYMOUS,
      subjectUserId: userId,
      reasonCode,
      details,
      context,
    });

  async function revokeChallenge(challenge) {
    try {
      await withTransaction(POOLS.LOW, (connection) =>
        sessionRepository.revokeSession(connection, {
          sessionId: challenge.sessionId,
          actorUserId: null,
        }),
      );
    } catch (error) {
      logger.error({ err: error }, 'MFA challenge could not be revoked');
    }
  }

  /** Loads and validates the challenge for every MFA request; throws when it is not usable. */
  async function loadChallenge(token, context) {
    if (!isWellFormedToken(token)) throw challengeInvalid();

    const rows = await withConnection(POOLS.LOW, (connection) =>
      sessionRepository.findSessionByTokenHash(connection, hashSessionToken(token)),
    );
    if (rows.length !== 1) throw challengeInvalid();

    const [row] = rows;
    const evaluation = evaluateChallenge(row, mfaPolicy);
    if (!evaluation.valid) {
      if (evaluation.revoke) {
        await revokeChallenge(row);
        await loginFailed(evaluation.reason, row.userId, context, AUDIT_OUTCOMES.DENIED);
      }
      throw challengeInvalid();
    }
    return { ...row, mfa: evaluation.mfa, password: evaluation.password };
  }

  /** ACCESS_DENIED for a refused replacement request from an authenticated session. */
  const accessDenied = (auth, reasonCode, context) =>
    auditService.recordIndependently({
      eventCode: AUDIT_EVENTS.ACCESS_DENIED,
      outcome: AUDIT_OUTCOMES.DENIED,
      actorType: ACTOR_TYPES.USER,
      actorUserId: auth.userId,
      subjectUserId: auth.userId,
      target: { type: 'USER_SESSION', id: auth.sessionId },
      reasonCode,
      context,
    });

  const revokeAllSessions = (userId, context) =>
    revokeSessionsAfterLockout(
      { sessionRepository, auditService, withTransaction, logger },
      userId,
      context,
    );

  /**
   * Preconditions shared by both replacement steps: MFA verified on this session within the
   * recent-verification window (database clock), an enrolled and readable authenticator. Returns
   * the candidate secret, derived from the session and the currently stored ciphertext.
   */
  async function loadReplacement(auth, context) {
    const verifiedAt = auth.mfaVerifiedAt;
    const recent =
      verifiedAt instanceof Date &&
      auth.dbNow.getTime() - verifiedAt.getTime() < MFA_POLICY.replacementRecentVerificationMs;
    if (!recent) {
      await accessDenied(auth, 'MFA_RECENT_VERIFICATION_REQUIRED', context);
      throw recentVerificationRequired();
    }

    const credential = await withConnection(POOLS.LOW, (connection) =>
      authRepository.findMfaCredential(connection, auth.userId),
    );
    if (!credential) {
      await accessDenied(auth, 'MFA_NOT_ENROLLED', context);
      throw enrollmentRequired();
    }

    let current;
    try {
      current = keyring.decrypt(auth.userId, credential.encryptedSecret);
    } catch (error) {
      if (!(error instanceof MfaSecretUnreadable)) throw error;
      logger.error(
        { correlationId: context.requestId },
        'Stored MFA secret could not be decrypted',
      );
      await accessDenied(auth, 'MFA_SECRET_UNREADABLE', context);
      throw mfaUnavailable();
    }

    const candidate = keyring.replacementSecret(
      auth.userId,
      auth.sessionId,
      credential.encryptedSecret,
    );
    // The new authenticator must never share the old (possibly compromised) secret.
    if (candidate.equals(current)) throw mfaUnavailable();
    return { candidate, currentEncryptedSecret: credential.encryptedSecret };
  }

  /** Counts a wrong or replayed code toward the lockout; a lock also ends the challenge. */
  async function refuseCode(challenge, reasonCode, context) {
    const { locked } = await recordAuthenticationFailure(challenge.userId, reasonCode, context);
    if (locked) await revokeChallenge(challenge);
    throw verificationFailed();
  }

  async function complete(challenge, { mode, step, encryptedSecret }, presentedToken, context) {
    const { userId } = challenge;
    let issued;
    try {
      issued = await withTransaction(POOLS.LOW, async (connection) => {
        if (mode === 'ENROLL') {
          const enrolled = await authRepository.enrollMfa(connection, {
            userId,
            encryptedSecret,
            step,
          });
          if (!enrolled) throw new CompletionAborted('ALREADY_ENROLLED');
          // An MFA change revokes every active session and challenge of the user (docs/07 §4).
          // The count includes the completing challenge itself; only other sessions are audited.
          const otherSessionsRevoked =
            (await sessionRepository.revokeUserSessions(connection, {
              userId,
              actorUserId: userId,
            })) - 1;
          if (otherSessionsRevoked > 0) {
            await auditService.record(connection, {
              eventCode: AUDIT_EVENTS.SESSION_REVOKED,
              outcome: AUDIT_OUTCOMES.SUCCESS,
              actorType: ACTOR_TYPES.USER,
              actorUserId: userId,
              subjectUserId: userId,
              target: { type: 'USER', id: userId },
              reasonCode: 'MFA_ENROLLED',
              details: { sessionsRevoked: otherSessionsRevoked },
              context,
            });
          }
        } else {
          // Atomic replay guard: the step must be later than any step accepted before.
          if (!(await authRepository.recordMfaStep(connection, { userId, step }))) {
            throw new CompletionAborted('REPLAY');
          }
          await sessionRepository.revokeSession(connection, {
            sessionId: challenge.sessionId,
            actorUserId: userId,
          });
        }

        const result = await issueSessionInTransaction(connection, sessionDeps, {
          userId,
          presentedToken,
          mfaVerified: true,
          privileged: challenge.mfa.privileged,
          reasonCode: mode === 'ENROLL' ? 'MFA_ENROLLMENT_COMPLETED' : 'MFA_VERIFIED',
          context,
        });
        if (!result) throw new CompletionAborted('ACCOUNT_STATE_CHANGED');
        return result;
      });
    } catch (error) {
      if (!(error instanceof CompletionAborted)) throw error;
      if (error.reason === 'REPLAY') return refuseCode(challenge, 'MFA_CODE_REPLAYED', context);
      if (error.reason === 'ALREADY_ENROLLED') throw alreadyEnrolled();
      await loginFailed(error.reason, userId, context, AUDIT_OUTCOMES.DENIED);
      throw challengeInvalid();
    }

    return sessionResult(
      { userId, employeeNumber: challenge.employeeNumber, employee: challenge.employee },
      issued,
      challenge.password,
      true,
    );
  }

  return {
    /**
     * Creates the MFA login challenge after a correct password: a session row with a 5-minute
     * lifetime and MFA_VERIFIED_AT NULL, usable only by the MFA endpoints. A correct password is not
     * a failure, and authentication is not complete yet, so no audit event is written here:
     * LOGIN_SUCCESS follows only when the MFA-verified session is created, and every failed code
     * is recorded as LOGIN_FAILED.
     */
    async issueChallenge(candidate, _mfa, context) {
      const { account } = candidate;
      const token = generateSessionToken();

      const created = await withTransaction(POOLS.LOW, (connection) =>
        sessionRepository.insertSession(connection, {
          userId: account.userId,
          tokenHash: hashSessionToken(token),
          absoluteSeconds: MFA_POLICY.challengeLifetimeMs / 1000,
          ipAddress: context.ipAddress?.slice(0, 45) ?? null,
          userAgent: context.userAgent?.slice(0, 512) ?? null,
          mfaVerified: false,
        }),
      );

      return {
        kind: 'MFA_CHALLENGE',
        token,
        csrfToken: deriveCsrfToken(token),
        expiresAt: created.expiresAt,
        enrollmentRequired: !account.mfaEnrolled,
      };
    },

    /**
     * Starts first-time enrollment: returns the candidate secret (shown once, as a QR/otpauth URI)
     * for a mandatory-MFA user without an authenticator. Nothing is stored until confirmation.
     */
    async startEnrollment(token, context) {
      const challenge = await loadChallenge(token, context);
      if (challenge.mfaEnrolled) throw alreadyEnrolled();

      const secret = keyring.enrollmentSecret(challenge.userId, challenge.sessionId);
      return setupPayload(secret, challenge, challenge.expiresAt);
    },

    /**
     * Confirms enrollment with a code from the new authenticator (proof of possession), stores the
     * encrypted secret and issues an MFA-verified session.
     */
    async confirmEnrollment(token, code, context, presentedToken) {
      const challenge = await loadChallenge(token, context);
      if (challenge.mfaEnrolled) throw alreadyEnrolled();

      const secret = keyring.enrollmentSecret(challenge.userId, challenge.sessionId);
      const match = verifyTotp(secret, code, challenge.dbNow.getTime(), null);
      if (match.status !== 'MATCH') {
        return refuseCode(challenge, 'MFA_ENROLLMENT_CODE_INVALID', context);
      }

      return complete(
        challenge,
        {
          mode: 'ENROLL',
          step: match.step,
          encryptedSecret: keyring.encrypt(challenge.userId, secret),
        },
        presentedToken,
        context,
      );
    },

    /** Verifies a code from the enrolled authenticator and issues an MFA-verified session. */
    async verify(token, code, context, presentedToken) {
      const challenge = await loadChallenge(token, context);
      if (!challenge.mfaEnrolled) throw enrollmentRequired();

      const credential = await withConnection(POOLS.LOW, (connection) =>
        authRepository.findMfaCredential(connection, challenge.userId),
      );
      if (!credential) throw enrollmentRequired();

      let secret;
      try {
        secret = keyring.decrypt(challenge.userId, credential.encryptedSecret);
      } catch (error) {
        if (!(error instanceof MfaSecretUnreadable)) throw error;
        logger.error(
          { correlationId: context.requestId },
          'Stored MFA secret could not be decrypted',
        );
        await loginFailed(
          'MFA_SECRET_UNREADABLE',
          challenge.userId,
          context,
          AUDIT_OUTCOMES.FAILURE,
        );
        throw mfaUnavailable();
      }

      const match = verifyTotp(secret, code, challenge.dbNow.getTime(), credential.lastUsedStep);
      if (match.status !== 'MATCH') {
        const reason = match.status === 'REPLAY' ? 'MFA_CODE_REPLAYED' : 'MFA_CODE_INVALID';
        return refuseCode(challenge, reason, context);
      }

      return complete(challenge, { mode: 'VERIFY', step: match.step }, presentedToken, context);
    },

    /**
     * Starts replacing the enrolled authenticator from an authenticated session whose MFA was
     * verified within the last 5 minutes. Returns the new candidate secret (shown once); nothing
     * is stored until /mfa/replacement/confirm proves possession of the new authenticator.
     */
    async startReplacement(auth, context) {
      const replacement = await loadReplacement(auth, context);
      const expiresAt = new Date(
        auth.mfaVerifiedAt.getTime() + MFA_POLICY.replacementRecentVerificationMs,
      );
      return setupPayload(replacement.candidate, auth, expiresAt);
    },

    /**
     * Confirms the replacement with a code from the new authenticator, replaces the stored secret
     * (only if it is still the one read: optimistic concurrency) and revokes every session and
     * challenge of the user, including the current session. A new password + MFA sign-in is
     * required afterwards; codes from the old authenticator are never accepted again.
     */
    async confirmReplacement(auth, code, context) {
      const replacement = await loadReplacement(auth, context);
      const { userId } = auth;

      const match = verifyTotp(replacement.candidate, code, auth.dbNow.getTime(), null);
      if (match.status !== 'MATCH') {
        const { locked } = await recordAuthenticationFailure(
          userId,
          'MFA_REPLACEMENT_CODE_INVALID',
          context,
          {
            eventCode: AUDIT_EVENTS.ACCESS_DENIED,
            outcome: AUDIT_OUTCOMES.DENIED,
            actorUserId: userId,
            target: { type: 'USER_SESSION', id: auth.sessionId },
          },
        );
        // A lockout reached from inside a session ends every session of the user (fail closed).
        if (locked) await revokeAllSessions(userId, context);
        throw verificationFailed();
      }

      let sessionsRevoked;
      try {
        sessionsRevoked = await withTransaction(POOLS.LOW, async (connection) => {
          const replaced = await authRepository.replaceMfa(connection, {
            userId,
            currentEncryptedSecret: replacement.currentEncryptedSecret,
            encryptedSecret: keyring.encrypt(userId, replacement.candidate),
            step: match.step,
          });
          if (!replaced) throw new CompletionAborted('REPLACEMENT_CONFLICT');

          const revoked = await sessionRepository.revokeUserSessions(connection, {
            userId,
            actorUserId: userId,
          });
          await auditService.record(connection, {
            eventCode: AUDIT_EVENTS.SESSION_REVOKED,
            outcome: AUDIT_OUTCOMES.SUCCESS,
            actorType: ACTOR_TYPES.USER,
            actorUserId: userId,
            subjectUserId: userId,
            target: { type: 'USER', id: userId },
            reasonCode: 'MFA_REPLACED',
            details: { sessionsRevoked: revoked },
            context,
          });
          return revoked;
        });
      } catch (error) {
        if (!(error instanceof CompletionAborted)) throw error;
        await accessDenied(auth, 'MFA_REPLACEMENT_CONFLICT', context);
        throw replacementConflict();
      }

      return { replaced: true, sessionsRevoked, reauthenticationRequired: true };
    },
  };
}
