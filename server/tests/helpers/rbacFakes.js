import { randomBytes } from 'node:crypto';
import { config } from '../../src/config/index.js';
import { PRIVILEGE_CLASSIFICATION } from '../../src/modules/auth/auth.policy.js';
import { deriveCsrfToken, hashSessionToken } from '../../src/modules/auth/session.service.js';
import {
  ADMINISTRATOR_ROLE_DEFINITIONS,
  SECURITY_MODULE,
  SECURITY_RESOURCES,
} from '../../src/modules/access-control/securityCatalog.js';

/*
 * In-memory doubles for the RBAC tables and the authorization/RBAC repositories, installed into an
 * auth store (its `state`, so transactions roll RBAC changes back too). They mirror the repository
 * semantics: effective = active, unexpired membership of an active role with an active grant, or
 * an active, unexpired ALLOW override; an active, unexpired DENY override wins; module, resource and
 * permission must be active; unique keys raise ORA-00001. They do NOT prove the SQL itself; see
 * scripts/verify-auth-sql.js for read-only checks against the real Oracle schema.
 *
 * With `syncPrivilegeFlags`, each user's session classification flags (IS_PRIVILEGED_ROLE_MEMBER,
 * HAS_SECURITY_ADMINISTRATION) are derived from these tables after every change, as the session
 * SQL derives them from the real tables on every request.
 */
const uniqueViolation = (constraint) =>
  Object.assign(new Error(`ORA-00001: unique constraint (${constraint}) violated`), {
    errorNum: 1,
  });

export function installRbac(store, { syncPrivilegeFlags = false } = {}) {
  store.state.rbac = {
    nextId: 1000,
    modules: [],
    resources: [],
    permissions: [],
    roles: [],
    rolePermissions: [],
    userRoles: [],
    overrides: [],
  };
  const t = () => store.state.rbac; // re-read: a rollback replaces the object
  const nowMs = () => store.now().getTime();
  const newId = () => String(t().nextId++);
  const notExpired = (row) => !row.expiresAt || row.expiresAt.getTime() > nowMs();
  const stamp = (row, actorUserId) =>
    Object.assign(row, { updatedAt: store.now(), updatedBy: actorUserId });

  const moduleOf = (resource) => t().modules.find((m) => m.moduleId === resource.moduleId);
  const resourceOf = (permission) =>
    t().resources.find((r) => r.resourceId === permission.resourceId);
  const permissionKey = (permission) => {
    const resource = resourceOf(permission);
    return {
      permissionId: permission.permissionId,
      moduleCode: moduleOf(resource).moduleCode,
      resourceCode: resource.resourceCode,
      actionCode: permission.actionCode,
    };
  };
  const chainActive = (permission) => {
    const resource = resourceOf(permission);
    return permission.isActive && resource.isActive && moduleOf(resource).isActive;
  };
  const sortKeys = (a, b) =>
    `${a.moduleCode}|${a.resourceCode}|${a.actionCode}`.localeCompare(
      `${b.moduleCode}|${b.resourceCode}|${b.actionCode}`,
    );

  const activeMemberships = (userId) =>
    t().userRoles.filter((ur) => {
      const role = t().roles.find((r) => r.roleId === ur.roleId);
      return ur.userId === userId && ur.isActive && role.isActive && notExpired(ur);
    });
  const hasOverride = (userId, permissionId, effect) =>
    t().overrides.some(
      (o) =>
        o.userId === userId &&
        o.permissionId === permissionId &&
        o.isActive &&
        o.effect === effect &&
        notExpired(o),
    );
  const hasRoleGrant = (userId, permissionId) =>
    activeMemberships(userId).some((ur) =>
      t().rolePermissions.some(
        (rp) => rp.roleId === ur.roleId && rp.permissionId === permissionId && rp.isActive,
      ),
    );
  const effective = (userId) =>
    t()
      .permissions.filter(
        (p) =>
          chainActive(p) &&
          !hasOverride(userId, p.permissionId, 'DENY') &&
          (hasRoleGrant(userId, p.permissionId) || hasOverride(userId, p.permissionId, 'ALLOW')),
      )
      .map((p) => ({
        ...permissionKey(p),
        viaRole: hasRoleGrant(userId, p.permissionId),
        viaOverride: hasOverride(userId, p.permissionId, 'ALLOW'),
      }))
      .sort(sortKeys);

  function syncFlags() {
    if (!syncPrivilegeFlags) return;
    for (const user of store.state.users) {
      user.isPrivilegedRoleMember = activeMemberships(user.userId).some((ur) =>
        PRIVILEGE_CLASSIFICATION.privilegedRoleCodes.includes(
          t().roles.find((r) => r.roleId === ur.roleId).roleCode,
        ),
      );
      user.hasSecurityAdministration = effective(user.userId).some((p) =>
        PRIVILEGE_CLASSIFICATION.securityAdministrationModuleCodes.includes(p.moduleCode),
      );
    }
  }
  const writing =
    (fn) =>
    async (...args) => {
      const result = await fn(...args);
      syncFlags();
      return result;
    };

  const authorizationRepository = {
    async findPermissionDecision(_c, { userId, moduleCode, resourceCode, actionCode }) {
      const permission = t().permissions.find((p) => {
        const key = permissionKey(p);
        return (
          key.moduleCode === moduleCode &&
          key.resourceCode === resourceCode &&
          key.actionCode === actionCode
        );
      });
      if (!permission) return null;
      return {
        permissionId: permission.permissionId,
        catalogActive: chainActive(permission),
        denied: hasOverride(userId, permission.permissionId, 'DENY'),
        allowedByOverride: hasOverride(userId, permission.permissionId, 'ALLOW'),
        allowedByRole: hasRoleGrant(userId, permission.permissionId),
      };
    },
    async listEffectivePermissions(_c, userId) {
      return effective(userId);
    },
  };

  const mapRole = (r) => ({
    roleId: r.roleId,
    roleCode: r.roleCode,
    roleName: r.roleName,
    description: r.description,
    isActive: r.isActive,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt ?? null,
  });
  const table = {
    ROLE: () => [t().roles, 'roleId'],
    MODULE: () => [t().modules, 'moduleId'],
    RESOURCE: () => [t().resources, 'resourceId'],
    PERMISSION: () => [t().permissions, 'permissionId'],
  };

  const rbacRepository = {
    async findUser(_c, userId) {
      const user = store.user(userId);
      return user
        ? {
            userId: user.userId,
            employeeNumber: user.employeeNumber,
            accountStatus: user.accountStatus,
          }
        : null;
    },
    async listActiveRoleCodes(_c, userId) {
      return activeMemberships(userId).map(
        (ur) => t().roles.find((r) => r.roleId === ur.roleId).roleCode,
      );
    },
    async listRoles(_c, { limit, offset }) {
      const sorted = [...t().roles].sort((a, b) => a.roleCode.localeCompare(b.roleCode));
      return { total: sorted.length, items: sorted.slice(offset, offset + limit).map(mapRole) };
    },
    async findRole(_c, roleId) {
      const role = t().roles.find((r) => r.roleId === roleId);
      return role ? mapRole(role) : null;
    },
    insertRole: writing(async (_c, { roleCode, roleName, description, actorUserId }) => {
      if (t().roles.some((r) => r.roleCode === roleCode))
        throw uniqueViolation('UQ_ZRV_ROLES_CODE');
      const roleId = newId();
      t().roles.push({
        roleId,
        roleCode,
        roleName,
        description,
        isActive: true,
        createdAt: store.now(),
        createdBy: actorUserId,
      });
      return roleId;
    }),
    async updateRole(_c, { roleId, roleName, description, actorUserId }) {
      const role = t().roles.find((r) => r.roleId === roleId);
      if (!role) return false;
      stamp(Object.assign(role, { roleName, description }), actorUserId);
      return true;
    },
    async listCatalog() {
      return [...t().modules]
        .sort((a, b) => a.displayOrder - b.displayOrder || a.moduleCode.localeCompare(b.moduleCode))
        .map((m) => ({
          moduleId: m.moduleId,
          moduleCode: m.moduleCode,
          moduleName: m.moduleName,
          displayOrder: m.displayOrder,
          isActive: m.isActive,
          resources: t()
            .resources.filter((r) => r.moduleId === m.moduleId)
            .sort((a, b) => a.resourceCode.localeCompare(b.resourceCode))
            .map((r) => ({
              resourceId: r.resourceId,
              resourceCode: r.resourceCode,
              resourceName: r.resourceName,
              isActive: r.isActive,
              permissions: t()
                .permissions.filter((p) => p.resourceId === r.resourceId)
                .sort((a, b) => a.actionCode.localeCompare(b.actionCode))
                .map((p) => ({
                  permissionId: p.permissionId,
                  actionCode: p.actionCode,
                  description: p.description,
                  isActive: p.isActive,
                })),
            })),
        }));
    },
    async findModule(_c, moduleId) {
      const m = t().modules.find((item) => item.moduleId === moduleId);
      return m ? { moduleId: m.moduleId, moduleCode: m.moduleCode, isActive: m.isActive } : null;
    },
    async findResource(_c, resourceId) {
      const r = t().resources.find((item) => item.resourceId === resourceId);
      return r
        ? {
            resourceId: r.resourceId,
            resourceCode: r.resourceCode,
            moduleCode: moduleOf(r).moduleCode,
            isActive: r.isActive,
          }
        : null;
    },
    async findPermission(_c, permissionId) {
      const p = t().permissions.find((item) => item.permissionId === permissionId);
      return p ? { ...permissionKey(p), isActive: p.isActive, chainActive: chainActive(p) } : null;
    },
    insertModule: writing(
      async (_c, { moduleCode, moduleName, description, displayOrder, actorUserId }) => {
        if (t().modules.some((m) => m.moduleCode === moduleCode))
          throw uniqueViolation('UQ_ZRV_MOD_CODE');
        const moduleId = newId();
        t().modules.push({
          moduleId,
          moduleCode,
          moduleName,
          description,
          displayOrder,
          isActive: true,
          createdBy: actorUserId,
        });
        return moduleId;
      },
    ),
    insertResource: writing(
      async (_c, { moduleId, resourceCode, resourceName, description, actorUserId }) => {
        if (t().resources.some((r) => r.moduleId === moduleId && r.resourceCode === resourceCode)) {
          throw uniqueViolation('UQ_ZRV_RES_MOD_CODE');
        }
        const resourceId = newId();
        t().resources.push({
          resourceId,
          moduleId,
          resourceCode,
          resourceName,
          description,
          isActive: true,
          createdBy: actorUserId,
        });
        return resourceId;
      },
    ),
    insertPermission: writing(async (_c, { resourceId, actionCode, description, actorUserId }) => {
      if (t().permissions.some((p) => p.resourceId === resourceId && p.actionCode === actionCode)) {
        throw uniqueViolation('UQ_ZRV_PERM_RES_ACT');
      }
      const permissionId = newId();
      t().permissions.push({
        permissionId,
        resourceId,
        actionCode,
        description,
        isActive: true,
        createdBy: actorUserId,
      });
      return permissionId;
    }),
    setActive: writing(async (_c, { entity, id, isActive, actorUserId }) => {
      const [rows, key] = table[entity]();
      const row = rows.find((item) => item[key] === id);
      if (!row || row.isActive === isActive) return false;
      stamp(Object.assign(row, { isActive }), actorUserId);
      return true;
    }),
    async listRolePermissions(_c, roleId) {
      return t()
        .rolePermissions.filter((g) => g.roleId === roleId)
        .map((g) => ({
          ...permissionKey(t().permissions.find((p) => p.permissionId === g.permissionId)),
          isActive: g.isActive,
          createdAt: g.createdAt,
          updatedAt: g.updatedAt ?? null,
        }))
        .sort(sortKeys);
    },
    async listActiveRoleGrantKeys(_c, roleId) {
      return t()
        .rolePermissions.filter((g) => g.roleId === roleId && g.isActive)
        .map((g) => permissionKey(t().permissions.find((p) => p.permissionId === g.permissionId)));
    },
    grantRolePermission: writing(async (_c, { roleId, permissionId, actorUserId }) => {
      const row = t().rolePermissions.find(
        (g) => g.roleId === roleId && g.permissionId === permissionId,
      );
      if (row) {
        if (row.isActive) return false;
        stamp(Object.assign(row, { isActive: true }), actorUserId);
        return true;
      }
      t().rolePermissions.push({
        roleId,
        permissionId,
        isActive: true,
        createdAt: store.now(),
        createdBy: actorUserId,
      });
      return true;
    }),
    revokeRolePermission: writing(async (_c, { roleId, permissionId, actorUserId }) => {
      const row = t().rolePermissions.find(
        (g) => g.roleId === roleId && g.permissionId === permissionId && g.isActive,
      );
      if (!row) return false;
      stamp(Object.assign(row, { isActive: false }), actorUserId);
      return true;
    }),
    async listUserRoles(_c, userId) {
      return t()
        .userRoles.filter((ur) => ur.userId === userId)
        .map((ur) => {
          const role = t().roles.find((r) => r.roleId === ur.roleId);
          return {
            roleId: role.roleId,
            roleCode: role.roleCode,
            roleName: role.roleName,
            roleActive: role.isActive,
            isActive: ur.isActive,
            expiresAt: ur.expiresAt,
            effective: ur.isActive && role.isActive && notExpired(ur),
            createdAt: ur.createdAt,
            updatedAt: ur.updatedAt ?? null,
          };
        })
        .sort((a, b) => a.roleCode.localeCompare(b.roleCode));
    },
    assignUserRole: writing(async (_c, { userId, roleId, expiresAt, actorUserId }) => {
      const row = t().userRoles.find((ur) => ur.userId === userId && ur.roleId === roleId);
      if (row) {
        stamp(Object.assign(row, { isActive: true, expiresAt: expiresAt ?? null }), actorUserId);
      } else {
        t().userRoles.push({
          userId,
          roleId,
          isActive: true,
          expiresAt: expiresAt ?? null,
          createdAt: store.now(),
          createdBy: actorUserId,
        });
      }
      return true;
    }),
    unassignUserRole: writing(async (_c, { userId, roleId, actorUserId }) => {
      const row = t().userRoles.find(
        (ur) => ur.userId === userId && ur.roleId === roleId && ur.isActive,
      );
      if (!row) return false;
      stamp(Object.assign(row, { isActive: false }), actorUserId);
      return true;
    }),
    async listUserOverrides(_c, userId) {
      return t()
        .overrides.filter((o) => o.userId === userId)
        .map((o) => ({
          ...permissionKey(t().permissions.find((p) => p.permissionId === o.permissionId)),
          effect: o.effect,
          justification: o.justification,
          isActive: o.isActive,
          expiresAt: o.expiresAt,
          createdAt: o.createdAt,
          updatedAt: o.updatedAt ?? null,
        }))
        .sort(sortKeys);
    },
    setOverride: writing(
      async (_c, { userId, permissionId, effect, justification, expiresAt, actorUserId }) => {
        if (!justification?.trim())
          throw new Error('ORA-02290: check constraint (CK_ZRV_UPO_REASON) violated');
        const row = t().overrides.find(
          (o) => o.userId === userId && o.permissionId === permissionId,
        );
        const values = { effect, justification, isActive: true, expiresAt: expiresAt ?? null };
        if (row) stamp(Object.assign(row, values), actorUserId);
        else
          t().overrides.push({
            userId,
            permissionId,
            ...values,
            createdAt: store.now(),
            createdBy: actorUserId,
          });
        return true;
      },
    ),
    revokeOverride: writing(async (_c, { userId, permissionId, actorUserId }) => {
      const row = t().overrides.find(
        (o) => o.userId === userId && o.permissionId === permissionId && o.isActive,
      );
      if (!row) return false;
      stamp(Object.assign(row, { isActive: false }), actorUserId);
      return true;
    }),
  };

  store.authorizationRepository = authorizationRepository;
  store.rbacRepository = rbacRepository;

  // --- Seeding helpers (direct table setup for tests, not API calls) -----------------------------
  const helpers = {
    tables: t,
    syncFlags,
    addModule(moduleCode, overrides = {}) {
      const m = {
        moduleId: newId(),
        moduleCode,
        moduleName: moduleCode,
        description: null,
        displayOrder: 10,
        isActive: true,
        ...overrides,
      };
      t().modules.push(m);
      return m;
    },
    addResource(module, resourceCode, overrides = {}) {
      const r = {
        resourceId: newId(),
        moduleId: module.moduleId,
        resourceCode,
        resourceName: resourceCode,
        description: null,
        isActive: true,
        ...overrides,
      };
      t().resources.push(r);
      return r;
    },
    addPermission(resource, actionCode, overrides = {}) {
      const p = {
        permissionId: newId(),
        resourceId: resource.resourceId,
        actionCode,
        description: null,
        isActive: true,
        ...overrides,
      };
      t().permissions.push(p);
      return p;
    },
    addRole(roleCode, overrides = {}) {
      const r = {
        roleId: newId(),
        roleCode,
        roleName: roleCode,
        description: null,
        isActive: true,
        createdAt: store.now(),
        ...overrides,
      };
      t().roles.push(r);
      return r;
    },
    grant(role, permission, overrides = {}) {
      t().rolePermissions.push({
        roleId: role.roleId,
        permissionId: permission.permissionId,
        isActive: true,
        createdAt: store.now(),
        ...overrides,
      });
      syncFlags();
    },
    assign(user, role, overrides = {}) {
      t().userRoles.push({
        userId: user.userId,
        roleId: role.roleId,
        isActive: true,
        expiresAt: null,
        createdAt: store.now(),
        ...overrides,
      });
      syncFlags();
    },
    override(user, permission, effect, overrides = {}) {
      t().overrides.push({
        userId: user.userId,
        permissionId: permission.permissionId,
        effect,
        justification: 'test',
        isActive: true,
        expiresAt: null,
        createdAt: store.now(),
        ...overrides,
      });
      syncFlags();
    },
    permission(moduleCode, resourceCode, actionCode) {
      return t().permissions.find((p) => {
        const key = permissionKey(p);
        return (
          key.moduleCode === moduleCode &&
          key.resourceCode === resourceCode &&
          key.actionCode === actionCode
        );
      });
    },
    role: (roleCode) => t().roles.find((r) => r.roleCode === roleCode),

    /** The approved security catalogue and administrator roles; SUPER_ADMINISTRATOR holds all. */
    seedSecurityCatalog() {
      const module = helpers.addModule(SECURITY_MODULE.code, { displayOrder: 0 });
      const all = [];
      for (const resource of SECURITY_RESOURCES) {
        const r = helpers.addResource(module, resource.code);
        for (const action of resource.actions) all.push(helpers.addPermission(r, action));
      }
      const roles = Object.fromEntries(
        ADMINISTRATOR_ROLE_DEFINITIONS.map((d) => [
          d.code,
          helpers.addRole(d.code, { roleName: d.name }),
        ]),
      );
      for (const p of all) helpers.grant(roles.SUPER_ADMINISTRATOR, p);
      return { module, permissions: all, roles };
    },
  };
  return helpers;
}

/**
 * Creates a session for a user directly in the fake session table (as a completed login would)
 * and returns the Supertest cookie and CSRF header values.
 */
export async function signIn(store, user, { mfaVerified = true } = {}) {
  const token = randomBytes(32).toString('base64url');
  await store.sessionRepository.insertSession(
    {},
    {
      userId: user.userId,
      tokenHash: hashSessionToken(token),
      absoluteSeconds: 8 * 3600,
      ipAddress: '127.0.0.1',
      userAgent: 'test',
      mfaVerified,
    },
  );
  return { cookie: `${config.auth.cookie.name}=${token}`, csrf: deriveCsrfToken(token) };
}
