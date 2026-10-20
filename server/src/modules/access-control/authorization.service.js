import { POOLS, withConnection as defaultWithConnection } from '../../database/oracle.js';
import { ACTOR_TYPES, AUDIT_EVENTS, AUDIT_OUTCOMES } from '../audit/securityAudit.service.js';
import { PRIVILEGE_CLASSIFICATION } from '../auth/auth.policy.js';
import * as defaultRepository from './authorization.repository.js';

const CODE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Parses a permission key `MODULE_CODE.RESOURCE_CODE` plus an action. RESOURCE_CODE is unique only
 * within its module (UQ_ZRV_RES_MOD_CODE), so the module is part of every key. Codes cannot contain
 * a dot, so the key is unambiguous. Throws at startup for a malformed route declaration.
 */
export function parsePermission(resourceKey, actionCode) {
  const [moduleCode, resourceCode, extra] = String(resourceKey).split('.');
  if (extra !== undefined || !CODE.test(moduleCode ?? '') || !CODE.test(resourceCode ?? '')) {
    throw new Error(`Invalid permission resource key: ${resourceKey}`);
  }
  if (!CODE.test(actionCode ?? '')) throw new Error(`Invalid permission action: ${actionCode}`);
  return { moduleCode, resourceCode, actionCode };
}

export const permissionLabel = ({ moduleCode, resourceCode, actionCode }) =>
  `${moduleCode}.${resourceCode}:${actionCode}`;

const isSecurityModule = (moduleCode) =>
  PRIVILEGE_CLASSIFICATION.securityAdministrationModuleCodes.includes(moduleCode);

/**
 * Pure decision (deny by default): unknown or inactive permission → deny; active DENY override →
 * deny (wins over everything); ALLOW override or role grant → allow; otherwise deny. A
 * security-administration permission additionally requires an MFA-verified session.
 */
export function decide(facts, permission, auth) {
  if (!facts) return { allowed: false, reason: 'PERMISSION_UNKNOWN' };
  if (!facts.catalogActive) return { allowed: false, reason: 'PERMISSION_INACTIVE' };
  if (facts.denied) return { allowed: false, reason: 'EXPLICIT_DENY' };
  if (!facts.allowedByOverride && !facts.allowedByRole)
    return { allowed: false, reason: 'NO_GRANT' };
  if (isSecurityModule(permission.moduleCode) && !auth.mfaVerified) {
    return { allowed: false, reason: 'MFA_REQUIRED' };
  }
  return { allowed: true, permissionId: facts.permissionId };
}

export function createAuthorizationService({
  repository = defaultRepository,
  auditService,
  withConnection = defaultWithConnection,
}) {
  return {
    /** Request-time decision for the authenticated user (`req.auth`). Denials are audited. */
    async check(auth, permission, context) {
      const facts = await withConnection(POOLS.LOW, (connection) =>
        repository.findPermissionDecision(connection, { userId: auth.userId, ...permission }),
      );
      const decision = decide(facts, permission, auth);
      if (!decision.allowed) {
        await auditService.recordIndependently({
          eventCode: AUDIT_EVENTS.ACCESS_DENIED,
          outcome: AUDIT_OUTCOMES.DENIED,
          actorType: ACTOR_TYPES.USER,
          actorUserId: auth.userId,
          subjectUserId: auth.userId,
          target: { type: 'USER_SESSION', id: auth.sessionId },
          reasonCode: decision.reason,
          details: { permission: permissionLabel(permission) },
          context,
        });
      }
      return decision;
    },

    /** Whether a user effectively holds a permission (no MFA aspect, no audit): escalation checks. */
    async holds(userId, permission) {
      const facts = await withConnection(POOLS.LOW, (connection) =>
        repository.findPermissionDecision(connection, { userId, ...permission }),
      );
      return Boolean(
        facts?.catalogActive && !facts.denied && (facts.allowedByOverride || facts.allowedByRole),
      );
    },

    /** Every effective permission of a user. */
    effectivePermissions(userId) {
      return withConnection(POOLS.LOW, (connection) =>
        repository.listEffectivePermissions(connection, userId),
      );
    },
  };
}
