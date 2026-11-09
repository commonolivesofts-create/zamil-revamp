// Reads the session cookie on every API request; sets req.auth for a valid session.
// Invalid sessions are cleared and the request continues anonymously (guards return 401).
import type { RequestHandler } from 'express';
import type { DataLayer } from '../data/ports';
import { riyadhDate, type Clock } from '../lib/dates';
import { loadAuthContext } from './context';
import { SESSION_COOKIE, type SessionService } from './session';

export function authenticate(deps: {
  data: DataLayer;
  sessions: SessionService;
  clock: Clock;
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
      auth.passwordFingerprint !== claims.ph
    ) {
      deps.sessions.clear(res);
      next();
      return;
    }

    auth.session = deps.sessions.shouldRefresh(claims)
      ? await deps.sessions.issue(res, { ...claims })
      : { expiresAt: new Date(claims.exp * 1000), absoluteExpiresAt: new Date(claims.abs * 1000) };
    req.auth = auth;
    next();
  };
}
