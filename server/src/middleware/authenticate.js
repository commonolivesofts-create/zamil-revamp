import { AppError } from '../shared/errors/AppError.js';
import { readCookie } from '../shared/utils/cookies.js';

export const requestContext = (req) => ({
  requestId: req.id,
  ipAddress: req.ip,
  userAgent: req.get('User-Agent'),
});

/** Cookie attributes shared by issuing and clearing the session cookie. */
export function sessionCookieOptions(cookieConfig) {
  return {
    httpOnly: true,
    secure: cookieConfig.secure,
    sameSite: cookieConfig.sameSite,
    path: '/',
  };
}

/**
 * Requires a valid database-backed session. On success `req.auth` holds the session identity;
 * on any failure the cookie is cleared and a safe 401 is returned. The reason is never exposed.
 *
 * @param {{ sessionService: object, cookieConfig: { name: string, secure: boolean, sameSite: string } }} options
 */
export function createAuthenticate({ sessionService, cookieConfig }) {
  return async function authenticate(req, res, next) {
    const token = readCookie(req, cookieConfig.name);
    const result = await sessionService.authenticate(token, requestContext(req));

    if (!result.ok) {
      if (token !== undefined) {
        res.clearCookie(cookieConfig.name, sessionCookieOptions(cookieConfig));
      }
      return next(new AppError(401, 'UNAUTHENTICATED', 'Authentication is required'));
    }

    req.auth = result.auth;
    next();
  };
}
