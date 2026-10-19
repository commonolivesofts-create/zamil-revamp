import { Router } from 'express';
import { createRequireCsrfToken } from '../../middleware/csrf.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { createAuthController } from './auth.controller.js';
import { emptyQuerySchema, loginSchema } from './auth.validation.js';

/**
 * Authentication routes, mounted at /api/v1/auth. State-changing routes are additionally covered
 * by the API router's origin check.
 */
export function createAuthRouter({
  authService,
  sessionService,
  auditService,
  authenticate,
  authConfig,
}) {
  const controller = createAuthController({
    authService,
    sessionService,
    cookieConfig: authConfig.cookie,
  });
  const loginRateLimit = createRateLimiter(authConfig.loginRateLimit);
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const router = Router();

  // Authentication responses carry identity and CSRF material; never cache them.
  router.use((_req, res, next) => {
    res.set('Cache-Control', 'no-store');
    next();
  });

  router.get(
    '/password/policy',
    validate({ query: emptyQuerySchema }),
    controller.getPasswordPolicy,
  );
  router.post(
    '/login',
    loginRateLimit,
    validate({ query: emptyQuerySchema, body: loginSchema }),
    controller.login,
  );
  router.get('/me', validate({ query: emptyQuerySchema }), authenticate, controller.getCurrentUser);
  router.get('/csrf', validate({ query: emptyQuerySchema }), authenticate, controller.getCsrfToken);
  router.post(
    '/logout',
    validate({ query: emptyQuerySchema }),
    authenticate,
    requireCsrfToken,
    controller.logout,
  );

  return router;
}
