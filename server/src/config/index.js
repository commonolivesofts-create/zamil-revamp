import { isAbsolute, resolve } from 'node:path';
import Joi from 'joi';
import { PRODUCT } from './product.js';

const DOCS_ALLOWED_ENVIRONMENTS = ['development', 'test'];
const INSECURE_COOKIE_ENVIRONMENTS = ['development', 'test'];

/** Loopback listener addresses: 127.0.0.0/8, ::1 and IPv4-mapped 127.x. */
export function isLoopbackHost(host) {
  const address = String(host ?? '')
    .toLowerCase()
    .replace(/^::ffff:/, '');
  return address === '::1' || /^127(\.\d{1,3}){3}$/.test(address);
}
const SERVER_ROOT = resolve(import.meta.dirname, '../..');

// Office 365 SMTP (owner decision, Phase 05): fixed endpoint, STARTTLS on 587, verified certificates.
export const SMTP_ENDPOINT = Object.freeze({ host: 'smtp.office365.com', port: 587 });
// The only mailbox that may receive redirected ordinary-user messages outside production.
export const APPROVED_TEST_RECIPIENT = 'shaikh.azim@olivesofts.com';
const email = Joi.string()
  .trim()
  .lowercase()
  .email({ tlds: { allow: false } })
  .max(254);
const routePath = Joi.string().pattern(/^\/[A-Za-z0-9/_-]*$/);
const smtpRequired = (schema) =>
  schema.when('SMTP_ENABLED', { is: true, then: Joi.required(), otherwise: Joi.optional() });

// OWASP Password Storage Cheat Sheet minimum for Argon2id: 19 MiB, 2 passes, 1 lane.
const ARGON2_MIN_MEMORY_KIB = 19456;
const ARGON2_MIN_PASSES = 2;

// Base64 that decodes to exactly 32 bytes; the decoded Buffer is what the application receives.
const mfaKey = Joi.string()
  .trim()
  .custom((value, helpers) => {
    const key = Buffer.from(value, 'base64');
    if (key.length !== 32 || key.toString('base64') !== value.replace(/\s/g, '')) {
      return helpers.message('"{{#label}}" must be base64 encoding exactly 32 random bytes');
    }
    return key;
  });

const originList = Joi.string()
  .allow('')
  .default('')
  .custom((value, helpers) => {
    const origins = value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
    for (const origin of origins) {
      let parsed;
      try {
        parsed = new URL(origin);
      } catch {
        return helpers.message(`"{{#label}}" contains an invalid origin`);
      }
      if (!['http:', 'https:'].includes(parsed.protocol) || parsed.origin !== origin) {
        return helpers.message(`"{{#label}}" entries must be bare origins such as https://host`);
      }
    }
    return origins;
  });

// Oracle settings are mandatory everywhere except automated tests, which use test doubles.
const requiredOutsideTest = (schema) =>
  schema.when('NODE_ENV', { is: 'test', then: Joi.optional(), otherwise: Joi.required() });

const poolSchema = (prefix, defaults) => ({
  [`${prefix}_POOL_MIN`]: Joi.number().integer().min(0).default(defaults.min),
  [`${prefix}_POOL_MAX`]: Joi.number()
    .integer()
    .min(1)
    .min(Joi.ref(`${prefix}_POOL_MIN`))
    .default(defaults.max),
  [`${prefix}_QUEUE_MAX`]: Joi.number().integer().min(0).default(defaults.queueMax),
  [`${prefix}_QUEUE_TIMEOUT_MS`]: Joi.number().integer().min(1).default(defaults.queueTimeoutMs),
});

const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'uat', 'production').required(),
  PORT: Joi.number().port().default(3000),
  // Listener address. Local development/test binds to loopback only; deployments listen on all
  // interfaces behind the approved gateway unless configured otherwise.
  HTTP_HOST: Joi.when('NODE_ENV', {
    is: Joi.valid(...INSECURE_COOKIE_ENVIRONMENTS),
    then: Joi.string().ip().default('127.0.0.1'),
    otherwise: Joi.string().ip().default('0.0.0.0'),
  }),
  LOG_LEVEL: Joi.string()
    .valid('fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent')
    .default('info'),
  TRUST_PROXY_HOPS: Joi.number().integer().min(0).default(0),
  REQUEST_BODY_LIMIT: Joi.string()
    .pattern(/^\d+(b|kb|mb)$/i)
    .default('100kb'),
  SHUTDOWN_TIMEOUT_MS: Joi.number().integer().min(1000).default(10000),
  // Swagger UI stays development-only until the documentation access policy is finalized.
  API_DOCS_ENABLED: Joi.when('NODE_ENV', {
    is: Joi.valid(...DOCS_ALLOWED_ENVIRONMENTS),
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean()
      .valid(false)
      .default(false)
      .messages({
        'any.only': `"API_DOCS_ENABLED" may only be true when NODE_ENV is ${DOCS_ALLOWED_ENVIRONMENTS.join(' or ')}`,
      }),
  }),
  HEALTH_READY_TIMEOUT_MS: Joi.number().integer().min(100).default(3000),
  HEALTH_READY_CACHE_MS: Joi.number().integer().min(0).default(5000),

  ORACLE_USER: requiredOutsideTest(Joi.string()),
  ORACLE_PASSWORD: requiredOutsideTest(Joi.string()),
  ORACLE_WALLET_DIR: requiredOutsideTest(Joi.string()),
  ORACLE_WALLET_PASSWORD: requiredOutsideTest(Joi.string()),
  ORACLE_LOW_ALIAS: requiredOutsideTest(Joi.string()),
  ORACLE_HIGH_ALIAS: requiredOutsideTest(Joi.string().invalid(Joi.ref('ORACLE_LOW_ALIAS'))),
  ORACLE_CONNECT_TIMEOUT_S: Joi.number().integer().min(1).default(15),
  ORACLE_STMT_CACHE_SIZE: Joi.number().integer().min(0).default(30),
  ORACLE_POOL_STATISTICS: Joi.boolean().default(true),
  ...poolSchema('ORACLE_LOW', { min: 1, max: 4, queueMax: 50, queueTimeoutMs: 10000 }),
  ...poolSchema('ORACLE_HIGH', { min: 0, max: 2, queueMax: 10, queueTimeoutMs: 30000 }),

  // Session cookie. The __Host- prefix requires Secure, Path=/ and no Domain attribute.
  AUTH_SESSION_COOKIE_NAME: Joi.string()
    .pattern(/^[A-Za-z0-9_-]+$/)
    .default('__Host-zr_session'),
  AUTH_COOKIE_SECURE: Joi.when('NODE_ENV', {
    is: Joi.valid(...INSECURE_COOKIE_ENVIRONMENTS),
    then: Joi.boolean().default(true),
    otherwise: Joi.boolean()
      .valid(true)
      .default(true)
      .messages({ 'any.only': '"AUTH_COOKIE_SECURE" must be true outside development and test' }),
  }),
  AUTH_COOKIE_SAMESITE: Joi.string().valid('lax', 'strict').default('lax'),
  // Origins (besides the API's own origin) allowed to send state-changing browser requests.
  AUTH_ALLOWED_ORIGINS: originList,
  // How often an active session's LAST_ACTIVITY_AT is persisted; bounds idle-timeout precision.
  AUTH_SESSION_TOUCH_INTERVAL_S: Joi.number().integer().min(0).max(300).default(60),
  // Per-client-IP login attempt limit (in-process; complements the per-account lockout).
  AUTH_LOGIN_RATE_LIMIT_MAX: Joi.number().integer().min(1).default(60),
  AUTH_LOGIN_RATE_LIMIT_WINDOW_S: Joi.number().integer().min(1).default(60),
  // Argon2id cost for newly created hashes. Verification reads the cost from each stored hash.
  AUTH_ARGON2_MEMORY_KIB: Joi.number().integer().min(ARGON2_MIN_MEMORY_KIB).default(19456),
  AUTH_ARGON2_PASSES: Joi.number().integer().min(ARGON2_MIN_PASSES).max(16).default(2),
  AUTH_ARGON2_PARALLELISM: Joi.number().integer().min(1).max(16).default(1),

  // TOTP secret protection key (base64, exactly 32 bytes), held outside Oracle. Without it MFA
  // cannot be completed and mandatory-MFA users stay blocked (fail closed); required in UAT/prod.
  AUTH_MFA_ENCRYPTION_KEY: Joi.when('NODE_ENV', {
    is: Joi.valid(...INSECURE_COOKIE_ENVIRONMENTS),
    then: mfaKey.optional(),
    otherwise: mfaKey.required(),
  }),
  // Identifies the key inside each stored ciphertext, so a future rotation can tell keys apart.
  AUTH_MFA_KEY_ID: Joi.string()
    .pattern(/^[a-z0-9]{1,16}$/)
    .default('k1'),
  // Label shown in authenticator apps for NEW enrollments only. Codes are verified from the stored
  // secret alone, so existing enrollments (created under an earlier label) keep working.
  AUTH_MFA_ISSUER: Joi.string()
    .trim()
    .max(64)
    .pattern(/^[^:]+$/)
    .default(PRODUCT.name),
  // Mandatory administrator MFA (docs/07 §4). Default true. `false` is permitted for local
  // development and for the explicitly selected non-production APP_ENV=Test profile.
  AUTH_ADMIN_MFA_REQUIRED: Joi.boolean().sensitive().default(true),
  AUTH_MFA_COOKIE_NAME: Joi.string()
    .pattern(/^[A-Za-z0-9_-]+$/)
    .invalid(Joi.ref('AUTH_SESSION_COOKIE_NAME'))
    .default('__Host-zr_mfa'),

  // Account e-mail (password setup / reset / MFA recovery) through Office 365 SMTP. Disabled by
  // default: every delivery-dependent flow then fails closed. Secrets come from the environment only.
  SMTP_ENABLED: Joi.boolean().default(false),
  // OAUTH2 = SMTP AUTH XOAUTH2 with an Entra ID app (client credentials); PASSWORD only where the
  // tenant still permits basic SMTP AUTH for the mailbox.
  SMTP_AUTH_METHOD: Joi.string().valid('OAUTH2', 'PASSWORD').default('OAUTH2'),
  SMTP_USER: smtpRequired(email),
  SMTP_FROM: email,
  SMTP_FROM_NAME: Joi.string()
    .trim()
    .max(64)
    .pattern(/^[^\r\n<>"]+$/)
    .default(PRODUCT.name),
  SMTP_OAUTH_TENANT_ID: Joi.when('SMTP_AUTH_METHOD', {
    is: 'OAUTH2',
    then: smtpRequired(Joi.string().pattern(/^[A-Za-z0-9.-]{1,100}$/)),
    otherwise: Joi.forbidden(),
  }),
  SMTP_OAUTH_CLIENT_ID: Joi.when('SMTP_AUTH_METHOD', {
    is: 'OAUTH2',
    then: smtpRequired(Joi.string().guid()),
    otherwise: Joi.forbidden(),
  }),
  SMTP_OAUTH_CLIENT_SECRET: Joi.when('SMTP_AUTH_METHOD', {
    is: 'OAUTH2',
    then: smtpRequired(Joi.string().min(1).max(512)),
    otherwise: Joi.forbidden(),
  }),
  SMTP_PASSWORD: Joi.when('SMTP_AUTH_METHOD', {
    is: 'PASSWORD',
    then: smtpRequired(Joi.string().min(1).max(512)),
    otherwise: Joi.forbidden(),
  }),
  // Outside production every ordinary-user message goes to the approved test mailbox only, and only
  // after the connected database proves to be the configured TEST database (checked in Oracle).
  SMTP_TEST_RECIPIENT_OVERRIDE: Joi.when('NODE_ENV', {
    is: 'production',
    then: Joi.forbidden().messages({
      'any.unknown': '"SMTP_TEST_RECIPIENT_OVERRIDE" is not allowed in production',
    }),
    otherwise: email
      .valid(APPROVED_TEST_RECIPIENT)
      .when('SMTP_ENABLED', { is: true, then: Joi.required() }),
  }),
  SMTP_TEST_DATABASE_NAME: Joi.when('SMTP_TEST_RECIPIENT_OVERRIDE', {
    is: Joi.exist(),
    then: Joi.string()
      .pattern(/^[A-Za-z0-9_$#]{1,128}$/)
      .pattern(/TEST/i, 'test database name')
      .required(),
    otherwise: Joi.forbidden(),
  }),
  // Privileged-account (incl. Super Administrator) recovery e-mail needs separate approval; it is
  // never redirected to the test mailbox.
  SMTP_PRIVILEGED_DELIVERY_ENABLED: Joi.boolean()
    .default(false)
    .when('SMTP_TEST_RECIPIENT_OVERRIDE', { is: Joi.exist(), then: Joi.valid(false) }),
  // Frontend routes that receive the token (in the URL fragment). No frontend change is implied.
  AUTH_FRONTEND_BASE_URL: smtpRequired(
    Joi.string()
      .uri({ scheme: ['https', 'http'] })
      .max(200),
  ),
  AUTH_PASSWORD_SETUP_PATH: routePath.default('/password/setup'),
  AUTH_PASSWORD_RESET_PATH: routePath.default('/password/reset'),
  AUTH_MFA_RECOVERY_PATH: routePath.default('/mfa/recovery'),
})
  .custom((value, helpers) => {
    // The local-development exception is loopback-only. The explicit Test profile may disable
    // administrator MFA on its shared listener; UAT and production always require it.
    if (value.AUTH_ADMIN_MFA_REQUIRED === false) {
      const isTestProfile =
        String(value.APP_ENV ?? '')
          .trim()
          .toLowerCase() === 'test' && value.NODE_ENV === 'test';
      if (isTestProfile) {
        if (value.HTTP_HOST !== '0.0.0.0' || value.TRUST_PROXY_HOPS !== 0) {
          return helpers.message(
            '"AUTH_ADMIN_MFA_REQUIRED=false" in APP_ENV=Test requires HTTP_HOST=0.0.0.0 and TRUST_PROXY_HOPS=0',
          );
        }
      } else if (value.NODE_ENV !== 'development') {
        return helpers.message(
          '"AUTH_ADMIN_MFA_REQUIRED" may be false only in local development or APP_ENV=Test',
        );
      } else if (!isLoopbackHost(value.HTTP_HOST)) {
        return helpers.message(
          '"AUTH_ADMIN_MFA_REQUIRED=false" requires a loopback HTTP_HOST (127.0.0.1 or ::1)',
        );
      } else if (value.TRUST_PROXY_HOPS !== 0) {
        return helpers.message(
          '"AUTH_ADMIN_MFA_REQUIRED=false" is not allowed behind a reverse proxy (TRUST_PROXY_HOPS must be 0)',
        );
      }
    }
    if (
      value.AUTH_FRONTEND_BASE_URL?.startsWith('http:') &&
      !INSECURE_COOKIE_ENVIRONMENTS.includes(value.NODE_ENV)
    ) {
      return helpers.message(
        '"AUTH_FRONTEND_BASE_URL" must use https outside development and test',
      );
    }
    for (const name of ['AUTH_SESSION_COOKIE_NAME', 'AUTH_MFA_COOKIE_NAME']) {
      if (value[name].startsWith('__Host-') && !value.AUTH_COOKIE_SECURE) {
        return helpers.message(
          `"${name}" with the __Host- prefix requires AUTH_COOKIE_SECURE=true`,
        );
      }
    }
    return value;
  })
  .unknown(true);

const poolConfig = (value, prefix) =>
  Object.freeze({
    alias: value[`${prefix}_ALIAS`],
    poolMin: value[`${prefix}_POOL_MIN`],
    poolMax: value[`${prefix}_POOL_MAX`],
    queueMax: value[`${prefix}_QUEUE_MAX`],
    queueTimeout: value[`${prefix}_QUEUE_TIMEOUT_MS`],
  });

/**
 * Validates environment variables and returns the immutable runtime configuration.
 * Throws on any missing or invalid setting so the process fails fast at startup.
 */
export function loadConfig(env) {
  const hasAppEnv = Object.hasOwn(env, 'APP_ENV');
  const appEnv = hasAppEnv
    ? String(env.APP_ENV ?? '')
        .trim()
        .toLowerCase()
    : null;
  const runtimeEnv =
    appEnv === null
      ? env.NODE_ENV
      : appEnv === ''
        ? 'production'
        : appEnv === 'test'
          ? 'test'
          : appEnv;
  const isSharedTest = appEnv === 'test';
  const normalizedEnv = {
    ...env,
    NODE_ENV: runtimeEnv,
    ...(appEnv === 'development'
      ? {
          PORT: 7381,
          HTTP_HOST: '127.0.0.1',
          AUTH_FRONTEND_BASE_URL: 'http://localhost:7382',
        }
      : {}),
    ...(isSharedTest
      ? {
          PORT: 7381,
          HTTP_HOST: '0.0.0.0',
          AUTH_SESSION_COOKIE_NAME: 'zr_session',
          AUTH_MFA_COOKIE_NAME: 'zr_mfa',
          AUTH_COOKIE_SECURE: false,
          AUTH_ADMIN_MFA_REQUIRED: true,
          AUTH_FRONTEND_BASE_URL: 'http://10.10.2.160:7382',
        }
      : {}),
  };
  const { value, error } = envSchema.validate(normalizedEnv, { abortEarly: false, convert: true });

  if (error) {
    const problems = error.details.map((detail) => detail.message).join('; ');
    throw new Error(`Invalid configuration: ${problems}`);
  }

  const walletDir = value.ORACLE_WALLET_DIR;

  return Object.freeze({
    env: value.NODE_ENV,
    port: value.PORT,
    logLevel: value.LOG_LEVEL,
    shutdownTimeoutMs: value.SHUTDOWN_TIMEOUT_MS,
    http: Object.freeze({
      host: value.HTTP_HOST,
      trustProxyHops: value.TRUST_PROXY_HOPS,
      bodyLimit: value.REQUEST_BODY_LIMIT,
    }),
    apiDocs: Object.freeze({ enabled: value.API_DOCS_ENABLED }),
    health: Object.freeze({
      readyTimeoutMs: value.HEALTH_READY_TIMEOUT_MS,
      readyCacheMs: value.HEALTH_READY_CACHE_MS,
    }),
    auth: Object.freeze({
      cookie: Object.freeze({
        name: value.AUTH_SESSION_COOKIE_NAME,
        secure: value.AUTH_COOKIE_SECURE,
        sameSite: value.AUTH_COOKIE_SAMESITE,
      }),
      allowedOrigins: Object.freeze([...value.AUTH_ALLOWED_ORIGINS]),
      // false only under local-development or explicit Test-profile exceptions (validated above).
      adminMfaRequired: value.AUTH_ADMIN_MFA_REQUIRED,
      adminMfaExemption: isSharedTest
        ? 'TEST_PROFILE'
        : value.NODE_ENV === 'development'
          ? 'LOCAL_DEVELOPMENT'
          : null,
      sessionTouchIntervalMs: value.AUTH_SESSION_TOUCH_INTERVAL_S * 1000,
      loginRateLimit: Object.freeze({
        max: value.AUTH_LOGIN_RATE_LIMIT_MAX,
        windowMs: value.AUTH_LOGIN_RATE_LIMIT_WINDOW_S * 1000,
      }),
      argon2: Object.freeze({
        memoryKiB: value.AUTH_ARGON2_MEMORY_KIB,
        passes: value.AUTH_ARGON2_PASSES,
        parallelism: value.AUTH_ARGON2_PARALLELISM,
      }),
      mfa: Object.freeze({
        encryptionKey: value.AUTH_MFA_ENCRYPTION_KEY ?? null,
        keyId: value.AUTH_MFA_KEY_ID,
        issuer: value.AUTH_MFA_ISSUER,
        cookieName: value.AUTH_MFA_COOKIE_NAME,
      }),
    }),
    smtp: Object.freeze({
      enabled: value.SMTP_ENABLED,
      ...SMTP_ENDPOINT,
      authMethod: value.SMTP_AUTH_METHOD,
      user: value.SMTP_USER ?? null,
      from: Object.freeze({
        address: value.SMTP_FROM ?? value.SMTP_USER ?? null,
        name: value.SMTP_FROM_NAME,
      }),
      oauth: Object.freeze({
        tenantId: value.SMTP_OAUTH_TENANT_ID ?? null,
        clientId: value.SMTP_OAUTH_CLIENT_ID ?? null,
        clientSecret: value.SMTP_OAUTH_CLIENT_SECRET ?? null,
      }),
      password: value.SMTP_PASSWORD ?? null,
      testRecipientOverride: value.SMTP_TEST_RECIPIENT_OVERRIDE ?? null,
      testDatabaseName: value.SMTP_TEST_DATABASE_NAME ?? null,
      privilegedDeliveryEnabled: value.SMTP_PRIVILEGED_DELIVERY_ENABLED,
    }),
    links: Object.freeze({
      baseUrl: value.AUTH_FRONTEND_BASE_URL ?? null,
      PASSWORD_SETUP: value.AUTH_PASSWORD_SETUP_PATH,
      PASSWORD_RESET: value.AUTH_PASSWORD_RESET_PATH,
      MFA_RECOVERY: value.AUTH_MFA_RECOVERY_PATH,
    }),
    database: Object.freeze({
      user: value.ORACLE_USER,
      password: value.ORACLE_PASSWORD,
      // Relative paths resolve against server/, regardless of the shell's working directory.
      walletDir: walletDir && (isAbsolute(walletDir) ? walletDir : resolve(SERVER_ROOT, walletDir)),
      walletPassword: value.ORACLE_WALLET_PASSWORD,
      connectTimeout: value.ORACLE_CONNECT_TIMEOUT_S,
      stmtCacheSize: value.ORACLE_STMT_CACHE_SIZE,
      enableStatistics: value.ORACLE_POOL_STATISTICS,
      pools: Object.freeze({
        LOW: poolConfig(value, 'ORACLE_LOW'),
        HIGH: poolConfig(value, 'ORACLE_HIGH'),
      }),
    }),
  });
}

export const config = loadConfig(process.env);
