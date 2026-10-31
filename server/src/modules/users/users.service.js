import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../database/oracle.js';
import { AppError } from '../../shared/errors/AppError.js';
import * as defaultRbacRepository from '../access-control/rbac.repository.js';
import { ACTOR_TYPES, AUDIT_EVENTS, AUDIT_OUTCOMES } from '../audit/securityAudit.service.js';
import { evaluateEmployeeEligibility, evaluatePasswordExpiry } from '../auth/auth.eligibility.js';
import { PRIVILEGE_CLASSIFICATION } from '../auth/auth.policy.js';
import * as defaultSessionRepository from '../auth/session.repository.js';
import * as defaultRepository from './users.repository.js';
import * as profileImageRepository from './profileImage.repository.js';
import { validateImage } from './profileImage.service.js';

/*
 * User administration (docs/07 §3–§5, §10B). `authorize` has already checked the actor's
 * USER_ACCOUNTS permission; these rules apply on top:
 *   - Accounts are provisioned PENDING without a password for an eligible employee whose USER_NAME
 *     is present and unambiguous; nothing is activated or granted automatically.
 *   - Activation requires an eligible employee and a password already set through the password-setup
 *     lifecycle (CK_ZRV_USERS_PWD); no temporary password is ever generated.
 *   - Disabling revokes every session and outstanding action token in the same transaction.
 *   - The Super Administrator's account (employee 2172) cannot be changed here by anyone; accounts
 *     that hold a protected administrator role or any security-administration permission are
 *     managed only by the Super Administrator; nobody changes their own account here.
 * Changes commit together with their audit rows; refusals are audited as ACCESS_DENIED.
 */
const isZaid = (user) =>
  PRIVILEGE_CLASSIFICATION.protectedEmployeeNumbers.includes(user.employeeNumber);

const REFUSALS = Object.freeze({
  PROTECTED_ACCOUNT: 'Only the Super Administrator can change this account.',
  SELF_MODIFICATION_FORBIDDEN: 'You cannot change your own account here.',
});

const notFound = (what) => new AppError(404, 'RESOURCE_NOT_FOUND', `The ${what} was not found`);
const isUniqueViolation = (error) =>
  error?.errorNum === 1 || /ORA-00001/.test(error?.message ?? '');

/** Escapes LIKE wildcards and builds an upper-case contains-pattern for the repository. */
export function searchPattern(search) {
  if (!search) return undefined;
  return `%${search.toUpperCase().replace(/[\\%_]/g, (c) => `\\${c}`)}%`;
}

/** Provisioning eligibility: employment (Decision 01) plus a present, unambiguous login username. */
export function evaluateProvisioning(candidates) {
  if (candidates.length === 0) return { eligible: false, reason: 'EMPLOYEE_NOT_FOUND' };
  const [candidate] = candidates;
  const employment = evaluateEmployeeEligibility({
    ...candidate.employee,
    employeeRowCount: candidates.length > 1 ? 2 : candidate.employee.employeeRowCount,
  });
  if (!employment.eligible) return employment;
  if (!candidate.employee.username?.trim()) return { eligible: false, reason: 'USERNAME_MISSING' };
  if (candidate.usernameCount !== 1) return { eligible: false, reason: 'USERNAME_AMBIGUOUS' };
  return { eligible: true };
}

/** Unmet activation prerequisites of an account (empty when it can be activated). */
export function activationPrerequisites(user) {
  const unmet = [];
  const employment = evaluateEmployeeEligibility(user.employee);
  if (!employment.eligible) unmet.push(employment.reason);
  if (!user.passwordSet || !user.passwordChangedAt) unmet.push('PASSWORD_NOT_SET');
  return unmet;
}

const toCandidate = (candidate, evaluation) => ({
  employeeNumber: candidate.employeeNumber,
  username: candidate.employee.username,
  fullName: candidate.employee.fullName,
  department: candidate.employee.department,
  jobTitle: candidate.employee.jobTitle,
  currentEmployeeFlag: candidate.employee.currentEmployeeFlag,
  terminationStatus: candidate.employee.terminationStatus,
  userId: candidate.userId,
  accountStatus: candidate.accountStatus,
  provisionable: candidate.userId === null && evaluation.eligible,
  ineligibilityReason: evaluation.eligible ? null : evaluation.reason,
});

export function createUsersService({
  repository = defaultRepository,
  sessionRepository = defaultSessionRepository,
  rbacRepository = defaultRbacRepository,
  auditService,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
  imageRepository = profileImageRepository,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  async function refuse(actor, reasonCode, context, target) {
    await auditService.recordIndependently({
      eventCode: AUDIT_EVENTS.ACCESS_DENIED,
      outcome: AUDIT_OUTCOMES.DENIED,
      actorType: ACTOR_TYPES.USER,
      actorUserId: actor.userId,
      subjectUserId: target.userId,
      target: { type: 'USER', id: target.userId },
      reasonCode,
      context,
    });
    throw new AppError(403, reasonCode, REFUSALS[reasonCode]);
  }

  async function loadUser(userId) {
    const user = await read((c) => repository.findUserDetail(c, userId));
    if (!user) throw notFound('user');
    return user;
  }

  /** Hierarchy for every change to an existing account. */
  async function loadTarget(actor, userId, context) {
    const target = await loadUser(userId);
    if (target.userId === actor.userId) {
      await refuse(actor, 'SELF_MODIFICATION_FORBIDDEN', context, target);
    }
    if (isZaid(target)) await refuse(actor, 'PROTECTED_ACCOUNT', context, target);
    const administrator = target.isPrivilegedRoleMember || target.hasSecurityAdministration;
    if (administrator && !isZaid(actor)) {
      await refuse(actor, 'PROTECTED_ACCOUNT', context, target);
    }
    return target;
  }

  const audit = (actor, context, target, event) => ({
    outcome: AUDIT_OUTCOMES.SUCCESS,
    actorType: ACTOR_TYPES.USER,
    actorUserId: actor.userId,
    subjectUserId: target.userId,
    target: { type: 'USER', id: target.userId },
    context,
    ...event,
  });

  async function toDetail(user) {
    const [roles, sessions] = await read(async (c) => [
      await rbacRepository.listUserRoles(c, user.userId),
      await repository.listActiveSessions(c, user.userId),
    ]);
    const employment = evaluateEmployeeEligibility(user.employee);
    const password = evaluatePasswordExpiry(user.passwordChangedAt, user.dbNow);
    const unmet = activationPrerequisites(user);
    return {
      userId: user.userId,
      employeeNumber: user.employeeNumber,
      account: {
        status: user.accountStatus,
        locked: user.locked,
        lockedUntil: user.locked ? user.lockedUntil : null,
        failedLoginAttempts: user.failedLoginAttempts,
        lastFailedLoginAt: user.lastFailedLoginAt,
        lastLoginAt: user.lastLoginAt,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      },
      password: {
        set: user.passwordSet,
        changedAt: user.passwordChangedAt,
        expiresAt: password.expiresAt,
        expired: user.passwordSet ? password.expired : null,
      },
      mfa: { enrolled: user.mfaEnrolled, enrolledAt: user.mfaEnrolledAt },
      employee: user.employee && {
        username: user.employee.username,
        fullName: user.employee.fullName,
        email: user.employee.email,
        jobTitle: user.employee.jobTitle,
        department: user.employee.department,
        currentEmployeeFlag: user.employee.currentEmployeeFlag,
        terminationStatus: user.employee.terminationStatus,
      },
      eligibility: {
        eligible: employment.eligible,
        reason: employment.eligible ? null : employment.reason,
      },
      classification: {
        protectedSuperAdministrator: isZaid(user),
        privilegedRoleMember: user.isPrivilegedRoleMember,
        securityAdministration: user.hasSecurityAdministration,
        mfaRequired:
          isZaid(user) ||
          user.isPrivilegedRoleMember ||
          user.hasSecurityAdministration ||
          user.mfaEnrolled,
      },
      activation: {
        ready: user.accountStatus !== 'ACTIVE' && unmet.length === 0,
        unmetPrerequisites: user.accountStatus === 'ACTIVE' ? [] : unmet,
      },
      roles,
      activeSessions: sessions,
    };
  }

  return {
    listUsers: (query) => read((c) => repository.listUsers(c, query)),

    async listCandidates({ limit, offset, search, hasAccount }) {
      const page = await read((c) =>
        repository.listEmployeeCandidates(c, {
          limit,
          offset,
          search: searchPattern(search),
          hasAccount,
        }),
      );
      return {
        total: page.total,
        items: page.items.map((candidate) =>
          toCandidate(candidate, evaluateProvisioning([candidate])),
        ),
      };
    },

    async getUser(userId) {
      return toDetail(await loadUser(userId));
    },

    async provision(actor, { employeeNumber }, context, profileImage) {
      const candidates = await read((c) => repository.findEmployeeCandidate(c, employeeNumber));
      if (candidates.length === 0) throw notFound('employee');
      if (candidates[0].userId !== null) {
        throw new AppError(409, 'ACCOUNT_EXISTS', 'An account already exists for this employee');
      }
      const evaluation = evaluateProvisioning(candidates);
      if (!evaluation.eligible) {
        throw new AppError(
          409,
          'EMPLOYEE_NOT_ELIGIBLE',
          'The employee is not eligible for an application account',
          [{ field: 'employeeNumber', message: evaluation.reason }],
        );
      }
      let userId;
      try {
        userId = await withTransaction(POOLS.LOW, async (c) => {
          const id = await repository.insertUser(c, { employeeNumber, actorUserId: actor.userId });
          if (profileImage) {
            const mimeType = validateImage(profileImage);
            await imageRepository.saveProfileImage(c, {
              userId: id,
              data: profileImage.buffer,
              mimeType,
            });
          }
          await auditService.record(
            c,
            audit(
              actor,
              context,
              { userId: id },
              {
                eventCode: AUDIT_EVENTS.ACCOUNT_PROVISIONED,
                details: { accountStatus: 'PENDING' },
              },
            ),
          );
          return id;
        });
      } catch (error) {
        if (isUniqueViolation(error)) {
          throw new AppError(409, 'ACCOUNT_EXISTS', 'An account already exists for this employee');
        }
        throw error;
      }
      return toDetail(await loadUser(userId));
    },

    async activate(actor, userId, context) {
      const target = await loadTarget(actor, userId, context);
      if (target.accountStatus === 'ACTIVE') return { ...(await toDetail(target)), changed: false };
      const unmet = activationPrerequisites(target);
      if (unmet.length > 0) {
        throw new AppError(
          409,
          'ACTIVATION_PREREQUISITES_NOT_MET',
          'The account cannot be activated yet',
          unmet.map((reason) => ({ field: 'account', message: reason })),
        );
      }
      const activated = await withTransaction(POOLS.LOW, async (c) => {
        const changed = await repository.activateUser(c, { userId, actorUserId: actor.userId });
        if (changed) {
          await auditService.record(
            c,
            audit(actor, context, target, {
              eventCode: AUDIT_EVENTS.ACCOUNT_ACTIVATED,
              details: { previousStatus: target.accountStatus },
            }),
          );
        }
        return changed;
      });
      if (!activated) {
        throw new AppError(409, 'CONFLICT', 'The account changed; reload and try again');
      }
      return { ...(await toDetail(await loadUser(userId))), changed: true };
    },

    async disable(actor, userId, context) {
      const target = await loadTarget(actor, userId, context);
      const result = await withTransaction(POOLS.LOW, async (c) => {
        const changed = await repository.disableUser(c, { userId, actorUserId: actor.userId });
        if (!changed) return { changed: false, sessionsRevoked: 0 };
        // docs/07 §4: disabling revokes every session; outstanding action tokens die with it.
        const sessionsRevoked = await sessionRepository.revokeUserSessions(c, {
          userId,
          actorUserId: actor.userId,
        });
        const tokensRevoked = await repository.revokeActionTokens(c, {
          userId,
          actorUserId: actor.userId,
        });
        await auditService.record(
          c,
          audit(actor, context, target, {
            eventCode: AUDIT_EVENTS.ACCOUNT_DISABLED,
            details: { previousStatus: target.accountStatus, sessionsRevoked, tokensRevoked },
          }),
        );
        if (sessionsRevoked > 0) {
          await auditService.record(
            c,
            audit(actor, context, target, {
              eventCode: AUDIT_EVENTS.SESSION_REVOKED,
              reasonCode: 'ACCOUNT_DISABLED',
              details: { sessionsRevoked },
            }),
          );
        }
        return { changed: true, sessionsRevoked };
      });
      return { ...(await toDetail(await loadUser(userId))), ...result };
    },

    async revokeSessions(actor, userId, context) {
      const target = await loadTarget(actor, userId, context);
      const sessionsRevoked = await withTransaction(POOLS.LOW, async (c) => {
        const count = await sessionRepository.revokeUserSessions(c, {
          userId,
          actorUserId: actor.userId,
        });
        if (count > 0) {
          await auditService.record(
            c,
            audit(actor, context, target, {
              eventCode: AUDIT_EVENTS.SESSION_REVOKED,
              reasonCode: 'ADMIN_REVOKED',
              details: { sessionsRevoked: count },
            }),
          );
        }
        return count;
      });
      return { userId, sessionsRevoked };
    },

    async revokeSession(actor, userId, sessionId, context) {
      const target = await loadTarget(actor, userId, context);
      const session = await read((c) => repository.findSession(c, { userId, sessionId }));
      if (!session) throw notFound('session');
      const changed = await withTransaction(POOLS.LOW, async (c) => {
        const revoked = await repository.revokeUserSession(c, {
          userId,
          sessionId,
          actorUserId: actor.userId,
        });
        if (revoked) {
          await auditService.record(
            c,
            audit(actor, context, target, {
              eventCode: AUDIT_EVENTS.SESSION_REVOKED,
              reasonCode: 'ADMIN_REVOKED',
              target: { type: 'USER_SESSION', id: sessionId },
            }),
          );
        }
        return revoked;
      });
      return { userId, sessionId, revoked: true, changed };
    },
  };
}
