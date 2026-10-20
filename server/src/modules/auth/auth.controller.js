import { requestContext, sessionCookieOptions } from '../../middleware/authenticate.js';
import { CSRF_HEADER } from '../../middleware/csrf.js';
import { readCookie } from '../../shared/utils/cookies.js';
import { sendSuccess } from '../../shared/responses/apiResponse.js';
import { toUserProfile } from './auth.service.js';
import { PASSWORD_POLICY } from './auth.policy.js';

/**
 * @param {{ authService: object, sessionService: object, mfaService: object | null,
 *   cookieConfig: object, mfaCookieName: string }} deps
 */
export function createAuthController({
  authService,
  sessionService,
  mfaService,
  cookieConfig,
  mfaCookieName,
}) {
  const cookieOptions = sessionCookieOptions(cookieConfig);

  // Completed authentication: set the session cookie, drop any MFA challenge cookie.
  function sendSession(res, result) {
    res.cookie(cookieConfig.name, result.token, {
      ...cookieOptions,
      expires: result.session.expiresAt,
    });
    res.clearCookie(mfaCookieName, cookieOptions);
    sendSuccess(res, {
      authenticated: true,
      user: result.user,
      session: result.session,
      password: result.password,
      csrf: { token: result.csrfToken, headerName: CSRF_HEADER },
    });
  }

  // Password verified but MFA still required: only the challenge cookie is set.
  function sendChallenge(res, challenge) {
    res.cookie(mfaCookieName, challenge.token, { ...cookieOptions, expires: challenge.expiresAt });
    sendSuccess(res, {
      authenticated: false,
      mfa: {
        required: true,
        enrollmentRequired: challenge.enrollmentRequired,
        expiresAt: challenge.expiresAt,
      },
      csrf: { token: challenge.csrfToken, headerName: CSRF_HEADER },
    });
  }

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
      if (result.kind === 'MFA_CHALLENGE') return sendChallenge(res, result);
      sendSession(res, result);
    },

    async startMfaEnrollment(req, res) {
      sendSuccess(
        res,
        await mfaService.startEnrollment(req.mfaChallengeToken, requestContext(req)),
      );
    },

    async confirmMfaEnrollment(req, res) {
      const result = await mfaService.confirmEnrollment(
        req.mfaChallengeToken,
        req.body.code,
        requestContext(req),
        readCookie(req, cookieConfig.name),
      );
      sendSession(res, result);
    },

    async verifyMfa(req, res) {
      const result = await mfaService.verify(
        req.mfaChallengeToken,
        req.body.code,
        requestContext(req),
        readCookie(req, cookieConfig.name),
      );
      sendSession(res, result);
    },

    async startMfaReplacement(req, res) {
      sendSuccess(res, await mfaService.startReplacement(req.auth, requestContext(req)));
    },

    // Every session of the user, including this one, is revoked: both cookies are cleared and a
    // new password + MFA sign-in with the new authenticator is required.
    async confirmMfaReplacement(req, res) {
      const result = await mfaService.confirmReplacement(
        req.auth,
        req.body.code,
        requestContext(req),
      );
      res.clearCookie(cookieConfig.name, cookieOptions);
      res.clearCookie(mfaCookieName, cookieOptions);
      sendSuccess(res, result);
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
