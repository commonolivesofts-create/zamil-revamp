import { POOLS } from '../../database/oracle.js';
import { ACTOR_TYPES, AUDIT_EVENTS, AUDIT_OUTCOMES } from '../audit/securityAudit.service.js';
import { LOCKOUT_POLICY } from './auth.policy.js';

/**
 * Consecutive authentication failures (wrong password or wrong/replayed MFA code) share the
 * XX_ZRV_USERS failure counter: five in a row lock the account for 15 minutes. The counter is reset
 * only by a completed authentication, so a password holder cannot reset it between MFA guesses.
 *
 * Each failure is audited in its own transaction (Decision 03): by default as an anonymous
 * LOGIN_FAILED/FAILURE; failures inside an authenticated session (MFA replacement) pass
 * `{ eventCode: ACCESS_DENIED, outcome: DENIED, actorUserId }`. The lock is audited as
 * ACCOUNT_LOCKED. Returns `{ locked }`; rethrows a counter-update failure after recording it.
 */
export function createFailureRecorder({ authRepository, auditService, withTransaction }) {
  return async function recordAuthenticationFailure(
    userId,
    reasonCode,
    context,
    {
      eventCode = AUDIT_EVENTS.LOGIN_FAILED,
      outcome = AUDIT_OUTCOMES.FAILURE,
      actorUserId = null,
      target = null,
    } = {},
  ) {
    const actor = actorUserId
      ? { actorType: ACTOR_TYPES.USER, actorUserId }
      : { actorType: ACTOR_TYPES.ANONYMOUS };
    let attempt;
    try {
      attempt = await withTransaction(POOLS.LOW, (connection) =>
        authRepository.recordFailedAttempt(connection, {
          userId,
          maxFailures: LOCKOUT_POLICY.maxConsecutiveFailures,
          lockSeconds: LOCKOUT_POLICY.lockDurationMs / 1000,
        }),
      );
    } catch (error) {
      // The counter could not be updated; the failed attempt is still recorded.
      await auditService.recordIndependently({
        eventCode,
        outcome,
        ...actor,
        subjectUserId: userId,
        target,
        reasonCode,
        details: { lockoutCounterUpdated: false },
        context,
      });
      throw error;
    }

    await auditService.recordIndependently({
      eventCode,
      outcome: attempt ? outcome : AUDIT_OUTCOMES.DENIED,
      ...actor,
      subjectUserId: userId,
      target,
      reasonCode: attempt ? reasonCode : 'ACCOUNT_LOCKED',
      details: attempt ? { consecutiveFailures: attempt.failedAttempts } : null,
      context,
    });

    if (attempt?.locked) {
      await auditService.recordIndependently({
        eventCode: AUDIT_EVENTS.ACCOUNT_LOCKED,
        outcome: AUDIT_OUTCOMES.SUCCESS,
        actorType: ACTOR_TYPES.SYSTEM,
        subjectUserId: userId,
        target: { type: 'USER', id: userId },
        reasonCode: 'CONSECUTIVE_FAILED_LOGINS',
        details: {
          consecutiveFailures: attempt.failedAttempts,
          lockMinutes: LOCKOUT_POLICY.lockDurationMs / 60000,
        },
        context,
      });
    }
    return { locked: !attempt || attempt.locked };
  };
}
