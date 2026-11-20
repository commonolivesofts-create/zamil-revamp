// GET /auth/me, POST /auth/sso (exchange the Zamil session for an attendance session),
// POST /auth/logout (also revokes the central Zamil session).
import { Router } from 'express';
import type { ZamilAuthConfig } from '../config';
import { AppError } from '../lib/errors';
import { rolesFor, toMe, type IdentityRepository } from './identity';
import { authOf, requireAuth, type ZamilResolver } from './middleware';
import type { SessionService } from './session';
import { resolveZamilIdentity, revokeZamilSession } from './zamil-sso';

export interface AuthRouteDeps {
  sessions: SessionService;
  identities: IdentityRepository;
  zamil: ZamilAuthConfig;
  hrAdmins: ReadonlySet<string>;
  resolveZamil?: ZamilResolver;
  revokeZamil?: typeof revokeZamilSession;
}

export function authRoutes(deps: AuthRouteDeps): Router {
  const router = Router();
  const resolve = deps.resolveZamil ?? resolveZamilIdentity;
  const revoke = deps.revokeZamil ?? revokeZamilSession;

  router.get('/auth/me', requireAuth, async (req, res) => {
    const auth = authOf(req);
    const identity = await deps.identities.findByEmployeeNumber(auth.employeeNumber);
    if (!identity) throw new AppError('UNAUTHENTICATED', 'Your attendance profile was not found.');
    res.json(toMe(identity, auth.roles));
  });

  router.post('/auth/sso', async (req, res) => {
    const zamil = await resolve(req, deps.zamil);
    const identity = await deps.identities.findByEmployeeNumber(zamil.personNumber);
    if (!identity) {
      throw new AppError(
        'FORBIDDEN',
        `Your Zamil account (employee ${zamil.personNumber}) is not linked to an employee record in the attendance system.`,
        { reason: 'NOT_LINKED' },
      );
    }
    const roles = rolesFor(identity, deps.hrAdmins);
    await deps.sessions.issue(res, {
      userId: identity.userId,
      employeeNumber: identity.employeeNumber,
      roles,
      abs: zamil.absoluteExpiresAt,
    });
    res.json(toMe(identity, roles));
  });

  router.post('/auth/logout', async (req, res) => {
    await revoke(req, res, deps.zamil);
    deps.sessions.clear(res);
    res.status(204).end();
  });

  return router;
}
