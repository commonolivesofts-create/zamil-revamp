import {
  POOLS,
  withConnection as defaultWithConnection,
  withTransaction as defaultWithTransaction,
} from '../../database/oracle.js';
import { AppError } from '../../shared/errors/AppError.js';
import { ACTOR_TYPES, AUDIT_EVENTS, AUDIT_OUTCOMES } from '../audit/securityAudit.service.js';
import { PRIVILEGE_CLASSIFICATION } from '../auth/auth.policy.js';
import { permissionLabel } from './authorization.service.js';
import * as defaultRepository from './rbac.repository.js';
import { ADMINISTRATOR_ROLES } from './securityCatalog.js';

/*
 * RBAC administration rules (docs/07 §5–§6, §10B). Enforced here, after `authorize` has checked the
 * actor's resource/action permission:
 *   - Protected administrator roles (SUPER_/MAIN_ADMINISTRATOR, ADMINISTRATOR) cannot be renamed,
 *     deactivated or re-activated through the API. SUPER_ADMINISTRATOR is never assigned or
 *     unassigned through the API (reserved for Zaid), and its security permissions are never revoked.
 *   - Only Zaid (protected employee number) manages: MAIN_/ADMINISTRATOR memberships and grants,
 *     SUPER_ADMINISTRATOR grants, accounts that hold a protected role, the security-administration
 *     module, and any security-administration permission (grants, roles containing them, overrides).
 *   - No overrides on Zaid's account; nobody changes their own roles or overrides.
 *   - No escalation: an actor can grant, assign (via a role) or ALLOW only permissions they hold.
 * Every change and its RBAC_* audit row commit in one transaction; refusals are audited as
 * ACCESS_DENIED independently of the request.
 */
const PROTECTED_ROLES = new Set(PRIVILEGE_CLASSIFICATION.privilegedRoleCodes);
const SUPER = ADMINISTRATOR_ROLES.SUPER_ADMINISTRATOR;
const isZaid = (user) =>
  PRIVILEGE_CLASSIFICATION.protectedEmployeeNumbers.includes(user.employeeNumber);
const isSecurityModule = (moduleCode) =>
  PRIVILEGE_CLASSIFICATION.securityAdministrationModuleCodes.includes(moduleCode);

const notFound = (what) => new AppError(404, 'RESOURCE_NOT_FOUND', `The ${what} was not found`);
const conflict = (message) => new AppError(409, 'CONFLICT', message);
const inactive = (what) => new AppError(409, 'INACTIVE_TARGET', `The ${what} is not active`);

const REFUSALS = Object.freeze({
  PROTECTED_ROLE: 'Protected administrator roles cannot be changed this way.',
  PROTECTED_ACCOUNT: 'Only the Super Administrator can change this account.',
  PROTECTED_CATALOG: 'The security administration catalogue cannot be changed this way.',
  SUPER_ADMINISTRATOR_ONLY: 'Only the Super Administrator can make this change.',
  SELF_MODIFICATION_FORBIDDEN: 'You cannot change your own roles or permissions.',
  PRIVILEGE_ESCALATION_FORBIDDEN: 'You cannot grant access that you do not hold yourself.',
});

const isUniqueViolation = (error) =>
  error?.errorNum === 1 || /ORA-00001/.test(error?.message ?? '');

export function createRbacService({
  repository = defaultRepository,
  authorizationService,
  auditService,
  withConnection = defaultWithConnection,
  withTransaction = defaultWithTransaction,
}) {
  const read = (work) => withConnection(POOLS.LOW, work);

  async function refuse(
    actor,
    reasonCode,
    context,
    { target = null, subjectUserId = null, details = null } = {},
  ) {
    await auditService.recordIndependently({
      eventCode: AUDIT_EVENTS.ACCESS_DENIED,
      outcome: AUDIT_OUTCOMES.DENIED,
      actorType: ACTOR_TYPES.USER,
      actorUserId: actor.userId,
      subjectUserId: subjectUserId ?? actor.userId,
      target,
      reasonCode,
      details,
      context,
    });
    throw new AppError(403, reasonCode, REFUSALS[reasonCode]);
  }

  /** Runs a change and, if it changed anything, its audit row in the same transaction. */
  async function change(actor, context, work, uniqueMessage) {
    try {
      return await withTransaction(POOLS.LOW, async (connection) => {
        const result = await work(connection);
        if (result.audit) {
          await auditService.record(connection, {
            outcome: AUDIT_OUTCOMES.SUCCESS,
            actorType: ACTOR_TYPES.USER,
            actorUserId: actor.userId,
            subjectUserId: actor.userId,
            context,
            ...result.audit,
          });
        }
        return result.value;
      });
    } catch (error) {
      if (uniqueMessage && isUniqueViolation(error)) throw conflict(uniqueMessage);
      throw error;
    }
  }

  async function loadRole(roleId) {
    const role = await read((c) => repository.findRole(c, roleId));
    if (!role) throw notFound('role');
    return role;
  }

  async function loadPermission(permissionId) {
    const permission = await read((c) => repository.findPermission(c, permissionId));
    if (!permission) throw notFound('permission');
    return permission;
  }

  /** Target account checks shared by role and override administration. */
  async function loadTarget(actor, userId, context, { overrides = false } = {}) {
    const target = await read((c) => repository.findUser(c, userId));
    if (!target) throw notFound('user');
    const denial = { subjectUserId: target.userId, target: { type: 'USER', id: target.userId } };
    if (target.userId === actor.userId) {
      await refuse(actor, 'SELF_MODIFICATION_FORBIDDEN', context, denial);
    }
    if (overrides && isZaid(target)) await refuse(actor, 'PROTECTED_ACCOUNT', context, denial);
    const roleCodes = await read((c) => repository.listActiveRoleCodes(c, target.userId));
    const isProtected = isZaid(target) || roleCodes.some((code) => PROTECTED_ROLES.has(code));
    if (isProtected && !isZaid(actor)) await refuse(actor, 'PROTECTED_ACCOUNT', context, denial);
    return target;
  }

  /** The actor may only pass on permissions they hold; security permissions are Zaid's alone. */
  async function assertMayGrant(actor, permission, context, denial) {
    if (isZaid(actor)) return;
    if (isSecurityModule(permission.moduleCode)) {
      await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, {
        ...denial,
        details: { permission: permissionLabel(permission) },
      });
    }
    if (!(await authorizationService.holds(actor.userId, permission))) {
      await refuse(actor, 'PRIVILEGE_ESCALATION_FORBIDDEN', context, {
        ...denial,
        details: { permission: permissionLabel(permission) },
      });
    }
  }

  async function assertRoleChangeable(actor, role, context) {
    if (PROTECTED_ROLES.has(role.roleCode)) {
      await refuse(actor, 'PROTECTED_ROLE', context, { target: { type: 'ROLE', id: role.roleId } });
    }
  }

  /** Grants on protected roles: SUPER_ADMINISTRATOR/MAIN/ADMINISTRATOR only by Zaid. */
  async function assertRoleGrantsChangeable(actor, role, context) {
    if (PROTECTED_ROLES.has(role.roleCode) && !isZaid(actor)) {
      await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, {
        target: { type: 'ROLE', id: role.roleId },
      });
    }
  }

  return {
    // --- Roles ---------------------------------------------------------------------------------
    listRoles: (page) => read((c) => repository.listRoles(c, page)),

    async createRole(actor, { roleCode, roleName, description }, context) {
      const roleId = await change(
        actor,
        context,
        async (c) => {
          const id = await repository.insertRole(c, {
            roleCode,
            roleName,
            description: description ?? null,
            actorUserId: actor.userId,
          });
          return {
            value: id,
            audit: {
              eventCode: AUDIT_EVENTS.RBAC_ROLE_CREATED,
              target: { type: 'ROLE', id },
              details: { roleCode },
            },
          };
        },
        'A role with this code already exists',
      );
      return loadRole(roleId);
    },

    async updateRole(actor, roleId, changes, context) {
      const role = await loadRole(roleId);
      await assertRoleChangeable(actor, role, context);
      await change(actor, context, async (c) => {
        await repository.updateRole(c, {
          roleId,
          roleName: changes.roleName ?? role.roleName,
          description: changes.description === undefined ? role.description : changes.description,
          actorUserId: actor.userId,
        });
        return {
          audit: {
            eventCode: AUDIT_EVENTS.RBAC_ROLE_UPDATED,
            target: { type: 'ROLE', id: roleId },
            details: { roleCode: role.roleCode, fields: Object.keys(changes).sort() },
          },
        };
      });
      return loadRole(roleId);
    },

    async setRoleActive(actor, roleId, isActive, context) {
      const role = await loadRole(roleId);
      await assertRoleChangeable(actor, role, context);
      await change(actor, context, async (c) => {
        const changed = await repository.setActive(c, {
          entity: 'ROLE',
          id: roleId,
          isActive,
          actorUserId: actor.userId,
        });
        return {
          audit: changed && {
            eventCode: isActive
              ? AUDIT_EVENTS.RBAC_ROLE_ACTIVATED
              : AUDIT_EVENTS.RBAC_ROLE_DEACTIVATED,
            target: { type: 'ROLE', id: roleId },
            details: { roleCode: role.roleCode },
          },
        };
      });
      return loadRole(roleId);
    },

    // --- Permission catalogue ------------------------------------------------------------------
    getCatalog: () => read((c) => repository.listCatalog(c)),

    async createModule(actor, input, context) {
      const moduleId = await change(
        actor,
        context,
        async (c) => {
          const id = await repository.insertModule(c, {
            moduleCode: input.moduleCode,
            moduleName: input.moduleName,
            description: input.description ?? null,
            displayOrder: input.displayOrder ?? 0,
            actorUserId: actor.userId,
          });
          return {
            value: id,
            audit: {
              eventCode: AUDIT_EVENTS.RBAC_CATALOG_CHANGED,
              target: { type: 'APP_MODULE', id },
              reasonCode: 'MODULE_CREATED',
              details: { moduleCode: input.moduleCode },
            },
          };
        },
        'A module with this code already exists',
      );
      return { moduleId, moduleCode: input.moduleCode };
    },

    async createResource(actor, moduleId, input, context) {
      const module = await read((c) => repository.findModule(c, moduleId));
      if (!module) throw notFound('module');
      if (isSecurityModule(module.moduleCode) && !isZaid(actor)) {
        await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, {
          target: { type: 'APP_MODULE', id: moduleId },
        });
      }
      const resourceId = await change(
        actor,
        context,
        async (c) => {
          const id = await repository.insertResource(c, {
            moduleId,
            resourceCode: input.resourceCode,
            resourceName: input.resourceName,
            description: input.description ?? null,
            actorUserId: actor.userId,
          });
          return {
            value: id,
            audit: {
              eventCode: AUDIT_EVENTS.RBAC_CATALOG_CHANGED,
              target: { type: 'RESOURCE', id },
              reasonCode: 'RESOURCE_CREATED',
              details: { moduleCode: module.moduleCode, resourceCode: input.resourceCode },
            },
          };
        },
        'A resource with this code already exists in the module',
      );
      return { resourceId, moduleCode: module.moduleCode, resourceCode: input.resourceCode };
    },

    async createPermission(actor, resourceId, input, context) {
      const resource = await read((c) => repository.findResource(c, resourceId));
      if (!resource) throw notFound('resource');
      if (isSecurityModule(resource.moduleCode) && !isZaid(actor)) {
        await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, {
          target: { type: 'RESOURCE', id: resourceId },
        });
      }
      const key = { moduleCode: resource.moduleCode, resourceCode: resource.resourceCode };
      const permissionId = await change(
        actor,
        context,
        async (c) => {
          const id = await repository.insertPermission(c, {
            resourceId,
            actionCode: input.actionCode,
            description: input.description ?? null,
            actorUserId: actor.userId,
          });
          return {
            value: id,
            audit: {
              eventCode: AUDIT_EVENTS.RBAC_CATALOG_CHANGED,
              target: { type: 'PERMISSION', id },
              reasonCode: 'PERMISSION_CREATED',
              details: { permission: permissionLabel({ ...key, actionCode: input.actionCode }) },
            },
          };
        },
        'This action already exists for the resource',
      );
      return { permissionId, ...key, actionCode: input.actionCode };
    },

    /** Activates/deactivates a module, resource or permission (never in the security module). */
    async setCatalogActive(actor, entity, id, isActive, context) {
      const lookup = {
        MODULE: () => read((c) => repository.findModule(c, id)),
        RESOURCE: () => read((c) => repository.findResource(c, id)),
        PERMISSION: () => read((c) => repository.findPermission(c, id)),
      }[entity];
      const item = await lookup();
      if (!item) throw notFound(entity.toLowerCase());
      const target = { type: entity === 'MODULE' ? 'APP_MODULE' : entity, id };
      if (isSecurityModule(item.moduleCode)) {
        await refuse(actor, 'PROTECTED_CATALOG', context, { target });
      }
      const changed = await change(actor, context, async (c) => {
        const updated = await repository.setActive(c, {
          entity,
          id,
          isActive,
          actorUserId: actor.userId,
        });
        return {
          value: updated,
          audit: updated && {
            eventCode: AUDIT_EVENTS.RBAC_CATALOG_CHANGED,
            target,
            reasonCode: `${entity}_${isActive ? 'ACTIVATED' : 'DEACTIVATED'}`,
          },
        };
      });
      return { [`${entity.toLowerCase()}Id`]: id, isActive, changed };
    },

    // --- Role permissions --------------------------------------------------------------------------
    async listRolePermissions(roleId) {
      await loadRole(roleId);
      return read((c) => repository.listRolePermissions(c, roleId));
    },

    async grantRolePermission(actor, roleId, permissionId, context) {
      const role = await loadRole(roleId);
      const permission = await loadPermission(permissionId);
      await assertRoleGrantsChangeable(actor, role, context);
      if (!role.isActive) throw inactive('role');
      if (!permission.chainActive) throw inactive('permission');
      // Security permissions on a non-protected role would create privileged users outside the
      // administrator hierarchy: Zaid only (assertMayGrant).
      await assertMayGrant(actor, permission, context, { target: { type: 'ROLE', id: roleId } });

      const changed = await change(actor, context, async (c) => {
        const granted = await repository.grantRolePermission(c, {
          roleId,
          permissionId,
          actorUserId: actor.userId,
        });
        return {
          value: granted,
          audit: granted && {
            eventCode: AUDIT_EVENTS.RBAC_PERMISSION_GRANTED,
            target: { type: 'ROLE', id: roleId },
            details: { roleCode: role.roleCode, permission: permissionLabel(permission) },
          },
        };
      });
      return { roleId, permissionId, granted: true, changed };
    },

    async revokeRolePermission(actor, roleId, permissionId, context) {
      const role = await loadRole(roleId);
      const permission = await loadPermission(permissionId);
      // The Super Administrator must never lose security administration (lockout protection).
      if (role.roleCode === SUPER && isSecurityModule(permission.moduleCode)) {
        await refuse(actor, 'PROTECTED_ROLE', context, { target: { type: 'ROLE', id: roleId } });
      }
      await assertRoleGrantsChangeable(actor, role, context);
      if (isSecurityModule(permission.moduleCode) && !isZaid(actor)) {
        await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, {
          target: { type: 'ROLE', id: roleId },
        });
      }

      const changed = await change(actor, context, async (c) => {
        const revoked = await repository.revokeRolePermission(c, {
          roleId,
          permissionId,
          actorUserId: actor.userId,
        });
        return {
          value: revoked,
          audit: revoked && {
            eventCode: AUDIT_EVENTS.RBAC_PERMISSION_REVOKED,
            target: { type: 'ROLE', id: roleId },
            details: { roleCode: role.roleCode, permission: permissionLabel(permission) },
          },
        };
      });
      return { roleId, permissionId, granted: false, changed };
    },

    // --- User roles --------------------------------------------------------------------------------
    async listUserRoles(userId) {
      const user = await read((c) => repository.findUser(c, userId));
      if (!user) throw notFound('user');
      return read((c) => repository.listUserRoles(c, userId));
    },

    async assignUserRole(actor, userId, roleId, { expiresAt = null }, context) {
      const role = await loadRole(roleId);
      const denial = { target: { type: 'ROLE', id: roleId }, subjectUserId: userId };
      if (role.roleCode === SUPER) await refuse(actor, 'PROTECTED_ROLE', context, denial);
      if (PROTECTED_ROLES.has(role.roleCode) && !isZaid(actor)) {
        await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, denial);
      }
      const target = await loadTarget(actor, userId, context);
      if (!role.isActive) throw inactive('role');

      // Assigning a role passes on all of its permissions: the actor must hold every one.
      const grants = await read((c) => repository.listActiveRoleGrantKeys(c, roleId));
      for (const permission of grants) {
        await assertMayGrant(actor, permission, context, denial);
      }

      await change(actor, context, async (c) => {
        await repository.assignUserRole(c, {
          userId: target.userId,
          roleId,
          expiresAt,
          actorUserId: actor.userId,
        });
        return {
          audit: {
            eventCode: AUDIT_EVENTS.RBAC_ROLE_ASSIGNED,
            subjectUserId: target.userId,
            target: { type: 'ROLE', id: roleId },
            details: { roleCode: role.roleCode, expiresAt: expiresAt?.toISOString() ?? null },
          },
        };
      });
      return { userId: target.userId, roleId, roleCode: role.roleCode, assigned: true, expiresAt };
    },

    async unassignUserRole(actor, userId, roleId, context) {
      const role = await loadRole(roleId);
      const denial = { target: { type: 'ROLE', id: roleId }, subjectUserId: userId };
      if (role.roleCode === SUPER) await refuse(actor, 'PROTECTED_ROLE', context, denial);
      if (PROTECTED_ROLES.has(role.roleCode) && !isZaid(actor)) {
        await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, denial);
      }
      const target = await loadTarget(actor, userId, context);

      const changed = await change(actor, context, async (c) => {
        const removed = await repository.unassignUserRole(c, {
          userId: target.userId,
          roleId,
          actorUserId: actor.userId,
        });
        return {
          value: removed,
          audit: removed && {
            eventCode: AUDIT_EVENTS.RBAC_ROLE_UNASSIGNED,
            subjectUserId: target.userId,
            target: { type: 'ROLE', id: roleId },
            details: { roleCode: role.roleCode },
          },
        };
      });
      return { userId: target.userId, roleId, assigned: false, changed };
    },

    // --- Overrides -----------------------------------------------------------------------------------
    async listUserOverrides(userId) {
      const user = await read((c) => repository.findUser(c, userId));
      if (!user) throw notFound('user');
      return read((c) => repository.listUserOverrides(c, userId));
    },

    async setOverride(
      actor,
      userId,
      permissionId,
      { effect, justification, expiresAt = null },
      context,
    ) {
      const permission = await loadPermission(permissionId);
      const target = await loadTarget(actor, userId, context, { overrides: true });
      const denial = {
        target: { type: 'PERMISSION', id: permissionId },
        subjectUserId: target.userId,
      };
      if (isSecurityModule(permission.moduleCode) && !isZaid(actor)) {
        await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, denial);
      }
      if (effect === 'ALLOW') await assertMayGrant(actor, permission, context, denial);

      await change(actor, context, async (c) => {
        await repository.setOverride(c, {
          userId: target.userId,
          permissionId,
          effect,
          justification,
          expiresAt,
          actorUserId: actor.userId,
        });
        return {
          audit: {
            eventCode: AUDIT_EVENTS.RBAC_OVERRIDE_SET,
            subjectUserId: target.userId,
            target: { type: 'PERMISSION', id: permissionId },
            details: {
              permission: permissionLabel(permission),
              effect,
              expiresAt: expiresAt?.toISOString() ?? null,
            },
          },
        };
      });
      return { userId: target.userId, permissionId, effect, expiresAt, isActive: true };
    },

    async revokeOverride(actor, userId, permissionId, context) {
      const permission = await loadPermission(permissionId);
      const target = await loadTarget(actor, userId, context, { overrides: true });
      const denial = {
        target: { type: 'PERMISSION', id: permissionId },
        subjectUserId: target.userId,
      };
      if (isSecurityModule(permission.moduleCode) && !isZaid(actor)) {
        await refuse(actor, 'SUPER_ADMINISTRATOR_ONLY', context, denial);
      }
      // Removing a DENY restores access, so it is held to the same no-escalation rule as an ALLOW.
      const current = (await read((c) => repository.listUserOverrides(c, target.userId))).find(
        (item) => item.permissionId === permissionId && item.isActive,
      );
      if (current?.effect === 'DENY') await assertMayGrant(actor, permission, context, denial);

      const changed = await change(actor, context, async (c) => {
        const revoked = await repository.revokeOverride(c, {
          userId: target.userId,
          permissionId,
          actorUserId: actor.userId,
        });
        return {
          value: revoked,
          audit: revoked && {
            eventCode: AUDIT_EVENTS.RBAC_OVERRIDE_REVOKED,
            subjectUserId: target.userId,
            target: { type: 'PERMISSION', id: permissionId },
            details: { permission: permissionLabel(permission), effect: current?.effect ?? null },
          },
        };
      });
      return { userId: target.userId, permissionId, isActive: false, changed };
    },

    // --- Effective permissions -----------------------------------------------------------------------
    async effectivePermissionsOf(userId) {
      const user = await read((c) => repository.findUser(c, userId));
      if (!user) throw notFound('user');
      return authorizationService.effectivePermissions(userId);
    },
  };
}
