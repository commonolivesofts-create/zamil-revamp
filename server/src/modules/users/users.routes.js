import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../../shared/errors/AppError.js';
import { createRequireCsrfToken } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validate.js';
import { createUsersController } from './users.controller.js';
import {
  candidatesQuerySchema,
  emptyBodySchema,
  emptyQuerySchema,
  listUsersQuerySchema,
  passwordSetupIssueSchema,
  provisionSchema,
  recoveryIssueSchema,
  userIdParams,
  userSessionParams,
} from './users.validation.js';

const USER_ACCOUNTS = 'SECURITY_ADMINISTRATION.USER_ACCOUNTS';

/**
 * User administration, mounted at /api/v1/users. Every route requires an authenticated session
 * and the USER_ACCOUNTS action (re-evaluated in Oracle per request; MFA-verified session required);
 * changes also require the session-bound CSRF token. Validation runs after authorization.
 */
export function createUsersRouter({
  usersService,
  recoveryService,
  authorize,
  authenticate,
  auditService,
}) {
  const controller = createUsersController({ usersService, recoveryService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  const receiveImage = (req, res, next) =>
    upload.single('profileImage')(req, res, (error) =>
      error ? next(new AppError(400, 'VALIDATION_ERROR', 'Invalid profile image upload')) : next(),
    );
  const read = (action, schemas) => [
    authenticate,
    authorize(USER_ACCOUNTS, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas, resource = USER_ACCOUNTS) => [
    authenticate,
    requireCsrfToken,
    authorize(resource, action),
    validate({ query: emptyQuerySchema, body: emptyBodySchema, ...schemas }),
  ];
  const router = Router();

  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get('/', ...read('VIEW', { query: listUsersQuerySchema }), controller.listUsers);
  // Employee-master search for provisioning (declared before /:userId).
  router.get(
    '/candidates',
    ...read('CREATE', { query: candidatesQuerySchema }),
    controller.listCandidates,
  );
  router.post(
    '/',
    authenticate,
    requireCsrfToken,
    authorize(USER_ACCOUNTS, 'CREATE'),
    receiveImage,
    validate({ query: emptyQuerySchema, body: provisionSchema }),
    controller.provision,
  );
  router.get('/:userId', ...read('VIEW', { params: userIdParams }), controller.getUser);
  router.post(
    '/:userId/activate',
    ...write('ACTIVATE', { params: userIdParams }),
    controller.activate,
  );
  router.post(
    '/:userId/disable',
    ...write('DISABLE', { params: userIdParams }),
    controller.disable,
  );
  // Password setup link for a PENDING account (USER_ACCOUNTS:CREATE) and recovery links
  // (ACCOUNT_RECOVERY:ISSUE); both fail closed until a delivery channel is configured.
  router.post(
    '/:userId/password-setup',
    ...write('CREATE', { params: userIdParams, body: passwordSetupIssueSchema }),
    controller.issueToken(false),
  );
  router.post(
    '/:userId/recovery',
    ...write(
      'ISSUE',
      { params: userIdParams, body: recoveryIssueSchema },
      'SECURITY_ADMINISTRATION.ACCOUNT_RECOVERY',
    ),
    controller.issueToken(true),
  );
  router.delete(
    '/:userId/sessions',
    ...write('REVOKE_SESSIONS', { params: userIdParams }),
    controller.revokeSessions,
  );
  router.delete(
    '/:userId/sessions/:sessionId',
    ...write('REVOKE_SESSIONS', { params: userSessionParams }),
    controller.revokeSession,
  );

  return router;
}
