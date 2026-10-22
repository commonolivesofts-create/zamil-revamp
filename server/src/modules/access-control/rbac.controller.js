import { requestContext } from '../../middleware/authenticate.js';
import { sendPaginated, sendSuccess } from '../../shared/responses/apiResponse.js';

/** HTTP adapter for RBAC administration; rules live in rbac.service.js. */
export function createRbacController({ rbacService, authorizationService }) {
  const ctx = requestContext;

  return {
    async getMyPermissions(req, res) {
      sendSuccess(res, {
        userId: req.auth.userId,
        mfaVerified: req.auth.mfaVerified,
        // Whether SECURITY_ADMINISTRATION permissions need an MFA-verified session on this server
        // (false only under the local-development exception). The frontend mirrors this; the
        // backend still decides every request.
        adminMfaRequired: authorizationService.adminMfaRequired,
        permissions: await authorizationService.effectivePermissions(req.auth.userId),
      });
    },

    // Roles
    async listRoles(req, res) {
      const { page, limit } = req.query;
      const { total, items } = await rbacService.listRoles({ limit, offset: (page - 1) * limit });
      sendPaginated(res, items, { page, limit, total });
    },
    async createRole(req, res) {
      sendSuccess(res, await rbacService.createRole(req.auth, req.body, ctx(req)), 201);
    },
    async updateRole(req, res) {
      sendSuccess(
        res,
        await rbacService.updateRole(req.auth, req.params.roleId, req.body, ctx(req)),
      );
    },
    async activateRole(req, res) {
      sendSuccess(
        res,
        await rbacService.setRoleActive(req.auth, req.params.roleId, true, ctx(req)),
      );
    },
    async deactivateRole(req, res) {
      sendSuccess(
        res,
        await rbacService.setRoleActive(req.auth, req.params.roleId, false, ctx(req)),
      );
    },

    // Permission catalogue
    async getCatalog(_req, res) {
      sendSuccess(res, await rbacService.getCatalog());
    },
    async createModule(req, res) {
      sendSuccess(res, await rbacService.createModule(req.auth, req.body, ctx(req)), 201);
    },
    async createResource(req, res) {
      const result = await rbacService.createResource(
        req.auth,
        req.params.moduleId,
        req.body,
        ctx(req),
      );
      sendSuccess(res, result, 201);
    },
    async createPermission(req, res) {
      const result = await rbacService.createPermission(
        req.auth,
        req.params.resourceId,
        req.body,
        ctx(req),
      );
      sendSuccess(res, result, 201);
    },
    setCatalogActive(entity, param) {
      return async (req, res) => {
        const result = await rbacService.setCatalogActive(
          req.auth,
          entity,
          req.params[param],
          req.body.isActive,
          ctx(req),
        );
        sendSuccess(res, result);
      };
    },

    // Role permissions
    async listRolePermissions(req, res) {
      sendSuccess(res, await rbacService.listRolePermissions(req.params.roleId));
    },
    async grantRolePermission(req, res) {
      const { roleId, permissionId } = req.params;
      sendSuccess(
        res,
        await rbacService.grantRolePermission(req.auth, roleId, permissionId, ctx(req)),
      );
    },
    async revokeRolePermission(req, res) {
      const { roleId, permissionId } = req.params;
      sendSuccess(
        res,
        await rbacService.revokeRolePermission(req.auth, roleId, permissionId, ctx(req)),
      );
    },

    // User roles
    async listUserRoles(req, res) {
      sendSuccess(res, await rbacService.listUserRoles(req.params.userId));
    },
    async assignUserRole(req, res) {
      const { userId, roleId } = req.params;
      sendSuccess(
        res,
        await rbacService.assignUserRole(req.auth, userId, roleId, req.body, ctx(req)),
      );
    },
    async unassignUserRole(req, res) {
      const { userId, roleId } = req.params;
      sendSuccess(res, await rbacService.unassignUserRole(req.auth, userId, roleId, ctx(req)));
    },

    // Overrides
    async listUserOverrides(req, res) {
      sendSuccess(res, await rbacService.listUserOverrides(req.params.userId));
    },
    async setOverride(req, res) {
      const { userId, permissionId } = req.params;
      sendSuccess(
        res,
        await rbacService.setOverride(req.auth, userId, permissionId, req.body, ctx(req)),
      );
    },
    async revokeOverride(req, res) {
      const { userId, permissionId } = req.params;
      sendSuccess(res, await rbacService.revokeOverride(req.auth, userId, permissionId, ctx(req)));
    },

    async getEffectivePermissions(req, res) {
      sendSuccess(res, await rbacService.effectivePermissionsOf(req.params.userId));
    },
  };
}
