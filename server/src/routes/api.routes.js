import { Router } from 'express';
import { POOLS, withConnection } from '../database/oracle.js';
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
import { createRecoveryService } from '../modules/auth/recovery.service.js';
import { findDatabaseName } from '../modules/notifications/databaseIdentity.repository.js';
import { createUnconfiguredDelivery } from '../modules/notifications/delivery.js';
import { createSmtpDelivery } from '../modules/notifications/smtpDelivery.js';
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
  // Mandatory administrator MFA (default true). false only under the local-development exception
  // validated by config/index.js; every service applies the same policy.
  const adminMfaRequired = appConfig.auth.adminMfaRequired !== false;
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
    adminMfaRequired,
  });
  // MFA can be completed only with the TOTP key ring; without it mandatory-MFA users stay blocked.
  const { mfa } = appConfig.auth;
  const keyring = mfa.encryptionKey
    ? createMfaKeyring({ encryptionKey: mfa.encryptionKey, keyId: mfa.keyId })
    : null;
  const mfaService = keyring
    ? createMfaService({
        keyring,
        issuer: mfa.issuer,
        authRepository: deps.authRepository,
        sessionRepository: deps.sessionRepository,
        auditService,
        withConnection: db.withConnection,
        withTransaction: db.withTransaction,
        adminMfaRequired,
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
    adminMfaRequired,
  });
  // Office 365 SMTP when enabled; otherwise unconfigured, so delivery-dependent flows fail closed.
  const withDatabase = db.withConnection ?? withConnection;
  const delivery =
    deps.delivery ??
    (appConfig.smtp?.enabled
      ? createSmtpDelivery({
          smtp: appConfig.smtp,
          links: appConfig.links,
          readDatabaseName: () => withDatabase(POOLS.LOW, findDatabaseName),
        })
      : createUnconfiguredDelivery());
  const recoveryService = createRecoveryService({
    recoveryRepository: deps.recoveryRepository,
    usersRepository: deps.usersRepository,
    authRepository: deps.authRepository,
    sessionRepository: deps.sessionRepository,
    auditService,
    delivery,
    keyring,
    issuer: mfa.issuer,
    argon2Cost: deps.argon2Cost ?? appConfig.auth.argon2,
    backgroundTasks: deps.backgroundTasks,
    withConnection: db.withConnection,
    withTransaction: db.withTransaction,
  });
  const authenticate = createAuthenticate({ sessionService, cookieConfig: appConfig.auth.cookie });
  const authorizationService = createAuthorizationService({
    repository: deps.authorizationRepository,
    auditService,
    withConnection: db.withConnection,
    adminMfaRequired,
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
      recoveryService,
      authenticate,
      authConfig: appConfig.auth,
    }),
  );
  router.use(
    '/access-control',
    createRbacRouter({ rbacService, authorizationService, authorize, authenticate, auditService }),
  );

  router.use(
    '/users',
    createUsersRouter({ usersService, recoveryService, authorize, authenticate, auditService }),
  );

  return router;
}
