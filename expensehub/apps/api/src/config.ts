// Implements: TRD §10 configuration, D-33 run modes.
// Reads and validates the environment once at start-up; refuses to start on a bad value.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import {
  APP_ENVS,
  DATA_MODES,
  FUSION_MODES,
  NOTIFY_TRANSPORTS,
  type AppEnv,
  type DataMode,
  type FusionMode,
  type NotifyTransport,
} from '@expensehub/shared';
import { REPO_ROOT, fromRepoRoot } from './paths';

const PLACEHOLDER_SECRET = /change-me/i;

const envSchema = z
  .object({
    NODE_ENV: z.enum(APP_ENVS).default('development'),
    /** APP_ENV=test mirrors the host app's Test (LAN) listener profile. */
    APP_ENV: z.enum(['development', 'test']).default('development'),
    API_PORT: z.coerce.number().int().min(1).max(65535).default(7385),
    WEB_PORT: z.coerce.number().int().min(1).max(65535).default(7386),
    APP_BASE_URL: z.url().default('http://localhost:7386'),
    SESSION_SECRET: z.string().min(32, 'SESSION_SECRET must be at least 32 characters'),
    TZ: z.string().default('Asia/Riyadh'),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),

    DATA_MODE: z.enum(DATA_MODES).default('memory'),
    DATA_FILE: z.string().default('./storage/dev-data.json'),
    DB_USER: z.string().optional(),
    DB_PASSWORD: z.string().optional(),
    DB_CONNECT_STRING: z.string().optional(),
    DB_WALLET_DIR: z.string().optional(),
    DB_WALLET_PASSWORD: z.string().optional(),
    DB_POOL_MIN: z.coerce.number().int().min(0).default(1),
    DB_POOL_MAX: z.coerce.number().int().min(1).default(5),

    FUSION_MODE: z.enum(FUSION_MODES).default('mock'),
    FUSION_BASE_URL: z.url().optional(),
    FUSION_USER: z.string().optional(),
    FUSION_PASSWORD: z.string().optional(),
    FUSION_REST_VERSION: z.string().default('11.13.18.05'),
    FUSION_BIP_PATH_PREFIX: z.string().default('/Custom/ExpenseHub'),
    /** INTEGRATION §2.4: waits before retry 1, 2, 3. */
    FUSION_RETRY_DELAYS_MS: z
      .string()
      .regex(/^\d+(,\d+)*$/, 'comma-separated milliseconds, e.g. 2000,10000,30000')
      .default('2000,10000,30000'),
    /** D-36: the Fusion test pod, linked from invoices ("Open in Fusion test pod"). */
    FUSION_POD_URL: z.url().default('https://iaeskf-test.fa.ocs.oraclecloud.com'),
    /** D-36: mock Fusion invoices survive restarts in this file ('' = memory only, tests). */
    FUSION_MOCK_STATE: z.string().default('./storage/mock-fusion.json'),
    /** D-50: person numbers made System Admin on the first live start (comma-separated). */
    BOOTSTRAP_ADMINS: z.string().default(''),
    /** TRD §7 nightly jobs (the scheduler never runs in tests). */
    JOBS_ENABLED: z.stringbool().default(true),

    RECEIPTS_DIR: z.string().default('./storage/receipts'),
    MAX_UPLOAD_MB: z.coerce.number().int().min(1).max(50).default(10),
    OCR_PROVIDER: z.enum(['tesseract', 'none']).default('tesseract'),

    NOTIFY_TRANSPORT: z.enum(NOTIFY_TRANSPORTS).default('outbox'),
    SMTP_HOST: z.string().optional(),
    SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
    SMTP_FROM: z.string().optional(),
    TEAMS_WEBHOOK_URL: z.url().optional(),

    AUTH_PROVIDER: z.enum(['local', 'entra']).default('local'),
    DEV_QUICK_LOGIN: z.stringbool().default(true),
    /** SSO calls the host API server-side; omitted in production to keep local sign-in available. */
    ZAMIL_AUTH_API_BASE_URL: z.url().optional(),
    ZAMIL_AUTH_SESSION_COOKIE_NAME: z
      .string()
      .regex(/^[A-Za-z0-9_-]+$/)
      .default('__Host-zr_session'),
    ZAMIL_AUTH_COOKIE_SECURE: z.stringbool().default(true),
    ZAMIL_AUTH_COOKIE_SAMESITE: z.enum(['lax', 'strict']).default('lax'),
    /** TRD §5: bcrypt cost 12. Lower only in tests. */
    BCRYPT_COST: z.coerce.number().int().min(4).max(15).default(12),
  })
  .superRefine((env, ctx) => {
    const require = (keys: (keyof typeof env)[], when: string) => {
      for (const key of keys) {
        if (!env[key])
          ctx.addIssue({ code: 'custom', path: [key], message: `required when ${when}` });
      }
    };
    if (env.DATA_MODE === 'oracle') {
      require(['DB_USER', 'DB_PASSWORD', 'DB_CONNECT_STRING', 'DB_WALLET_DIR'], 'DATA_MODE=oracle');
    }
    if (env.FUSION_MODE === 'live') {
      require(['FUSION_BASE_URL', 'FUSION_USER', 'FUSION_PASSWORD'], 'FUSION_MODE=live');
    }
    if (env.NOTIFY_TRANSPORT === 'smtp') {
      require(['SMTP_HOST', 'SMTP_FROM'], 'NOTIFY_TRANSPORT=smtp');
    }
    if (env.NODE_ENV === 'production') {
      // D-33: the memory store and mock Fusion are development tools only.
      if (env.DATA_MODE !== 'oracle') {
        ctx.addIssue({
          code: 'custom',
          path: ['DATA_MODE'],
          message: 'must be oracle in production',
        });
      }
      if (env.FUSION_MODE !== 'live') {
        ctx.addIssue({
          code: 'custom',
          path: ['FUSION_MODE'],
          message: 'must be live in production',
        });
      }
      if (PLACEHOLDER_SECRET.test(env.SESSION_SECRET)) {
        ctx.addIssue({
          code: 'custom',
          path: ['SESSION_SECRET'],
          message: 'placeholder secret not allowed in production',
        });
      }
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
      if (!env.ZAMIL_AUTH_COOKIE_SECURE) {
        ctx.addIssue({
          code: 'custom',
          path: ['ZAMIL_AUTH_COOKIE_SECURE'],
          message: 'must be true in production to match the Zamil session cookie',
        });
      }
    }
    if (env.ZAMIL_AUTH_API_BASE_URL) {
      const apiPath = new URL(env.ZAMIL_AUTH_API_BASE_URL).pathname.replace(/\/+$/, '');
      if (!apiPath.endsWith('/api/v1')) {
        ctx.addIssue({
          code: 'custom',
          path: ['ZAMIL_AUTH_API_BASE_URL'],
          message: 'must point to the Zamil API base path ending in /api/v1',
        });
      }
    }
  });

export interface AppConfig {
  env: AppEnv;
  isProduction: boolean;
  api: { host: '127.0.0.1' | '0.0.0.0'; port: number };
  web: { port: number; baseUrl: string };
  session: { secret: string };
  tz: string;
  logLevel: z.infer<typeof envSchema>['LOG_LEVEL'];
  data: {
    mode: DataMode;
    /** Absolute path of the memory-store snapshot. */
    file: string;
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
    mode: FusionMode;
    baseUrl?: string;
    user?: string;
    password?: string;
    restVersion: string;
    bipPathPrefix: string;
    retryDelaysMs: number[];
    podUrl: string;
    /** Absolute path, or null = keep mock invoices in memory only. */
    mockStateFile: string | null;
    /** D-50: person numbers made System Admin on the first live start. */
    bootstrapAdmins: string[];
  };
  jobs: { enabled: boolean };
  receipts: { dir: string; maxUploadBytes: number };
  ocr: { provider: 'tesseract' | 'none' };
  notify: {
    transport: NotifyTransport;
    smtp?: { host: string; port: number; from: string };
    teamsWebhookUrl?: string;
  };
  auth: {
    provider: 'local' | 'entra';
    devQuickLogin: boolean;
    bcryptCost: number;
    zamil: {
      apiBaseUrl?: string;
      sessionCookieName: string;
      cookieSecure: boolean;
      cookieSameSite: 'lax' | 'strict';
    };
  };
}

export class ConfigError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid configuration:\n  - ${issues.join('\n  - ')}`);
    this.name = 'ConfigError';
  }
}

/** Empty values in .env (`KEY=`) mean "not set". */
function dropEmpty(source: NodeJS.ProcessEnv): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    if (value !== undefined && value.trim() !== '') out[key] = value.trim();
  }
  return out;
}

export function loadConfig(source: NodeJS.ProcessEnv = process.env): AppConfig {
  const parsed = envSchema.safeParse(dropEmpty(source));
  if (!parsed.success) {
    throw new ConfigError(
      parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`),
    );
  }
  const e = parsed.data;
  const isProduction = e.NODE_ENV === 'production';

  return {
    env: e.NODE_ENV,
    isProduction,
    api: { host: e.APP_ENV === 'test' ? '0.0.0.0' : '127.0.0.1', port: e.API_PORT },
    web: { port: e.WEB_PORT, baseUrl: e.APP_BASE_URL },
    session: { secret: e.SESSION_SECRET },
    tz: e.TZ,
    logLevel: e.LOG_LEVEL,
    data: {
      mode: e.DATA_MODE,
      file: fromRepoRoot(e.DATA_FILE),
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
      baseUrl: e.FUSION_BASE_URL,
      user: e.FUSION_USER,
      password: e.FUSION_PASSWORD,
      restVersion: e.FUSION_REST_VERSION,
      bipPathPrefix: e.FUSION_BIP_PATH_PREFIX,
      retryDelaysMs: e.FUSION_RETRY_DELAYS_MS.split(',').map(Number),
      podUrl: e.FUSION_POD_URL.replace(/\/+$/, ''),
      mockStateFile: e.FUSION_MOCK_STATE ? fromRepoRoot(e.FUSION_MOCK_STATE) : null,
      bootstrapAdmins: e.BOOTSTRAP_ADMINS.split(',')
        .map((s) => s.trim())
        .filter(Boolean),
    },
    jobs: { enabled: e.JOBS_ENABLED && e.NODE_ENV !== 'test' },
    receipts: { dir: fromRepoRoot(e.RECEIPTS_DIR), maxUploadBytes: e.MAX_UPLOAD_MB * 1024 * 1024 },
    ocr: { provider: e.OCR_PROVIDER },
    notify: {
      transport: e.NOTIFY_TRANSPORT,
      ...(e.NOTIFY_TRANSPORT === 'smtp' && {
        smtp: { host: e.SMTP_HOST!, port: e.SMTP_PORT, from: e.SMTP_FROM! },
      }),
      teamsWebhookUrl: e.TEAMS_WEBHOOK_URL,
    },
    // D-33: quick-login can never be on in production, whatever the env says.
    auth: {
      provider: e.AUTH_PROVIDER,
      devQuickLogin: !isProduction && e.DEV_QUICK_LOGIN,
      bcryptCost: isProduction ? Math.max(12, e.BCRYPT_COST) : e.BCRYPT_COST,
      zamil: {
        apiBaseUrl:
          e.ZAMIL_AUTH_API_BASE_URL?.replace(/\/+$/, '') ??
          (isProduction ? undefined : 'http://127.0.0.1:7381/api/v1'),
        sessionCookieName: e.ZAMIL_AUTH_SESSION_COOKIE_NAME,
        cookieSecure: e.ZAMIL_AUTH_COOKIE_SECURE,
        cookieSameSite: e.ZAMIL_AUTH_COOKIE_SAMESITE,
      },
    },
  };
}

/** Loads <repo>/.env into process.env (existing variables win). */
export function loadDotEnv(file = path.join(REPO_ROOT, '.env')): void {
  if (existsSync(file)) process.loadEnvFile(file);
}
