import { requestContext, sessionCookieOptions } from '../../middleware/authenticate.js';
import { CSRF_HEADER } from '../../middleware/csrf.js';
import { readCookie } from '../../shared/utils/cookies.js';
import { sendSuccess } from '../../shared/responses/apiResponse.js';
import { toUserProfile } from './auth.service.js';
import { PASSWORD_POLICY } from './auth.policy.js';

/**
 * @param {{ authService: object, sessionService: object, cookieConfig: object }} deps
 */
export function createAuthController({ authService, sessionService, cookieConfig }) {
  const cookieOptions = sessionCookieOptions(cookieConfig);

  return {
    getPasswordPolicy(_req, res) {
      sendSuccess(res, PASSWORD_POLICY);
    },

    async login(req, res) {
      const result = await authService.login(
        req.body,
        requestContext(req),
        readCookie(req, cookieConfig.name),
      );

      res.cookie(cookieConfig.name, result.token, {
        ...cookieOptions,
        expires: result.session.expiresAt,
      });
      sendSuccess(res, {
        user: result.user,
        session: result.session,
        password: result.password,
        csrf: { token: result.csrfToken, headerName: CSRF_HEADER },
      });
    },

    getCurrentUser(req, res) {
      const { auth } = req;
      sendSuccess(res, {
        user: toUserProfile(auth.userId, auth.employeeNumber, auth.employee),
        session: {
          expiresAt: auth.expiresAt,
          idleTimeoutSeconds: auth.idleTimeoutMs / 1000,
          mfaVerified: auth.mfaVerified,
        },
        password: { expired: auth.passwordExpired, expiresAt: auth.passwordExpiresAt },
      });
    },

    getCsrfToken(req, res) {
      sendSuccess(res, { token: req.auth.csrfToken, headerName: CSRF_HEADER });
    },

    async logout(req, res) {
      await sessionService.logout(req.auth, requestContext(req));
      res.clearCookie(cookieConfig.name, cookieOptions);
      res.status(204).end();
    },
  };
}
