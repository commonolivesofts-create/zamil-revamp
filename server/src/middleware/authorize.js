import { parsePermission } from '../modules/access-control/authorization.service.js';
import { AppError } from '../shared/errors/AppError.js';
import { requestContext } from './authenticate.js';

/**
 * `authorize('MODULE_CODE.RESOURCE_CODE', 'ACTION_CODE')`: request-time resource/action check for
 * the authenticated user (must run after `authenticate`). Deny by default; explicit DENY wins; a
 * security-administration permission also requires an MFA-verified session. Denials return a safe
 * 403 and are audited as ACCESS_DENIED. The permission key is validated when the route is declared.
 */
export function createAuthorize({ authorizationService }) {
  return function authorize(resourceKey, actionCode) {
    const permission = parsePermission(resourceKey, actionCode);

    return async function authorizeRequest(req, _res, next) {
      if (!req.auth) {
        return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required'));
      }
      const decision = await authorizationService.check(req.auth, permission, requestContext(req));
      if (!decision.allowed) {
        return next(new AppError(403, 'FORBIDDEN', 'You do not have permission for this action.'));
      }
      req.permission = { ...permission, permissionId: decision.permissionId };
      next();
    };
  };
}
