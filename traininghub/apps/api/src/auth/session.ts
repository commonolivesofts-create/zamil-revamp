// Signed JWT (HS256) in an httpOnly, SameSite=Strict cookie; 8 h absolute, 30 min idle with
// sliding refresh — the same session model as ExpenseHub.
import type { Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import type { Clock } from '../lib/dates';

export const SESSION_COOKIE = 'th_session';
export const SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;
export const SESSION_IDLE_SECONDS = 30 * 60;
export const SESSION_REFRESH_AFTER_SECONDS = 60;

export interface SessionClaims {
  personId: number;
  abs: number;
  ph: string;
  /** Authenticated by the host Zamil session. */
  provider?: 'zamil';
  iat: number;
  exp: number;
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
  private now() {
    return Math.floor(this.clock().getTime() / 1000);
  }
  async issue(
    res: Response,
    c: { personId: number; ph: string; abs?: number; provider?: 'zamil' },
  ) {
    const now = this.now();
    const abs = c.abs ?? now + SESSION_ABSOLUTE_SECONDS;
    const exp = Math.min(now + SESSION_IDLE_SECONDS, abs);
    const token = await new SignJWT({ abs, ph: c.ph, ...(c.provider && { provider: c.provider }) })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(c.personId))
      .setIssuedAt(now)
      .setExpirationTime(exp)
      .sign(this.key);
    res.cookie(SESSION_COOKIE, token, { httpOnly: true, sameSite: 'strict', secure: this.secure, path: '/', maxAge: (abs - now) * 1000 });
  }
  async verify(token: string): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, { algorithms: ['HS256'], currentDate: this.clock() });
      const personId = Number(payload.sub);
      const { abs, ph, provider, iat, exp } = payload as Record<string, unknown>;
      if (!Number.isSafeInteger(personId) || typeof abs !== 'number' || typeof ph !== 'string' || (provider !== undefined && provider !== 'zamil') || typeof iat !== 'number' || typeof exp !== 'number')
        return null;
      if (this.now() >= abs) return null;
      return { personId, abs, ph, ...(provider === 'zamil' && { provider }), iat, exp };
    } catch {
      return null;
    }
  }
  needsRefresh(c: SessionClaims) {
    return this.now() - c.iat >= SESSION_REFRESH_AFTER_SECONDS;
  }
  clear(res: Response) {
    res.clearCookie(SESSION_COOKIE, { httpOnly: true, sameSite: 'strict', secure: this.secure, path: '/' });
  }
}
