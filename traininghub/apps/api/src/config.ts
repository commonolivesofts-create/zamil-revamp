// Reads and validates the environment once at start-up; refuses to start on a bad value.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { REPO_ROOT, fromRepoRoot } from './paths';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    /** APP_ENV=test mirrors the host app's Test (LAN) listener profile. */
    APP_ENV: z.enum(['development', 'test']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(7383),
    WEB_PORT: z.coerce.number().int().min(1).max(65535).default(7384),
    APP_BASE_URL: z.url().default('http://localhost:7384'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    TZ: z.string().default('Asia/Riyadh'),
    LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),

    DATA_MODE: z.enum(['memory', 'oracle']).default('memory'),
    DATA_FILE: z.string().default('./storage/dev-data.json'),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_CONNECT_STRING: z.string().optional(),
    DB_WALLET_DIR: z.string().optional(),
    DB_WALLET_PASSWORD: z.string().optional(),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(1),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(6),
    /** Every TrainingHub object in the shared schema starts with this prefix. */
    DB_OBJECT_PREFIX: z.string().regex(/^[A-Z][A-Z0-9]{0,5}_$/).default('TH_'),

    FUSION_MODE: z.enum(['mock', 'live', 'sql']).default('mock'),
    /** FUSION_MODE=sql: a SELECT over an existing ADW table/view that returns the employee columns. */
    EMPLOYEE_SQL: z.string().optional(),
    FUSION_BASE_URL: z.url().optional(),
    FUSION_USER: z.string().optional(),
    FUSION_PASSWORD: z.string().optional(),
    FUSION_BI_USER: z.string().optional(),
    FUSION_BI_PASSWORD: z.string().optional(),
    /** BIP report that returns employees. TrainingHub's own report first; ExpenseHub's as a fallback. */
    FUSION_EMPLOYEE_REPORT: z.string().default('/Custom/TrainingHub/TH_HCM_EMPLOYEES.xdo'),
    FUSION_EMPLOYEE_REPORT_FALLBACK: z.string().default('/Custom/ExpenseHub/EH_HCM_EMPLOYEES.xdo'),
    FUSION_SYNC_HOUR: z.coerce.number().int().min(0).max(23).default(2),
    /** Refuse a sync that would deactivate more than this share of active employees. */
    FUSION_SYNC_MAX_DROP: z.coerce.number().min(0).max(1).default(0.2),
    BOOTSTRAP_ADMINS: z.string().default(''),
    JOBS_ENABLED: z.stringbool().default(true),

    AUTH_PROVIDER: z.enum(['local']).default('local'),
    DEV_QUICK_LOGIN: z.stringbool().default(true),
    /** SSO calls the host API server-side; omitted in production to keep local sign-in available. */
    ZAMIL_AUTH_API_BASE_URL: z.url().optional(),
    ZAMIL_AUTH_SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('__Host-zr_session'),
    ZAMIL_AUTH_COOKIE_SECURE: z.stringbool().default(true),
    ZAMIL_AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict']).default('lax'),
    /** First-login password for local accounts created on sync (must be changed at first sign-in). */
    INITIAL_PASSWORD: z.string().min(8).optional(),
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  })
  .superRefine((env, ctx) => {
    const need = (keys: (keyof typeof env)[], when: string) => {
      for (const key of keys)
        if (!env[key]) ctx.addIssue({ code: 'custom', path: [key], message: `required when ${when}` });
    };
    if (env.DATA_MODE === 'oracle')
      need(['DB_USER', 'DB_PASSWORD', 'DB_CONNECT_STRING', 'DB_WALLET_DIR'], 'DATA_MODE=oracle');
    if (env.FUSION_MODE === 'live') need(['FUSION_BASE_URL', 'FUSION_USER', 'FUSION_PASSWORD'], 'FUSION_MODE=live');
    if (env.FUSION_MODE === 'sql') {
      need(['EMPLOYEE_SQL'], 'FUSION_MODE=sql');
      if (env.DATA_MODE !== 'oracle') ctx.addIssue({ code: 'custom', path: ['FUSION_MODE'], message: 'sql needs DATA_MODE=oracle' });
      if (env.EMPLOYEE_SQL && !/^\s*(select|with)\b/i.test(env.EMPLOYEE_SQL))
        ctx.addIssue({ code: 'custom', path: ['EMPLOYEE_SQL'], message: 'must be a SELECT' });
    }
    if (env.NODE_ENV === 'production') {
      if (env.DATA_MODE !== 'oracle')
        ctx.addIssue({ code: 'custom', path: ['DATA_MODE'], message: 'must be oracle in production' });
      if (env.DEV_QUICK_LOGIN)
        ctx.addIssue({ code: 'custom', path: ['DEV_QUICK_LOGIN'], message: 'must be false in production' });
      if (
        env.ZAMIL_AUTH_API_BASE_URL &&
        new URL(env.ZAMIL_AUTH_API_BASE_URL).protocol !== 'https:'
      ) {
        ctx.addIssue({
          code: 'custom',
          path: ['ZAMIL_AUTH_API_BASE_URL'],
          message: 'must use HTTPS in production because it carries the Zamil session cookie',
        });
      }
      if (!env.ZAMIL_AUTH_COOKIE_SECURE)
        ctx.addIssue({
          code: 'custom',
          path: ['ZAMIL_AUTH_COOKIE_SECURE'],
          message: 'must be true in production to match the Zamil session cookie',
        });
    }
    if (env.ZAMIL_AUTH_API_BASE_URL) {
      const apiPath = new URL(env.ZAMIL_AUTH_API_BASE_URL).pathname.replace(/\/+$/, '');
      if (!apiPath.endsWith('/api/v1'))
        ctx.addIssue({
          code: 'custom',
          path: ['ZAMIL_AUTH_API_BASE_URL'],
          message: 'must point to the Zamil API base path ending in /api/v1',
        });
    }
  });

export interface AppConfig {
  env: 'development' | 'test' | 'production';
  isProduction: boolean;
  api: { host: '127.0.0.1' | '0.0.0.0'; port: number };
  web: { port: number; baseUrl: string };
  session: { secret: string };
  tz: string;
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  data: {
    mode: 'memory' | 'oracle';
    file: string;
    prefix: string;
    oracle?: {
      user: string;
      password: string;
      connectString: string;
      walletDir: string;
      walletPassword?: string;
      poolMin: number;
      poolMax: number;
    };
  };
  fusion: {
    mode: 'mock' | 'live' | 'sql';
    employeeSql?: string;
    baseUrl?: string;
    user?: string;
    password?: string;
    biUser?: string;
    biPassword?: string;
    employeeReport: string;
    employeeReportFallback: string;
    syncHour: number;
    maxDrop: number;
  };
  bootstrapAdmins: string[];
  jobsEnabled: boolean;
  auth: {
    quickLogin: boolean;
    initialPassword?: string;
    bcryptCost: number;
    zamil: {
      apiBaseUrl?: string;
      sessionCookieName: string;
      cookieSecure: boolean;
      cookieSameSite: 'lax' | 'strict';
    };
  };
}

export function loadEnvFile(): void {
  const file = path.join(REPO_ROOT, '.env');
  if (existsSync(file)) process.loadEnvFile(file);
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(source);
  if (!parsed.success) {
    const lines = parsed.error.issues.map((i) => `  ${i.path.join('.')}: ${i.message}`);
    throw new Error(`Invalid configuration:\n${lines.join('\n')}`);
  }
  const e = parsed.data;
  return {
    env: e.NODE_ENV,
    isProduction: e.NODE_ENV === 'production',
    api: { host: e.APP_ENV === 'test' ? '0.0.0.0' : '127.0.0.1', port: e.API_PORT },
    web: { port: e.WEB_PORT, baseUrl: e.APP_BASE_URL },
    session: { secret: e.SESSION_SECRET },
    tz: e.TZ,
    logLevel: e.LOG_LEVEL,
    data: {
      mode: e.DATA_MODE,
      file: fromRepoRoot(e.DATA_FILE),
      prefix: e.DB_OBJECT_PREFIX,
      ...(e.DATA_MODE === 'oracle' && {
        oracle: {
          user: e.DB_USER!,
          password: e.DB_PASSWORD!,
          connectString: e.DB_CONNECT_STRING!,
          walletDir: fromRepoRoot(e.DB_WALLET_DIR!),
          walletPassword: e.DB_WALLET_PASSWORD,
          poolMin: e.DB_POOL_MIN,
          poolMax: e.DB_POOL_MAX,
        },
      }),
    },
    fusion: {
      mode: e.FUSION_MODE,
      employeeSql: e.EMPLOYEE_SQL,
      baseUrl: e.FUSION_BASE_URL?.replace(/\/+$/, ''),
      user: e.FUSION_USER,
      password: e.FUSION_PASSWORD,
      biUser: e.FUSION_BI_USER,
      biPassword: e.FUSION_BI_PASSWORD,
      employeeReport: e.FUSION_EMPLOYEE_REPORT,
      employeeReportFallback: e.FUSION_EMPLOYEE_REPORT_FALLBACK,
      syncHour: e.FUSION_SYNC_HOUR,
      maxDrop: e.FUSION_SYNC_MAX_DROP,
    },
    bootstrapAdmins: e.BOOTSTRAP_ADMINS.split(',').map((s) => s.trim()).filter(Boolean),
    jobsEnabled: e.JOBS_ENABLED && e.NODE_ENV !== 'test',
    auth: {
      quickLogin: e.DEV_QUICK_LOGIN,
      initialPassword: e.INITIAL_PASSWORD,
      bcryptCost: e.BCRYPT_COST,
      zamil: {
        apiBaseUrl:
          e.ZAMIL_AUTH_API_BASE_URL?.replace(/\/+$/, '') ??
          (e.NODE_ENV === 'production'
            ? undefined
            : 'http://127.0.0.1:7381/api/v1'),
        sessionCookieName: e.ZAMIL_AUTH_SESSION_COOKIE_NAME,
        cookieSecure: e.ZAMIL_AUTH_COOKIE_SECURE,
        cookieSameSite: e.ZAMIL_AUTH_COOKIE_SAMESITE,
      },
    },
  };
}
