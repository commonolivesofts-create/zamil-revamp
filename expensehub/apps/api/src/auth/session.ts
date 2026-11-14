// Implements: TRD §5 session — signed JWT (HS256) in an httpOnly, SameSite=Strict cookie;
// 8 h absolute, 30 min idle with sliding refresh (PRD §7).
import type { Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import type { Clock } from '../lib/dates';

export const SESSION_COOKIE = 'eh_session';
export const SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;
export const SESSION_IDLE_SECONDS = 30 * 60;
/** Re-issue the cookie at most once a minute. */
export const SESSION_REFRESH_AFTER_SECONDS = 60;

export interface SessionClaims {
  userId: number;
  personId: number;
  /** Absolute expiry (epoch seconds), fixed at sign-in. */
  abs: number;
  /** Password fingerprint (see password.ts). */
  ph: string;
  /** Authenticated by the host Zamil session; local password changes do not revoke this session. */
  provider?: 'zamil';
  iat: number;
  exp: number;
}

export interface SessionTimes {
  expiresAt: Date;
  absoluteExpiresAt: Date;
}

export class SessionService {
  private readonly key: Uint8Array;

  constructor(
    secret: string,
    private readonly secure: boolean,
    private readonly clock: Clock,
  ) {
    this.key = new TextEncoder().encode(secret);
  }

  private nowSeconds(): number {
    return Math.floor(this.clock().getTime() / 1000);
  }

  async issue(
    res: Response,
    claims: {
      userId: number;
      personId: number;
      ph: string;
      abs?: number;
      provider?: 'zamil';
    },
  ): Promise<SessionTimes> {
    const now = this.nowSeconds();
    const abs = claims.abs ?? now + SESSION_ABSOLUTE_SECONDS;
    const exp = Math.min(now + SESSION_IDLE_SECONDS, abs);
    const token = await new SignJWT({
      pid: claims.personId,
      abs,
      ph: claims.ph,
      ...(claims.provider && { provider: claims.provider }),
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(claims.userId))
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(this.key);
    res.cookie(SESSION_COOKIE, token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
      path: '/',
      maxAge: (abs - now) * 1000,
    });
    return { expiresAt: new Date(exp * 1000), absoluteExpiresAt: new Date(abs * 1000) };
  }

  /** Valid claims, or null for a missing, tampered, expired or malformed token. */
  async verify(token: string): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        currentDate: this.clock(),
      });
      const userId = Number(payload.sub);
      const { pid, abs, ph, provider, iat, exp } = payload as Record<string, unknown>;
      if (
        !Number.isSafeInteger(userId) ||
        typeof pid !== 'number' ||
        typeof abs !== 'number' ||
        typeof ph !== 'string' ||
        (provider !== undefined && provider !== 'zamil') ||
        typeof iat !== 'number' ||
        typeof exp !== 'number' ||
        this.nowSeconds() >= abs
      ) {
        return null;
      }
      return {
        userId,
        personId: pid,
        abs,
        ph,
        ...(provider === 'zamil' && { provider }),
        iat,
        exp,
      };
    } catch {
      return null;
    }
  }

  shouldRefresh(claims: SessionClaims): boolean {
    return this.nowSeconds() - claims.iat >= SESSION_REFRESH_AFTER_SECONDS;
  }

  clear(res: Response): void {
    res.clearCookie(SESSION_COOKIE, {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.secure,
      path: '/',
    });
  }
}
