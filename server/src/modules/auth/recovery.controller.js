import { requestContext, sessionCookieOptions } from '../../middleware/authenticate.js';
import { sendSuccess } from '../../shared/responses/apiResponse.js';

/** HTTP adapter for password setup/reset/change and MFA recovery (rules in recovery.service.js). */
export function createRecoveryController({ recoveryService, cookieConfig }) {
  const cookieOptions = sessionCookieOptions(cookieConfig);
  const ctx = requestContext;

  return {
    // Same 202 for every username and outcome (no enumeration); nothing about delivery leaks.
    async requestRecovery(req, res) {
      await recoveryService.requestSelfService(req.body, ctx(req));
      sendSuccess(
        res,
        {
          accepted: true,
          message:
            'If the account is eligible, instructions have been sent to its registered address.',
        },
        202,
      );
    },
    async completeSetup(req, res) {
      sendSuccess(res, await recoveryService.completeSetup(req.body, ctx(req)));
    },
    async completeReset(req, res) {
      sendSuccess(res, await recoveryService.completeReset(req.body, ctx(req)));
    },
    async changePassword(req, res) {
      const result = await recoveryService.changePassword(req.auth, req.body, ctx(req));
      // Every session, including this one, was revoked: sign in again with the new password.
      res.clearCookie(cookieConfig.name, cookieOptions);
      sendSuccess(res, result);
    },
    async startMfaRecovery(req, res) {
      sendSuccess(res, await recoveryService.startMfaRecovery(req.body, ctx(req)));
    },
    async confirmMfaRecovery(req, res) {
      const result = await recoveryService.confirmMfaRecovery(req.body, ctx(req));
      res.clearCookie(cookieConfig.name, cookieOptions);
      sendSuccess(res, result);
    },
  };
}
