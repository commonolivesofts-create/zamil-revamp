import { isAbsolute, resolve } from 'node:path';
import Joi from 'joi';

const DOCS_ALLOWED_ENVIRONMENTS = ['development', 'test'];
const SERVER_ROOT = resolve(import.meta.dirname, '../..');

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
}).unknown(true);

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
