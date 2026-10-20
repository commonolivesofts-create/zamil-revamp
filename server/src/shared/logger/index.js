import pino from 'pino';
import { pinoHttp } from 'pino-http';
import { config } from '../../config/index.js';

export const logger = pino({
  level: config.logLevel,
  base: { service: 'zamil-revamp-api', env: config.env },
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: [
      'password',
      '*.password',
      'passwordHash',
      '*.passwordHash',
      'currentPassword',
      '*.currentPassword',
      'newPassword',
      '*.newPassword',
      'walletPassword',
      '*.walletPassword',
      'token',
      '*.token',
      'sessionToken',
      '*.sessionToken',
      'csrfToken',
      '*.csrfToken',
      'tokenHash',
      'otpauthUri',
      '*.otpauthUri',
      'encryptedSecret',
      '*.encryptedSecret',
      'encryptionKey',
      '*.encryptionKey',
      '*.tokenHash',
      '*.secret',
      // SMTP / OAuth2 material and e-mailed links (defence in depth; never logged by design).
      'clientSecret',
      '*.clientSecret',
      'accessToken',
      '*.accessToken',
      'pass',
      '*.pass',
      'link',
      '*.link',
      'req.headers.authorization',
      'req.headers.cookie',
      'req.headers["x-csrf-token"]',
      'res.headers["set-cookie"]',
    ],
    censor: '[REDACTED]',
  },
});

/**
 * Logs one entry per completed request. Only method, path (no query string) and
 * status are recorded, so headers, cookies and filter values never reach the logs.
 */
export const httpLogger = pinoHttp({
  logger,
  genReqId: (req) => req.id,
  customLogLevel: (_req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  serializers: {
    req: (req) => ({ id: req.id, method: req.method, path: req.raw.originalUrl.split('?')[0] }),
    res: (res) => ({ statusCode: res.statusCode }),
  },
});
