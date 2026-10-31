import { Router } from 'express';
import multer from 'multer';
import { AppError } from '../../shared/errors/AppError.js';
import { createRequireCsrfToken } from '../../middleware/csrf.js';
import { createRequireMfaChallenge, requireMfaAvailable } from '../../middleware/mfaChallenge.js';
import { createRateLimiter } from '../../middleware/rateLimit.js';
import { validate } from '../../middleware/validate.js';
import { createAuthController } from './auth.controller.js';
import { createRecoveryController } from './recovery.controller.js';
import {
  emptyBodySchema,
  emptyQuerySchema,
  loginSchema,
  mfaCodeSchema,
  mfaRecoveryConfirmSchema,
  mfaRecoveryStartSchema,
  passwordChangeSchema,
  passwordTokenSchema,
  profileImageQuerySchema,
  recoveryRequestSchema,
} from './auth.validation.js';

/**
 * Authentication routes, mounted at /api/v1/auth. State-changing routes are additionally covered
 * by the API router's origin check.
 */
export function createAuthRouter({
  authService,
  sessionService,
  mfaService,
  auditService,
  recoveryService,
  authenticate,
  authConfig,
  profileImageService,
}) {
  const controller = createAuthController({
    authService,
    sessionService,
    mfaService,
    cookieConfig: authConfig.cookie,
    mfaCookieName: authConfig.mfa.cookieName,
  });
  const loginRateLimit = createRateLimiter(authConfig.loginRateLimit);
  const mfaRateLimit = createRateLimiter(authConfig.loginRateLimit);
  // Anonymous recovery endpoints share their own per-client limit (same approved 60/min policy).
  const recoveryRateLimit = createRateLimiter(authConfig.loginRateLimit);
  const recovery = createRecoveryController({ recoveryService, cookieConfig: authConfig.cookie });
  const requireCsrfToken = createRequireCsrfToken({ auditService });
  const imageUpload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
  });
  const receiveProfileImage = (req, res, next) =>
    imageUpload.single('profileImage')(req, res, (error) =>
      error ? next(new AppError(400, 'VALIDATION_ERROR', 'Invalid profile image upload')) : next(),
    );
  const requireMfaChallenge = createRequireMfaChallenge({ cookieName: authConfig.mfa.cookieName });
  const mfaGuards = [mfaRateLimit, requireMfaAvailable(Boolean(mfaService)), requireMfaChallenge];
  const router = Router();

  // Authentication responses carry identity, CSRF and enrollment material; never cache them.
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
  router.post(
    '/mfa/enrollment',
    ...mfaGuards,
    validate({ query: emptyQuerySchema, body: emptyBodySchema }),
    controller.startMfaEnrollment,
  );
  router.post(
    '/mfa/enrollment/confirm',
    ...mfaGuards,
    validate({ query: emptyQuerySchema, body: mfaCodeSchema }),
    controller.confirmMfaEnrollment,
  );
  router.post(
    '/mfa/verify',
    ...mfaGuards,
    validate({ query: emptyQuerySchema, body: mfaCodeSchema }),
    controller.verifyMfa,
  );
  // Authenticator replacement: authenticated session + CSRF; the service also requires MFA
  // verified on this session within the last 5 minutes.
  const replacementGuards = [
    mfaRateLimit,
    requireMfaAvailable(Boolean(mfaService)),
    authenticate,
    requireCsrfToken,
  ];
  router.post(
    '/mfa/replacement',
    validate({ query: emptyQuerySchema, body: emptyBodySchema }),
    ...replacementGuards,
    controller.startMfaReplacement,
  );
  router.post(
    '/mfa/replacement/confirm',
    validate({ query: emptyQuerySchema, body: mfaCodeSchema }),
    ...replacementGuards,
    controller.confirmMfaReplacement,
  );
  // Recovery (docs/07 §4–§5). Tokens arrive only in request bodies; responses never contain them.
  router.post(
    '/recovery/request',
    recoveryRateLimit,
    validate({ query: emptyQuerySchema, body: recoveryRequestSchema }),
    recovery.requestRecovery,
  );
  router.post(
    '/password/setup',
    recoveryRateLimit,
    validate({ query: emptyQuerySchema, body: passwordTokenSchema }),
    recovery.completeSetup,
  );
  router.post(
    '/password/reset',
    recoveryRateLimit,
    validate({ query: emptyQuerySchema, body: passwordTokenSchema }),
    recovery.completeReset,
  );
  router.post(
    '/mfa/recovery/start',
    recoveryRateLimit,
    validate({ query: emptyQuerySchema, body: mfaRecoveryStartSchema }),
    recovery.startMfaRecovery,
  );
  router.post(
    '/mfa/recovery/confirm',
    recoveryRateLimit,
    validate({ query: emptyQuerySchema, body: mfaRecoveryConfirmSchema }),
    recovery.confirmMfaRecovery,
  );
  router.post(
    '/password/change',
    recoveryRateLimit,
    validate({ query: emptyQuerySchema, body: passwordChangeSchema }),
    authenticate,
    requireCsrfToken,
    recovery.changePassword,
  );
  router.get('/me', validate({ query: emptyQuerySchema }), authenticate, controller.getCurrentUser);
  router.get(
    '/me/profile-image',
    authenticate,
    validate({ query: profileImageQuerySchema }),
    async (req, res, next) => {
      try {
        const image = await profileImageService.get(req.auth.userId);
        if (!image) return res.status(404).end();
        res.type(image.mimeType).set('X-Content-Type-Options', 'nosniff').end(image.data);
      } catch (error) {
        next(error);
      }
    },
  );
  router.put(
    '/me/profile-image',
    authenticate,
    requireCsrfToken,
    receiveProfileImage,
    async (req, res, next) => {
      try {
        await profileImageService.save(req.auth.userId, req.file);
        res.status(204).end();
      } catch (error) {
        next(error);
      }
    },
  );
  router.delete('/me/profile-image', authenticate, requireCsrfToken, async (req, res, next) => {
    try {
      await profileImageService.remove(req.auth.userId);
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
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
