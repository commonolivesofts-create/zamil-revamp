import {
  csrfTokenMatches,
  deriveCsrfToken,
  isWellFormedToken,
} from '../modules/auth/session.service.js';
import { AppError } from '../shared/errors/AppError.js';
import { readCookie } from '../shared/utils/cookies.js';
import { CSRF_HEADER } from './csrf.js';

/**
 * Requires the MFA challenge cookie and its session-bound X-CSRF-Token for the MFA endpoints.
 * Only the presence and CSRF binding are checked here; the MFA service validates the challenge
 * against the database. The token is placed on `req.mfaChallengeToken`.
 */
export function createRequireMfaChallenge({ cookieName }) {
  return function requireMfaChallenge(req, _res, next) {
    const token = readCookie(req, cookieName);
    if (!isWellFormedToken(token)) {
      return next(
        new AppError(
          401,
          'MFA_CHALLENGE_INVALID',
          'Your sign-in has expired or is no longer valid. Sign in again.',
        ),
      );
    }
    if (!csrfTokenMatches(deriveCsrfToken(token), req.get(CSRF_HEADER))) {
      return next(
        new AppError(
          403,
          'CSRF_REJECTED',
          'The request could not be verified. Reload and try again.',
        ),
      );
    }
    req.mfaChallengeToken = token;
    next();
  };
}

/** Refuses MFA endpoints when no MFA key ring is configured (mandatory-MFA users stay blocked). */
export function requireMfaAvailable(available) {
  return function mfaAvailable(_req, _res, next) {
    if (available) return next();
    next(
      new AppError(
        503,
        'MFA_UNAVAILABLE',
        'Multi-factor verification is temporarily unavailable. Contact your administrator.',
      ),
    );
  };
}
