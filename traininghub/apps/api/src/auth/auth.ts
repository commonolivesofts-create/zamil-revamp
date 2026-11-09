// Local sign-in by Fusion person number + password, session middleware and the dev quick login.
import type { NextFunction, Request, RequestHandler, Response } from 'express';
import { AppError } from '../lib/errors';
import { clearZamilCookie, resolveZamilIdentity } from './zamil-sso';
import { directory, nowIso, type Ctx } from '../domain/ctx';
import type { Services } from '../services';
import { burnPasswordCheck, hashPassword, passwordFingerprint, verifyPassword } from './password';
import { SESSION_COOKIE } from './session';

const LOCK_AFTER = 5;
const LOCK_MINUTES = 15;
const BAD_LOGIN = () => new AppError('UNAUTHENTICATED', 'Person number or password is wrong');

declare module 'express-serve-static-core' {
  interface Request {
    ctx: Ctx;
    personId?: number;
    quick?: boolean;
    mustChangePassword?: boolean;
  }
}

export async function login(svc: Services, ctx: Ctx, personNumber: string, password: string) {
  const dir = await directory(ctx);
  const cost = svc.config.auth.bcryptCost;
  const person = dir.byNumber.get(personNumber.trim());
  if (!person?.active) {
    await burnPasswordCheck(password, cost);
    throw BAD_LOGIN();
  }
  const user = await ctx.store.one('users', { personId: person.personId });
  const now = ctx.clock();
  if (user?.lockedUntil && new Date(user.lockedUntil) > now)
    throw new AppError('RATE_LIMITED', `Too many attempts — try again after ${new Date(user.lockedUntil).toLocaleTimeString('en-GB', { timeZone: 'Asia/Riyadh', hour: '2-digit', minute: '2-digit' })}`);
  let ok = false;
  let hash = user?.passwordHash ?? null;
  if (hash) ok = await verifyPassword(password, hash);
  else {
    // First sign-in with the pilot's shared initial password (if configured); must be changed at once.
    const initial = svc.config.auth.initialPassword;
    await burnPasswordCheck(password, cost);
    if (initial && password === initial) {
      ok = true;
      hash = await hashPassword(password, cost);
      await ctx.store.upsert('users', ['personId'], { personId: person.personId, passwordHash: hash, mustChangeFlag: true, failedCount: 0, createdAt: nowIso(ctx) });
    }
  }
  if (!ok) {
    if (user) {
      const failed = user.failedCount + 1;
      await ctx.store.update('users', { personId: person.personId }, {
        failedCount: failed >= LOCK_AFTER ? 0 : failed,
        lockedUntil: failed >= LOCK_AFTER ? new Date(now.getTime() + LOCK_MINUTES * 60_000).toISOString() : null,
      });
    }
    throw BAD_LOGIN();
  }
  await ctx.store.update('users', { personId: person.personId }, { failedCount: 0, lockedUntil: null, lastLoginAt: nowIso(ctx) });
  const fresh = await ctx.store.one('users', { personId: person.personId });
  return { personId: person.personId, ph: passwordFingerprint(hash), mustChange: fresh?.mustChangeFlag ?? false };
}

export async function changePassword(svc: Services, ctx: Ctx, personId: number, current: string, next: string) {
  const user = await ctx.store.one('users', { personId });
  if (!user?.passwordHash || !(await verifyPassword(current, user.passwordHash)))
    throw new AppError('VALIDATION', 'Current password is wrong', { fields: { currentPassword: 'Wrong password' } });
  if (current === next) throw new AppError('VALIDATION', 'Choose a new password', { fields: { newPassword: 'Same as the current one' } });
  const hash = await hashPassword(next, svc.config.auth.bcryptCost);
  await ctx.store.update('users', { personId }, { passwordHash: hash, mustChangeFlag: false, passwordChangedAt: nowIso(ctx) });
  return passwordFingerprint(hash);
}

export function sessionMiddleware(svc: Services): RequestHandler {
  return async (req: Request, res: Response, next: NextFunction) => {
    const token = req.cookies?.[SESSION_COOKIE] as string | undefined;
    const claims = token ? await svc.sessions.verify(token) : null;
    if (!claims) return next(new AppError('UNAUTHENTICATED', 'Please sign in'));
    const dir = await directory(req.ctx);
    const person = dir.people.get(claims.personId);
    if (!person?.active) return next(new AppError('UNAUTHENTICATED', 'Your account is not active'));
    const quick = claims.ph === 'quick';
    const user = await req.ctx.store.one('users', { personId: claims.personId });
    const zamilSso = claims.provider === 'zamil';
    if (zamilSso) {
      let identity;
      try {
        identity = await resolveZamilIdentity(req, svc.config.auth.zamil);
      } catch (error) {
        svc.sessions.clear(res);
        if (error instanceof AppError && error.code === 'UNAUTHENTICATED') {
          clearZamilCookie(res, svc.config.auth.zamil);
        }
        return next(new AppError('UNAUTHENTICATED', 'Please sign in'));
      }
      if (identity.personNumber !== person.personNumber) {
        svc.sessions.clear(res);
        return next(new AppError('UNAUTHENTICATED', 'Please sign in'));
      }
    }
    if (!zamilSso && (quick ? !svc.config.auth.quickLogin : passwordFingerprint(user?.passwordHash ?? null) !== claims.ph))
      return next(new AppError('UNAUTHENTICATED', 'Your session has ended — please sign in again'));
    req.personId = claims.personId;
    req.quick = quick;
    req.mustChangePassword = !quick && !zamilSso && !!user?.mustChangeFlag;
    req.ctx.actor = claims.personId;
    if (svc.sessions.needsRefresh(claims))
      await svc.sessions.issue(res, {
        personId: claims.personId,
        ph: claims.ph,
        abs: claims.abs,
        provider: claims.provider,
      });
    const allowed = req.path === '/me' || req.path.startsWith('/auth/');
    if (req.mustChangePassword && !allowed) return next(new AppError('FORBIDDEN', 'Change your password first'));
    next();
  };
}

/** Resolve a host-authenticated employee to the local session identity by Fusion person number. */
export async function resolveZamilPerson(ctx: Ctx, personNumber: string) {
  const person = (await directory(ctx)).byNumber.get(personNumber.trim());
  if (!person?.active)
    throw new AppError(
      'FORBIDDEN',
      'No active TrainingHub profile was found for this Zamil employee. Ask HR to sync the employee profile.',
    );
  const user = await ctx.store.one('users', { personId: person.personId });
  return { personId: person.personId, ph: passwordFingerprint(user?.passwordHash ?? null) };
}
