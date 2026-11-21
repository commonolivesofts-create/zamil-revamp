// Environment -> typed AppConfig. Validated once at startup; tests build their own config.
import path from 'node:path';
import { z } from 'zod';

const flag = z.enum(['true', 'false']).transform((value) => value === 'true');

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    APP_ENV: z.enum(['development', 'test']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(7387),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    ADW_USER: z.string().min(1),
    ADW_PASSWORD: z.string().min(1),
    ADW_CONNECT_STRING: z.string().min(1).default('zpadwtest_tp'),
    ADW_WALLET_DIR: z.string().min(1),
    ADW_WALLET_PASSWORD: z.string().optional(),
    ADW_POOL_MIN: z.coerce.number().int().min(0).default(0),
    ADW_POOL_MAX: z.coerce.number().int().min(1).default(8),

    // Oracle E-Business Suite, the same keys as zamil-attendance/.env (reachable on the Zamil LAN/VPN).
    EBS_ENABLED: flag.default(true),
    EBS_DB_HOST: z.string().optional(),
    EBS_DB_PORT: z.coerce.number().int().min(1).max(65535).default(1521),
    EBS_DB_SID: z.string().optional(),
    EBS_DB_USERNAME: z.string().optional(),
    EBS_DB_PASSWORD: z.string().optional(),
    EBS_DB_CONNECT_TIMEOUT: z.coerce.number().int().min(1).max(120).default(10),
    /** Optional full descriptor or alias instead of host/port/SID. */
    EBS_CONNECT_STRING: z.string().optional(),
    /** ebs = the EBS database (VPN), adw = ADW copies of the EBS tables (EBS-CONNECTIVITY.md, Option B). */
    EBS_SOURCE: z.enum(['ebs', 'adw']).default('ebs'),

    ZAMIL_AUTH_API_BASE_URL: z.url().default('http://127.0.0.1:7381/api/v1'),
    ZAMIL_AUTH_SESSION_COOKIE_NAME: z
      .string()
      .regex(/^(?:__Host-)?[A-Za-z0-9_-]+$/)
      .default('zr_session'),
    ZAMIL_AUTH_COOKIE_SECURE: flag.default(false),
    ZAMIL_AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict']).default('lax'),
  })
  .superRefine((env, ctx) => {
    if (env.EBS_ENABLED && (env.EBS_DB_HOST || env.EBS_CONNECT_STRING)) {
      const required = env.EBS_CONNECT_STRING
        ? (['EBS_DB_USERNAME', 'EBS_DB_PASSWORD'] as const)
        : (['EBS_DB_USERNAME', 'EBS_DB_PASSWORD', 'EBS_DB_SID'] as const);
      for (const key of required) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: 'required for the EBS connection' });
      }
    }
    const apiPath = new URL(env.ZAMIL_AUTH_API_BASE_URL).pathname.replace(/\/+$/, '');
    if (!apiPath.endsWith('/api/v1')) {
      ctx.addIssue({
        code: 'custom',
        path: ['ZAMIL_AUTH_API_BASE_URL'],
        message: 'must point to the Zamil API base path ending in /api/v1',
      });
    }
    if (env.NODE_ENV === 'production') {
      if (new URL(env.ZAMIL_AUTH_API_BASE_URL).protocol !== 'https:')
        ctx.addIssue({
          code: 'custom',
          path: ['ZAMIL_AUTH_API_BASE_URL'],
          message: 'must use HTTPS in production',
        });
      if (!env.ZAMIL_AUTH_COOKIE_SECURE)
        ctx.addIssue({
          code: 'custom',
          path: ['ZAMIL_AUTH_COOKIE_SECURE'],
          message: 'must be true in production',
        });
    }
  });

export interface ZamilAuthConfig {
  apiBaseUrl: string;
  sessionCookieName: string;
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'strict';
}

export interface OraclePoolConfig {
  user: string;
  password: string;
  connectString: string;
  walletDir?: string;
  walletPassword?: string;
  poolMin: number;
  poolMax: number;
  /** Seconds to wait for the network connection (EBS behind the VPN). */
  connectTimeout?: number;
  /** Message shown when the database cannot be reached. */
  unreachableMessage?: string;
}

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  logLevel: string;
  api: { port: number; host: string };
  session: { secret: string; secure: boolean };
  adw: OraclePoolConfig;
  ebs: OraclePoolConfig | null;
  /** Where EBS data is read from (see db/ebsSource.ts). */
  ebsSource: 'ebs' | 'adw';
  auth: { zamil: ZamilAuthConfig };
}

export class ConfigError extends Error {}

/** The same descriptor zamil-attendance builds (application/config/database.php, $db['ebs']). */
export function ebsDescriptor(
  host: string,
  port: number,
  sid: string,
  connectTimeout: number,
): string {
  return `(DESCRIPTION=(CONNECT_TIMEOUT=${connectTimeout})(ADDRESS=(PROTOCOL=TCP)(HOST=${host})(PORT=${port}))(CONNECT_DATA=(SID=${sid})))`;
}

/** `KEY=` in .env means "not set", so defaults apply. */
function dropEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  return Object.fromEntries(
    Object.entries(source).filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())),
  );
}

export function loadConfig(source: NodeJS.ProcessEnv, root: string): AppConfig {
  const parsed = envSchema.safeParse(dropEmpty(source));
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`).join('\n');
    throw new ConfigError(`Invalid configuration (.env):\n${issues}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    logLevel: e.LOG_LEVEL,
    api: { port: e.API_PORT, host: e.APP_ENV === 'test' ? '0.0.0.0' : '127.0.0.1' },
    session: { secret: e.SESSION_SECRET, secure: e.NODE_ENV === 'production' },
    adw: {
      user: e.ADW_USER,
      password: e.ADW_PASSWORD,
      connectString: e.ADW_CONNECT_STRING,
      walletDir: path.resolve(root, e.ADW_WALLET_DIR),
      ...(e.ADW_WALLET_PASSWORD && { walletPassword: e.ADW_WALLET_PASSWORD }),
      poolMin: e.ADW_POOL_MIN,
      poolMax: e.ADW_POOL_MAX,
    },
    ebs:
      e.EBS_ENABLED && (e.EBS_DB_HOST || e.EBS_CONNECT_STRING)
        ? {
            user: e.EBS_DB_USERNAME!,
            password: e.EBS_DB_PASSWORD!,
            connectString:
              e.EBS_CONNECT_STRING ??
              ebsDescriptor(e.EBS_DB_HOST!, e.EBS_DB_PORT, e.EBS_DB_SID!, e.EBS_DB_CONNECT_TIMEOUT),
            poolMin: 0,
            poolMax: 4,
            connectTimeout: e.EBS_DB_CONNECT_TIMEOUT,
            unreachableMessage:
              'The E-Business Suite database cannot be reached. Connect to the Zamil VPN (or office network) and try again.',
          }
        : null,
    ebsSource: e.EBS_SOURCE,
    auth: {
      zamil: {
        apiBaseUrl: e.ZAMIL_AUTH_API_BASE_URL.replace(/\/+$/, ''),
        sessionCookieName: e.ZAMIL_AUTH_SESSION_COOKIE_NAME,
        cookieSecure: e.ZAMIL_AUTH_COOKIE_SECURE,
        cookieSameSite: e.ZAMIL_AUTH_COOKIE_SAMESITE,
      },
    },
  };
}
