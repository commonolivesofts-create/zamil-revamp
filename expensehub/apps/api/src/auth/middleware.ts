// Reads the session cookie on every API request; sets req.auth for a valid session.
// Invalid sessions are cleared and the request continues anonymously (guards return 401).
import type { RequestHandler } from 'express';
import type { AppConfig } from '../config';
import type { DataLayer } from '../data/ports';
import { riyadhDate, type Clock } from '../lib/dates';
import { AppError } from '../lib/errors';
import { loadAuthContext } from './context';
import { SESSION_COOKIE, type SessionService } from './session';
import { clearZamilCookie, resolveZamilIdentity } from './zamil-sso';

export function authenticate(deps: {
  data: DataLayer;
  sessions: SessionService;
  clock: Clock;
  zamil: AppConfig['auth']['zamil'];
}): RequestHandler {
  return async (req, res, next) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') {
      next();
      return;
    }

    const claims = await deps.sessions.verify(token);
    const auth = claims
      ? await deps.data.read((r) => loadAuthContext(r, claims.userId, riyadhDate(deps.clock())))
      : null;

    // Unknown, deactivated, re-keyed (password changed) or mismatched → signed out.
    if (
      !claims ||
      !auth ||
      auth.personId !== claims.personId ||
      (claims.provider !== 'zamil' && auth.passwordFingerprint !== claims.ph)
    ) {
      deps.sessions.clear(res);
      next();
      return;
    }

    if (claims.provider === 'zamil') {
      let identity;
      try {
        identity = await resolveZamilIdentity(req, deps.zamil);
      } catch (error) {
        deps.sessions.clear(res);
        if (error instanceof AppError && error.code === 'UNAUTHENTICATED') {
          clearZamilCookie(res, deps.zamil);
        }
        // Fail closed for the SSO session but let the API's normal 401 route expose local sign-in.
        next();
        return;
      }
      if (identity.personNumber !== auth.employee.personNumber) {
        deps.sessions.clear(res);
        next();
        return;
      }
    }

    auth.session = deps.sessions.shouldRefresh(claims)
      ? await deps.sessions.issue(res, { ...claims })
      : { expiresAt: new Date(claims.exp * 1000), absoluteExpiresAt: new Date(claims.abs * 1000) };
    req.auth = auth;
    next();
  };
}
