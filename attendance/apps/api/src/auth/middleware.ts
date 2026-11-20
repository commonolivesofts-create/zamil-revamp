// Session middleware: verifies the at_session cookie, re-validates the host Zamil session (cached
// 30 s in zamil-sso.ts) so signing out of Zamil ends access here too, and slides the idle expiry.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { can, SESSION_COOKIE, type Permission } from '@attendance/shared';
import type { ZamilAuthConfig } from '../config';
import { AppError } from '../lib/errors';
import type { SessionClaims, SessionService } from './session';
import { resolveZamilIdentity, type ZamilIdentity } from './zamil-sso';

declare module 'express-serve-static-core' {
  interface Request {
    auth?: SessionClaims;
  }
}

export type ZamilResolver = (req: Request, config: ZamilAuthConfig) => Promise<ZamilIdentity>;

export function sessionMiddleware(deps: {
  sessions: SessionService;
  zamil: ZamilAuthConfig;
  resolveZamil?: ZamilResolver;
}): RequestHandler {
  const resolve = deps.resolveZamil ?? resolveZamilIdentity;
  return async (req: Request, res: Response, next: NextFunction) => {
    const token: unknown = req.cookies?.[SESSION_COOKIE];
    if (typeof token !== 'string' || token === '') return next();

    const claims = await deps.sessions.verify(token);
    if (!claims) {
      deps.sessions.clear(res);
      return next();
    }

    try {
      const zamil = await resolve(req, deps.zamil);
      if (zamil.personNumber !== claims.employeeNumber) {
        deps.sessions.clear(res);
        return next();
      }
    } catch (error) {
      // Zamil session gone or revoked: the attendance session ends with it.
      if (error instanceof AppError && error.httpStatus < 500) {
        deps.sessions.clear(res);
        return next();
      }
      return next(error);
    }

    req.auth = claims;
    if (deps.sessions.needsRefresh(claims)) {
      await deps.sessions.issue(res, {
        userId: claims.userId,
        employeeNumber: claims.employeeNumber,
        roles: claims.roles,
        abs: claims.abs,
      });
    }
    next();
  };
}

export const requireAuth: RequestHandler = (req, _res, next) => {
  next(req.auth ? undefined : new AppError('UNAUTHENTICATED', 'Sign in to continue.'));
};

export function requirePermission(permission: Permission): RequestHandler {
  return (req, _res, next) => {
    if (!req.auth) return next(new AppError('UNAUTHENTICATED', 'Sign in to continue.'));
    if (!can(req.auth.roles, permission)) {
      return next(new AppError('FORBIDDEN', 'You do not have access to this page.'));
    }
    next();
  };
}

export function authOf(req: Request): SessionClaims {
  if (!req.auth) throw new AppError('UNAUTHENTICATED', 'Sign in to continue.');
  return req.auth;
}
