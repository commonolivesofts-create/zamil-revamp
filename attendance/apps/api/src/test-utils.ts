// Test harness: an app with fake repositories, a fake Zamil resolver and a fixed clock.
import type { Express } from 'express';
import request from 'supertest';
import { CSRF_HEADER, CSRF_HEADER_VALUE, pageMeta, type Paged } from '@attendance/shared';
import { createApp, type AppDeps } from './app';
import type { Identity, IdentityRepository } from './auth/identity';
import type { ZamilResolver } from './auth/middleware';
import { SessionService } from './auth/session';
import type { AppConfig } from './config';
import type { Db } from './db/oracle';
import { AppError } from './lib/errors';
import { silentLogger } from './lib/logger';
import type { ReportRepository } from './modules/report';

export function testConfig(overrides: Partial<AppConfig> = {}): AppConfig {
  return {
    env: 'test',
    logLevel: 'silent',
    api: { port: 0, host: '127.0.0.1' },
    session: { secret: 'x'.repeat(48), secure: false },
    adw: { user: 'u', password: 'p', connectString: 'c', poolMin: 0, poolMax: 1 },
    ebs: null,
    auth: {
      zamil: {
        apiBaseUrl: 'http://zamil.test/api/v1',
        sessionCookieName: 'zr_session',
        cookieSecure: false,
        cookieSameSite: 'lax',
      },
      hrAdmins: new Set(['9001']),
    },
    ...overrides,
  };
}

export const fakeDb = (adwUp = true): Db => ({
  query: async () => {
    throw new Error('fake db: use repository fakes');
  },
  ping: async (pool) => (pool === 'adw' ? adwUp : null),
  close: async () => {},
});

export const identity = (overrides: Partial<Identity> = {}): Identity => ({
  userId: 501,
  employeeNumber: '1001',
  fullName: 'Test Employee',
  email: 'test@example.com',
  jobTitle: 'Analyst',
  department: 'IT',
  hasDirectReports: false,
  ...overrides,
});

export function fakeIdentities(...people: Identity[]): IdentityRepository {
  return {
    findByEmployeeNumber: async (emp) => people.find((p) => p.employeeNumber === emp) ?? null,
  };
}

/** A repository fake that records the queries it receives. */
export function fakeReport<F, T>(rows: T[]) {
  const calls: { list: unknown[]; export: unknown[] } = { list: [], export: [] };
  const repository: ReportRepository<F, T> = {
    list: async (query) => {
      calls.list.push(query);
      const start = (query.page - 1) * query.limit;
      return {
        items: rows.slice(start, start + query.limit),
        pagination: pageMeta(query.page, query.limit, rows.length),
      } satisfies Paged<T>;
    },
    exportRows: async (query, maxRows) => {
      calls.export.push(query);
      return rows.slice(0, maxRows + 1);
    },
  };
  return { repository, calls };
}

/**
 * The Zamil session is simulated by a `zr_session` cookie whose value is the employee number
 * (the real resolver validates a 43-character token against Zamil's /auth/me).
 */
export const fakeZamil: ZamilResolver = async (req) => {
  const emp: unknown = req.cookies?.zr_session;
  if (typeof emp !== 'string' || !emp) throw new AppError('FORBIDDEN', 'No Zamil session cookie');
  if (emp === 'expired') throw new AppError('UNAUTHENTICATED', 'Sign in to Zamil first.');
  return { personNumber: emp, absoluteExpiresAt: Math.floor(Date.now() / 1000) + 3600 };
};

export function testApp(deps: Partial<AppDeps> = {}): Express {
  const config = deps.config ?? testConfig();
  return createApp({
    config,
    logger: silentLogger(),
    db: fakeDb(),
    sessions: new SessionService(config.session.secret, false, () => new Date()),
    identities: fakeIdentities(identity()),
    resolveZamil: fakeZamil,
    revokeZamil: async () => {},
    ...deps,
  });
}

export const H = { [CSRF_HEADER]: CSRF_HEADER_VALUE };

/** Signs in through /auth/sso and returns the cookies to send on later requests. */
export async function signIn(app: Express, employeeNumber = '1001'): Promise<string[]> {
  const res = await request(app)
    .post('/api/v1/auth/sso')
    .set(H)
    .set('Cookie', `zr_session=${employeeNumber}`)
    .expect(200);
  const session = (res.headers['set-cookie'] as unknown as string[]).find((c) =>
    c.startsWith('at_session='),
  );
  if (!session) throw new Error('no session cookie');
  return [`zr_session=${employeeNumber}`, session.split(';')[0]!];
}
