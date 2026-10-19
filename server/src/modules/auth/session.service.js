import { createHash, createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../database/oracle.js';
import { logger } from '../../shared/logger/index.js';
import { ACTOR_TYPES, AUDIT_EVENTS, AUDIT_OUTCOMES } from '../audit/securityAudit.service.js';
import {
  evaluateEmployeeEligibility,
  evaluateMfaRequirement,
  evaluatePasswordExpiry,
} from './auth.eligibility.js';
import { SESSION_POLICY } from './auth.policy.js';
import * as defaultRepository from './session.repository.js';

const TOKEN_BYTES = 32;
// 32 random bytes encode to exactly 43 base64url characters.
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;
const CSRF_CONTEXT = 'zr-csrf-v1';

/** A new 256-bit opaque session token. Only its SHA-256 digest is ever persisted. */
export function generateSessionToken() {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function isWellFormedToken(token) {
  return typeof token === 'string' && TOKEN_PATTERN.test(token);
}

/** SHA-256 digest stored in XX_ZRV_USER_SESSIONS.SESSION_TOKEN_HASH RAW(32). */
export function hashSessionToken(token) {
  return createHash('sha256').update(token, 'utf8').digest();
}

/**
 * Synchronizer CSRF token bound to the session: HMAC-SHA256 keyed by the secret session token.
 * It cannot be computed without the HttpOnly cookie value and does not reveal it.
 */
export function deriveCsrfToken(sessionToken) {
  return createHmac('sha256', Buffer.from(sessionToken, 'base64url'))
    .update(CSRF_CONTEXT)
    .digest('base64url');
}

export function csrfTokenMatches(expected, presented) {
  if (typeof presented !== 'string' || presented.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(presented), Buffer.from(expected));
}

// Session rejections that reflect a security-state change revoke the session (SESSION_REVOKED).
// Expiry and idleness are recorded as SESSION_EXPIRED without changing the session row. Unknown and
// already-revoked tokens are not audited.
const REVOKE_ON_REJECT = new Set([
  'ACCOUNT_NOT_ACTIVE',
  'EMPLOYEE_NOT_FOUND',
  'EMPLOYEE_AMBIGUOUS',
  'EMPLOYEE_NOT_CURRENT',
  'EMPLOYEE_TERMINATED',
  'MFA_REQUIRED',
]);
const EXPIRY_REASONS = new Set(['ABSOLUTE_EXPIRY', 'IDLE_TIMEOUT']);

function evaluateSession(row) {
  const now = row.dbNow.getTime();

  if (row.revokedAt) return { valid: false, reason: 'SESSION_REVOKED' };
  if (row.expiresAt.getTime() <= now) return { valid: false, reason: 'ABSOLUTE_EXPIRY' };
  if (row.accountStatus !== 'ACTIVE') return { valid: false, reason: 'ACCOUNT_NOT_ACTIVE' };

  const eligibility = evaluateEmployeeEligibility(row.employee);
  if (!eligibility.eligible) return { valid: false, reason: eligibility.reason };

  // Classification is re-evaluated on every request, so a session whose user became privileged
  // (or enrolled MFA) after login cannot continue without MFA.
  const mfa = evaluateMfaRequirement(row);
  if (mfa.required && !row.mfaVerifiedAt) {
    return { valid: false, reason: 'MFA_REQUIRED', details: { basis: mfa.basis } };
  }

  const idleTimeoutMs = mfa.privileged
    ? SESSION_POLICY.privilegedIdleTimeoutMs
    : SESSION_POLICY.idleTimeoutMs;
  if (now - row.lastActivityAt.getTime() >= idleTimeoutMs) {
    return { valid: false, reason: 'IDLE_TIMEOUT' };
  }

  return { valid: true, idleTimeoutMs };
}

export function createSessionService({
  repository = defaultRepository,
  auditService,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  touchIntervalMs,
}) {
  const sessionEvent = (eventCode, outcome, row, evaluation, context, details) => ({
    eventCode,
    outcome,
    actorType: ACTOR_TYPES.SYSTEM,
    subjectUserId: row.userId,
    target: { type: 'USER_SESSION', id: row.sessionId },
    reasonCode: evaluation.reason,
    details: details ?? evaluation.details ?? null,
    context,
  });

  // The request is denied whether or not the revocation write succeeds. If it fails, the denial
  // is still recorded independently (Decision 03).
  async function rejectAndRevoke(row, evaluation, context) {
    try {
      await withTransaction(POOLS.LOW, async (connection) => {
        await repository.revokeSession(connection, { sessionId: row.sessionId, actorUserId: null });
        await auditService.record(
          connection,
          sessionEvent(
            AUDIT_EVENTS.SESSION_REVOKED,
            AUDIT_OUTCOMES.SUCCESS,
            row,
            evaluation,
            context,
          ),
        );
      });
    } catch (error) {
      logger.error(
        { err: error, reason: evaluation.reason, correlationId: context.requestId },
        'Rejected session could not be revoked',
      );
      await auditService.recordIndependently(
        sessionEvent(AUDIT_EVENTS.ACCESS_DENIED, AUDIT_OUTCOMES.DENIED, row, evaluation, context, {
          ...evaluation.details,
          sessionRevoked: false,
        }),
      );
    }
  }

  return {
    /**
     * Validates a presented session token against the database on every request.
     *
     * @returns {Promise<{ ok: true, auth: object } | { ok: false, reason: string }>}
     */
    async authenticate(token, context) {
      if (!isWellFormedToken(token)) return { ok: false, reason: 'SESSION_MISSING' };

      const tokenHash = hashSessionToken(token);
      const rows = await withConnection(POOLS.LOW, (connection) =>
        repository.findSessionByTokenHash(connection, tokenHash),
      );
      if (rows.length === 0) return { ok: false, reason: 'SESSION_NOT_FOUND' };

      const [row] = rows;
      const evaluation =
        rows.length > 1 ? { valid: false, reason: 'EMPLOYEE_AMBIGUOUS' } : evaluateSession(row);

      if (!evaluation.valid) {
        if (REVOKE_ON_REJECT.has(evaluation.reason)) {
          await rejectAndRevoke(row, evaluation, context);
        } else if (EXPIRY_REASONS.has(evaluation.reason)) {
          await auditService.recordIndependently(
            sessionEvent(
              AUDIT_EVENTS.SESSION_EXPIRED,
              AUDIT_OUTCOMES.DENIED,
              row,
              evaluation,
              context,
            ),
          );
        }
        return { ok: false, reason: evaluation.reason };
      }

      // LAST_ACTIVITY_AT is persisted at most once per interval to limit writes; the idle timeout
      // is therefore accurate to within that interval.
      if (row.dbNow.getTime() - row.lastActivityAt.getTime() >= touchIntervalMs) {
        const touched = await withTransaction(POOLS.LOW, (connection) =>
          repository.touchSession(connection, { sessionId: row.sessionId, userId: row.userId }),
        );
        if (!touched) return { ok: false, reason: 'SESSION_REVOKED' };
      }

      const password = evaluatePasswordExpiry(row.passwordChangedAt, row.dbNow);

      return {
        ok: true,
        auth: {
          sessionId: row.sessionId,
          userId: row.userId,
          employeeNumber: row.employeeNumber,
          employee: row.employee,
          expiresAt: row.expiresAt,
          idleTimeoutMs: evaluation.idleTimeoutMs,
          mfaVerified: Boolean(row.mfaVerifiedAt),
          // An expired password does not end a valid bounded session (docs/07 §4).
          passwordExpired: password.expired,
          passwordExpiresAt: password.expiresAt,
          csrfToken: deriveCsrfToken(token),
        },
      };
    },

    /** Revokes the current session on logout and records the event in the same transaction. */
    async logout(auth, context) {
      await withTransaction(POOLS.LOW, async (connection) => {
        await repository.revokeSession(connection, {
          sessionId: auth.sessionId,
          actorUserId: auth.userId,
        });
        await auditService.record(connection, {
          eventCode: AUDIT_EVENTS.LOGOUT,
          outcome: AUDIT_OUTCOMES.SUCCESS,
          actorType: ACTOR_TYPES.USER,
          actorUserId: auth.userId,
          subjectUserId: auth.userId,
          target: { type: 'USER_SESSION', id: auth.sessionId },
          context,
        });
      });
    },
  };
}
