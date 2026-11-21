// Signed JWT (HS256) in an HttpOnly, SameSite=Strict cookie: 8 h absolute (capped at the Zamil
// session's expiry), 30 min idle with sliding refresh. Same model as TrainingHub/ExpenseHub.
import type { Response } from 'express';
import { SignJWT, jwtVerify } from 'jose';
import { SESSION_COOKIE } from '@attendance/shared';

export const SESSION_ABSOLUTE_SECONDS = 8 * 60 * 60;
export const SESSION_IDLE_SECONDS = 30 * 60;
export const SESSION_REFRESH_AFTER_SECONDS = 60;

export type Clock = () => Date;

export interface SessionClaims {
  userId: number;
  employeeNumber: string;
  /** XX_DIGI_EMP_MASTER.USER_NAME (recorded as author, as CI3 intended). */
  userName: string | null;
  /** Absolute expiry (seconds since epoch). */
  abs: number;
  iat: number;
  exp: number;
}

export interface SessionInput {
  userId: number;
  employeeNumber: string;
  userName: string | null;
  abs?: number;
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

  async issue(res: Response, input: SessionInput): Promise<void> {
    const now = this.now();
    const abs = Math.min(input.abs ?? Number.POSITIVE_INFINITY, now + SESSION_ABSOLUTE_SECONDS);
    const exp = Math.min(now + SESSION_IDLE_SECONDS, abs);
    const token = await new SignJWT({ emp: input.employeeNumber, un: input.userName, abs })
      .setProtectedHeader({ alg: 'HS256' })
      .setSubject(String(input.userId))
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
  }

  async verify(token: string): Promise<SessionClaims | null> {
    try {
      const { payload } = await jwtVerify(token, this.key, {
        algorithms: ['HS256'],
        currentDate: this.clock(),
      });
      const userId = Number(payload.sub);
      const { emp, un, abs, iat, exp } = payload as Record<string, unknown>;
      if (
        !Number.isSafeInteger(userId) ||
        typeof emp !== 'string' ||
        (un !== null && typeof un !== 'string') ||
        typeof abs !== 'number' ||
        typeof iat !== 'number' ||
        typeof exp !== 'number' ||
        this.now() >= abs
      ) {
        return null;
      }
      return {
        userId,
        employeeNumber: emp,
        userName: (un as string | null) ?? null,
        abs,
        iat,
        exp,
      };
    } catch {
      return null;
    }
  }

  needsRefresh(claims: SessionClaims): boolean {
    return this.now() - claims.iat >= SESSION_REFRESH_AFTER_SECONDS;
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
