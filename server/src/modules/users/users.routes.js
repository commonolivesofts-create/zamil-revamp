import { Router } from 'express';
import { createRequireCsrfToken } from '../../middleware/csrf.js';
import { validate } from '../../middleware/validate.js';
import { createUsersController } from './users.controller.js';
import {
  candidatesQuerySchema,
  emptyBodySchema,
  emptyQuerySchema,
  listUsersQuerySchema,
  provisionSchema,
  userIdParams,
  userSessionParams,
} from './users.validation.js';

const USER_ACCOUNTS = 'SECURITY_ADMINISTRATION.USER_ACCOUNTS';

/**
 * User administration, mounted at /api/v1/users. Every route requires an authenticated session
 * and the USER_ACCOUNTS action (re-evaluated in Oracle per request; MFA-verified session required);
 * changes also require the session-bound CSRF token. Validation runs after authorization.
 */
export function createUsersRouter({ usersService, authorize, authenticate, auditService }) {
  const controller = createUsersController({ usersService });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const read = (action, schemas) => [
    authenticate,
    authorize(USER_ACCOUNTS, action),
    validate({ query: emptyQuerySchema, ...schemas }),
  ];
  const write = (action, schemas) => [
    authenticate,
    requireCsrfToken,
    authorize(USER_ACCOUNTS, action),
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
  router.post('/', ...write('CREATE', { body: provisionSchema }), controller.provision);
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
