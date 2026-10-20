import { Router } from 'express';
import { createAuthenticate } from '../middleware/authenticate.js';
import { createAuthorize } from '../middleware/authorize.js';
import { createAuthorizationService } from '../modules/access-control/authorization.service.js';
import { createRbacRouter } from '../modules/access-control/rbac.routes.js';
import { createRbacService } from '../modules/access-control/rbac.service.js';
import { createOriginCheck } from '../middleware/csrf.js';
import { createSecurityAuditService } from '../modules/audit/securityAudit.service.js';
import { createAuthRouter } from '../modules/auth/auth.routes.js';
import { createAuthService } from '../modules/auth/auth.service.js';
import { createMfaService } from '../modules/auth/mfa.service.js';
import { createMfaKeyring } from '../modules/auth/mfaSecret.js';
import { createSessionService } from '../modules/auth/session.service.js';
import { createUsersRouter } from '../modules/users/users.routes.js';
import { createUsersService } from '../modules/users/users.service.js';

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
  // MFA can be completed only with the TOTP key ring; without it mandatory-MFA users stay blocked.
  const { mfa } = appConfig.auth;
  const mfaService = mfa.encryptionKey
    ? createMfaService({
        keyring: createMfaKeyring({ encryptionKey: mfa.encryptionKey, keyId: mfa.keyId }),
        issuer: mfa.issuer,
        authRepository: deps.authRepository,
        sessionRepository: deps.sessionRepository,
        auditService,
        withConnection: db.withConnection,
        withTransaction: db.withTransaction,
      })
    : null;
  const authService = createAuthService({
    authRepository: deps.authRepository,
    sessionRepository: deps.sessionRepository,
    auditService,
    mfaService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
    argon2Cost: deps.argon2Cost ?? appConfig.auth.argon2,
  });
  const authenticate = createAuthenticate({ sessionService, cookieConfig: appConfig.auth.cookie });
  const authorizationService = createAuthorizationService({
    repository: deps.authorizationRepository,
    auditService,
    withConnection: db.withConnection,
  });
  const authorize = createAuthorize({ authorizationService });
  const rbacService = createRbacService({
    repository: deps.rbacRepository,
    authorizationService,
    auditService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const usersService = createUsersService({
    repository: deps.usersRepository,
    sessionRepository: deps.sessionRepository,
    rbacRepository: deps.rbacRepository,
    auditService,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });

  const router = Router();
  router.use(createOriginCheck({ allowedOrigins: appConfig.auth.allowedOrigins }));
  router.use(
    '/auth',
    createAuthRouter({
      authService,
      sessionService,
      mfaService,
      auditService,
      authenticate,
      authConfig: appConfig.auth,
    }),
  );
  router.use(
    '/access-control',
    createRbacRouter({ rbacService, authorizationService, authorize, authenticate, auditService }),
  );

  router.use('/users', createUsersRouter({ usersService, authorize, authenticate, auditService }));

  return router;
}
