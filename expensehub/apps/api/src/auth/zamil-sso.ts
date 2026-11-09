// Implements: TRD §5 — validate the host Zamil session before issuing an ExpenseHub session.
import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import type { AppConfig } from '../config';
import { AppError } from '../lib/errors';

type ZamilAuthConfig = AppConfig['auth']['zamil'];

export interface ZamilIdentity {
  personNumber: string;
  absoluteExpiresAt: number;
}

const VALIDATION_CACHE_MS = 30_000;
const validatedSessions = new Map<
  string,
  { until: number; identity?: ZamilIdentity; pending?: Promise<ZamilIdentity> }
>();

function sessionCookies(
  req: Request,
  config: ZamilAuthConfig,
): { name: string; header: string; key: string }[] {
  // APP_ENV=test uses `zr_session`; local development uses the __Host- cookie. The configured
  // name wins, with the other built-in profile name accepted when launch environments differ.
  const names = [...new Set([config.sessionCookieName, 'zr_session', '__Host-zr_session'])];
  const cookies: { name: string; header: string; key: string }[] = [];
  for (const name of names) {
    const token: unknown = req.cookies?.[name];
    if (typeof token !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(token)) continue;
    cookies.push({
      name,
      header: `${name}=${token}`,
      key: createHash('sha256').update(token).digest('hex'),
    });
  }
  return cookies;
}

function signInRequired(): AppError {
  return new AppError('UNAUTHENTICATED', 'Sign in to Zamil first, or use your ExpenseHub account.');
}

/** The Zamil cookie stays HttpOnly; only the backend forwards it to Zamil's own auth endpoint. */
export async function resolveZamilIdentity(
  req: Request,
  config: ZamilAuthConfig,
): Promise<ZamilIdentity> {
  const cookies = sessionCookies(req, config);
  if (cookies.length === 0) {
    throw new AppError(
      'FORBIDDEN',
      'No Zamil session cookie reached ExpenseHub. Open it using the same hostname as Zamil and reload.',
    );
  }
  if (!config.apiBaseUrl) {
    throw new AppError('INTERNAL', 'Zamil SSO is not configured for this environment.');
  }

  for (const cookie of cookies) {
    try {
      return await resolveCookieIdentity(cookie, req, config);
    } catch (error) {
      if (error instanceof AppError && error.code === 'UNAUTHENTICATED') continue;
      throw error;
    }
  }
  throw signInRequired();
}

async function resolveCookieIdentity(
  cookie: { name: string; header: string; key: string },
  req: Request,
  config: ZamilAuthConfig,
): Promise<ZamilIdentity> {
  if (!config.apiBaseUrl) throw signInRequired();
  const now = Date.now();
  for (const [key, entry] of validatedSessions) {
    if (entry.until <= now) validatedSessions.delete(key);
  }
  const cached = validatedSessions.get(cookie.key);
  if (cached && cached.until > now) {
    if (cached.identity) return cached.identity;
    if (cached.pending) return cached.pending;
  }

  const pending = fetchZamilIdentity(cookie.header, req.get('User-Agent'), config);
  validatedSessions.set(cookie.key, { until: now + VALIDATION_CACHE_MS, pending });
  try {
    const identity = await pending;
    if (validatedSessions.get(cookie.key)?.pending === pending) {
      validatedSessions.set(cookie.key, {
        until: Math.min(Date.now() + VALIDATION_CACHE_MS, identity.absoluteExpiresAt * 1000),
        identity,
      });
    }
    return identity;
  } catch (error) {
    if (validatedSessions.get(cookie.key)?.pending === pending)
      validatedSessions.delete(cookie.key);
    throw error;
  }
}

async function fetchZamilIdentity(
  cookie: string,
  userAgent: string | undefined,
  config: ZamilAuthConfig,
): Promise<ZamilIdentity> {
  if (!config.apiBaseUrl) throw signInRequired();
  let response: globalThis.Response;
  try {
    response = await fetch(`${config.apiBaseUrl}/auth/me`, {
      headers: {
        Accept: 'application/json',
        Cookie: cookie,
        ...(userAgent && { 'User-Agent': userAgent }),
      },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new AppError(
      'INTERNAL',
      'Zamil sign-in could not be checked. Try again or sign in here.',
    );
  }

  if (response.status === 401 || response.status === 403) throw signInRequired();
  const envelope: unknown = await response.json().catch(() => null);
  if (!response.ok || !envelope || typeof envelope !== 'object') {
    throw new AppError(
      'INTERNAL',
      'Zamil sign-in could not be checked. Try again or sign in here.',
    );
  }

  const body = envelope as {
    success?: unknown;
    data?: { user?: { employeeNumber?: unknown }; session?: { expiresAt?: unknown } };
  };
  const personNumber = body.data?.user?.employeeNumber;
  const absoluteExpiresAt =
    typeof body.data?.session?.expiresAt === 'string'
      ? Date.parse(body.data.session.expiresAt)
      : Number.NaN;
  if (
    body.success !== true ||
    typeof personNumber !== 'string' ||
    personNumber.trim() === '' ||
    !Number.isFinite(absoluteExpiresAt) ||
    absoluteExpiresAt <= Date.now()
  ) {
    throw new AppError('INTERNAL', 'Zamil returned an invalid sign-in response.');
  }

  return {
    personNumber: personNumber.trim(),
    absoluteExpiresAt: Math.floor(absoluteExpiresAt / 1000),
  };
}

export function clearZamilCookie(res: Response, config: ZamilAuthConfig): void {
  const names = [...new Set([config.sessionCookieName, 'zr_session', '__Host-zr_session'])];
  for (const name of names) {
    res.clearCookie(name, {
      httpOnly: true,
      secure: name === '__Host-zr_session' || config.cookieSecure,
      sameSite: config.cookieSameSite,
      path: '/',
    });
  }
}

/** Hub sign-out also revokes the central session so automatic SSO does not sign the user back in. */
export async function revokeZamilSession(
  req: Request,
  res: Response,
  config: ZamilAuthConfig,
): Promise<void> {
  const presented = sessionCookies(req, config);
  for (const cookie of presented) validatedSessions.delete(cookie.key);
  if (config.apiBaseUrl) {
    for (const cookie of presented) {
      try {
        const csrfResponse = await fetch(`${config.apiBaseUrl}/auth/csrf`, {
          headers: {
            Accept: 'application/json',
            Cookie: cookie.header,
            ...(req.get('User-Agent') && { 'User-Agent': req.get('User-Agent')! }),
          },
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });
        const csrfEnvelope: unknown = await csrfResponse.json().catch(() => null);
        const csrfBody = csrfEnvelope as {
          success?: unknown;
          data?: { token?: unknown; headerName?: unknown };
        } | null;
        const token = csrfBody?.data?.token;
        const headerName = csrfBody?.data?.headerName;
        if (
          !csrfResponse.ok ||
          csrfBody?.success !== true ||
          typeof token !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(token) ||
          headerName !== 'X-CSRF-Token'
        )
          continue;

        const logoutResponse = await fetch(`${config.apiBaseUrl}/auth/logout`, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            Cookie: cookie.header,
            'X-CSRF-Token': token,
            ...(req.get('User-Agent') && { 'User-Agent': req.get('User-Agent')! }),
          },
          body: '{}',
          redirect: 'error',
          signal: AbortSignal.timeout(5000),
        });
        if (logoutResponse.ok) break;
      } catch {
        // Try the other known profile cookie before giving up on central revocation.
      }
    }
  }

  clearZamilCookie(res, config);
}
