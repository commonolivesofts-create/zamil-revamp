import { Router } from 'express';
import { createAuthenticate } from '../middleware/authenticate.js';
import { createOriginCheck } from '../middleware/csrf.js';
import { createSecurityAuditService } from '../modules/audit/securityAudit.service.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createSessionService } from '../modules/auth/session.service.js';

/**
 * Versioned business API (/api/v1). `deps` lets tests substitute repositories and the
 * connection/transaction helpers; production uses the shared Oracle LOW pool.
 *
 * @param {object} appConfig Validated configuration.
 * @param {object} [deps]
 */
export function createApiRouter(appConfig, deps = {}) {
  const db = deps.db ?? {};
  const auditService = createSecurityAuditService({
    repository: deps.auditRepository,
    withTransaction: db.withTransaction,
  });
  const sessionService = createSessionService({
    repository: deps.sessionRepository,
    auditService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
    touchIntervalMs: appConfig.auth.sessionTouchIntervalMs,
  });
  const authService = createAuthService({
    authRepository: deps.authRepository,
    sessionRepository: deps.sessionRepository,
    auditService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
    argon2Cost: deps.argon2Cost ?? appConfig.auth.argon2,
  });
  const authenticate = createAuthenticate({ sessionService, cookieConfig: appConfig.auth.cookie });

  const router = Router();
  router.use(createOriginCheck({ allowedOrigins: appConfig.auth.allowedOrigins }));
  router.use(
    '/auth',
    createAuthRouter({
      authService,
      sessionService,
      auditService,
      authenticate,
      authConfig: appConfig.auth,
    }),
  );

  return router;
}
