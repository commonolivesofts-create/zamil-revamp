// Implements: API §2 auth endpoints, TRD §13 login rate limit (10/min/IP).
import {
  ASSIGNABLE_ROLES,
  devLoginRequestSchema,
  loginRequestSchema,
  passwordRequestSchema,
  passwordResetSchema,
  type DevUsersResponse,
} from '@expensehub/shared';
import { Router, type RequestHandler } from 'express';
import { rateLimit } from 'express-rate-limit';
import { authOf, requireAuth } from '../../auth/rbac';
import type { SessionService } from '../../auth/session';
import type { AppConfig } from '../../config';
import type { DataLayer } from '../../data/ports';
import { DEMO_USERS, DEV_PASSWORD } from '../../data/seed/demo-users';
import { AppError } from '../../lib/errors';
import { resolveZamilIdentity, revokeZamilSession } from '../../auth/zamil-sso';
import type { AuthService } from './service';

export interface AuthRouteDeps {
  config: AppConfig;
  data: DataLayer;
  auth: AuthService;
  sessions: SessionService;
}

function limiter(): RequestHandler {
  return rateLimit({
    windowMs: 60_000,
    limit: 10,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    handler: (_req, _res, next) =>
      next(new AppError('RATE_LIMITED', 'Too many attempts. Wait a minute and try again.')),
  });
}

export function authRoutes({ config, data, auth, sessions }: AuthRouteDeps): Router {
  const router = Router();
  const signInLimit = limiter();
  const passwordLimit = limiter();

  /** Issues the session cookie and answers with /auth/me. */
  async function signIn(
    res: Parameters<RequestHandler>[1],
    userId: number,
    sessionOptions: { abs?: number; provider?: 'zamil' } = {},
  ) {
    const ctx = await auth.context(userId);
    const session = await sessions.issue(res, {
      userId,
      personId: ctx.personId,
      ph: ctx.passwordFingerprint,
      ...sessionOptions,
    });
    res.json(auth.toMe(ctx, session));
  }

  router.post('/auth/login', signInLimit, async (req, res) => {
    const { username, password } = loginRequestSchema.parse(req.body);
    const verified = await auth.login(username, password);
    req.log.info({ personId: verified.personId }, 'signed in');
    await signIn(res, verified.userId);
  });

  router.post('/auth/sso', async (req, res) => {
    const identity = await resolveZamilIdentity(req, config.auth.zamil);
    const verified = await auth.ssoLogin(identity.personNumber);
    req.log.info({ provider: 'zamil' }, 'signed in through host SSO');
    await signIn(res, verified.userId, {
      abs: identity.absoluteExpiresAt,
      provider: 'zamil',
    });
  });

  router.post('/auth/logout', async (req, res) => {
    await revokeZamilSession(req, res, config.auth.zamil);
    sessions.clear(res);
    res.json({ ok: true });
  });

  router.get('/auth/me', requireAuth, (req, res) => {
    const ctx = authOf(req);
    res.set('Cache-Control', 'no-store').json(auth.toMe(ctx, ctx.session!));
  });

  router.post('/auth/password/request', passwordLimit, async (req, res) => {
    const { username } = passwordRequestSchema.parse(req.body);
    await auth.requestPasswordLink(username);
    res.json({ ok: true });
  });

  router.post('/auth/password/reset', passwordLimit, async (req, res) => {
    const { token, password } = passwordResetSchema.parse(req.body);
    await auth.resetPassword(token, password);
    sessions.clear(res);
    res.json({ ok: true });
  });

  // D-33 dev quick-login: the routes do not exist unless enabled (never in production).
  if (config.auth.devQuickLogin) {
    router.get('/auth/dev-users', async (_req, res) => {
      const users = await data.read(async (r) => {
        const out: DevUsersResponse['users'] = [];
        for (const demo of DEMO_USERS) {
          const e = await r.employees.getByPersonNumber(demo.personNumber);
          if (!e || e.active !== 'Y') continue;
          out.push({
            personNumber: demo.personNumber,
            fullName: e.fullName,
            persona: demo.persona,
            scenario: demo.scenario,
            businessUnit: e.businessUnit,
            jobName: e.jobName,
          });
        }
        if (out.length > 0) return out;
        // D-50 live data: no demo people — list everyone who holds an ExpenseHub role.
        const roles = new Map<number, string[]>();
        for (const role of ASSIGNABLE_ROLES) {
          for (const a of await r.roleAssignments.listByRole(role)) {
            roles.set(a.personId, [...(roles.get(a.personId) ?? []), role]);
          }
        }
        for (const [personId, held] of roles) {
          const e = await r.employees.get(personId);
          if (!e || e.active !== 'Y') continue;
          out.push({
            personNumber: e.personNumber,
            fullName: e.fullName,
            persona: held.map((x) => x.replace(/_/g, ' ').toLowerCase()).join(', '),
            scenario: 'Signed in with person number + the dev password (any employee works)',
            businessUnit: e.businessUnit,
            jobName: e.jobName,
          });
        }
        return out.sort((a, b) => a.fullName.localeCompare(b.fullName));
      });
      const body: DevUsersResponse = { password: DEV_PASSWORD, users };
      res.json(body);
    });

    router.post('/auth/dev-login', async (req, res) => {
      const { personNumber } = devLoginRequestSchema.parse(req.body);
      const verified = await auth.devLogin(personNumber);
      req.log.info({ personId: verified.personId }, 'dev quick-login');
      await signIn(res, verified.userId);
    });
  }

  return router;
}
