import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../database/oracle.js';
import { PRODUCT } from '../../config/product.js';
import { AppError } from '../../shared/errors/AppError.js';
import { logger } from '../../shared/logger/index.js';
import { ACTOR_TYPES, AUDIT_EVENTS, AUDIT_OUTCOMES } from '../audit/securityAudit.service.js';
import { createUnconfiguredDelivery, DeliveryUnavailable } from '../notifications/delivery.js';
import * as defaultUsersRepository from '../users/users.repository.js';
import * as defaultAuthRepository from './auth.repository.js';
import { evaluateEmployeeEligibility } from './auth.eligibility.js';
import { createFailureRecorder, revokeSessionsAfterLockout } from './auth.lockout.js';
import { ACTION_TOKEN_POLICY, MFA_POLICY, PRIVILEGE_CLASSIFICATION } from './auth.policy.js';
import { MfaSecretUnreadable } from './mfaSecret.js';
import { checkPasswordPolicy, hashPassword, verifyPassword } from './password.js';
import * as defaultRecoveryRepository from './recovery.repository.js';
import * as defaultSessionRepository from './session.repository.js';
import { generateSessionToken, hashSessionToken, isWellFormedToken } from './session.service.js';
import { base32Encode, otpauthUri, verifyTotp } from './totp.js';

/*
 * Authentication recovery (docs/07 §4–§5).
 *
 * Tokens: PASSWORD_SETUP 24 h, PASSWORD_RESET 30 min, MFA_RECOVERY 15 min; 256-bit random, only the
 * SHA-256 digest stored; single use (atomic guarded UPDATE); one outstanding per user and type
 * (issuance locks the user row and revokes the previous one); never returned by any API. A token is
 * created only together with an accepted delivery: the channel is called inside the issuing
 * transaction, so a failed delivery leaves no usable token.
 *
 * Authority:
 *   - Self-service password reset: ordinary employees and the Super Administrator (pinned address).
 *   - Self-service MFA recovery: the Super Administrator only.
 *   - Administrator-issued tokens: ordinary employees by holders of the route permission; other
 *     privileged accounts only by the Super Administrator with MFA verified within 5 minutes and an
 *     explicit target confirmation (Option A, no approval queue); never for the Super Administrator
 *     account (self-recovery only) or the actor's own account.
 * Completing a password setup activates the PENDING account (eligibility re-checked); completing a
 * reset or change revokes every session. MFA recovery replaces the authenticator only after the
 * token, the current password and a code from the new authenticator are all proven, so the account
 * is never left without MFA and the password alone never removes it.
 */
const TOKEN_TYPES = Object.freeze({
  SETUP: 'PASSWORD_SETUP',
  RESET: 'PASSWORD_RESET',
  MFA: 'MFA_RECOVERY',
});
const isZaid = (account) =>
  PRIVILEGE_CLASSIFICATION.protectedEmployeeNumbers.includes(account.employeeNumber);
const isPrivileged = (account) =>
  isZaid(account) || account.isPrivilegedRoleMember || account.hasSecurityAdministration;

const tokenInvalid = () =>
  new AppError(400, 'TOKEN_INVALID', 'This link is invalid or has expired. Request a new one.');
const deliveryUnavailable = (reason) =>
  new AppError(
    503,
    'DELIVERY_UNAVAILABLE',
    'Account recovery messages cannot be sent right now. Contact your administrator.',
    reason ? [{ field: 'delivery', message: reason }] : undefined,
  );
const recoveryFailed = () =>
  new AppError(401, 'RECOVERY_FAILED', 'The recovery could not be completed.');
const notApplicable = (reason) =>
  new AppError(409, 'RECOVERY_NOT_APPLICABLE', 'This action does not apply to the account', [
    { field: 'account', message: reason },
  ]);
const policyViolation = (failures, field = 'newPassword') =>
  new AppError(
    400,
    'PASSWORD_POLICY_VIOLATION',
    'The new password does not meet the password policy',
    failures.map((message) => ({ field, message })),
  );
const conflict = () =>
  new AppError(409, 'CONFLICT', 'The account changed while this request was processed');

class TokenRace extends Error {}
class Throttled extends Error {}

export function createRecoveryService({
  recoveryRepository = defaultRecoveryRepository,
  usersRepository = defaultUsersRepository,
  authRepository = defaultAuthRepository,
  sessionRepository = defaultSessionRepository,
  auditService,
  delivery = createUnconfiguredDelivery(),
  keyring = null,
  issuer = PRODUCT.name,
  argon2Cost,
  // Optional Set that tracks background self-service work (tests await it; production ignores it).
  backgroundTasks = null,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);
  const recordAuthenticationFailure = createFailureRecorder({
    authRepository,
    auditService,
    withTransaction,
  });

  const denied = (
    reasonCode,
    context,
    { actorUserId = null, subjectUserId = null, details } = {},
  ) =>
    auditService.recordIndependently({
      eventCode: AUDIT_EVENTS.ACCESS_DENIED,
      outcome: AUDIT_OUTCOMES.DENIED,
      ...(actorUserId
        ? { actorType: ACTOR_TYPES.USER, actorUserId }
        : { actorType: ACTOR_TYPES.ANONYMOUS }),
      subjectUserId,
      reasonCode,
      details,
      context,
    });

  async function loadAccount(userId) {
    return read((c) => usersRepository.findUserDetail(c, userId));
  }

  // --- Issuance -----------------------------------------------------------------------------------

  /**
   * Creates a token and hands it to the delivery channel inside one transaction. Throws
   * DeliveryUnavailable (nothing persisted) or Throttled. `actorUserId` null = anonymous request.
   */
  async function issueToken(account, actionType, { actorUserId, context, details = {} }) {
    const recipient = delivery.resolveRecipient(account, actionType);
    if (!delivery.configured) throw new DeliveryUnavailable('NO_CHANNEL_CONFIGURED');
    if (!recipient) throw new DeliveryUnavailable('RECIPIENT_UNAVAILABLE');
    const actor = actorUserId
      ? { actorType: ACTOR_TYPES.USER, actorUserId }
      : { actorType: ACTOR_TYPES.ANONYMOUS };
    const token = generateSessionToken();
    try {
      return await withTransaction(POOLS.LOW, async (c) => {
        if (!(await recoveryRepository.lockUser(c, account.userId))) throw conflict();
        const cooldownSeconds = ACTION_TOKEN_POLICY.issueCooldownMs / 1000;
        if (
          await recoveryRepository.hasRecentToken(c, {
            userId: account.userId,
            actionType,
            seconds: cooldownSeconds,
          })
        ) {
          throw new Throttled();
        }
        const previousTokensRevoked = await recoveryRepository.revokeOutstandingTokens(c, {
          userId: account.userId,
          actionType,
          actorUserId,
        });
        const issued = await recoveryRepository.insertToken(c, {
          userId: account.userId,
          actionType,
          tokenHash: hashSessionToken(token),
          lifetimeSeconds: ACTION_TOKEN_POLICY.lifetimeMs[actionType] / 1000,
          actorUserId,
        });
        await auditService.record(c, {
          eventCode: AUDIT_EVENTS.ACTION_TOKEN_ISSUED,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          ...actor,
          subjectUserId: account.userId,
          target: { type: 'ACTION_TOKEN', id: issued.tokenId },
          reasonCode: actionType,
          details: { recipientSource: recipient.source, previousTokensRevoked, ...details },
          context,
        });
        // Last step: if the provider refuses, the transaction (token and audit row) rolls back.
        await delivery
          .deliver({
            purpose: actionType,
            recipient,
            userId: account.userId,
            employeeNumber: account.employeeNumber,
            token,
            expiresAt: issued.expiresAt,
          })
          .catch((error) => {
            throw error instanceof DeliveryUnavailable
              ? error
              : new DeliveryUnavailable('DELIVERY_FAILED');
          });
        return issued;
      });
    } catch (error) {
      // Only channel failures are delivery failures; anything else (e.g. Oracle) propagates.
      if (!(error instanceof DeliveryUnavailable)) throw error;
      const { reason } = error;
      // No error object: provider errors may echo addresses; tokens and links are never logged.
      logger.error({ actionType, reason }, 'Action token delivery failed');
      await auditService.recordIndependently({
        eventCode: AUDIT_EVENTS.ACTION_TOKEN_ISSUED,
        outcome: AUDIT_OUTCOMES.FAILURE,
        ...actor,
        subjectUserId: account.userId,
        reasonCode: reason,
        details: { actionType },
        context,
      });
      throw new DeliveryUnavailable(reason);
    }
  }

  /** Why a self-service request cannot be honoured (null = it can). */
  function selfServiceDenial(account, purpose) {
    if (account.accountStatus !== 'ACTIVE') return `ACCOUNT_${account.accountStatus}`;
    const employment = evaluateEmployeeEligibility(account.employee);
    if (!employment.eligible) return employment.reason;
    if (purpose === TOKEN_TYPES.RESET) {
      if (!account.passwordSet) return 'PASSWORD_NOT_SET';
      if (!isZaid(account) && isPrivileged(account)) return 'SELF_SERVICE_NOT_PERMITTED';
    } else {
      if (!isZaid(account)) return 'SELF_SERVICE_NOT_PERMITTED';
      if (!account.mfaEnrolled) return 'MFA_NOT_ENROLLED';
    }
    return null;
  }

  /** Prerequisites of an administrator-issued token for the account (null = applicable). */
  function issuancePrerequisite(account, purpose) {
    const employment = evaluateEmployeeEligibility(account.employee);
    if (purpose === TOKEN_TYPES.SETUP) {
      if (account.accountStatus !== 'PENDING') return `ACCOUNT_${account.accountStatus}`;
      if (account.passwordSet) return 'PASSWORD_ALREADY_SET';
    } else if (account.accountStatus !== 'ACTIVE') {
      return `ACCOUNT_${account.accountStatus}`;
    }
    if (!employment.eligible) return employment.reason;
    if (purpose === TOKEN_TYPES.RESET && !account.passwordSet) return 'PASSWORD_NOT_SET';
    if (purpose === TOKEN_TYPES.MFA && !account.mfaEnrolled) return 'MFA_NOT_ENROLLED';
    return null;
  }

  // --- Token consumption ---------------------------------------------------------------------------

  async function loadToken(token, actionType, context) {
    if (!isWellFormedToken(token)) throw tokenInvalid();
    const found = await read((c) => recoveryRepository.findToken(c, hashSessionToken(token)));
    if (!found) {
      await denied('TOKEN_UNKNOWN', context, { details: { actionType } });
      throw tokenInvalid();
    }
    if (found.actionType !== actionType || !found.usable) {
      await denied(
        found.actionType !== actionType ? 'TOKEN_TYPE_MISMATCH' : 'TOKEN_NOT_USABLE',
        context,
        {
          subjectUserId: found.userId,
          details: { actionType },
        },
      );
      throw tokenInvalid();
    }
    return found;
  }

  /** Consumes the token and runs `work` in one transaction; a lost race is TOKEN_INVALID. */
  async function consumeWith(found, context, work) {
    try {
      return await withTransaction(POOLS.LOW, async (c) => {
        if (
          !(await recoveryRepository.consumeToken(c, {
            tokenId: found.tokenId,
            actorUserId: found.userId,
          }))
        ) {
          throw new TokenRace();
        }
        return work(c);
      });
    } catch (error) {
      if (!(error instanceof TokenRace)) throw error;
      await denied('TOKEN_NOT_USABLE', context, { subjectUserId: found.userId });
      throw tokenInvalid();
    }
  }

  const selfAudit = (userId, context, event) => ({
    outcome: AUDIT_OUTCOMES.SUCCESS,
    actorType: ACTOR_TYPES.USER,
    actorUserId: userId,
    subjectUserId: userId,
    target: { type: 'USER', id: userId },
    context,
    ...event,
  });

  /** Revokes every session (and challenge) plus outstanding reset tokens; audits revoked sessions. */
  async function endSessions(c, userId, actorUserId, reasonCode, context) {
    const sessionsRevoked = await sessionRepository.revokeUserSessions(c, { userId, actorUserId });
    const resetTokensRevoked = await recoveryRepository.revokeOutstandingTokens(c, {
      userId,
      actionType: TOKEN_TYPES.RESET,
      actorUserId,
    });
    if (sessionsRevoked > 0) {
      await auditService.record(
        c,
        selfAudit(userId, context, {
          actorUserId,
          eventCode: AUDIT_EVENTS.SESSION_REVOKED,
          reasonCode,
          details: { sessionsRevoked },
        }),
      );
    }
    return { sessionsRevoked, resetTokensRevoked };
  }

  async function completePasswordToken(actionType, { token, newPassword }, context) {
    const found = await loadToken(token, actionType, context);
    const failures = checkPasswordPolicy(newPassword);
    if (failures.length) throw policyViolation(failures);

    const account = await loadAccount(found.userId);
    const setup = actionType === TOKEN_TYPES.SETUP;
    const expectedStatus = setup ? 'PENDING' : 'ACTIVE';
    const employment = evaluateEmployeeEligibility(account?.employee);
    const reason = !account
      ? 'ACCOUNT_NOT_FOUND'
      : account.accountStatus !== expectedStatus
        ? `ACCOUNT_${account.accountStatus}`
        : setup && account.passwordSet
          ? 'PASSWORD_ALREADY_SET'
          : !employment.eligible
            ? employment.reason
            : null;
    if (reason) {
      await denied(reason, context, { subjectUserId: found.userId, details: { actionType } });
      throw new AppError(403, 'ACCOUNT_NOT_ELIGIBLE', 'This account cannot complete this action.');
    }
    if (!setup) {
      const current = await read((c) => recoveryRepository.findPasswordHash(c, found.userId));
      if (current && (await verifyPassword(newPassword, current)) === 'MATCH') {
        throw new AppError(
          400,
          'PASSWORD_REUSED',
          'Choose a password different from the current one',
        );
      }
    }
    const passwordHash = await hashPassword(newPassword, argon2Cost);

    const sessionsRevoked = await consumeWith(found, context, async (c) => {
      const updated = await recoveryRepository.setPassword(c, {
        userId: found.userId,
        passwordHash,
        expectedStatus,
        activate: setup,
        actorUserId: found.userId,
      });
      if (!updated) throw conflict();
      const ended = await endSessions(
        c,
        found.userId,
        found.userId,
        setup ? 'PASSWORD_SETUP' : 'PASSWORD_RESET',
        context,
      );
      await auditService.record(
        c,
        selfAudit(found.userId, context, {
          eventCode: AUDIT_EVENTS.PASSWORD_CHANGED,
          reasonCode: actionType,
          target: { type: 'ACTION_TOKEN', id: found.tokenId },
          details: ended,
        }),
      );
      if (setup) {
        await auditService.record(
          c,
          selfAudit(found.userId, context, {
            eventCode: AUDIT_EVENTS.ACCOUNT_ACTIVATED,
            reasonCode: 'PASSWORD_SETUP',
            details: { previousStatus: 'PENDING' },
          }),
        );
      }
      return ended.sessionsRevoked;
    });
    return {
      passwordChanged: true,
      accountStatus: 'ACTIVE',
      sessionsRevoked,
      signInRequired: true,
    };
  }

  // --- MFA recovery ----------------------------------------------------------------------------------

  async function loadMfaRecovery({ token, password }, context) {
    if (!keyring) {
      throw new AppError(
        503,
        'MFA_UNAVAILABLE',
        'Multi-factor verification is not available right now.',
      );
    }
    const found = await loadToken(token, TOKEN_TYPES.MFA, context);
    const account = await loadAccount(found.userId);
    const reason = !account
      ? 'ACCOUNT_NOT_FOUND'
      : account.accountStatus !== 'ACTIVE'
        ? `ACCOUNT_${account.accountStatus}`
        : account.locked
          ? 'ACCOUNT_LOCKED'
          : !evaluateEmployeeEligibility(account.employee).eligible
            ? evaluateEmployeeEligibility(account.employee).reason
            : !account.mfaEnrolled
              ? 'MFA_NOT_ENROLLED'
              : null;
    if (reason) {
      await denied(reason, context, {
        subjectUserId: found.userId,
        details: { actionType: TOKEN_TYPES.MFA },
      });
      throw recoveryFailed();
    }
    // The token alone (e-mail access) is never enough: the current password is required too.
    const stored = await read((c) => recoveryRepository.findPasswordHash(c, found.userId));
    if (!stored || (await verifyPassword(password, stored)) !== 'MATCH') {
      await recordAuthenticationFailure(found.userId, 'MFA_RECOVERY_PASSWORD_INVALID', context);
      throw recoveryFailed();
    }
    const credential = await read((c) => authRepository.findMfaCredential(c, found.userId));
    if (!credential) throw recoveryFailed();
    let current;
    try {
      current = keyring.decrypt(found.userId, credential.encryptedSecret);
    } catch (error) {
      // An unreadable stored secret is exactly what recovery repairs; only its ciphertext is bound.
      if (!(error instanceof MfaSecretUnreadable)) throw error;
      current = null;
    }
    const candidate = keyring.recoverySecret(
      found.userId,
      found.tokenId,
      credential.encryptedSecret,
    );
    if (current && candidate.equals(current)) throw recoveryFailed();
    return { found, account, candidate, credential };
  }

  /** Account-dependent part of a self-service request; outcomes are audited, never returned. */
  async function processSelfService({ username, purpose }, context) {
    const candidates = await read((c) => authRepository.findLoginCandidates(c, username));
    const linked = candidates.length === 1 ? candidates[0].account : null;
    const account = linked ? await loadAccount(linked.userId) : null;
    const reason =
      candidates.length === 0
        ? 'UNKNOWN_USERNAME'
        : candidates.length > 1
          ? 'AMBIGUOUS_USERNAME'
          : !account
            ? 'NO_LOCAL_ACCOUNT'
            : selfServiceDenial(account, purpose);
    if (reason) {
      await denied(reason, context, {
        subjectUserId: account?.userId ?? null,
        details: { purpose },
      });
      return;
    }
    try {
      await issueToken(account, purpose, {
        actorUserId: null,
        context,
        details: { selfService: true },
      });
    } catch (error) {
      if (error instanceof Throttled) {
        await denied('RECOVERY_THROTTLED', context, {
          subjectUserId: account.userId,
          details: { purpose },
        });
        return;
      }
      if (error instanceof DeliveryUnavailable) {
        if (error.reason === 'RECIPIENT_UNAVAILABLE') {
          await denied('RECIPIENT_UNAVAILABLE', context, {
            subjectUserId: account.userId,
            details: { purpose },
          });
        }
        return; // Same response; the failure is audited and logged.
      }
      throw error;
    }
  }

  return {
    TOKEN_TYPES,

    /**
     * Self-service request (anonymous). Only the account-independent configuration check runs
     * before the response; the lookup, token transaction and SMTP send run in the background, so
     * neither the response nor its timing depends on whether the username exists or is eligible.
     * Returns `{ completion }` (never awaited by the controller).
     */
    requestSelfService(input, context) {
      // Uniform for every username: without a channel nothing can ever be sent.
      if (!delivery.configured) throw deliveryUnavailable();
      const completion = processSelfService(input, context).catch((error) => {
        logger.error({ errorName: error?.name }, 'Self-service recovery request failed');
      });
      if (backgroundTasks) {
        backgroundTasks.add(completion);
        completion.finally(() => backgroundTasks.delete(completion));
      }
      return { completion };
    },

    /**
     * Administrator-issued token (`purpose` PASSWORD_SETUP, PASSWORD_RESET or MFA_RECOVERY). The
     * route has checked the permission. The token goes only to the delivery channel.
     */
    async issueForUser(actor, userId, { purpose, confirmEmployeeNumber }, context) {
      const account = await loadAccount(userId);
      if (!account) throw new AppError(404, 'RESOURCE_NOT_FOUND', 'The user was not found');
      const refuse = async (code, message) => {
        await denied(code, context, {
          actorUserId: actor.userId,
          subjectUserId: account.userId,
          details: { purpose },
        });
        throw new AppError(403, code, message);
      };
      if (account.userId === actor.userId) {
        await refuse(
          'SELF_MODIFICATION_FORBIDDEN',
          'Use self-service recovery for your own account.',
        );
      }
      if (isZaid(account)) {
        await refuse(
          'PROTECTED_ACCOUNT',
          'The Super Administrator recovers this account through verified self-service only.',
        );
      }
      const privilegedTarget = isPrivileged(account);
      if (privilegedTarget) {
        if (!isZaid(actor)) {
          await refuse(
            'PROTECTED_ACCOUNT',
            'Only the Super Administrator can authorize recovery of this account.',
          );
        }
        const verifiedAt = actor.mfaVerifiedAt;
        const recent =
          verifiedAt instanceof Date &&
          actor.dbNow.getTime() - verifiedAt.getTime() < ACTION_TOKEN_POLICY.recentVerificationMs;
        if (!recent) {
          await refuse(
            'MFA_RECENT_VERIFICATION_REQUIRED',
            'Verify your authenticator again (sign in within the last 5 minutes) to authorize this recovery.',
          );
        }
      }
      if (confirmEmployeeNumber !== account.employeeNumber) {
        throw new AppError(
          400,
          'CONFIRMATION_MISMATCH',
          'The confirmation does not match the selected account',
          [
            {
              field: 'confirmEmployeeNumber',
              message: 'must equal the employee number of the account',
            },
          ],
        );
      }
      const prerequisite = issuancePrerequisite(account, purpose);
      if (prerequisite) throw notApplicable(prerequisite);

      let issued;
      try {
        issued = await issueToken(account, purpose, {
          actorUserId: actor.userId,
          context,
          details: { authorizedBySuperAdministrator: privilegedTarget },
        });
      } catch (error) {
        if (error instanceof Throttled) {
          throw new AppError(
            429,
            'RECOVERY_THROTTLED',
            'A message was sent recently. Wait a few minutes before sending another.',
          );
        }
        if (error instanceof DeliveryUnavailable) throw deliveryUnavailable(error.reason);
        throw error;
      }
      return {
        userId: account.userId,
        actionType: purpose,
        expiresAt: issued.expiresAt,
        delivered: true,
        authorizedBySuperAdministrator: privilegedTarget,
      };
    },

    completeSetup: (input, context) => completePasswordToken(TOKEN_TYPES.SETUP, input, context),
    completeReset: (input, context) => completePasswordToken(TOKEN_TYPES.RESET, input, context),

    /** Authenticated password change: current password required; ends every session. */
    async changePassword(auth, { currentPassword, newPassword }, context) {
      const stored = await read((c) => recoveryRepository.findPasswordHash(c, auth.userId));
      if (!stored || (await verifyPassword(currentPassword, stored)) !== 'MATCH') {
        const { locked } = await recordAuthenticationFailure(
          auth.userId,
          'PASSWORD_CHANGE_CURRENT_INVALID',
          context,
          {
            eventCode: AUDIT_EVENTS.ACCESS_DENIED,
            outcome: AUDIT_OUTCOMES.DENIED,
            actorUserId: auth.userId,
            target: { type: 'USER_SESSION', id: auth.sessionId },
          },
        );
        if (locked) {
          await revokeSessionsAfterLockout(
            { sessionRepository, auditService, withTransaction, logger },
            auth.userId,
            context,
          );
        }
        throw new AppError(403, 'CURRENT_PASSWORD_INVALID', 'The current password is not correct');
      }
      const failures = checkPasswordPolicy(newPassword);
      if (failures.length) throw policyViolation(failures);
      if ((await verifyPassword(newPassword, stored)) === 'MATCH') {
        throw new AppError(
          400,
          'PASSWORD_REUSED',
          'Choose a password different from the current one',
        );
      }
      const passwordHash = await hashPassword(newPassword, argon2Cost);
      const sessionsRevoked = await withTransaction(POOLS.LOW, async (c) => {
        const updated = await recoveryRepository.setPassword(c, {
          userId: auth.userId,
          passwordHash,
          expectedStatus: 'ACTIVE',
          actorUserId: auth.userId,
        });
        if (!updated) throw conflict();
        const ended = await endSessions(c, auth.userId, auth.userId, 'PASSWORD_CHANGE', context);
        await auditService.record(
          c,
          selfAudit(auth.userId, context, {
            eventCode: AUDIT_EVENTS.PASSWORD_CHANGED,
            reasonCode: 'PASSWORD_CHANGE',
            details: ended,
          }),
        );
        return ended.sessionsRevoked;
      });
      return { passwordChanged: true, sessionsRevoked, signInRequired: true };
    },

    /** MFA recovery step 1: token + current password -> new authenticator setup (nothing stored). */
    async startMfaRecovery(input, context) {
      const { account, candidate } = await loadMfaRecovery(input, context);
      const accountName = account.employee?.username ?? account.employeeNumber;
      return {
        secret: base32Encode(candidate),
        otpauthUri: otpauthUri({ issuer, accountName, secret: candidate }),
        issuer,
        accountName,
        algorithm: MFA_POLICY.algorithm,
        digits: MFA_POLICY.digits,
        periodSeconds: MFA_POLICY.periodSeconds,
      };
    },

    /**
     * MFA recovery step 2: token + current password + code from the new authenticator. Consumes the
     * token, replaces the stored secret (optimistic: only if unchanged) and revokes every session.
     */
    async confirmMfaRecovery({ token, password, code }, context) {
      const { found, candidate, credential } = await loadMfaRecovery({ token, password }, context);
      const match = verifyTotp(candidate, code, found.dbNow.getTime(), null);
      if (match.status !== 'MATCH') {
        await recordAuthenticationFailure(found.userId, 'MFA_RECOVERY_CODE_INVALID', context);
        throw new AppError(
          401,
          'MFA_VERIFICATION_FAILED',
          'The code is not valid. Try the next code.',
        );
      }
      const sessionsRevoked = await consumeWith(found, context, async (c) => {
        const replaced = await authRepository.replaceMfa(c, {
          userId: found.userId,
          currentEncryptedSecret: credential.encryptedSecret,
          encryptedSecret: keyring.encrypt(found.userId, candidate),
          step: match.step,
        });
        if (!replaced) throw conflict();
        const revoked = await sessionRepository.revokeUserSessions(c, {
          userId: found.userId,
          actorUserId: found.userId,
        });
        await auditService.record(
          c,
          selfAudit(found.userId, context, {
            eventCode: AUDIT_EVENTS.MFA_RECOVERED,
            target: { type: 'ACTION_TOKEN', id: found.tokenId },
            details: { sessionsRevoked: revoked },
          }),
        );
        if (revoked > 0) {
          await auditService.record(
            c,
            selfAudit(found.userId, context, {
              eventCode: AUDIT_EVENTS.SESSION_REVOKED,
              reasonCode: 'MFA_RECOVERED',
              details: { sessionsRevoked: revoked },
            }),
          );
        }
        return revoked;
      });
      return { mfaRecovered: true, sessionsRevoked, signInRequired: true };
    },
  };
}
