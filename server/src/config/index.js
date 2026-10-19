import { isAbsolute, resolve } from 'node:path';
import Joi from 'joi';

const DOCS_ALLOWED_ENVIRONMENTS = ['development', 'test'];
const INSECURE_COOKIE_ENVIRONMENTS = ['development', 'test'];
const SERVER_ROOT = resolve(import.meta.dirname, '../..');

// OWASP Password Storage Cheat Sheet minimum for Argon2id: 19 MiB, 2 passes, 1 lane.
const ARGON2_MIN_MEMORY_KIB = 19456;
const ARGON2_MIN_PASSES = 2;

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
})
  .custom((value, helpers) => {
    if (value.AUTH_SESSION_COOKIE_NAME.startsWith('__Host-') && !value.AUTH_COOKIE_SECURE) {
      return helpers.message(
        '"AUTH_SESSION_COOKIE_NAME" with the __Host- prefix requires AUTH_COOKIE_SECURE=true',
      );
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
  const { value, error } = envSchema.validate(env, { abortEarly: false, convert: true });

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
