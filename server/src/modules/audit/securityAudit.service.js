import { POOLS, withTransaction as defaultWithTransaction } from '../../database/oracle.js';
import { logger } from '../../shared/logger/index.js';
import * as defaultRepository from './securityAudit.repository.js';

/*
 * Approved security audit catalogue (Phase 01 security review, Decision 07). Codes satisfy
 * CK_ZRV_AUD_EVENT (^[A-Z][A-Z0-9_]*$, EVENT_CODE VARCHAR2(80)). The outcome distinguishes a
 * credential FAILURE from a policy DENIED for the same event; REASON_CODE (VARCHAR2(60), no CHECK)
 * carries the specific cause.
 *
 * Writes are INSERT-only (Decision 03): this service and its repository expose no update or
 * delete operation, and tests/audit-append-only.test.js guards against adding one.
 */
export const AUDIT_EVENTS = Object.freeze({
  LOGIN_SUCCESS: 'LOGIN_SUCCESS',
  LOGIN_FAILED: 'LOGIN_FAILED',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  LOGOUT: 'LOGOUT',
  SESSION_REVOKED: 'SESSION_REVOKED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  ACCESS_DENIED: 'ACCESS_DENIED',
  // One-time initial security catalogue and Super Administrator provisioning (docs/07 §10B).
  SECURITY_BOOTSTRAP: 'SECURITY_BOOTSTRAP',
  // RBAC administration (approved for Phase 03); each commits with its change. Denials use
  // ACCESS_DENIED.
  RBAC_ROLE_CREATED: 'RBAC_ROLE_CREATED',
  RBAC_ROLE_UPDATED: 'RBAC_ROLE_UPDATED',
  RBAC_ROLE_ACTIVATED: 'RBAC_ROLE_ACTIVATED',
  RBAC_ROLE_DEACTIVATED: 'RBAC_ROLE_DEACTIVATED',
  RBAC_CATALOG_CHANGED: 'RBAC_CATALOG_CHANGED',
  RBAC_PERMISSION_GRANTED: 'RBAC_PERMISSION_GRANTED',
  RBAC_PERMISSION_REVOKED: 'RBAC_PERMISSION_REVOKED',
  RBAC_ROLE_ASSIGNED: 'RBAC_ROLE_ASSIGNED',
  RBAC_ROLE_UNASSIGNED: 'RBAC_ROLE_UNASSIGNED',
  RBAC_OVERRIDE_SET: 'RBAC_OVERRIDE_SET',
  RBAC_OVERRIDE_REVOKED: 'RBAC_OVERRIDE_REVOKED',
});

export const AUDIT_OUTCOMES = Object.freeze({
  SUCCESS: 'SUCCESS',
  FAILURE: 'FAILURE',
  DENIED: 'DENIED',
});

export const ACTOR_TYPES = Object.freeze({
  USER: 'USER',
  SYSTEM: 'SYSTEM',
  ANONYMOUS: 'ANONYMOUS',
});

const truncate = (value, max) => (typeof value === 'string' ? value.slice(0, max) : null);

/**
 * Builds a row that satisfies the table's CHECK constraints: CREATED_BY is set only for USER
 * actors, TARGET_TYPE/TARGET_RECORD_ID are both present or both null, and EVENT_DETAILS is JSON.
 * `details` must contain only sanitized, non-secret values chosen by the caller.
 */
export function buildAuditEvent({
  eventCode,
  outcome,
  actorType,
  actorUserId = null,
  subjectUserId = null,
  target = null,
  reasonCode = null,
  details = null,
  context = {},
}) {
  if (actorType === ACTOR_TYPES.USER && !actorUserId) {
    throw new Error('USER audit events require an actor user ID');
  }

  return {
    eventCode,
    eventOutcome: outcome,
    actorType,
    subjectUserId,
    targetType: target ? target.type : null,
    targetRecordId: target ? target.id : null,
    reasonCode,
    correlationId: truncate(context.requestId, 64),
    clientIpAddress: truncate(context.ipAddress, 45),
    userAgent: truncate(context.userAgent, 512),
    eventDetails: details ? JSON.stringify(details) : null,
    createdBy: actorType === ACTOR_TYPES.USER ? actorUserId : null,
  };
}

export function createSecurityAuditService({
  repository = defaultRepository,
  withTransaction = defaultWithTransaction,
} = {}) {
  return {
    /** Records an event inside the caller's transaction, so it commits or rolls back with it. */
    async record(connection, event) {
      await repository.insertAuditEvent(connection, buildAuditEvent(event));
    },

    /**
     * Records an event in its own LOW transaction, independent of any business transaction, so
     * failed and denied security events persist even when the request itself is rejected. An
     * audit-write failure is logged (without event details) but never changes the response.
     */
    async recordIndependently(event) {
      const row = buildAuditEvent(event);
      try {
        await withTransaction(POOLS.LOW, (connection) =>
          repository.insertAuditEvent(connection, row),
        );
      } catch (error) {
        logger.error(
          { err: error, eventCode: row.eventCode, correlationId: row.correlationId },
          'Security audit event could not be persisted',
        );
      }
    },
  };
}
