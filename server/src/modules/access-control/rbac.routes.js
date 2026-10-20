import { Router } from 'express';
import { createRequireCsrfToken } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validate.js';
import { createRbacController } from './rbac.controller.js';
import {
  activationSchema,
  assignRoleSchema,
  createModuleSchema,
  createPermissionSchema,
  createResourceSchema,
  createRoleSchema,
  emptyBodySchema,
  emptyQuerySchema,
  moduleIdParams,
  overrideSchema,
  pageQuerySchema,
  permissionIdParams,
  resourceIdParams,
  roleIdParams,
  rolePermissionParams,
  updateRoleSchema,
  userIdParams,
  userPermissionParams,
  userRoleParams,
} from './rbac.validation.js';

const SEC = 'SECURITY_ADMINISTRATION';

/**
 * RBAC administration, mounted at /api/v1/access-control. Every route requires an authenticated
 * session; administration routes also require the resource/action permission (re-evaluated in
 * Oracle on every request, MFA-verified session required for the security module). State-changing
 * routes require the session-bound CSRF token (the API router also checks Origin). Validation runs
 * after authorization so that callers without permission learn nothing about the input contract.
 */
export function createRbacRouter({
  rbacService,
  authorizationService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createRbacController({ rbacService, authorizationService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (resource, action, schemas) => [
    authenticate,
    authorize(`${SEC}.${resource}`, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (resource, action, schemas) => [
    authenticate,
    requireCsrfToken,
    authorize(`${SEC}.${resource}`, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get(
    '/me/permissions',
    authenticate,
    validate({ query: emptyQuerySchema }),
    controller.getMyPermissions,
  );

  // Roles
  router.get('/roles', ...read('ROLES', 'VIEW', { query: pageQuerySchema }), controller.listRoles);
  router.post(
    '/roles',
    ...write('ROLES', 'CREATE', { body: createRoleSchema }),
    controller.createRole,
  );
  router.patch(
    '/roles/:roleId',
    ...write('ROLES', 'UPDATE', { params: roleIdParams, body: updateRoleSchema }),
    controller.updateRole,
  );
  router.post(
    '/roles/:roleId/activate',
    ...write('ROLES', 'UPDATE', { params: roleIdParams }),
    controller.activateRole,
  );
  router.post(
    '/roles/:roleId/deactivate',
    ...write('ROLES', 'DEACTIVATE', { params: roleIdParams }),
    controller.deactivateRole,
  );

  // Permission catalogue
  router.get('/catalog', ...read('PERMISSION_CATALOG', 'VIEW'), controller.getCatalog);
  router.post(
    '/modules',
    ...write('PERMISSION_CATALOG', 'MANAGE', { body: createModuleSchema }),
    controller.createModule,
  );
  router.patch(
    '/modules/:moduleId',
    ...write('PERMISSION_CATALOG', 'MANAGE', { params: moduleIdParams, body: activationSchema }),
    controller.setCatalogActive('MODULE', 'moduleId'),
  );
  router.post(
    '/modules/:moduleId/resources',
    ...write('PERMISSION_CATALOG', 'MANAGE', {
      params: moduleIdParams,
      body: createResourceSchema,
    }),
    controller.createResource,
  );
  router.patch(
    '/resources/:resourceId',
    ...write('PERMISSION_CATALOG', 'MANAGE', { params: resourceIdParams, body: activationSchema }),
    controller.setCatalogActive('RESOURCE', 'resourceId'),
  );
  router.post(
    '/resources/:resourceId/permissions',
    ...write('PERMISSION_CATALOG', 'MANAGE', {
      params: resourceIdParams,
      body: createPermissionSchema,
    }),
    controller.createPermission,
  );
  router.patch(
    '/permissions/:permissionId',
    ...write('PERMISSION_CATALOG', 'MANAGE', {
      params: permissionIdParams,
      body: activationSchema,
    }),
    controller.setCatalogActive('PERMISSION', 'permissionId'),
  );

  // Role permissions
  router.get(
    '/roles/:roleId/permissions',
    ...read('ROLE_PERMISSIONS', 'VIEW', { params: roleIdParams }),
    controller.listRolePermissions,
  );
  router.put(
    '/roles/:roleId/permissions/:permissionId',
    ...write('ROLE_PERMISSIONS', 'GRANT', { params: rolePermissionParams }),
    controller.grantRolePermission,
  );
  router.delete(
    '/roles/:roleId/permissions/:permissionId',
    ...write('ROLE_PERMISSIONS', 'REVOKE', { params: rolePermissionParams }),
    controller.revokeRolePermission,
  );

  // User roles
  router.get(
    '/users/:userId/roles',
    ...read('USER_ROLES', 'VIEW', { params: userIdParams }),
    controller.listUserRoles,
  );
  router.put(
    '/users/:userId/roles/:roleId',
    ...write('USER_ROLES', 'ASSIGN', { params: userRoleParams, body: assignRoleSchema }),
    controller.assignUserRole,
  );
  router.delete(
    '/users/:userId/roles/:roleId',
    ...write('USER_ROLES', 'REVOKE', { params: userRoleParams }),
    controller.unassignUserRole,
  );
  router.get(
    '/users/:userId/effective-permissions',
    ...read('USER_ROLES', 'VIEW', { params: userIdParams }),
    controller.getEffectivePermissions,
  );

  // Direct user overrides
  router.get(
    '/users/:userId/overrides',
    ...read('USER_PERMISSION_OVERRIDES', 'VIEW', { params: userIdParams }),
    controller.listUserOverrides,
  );
  router.put(
    '/users/:userId/overrides/:permissionId',
    ...write('USER_PERMISSION_OVERRIDES', 'GRANT', {
      params: userPermissionParams,
      body: overrideSchema,
    }),
    controller.setOverride,
  );
  router.delete(
    '/users/:userId/overrides/:permissionId',
    ...write('USER_PERMISSION_OVERRIDES', 'REVOKE', { params: userPermissionParams }),
    controller.revokeOverride,
  );

  return router;
}
