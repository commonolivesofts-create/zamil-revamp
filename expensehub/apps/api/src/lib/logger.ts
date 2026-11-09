// Implements: TRD §4.10 — structured logs, never passwords, tokens, cookies or bank data.
import { pino, type Logger } from 'pino';
import type { AppConfig } from '../config';

export const REDACT_PATHS = [
  'req.headers.cookie',
  'req.headers.authorization',
  'res.headers["set-cookie"]',
  '*.password',
  '*.newPassword',
  '*.token',
  '*.secret',
  '*.iban',
  '*.bankAccount',
];

export function createLogger(config: Pick<AppConfig, 'logLevel' | 'isProduction' | 'env'>): Logger {
  const pretty = !config.isProduction && config.env !== 'test';
  return pino({
    level: config.env === 'test' ? 'silent' : config.logLevel,
    redact: { paths: REDACT_PATHS, censor: '[redacted]' },
    ...(pretty && {
      transport: {
        target: 'pino-pretty',
        options: { colorize: true, translateTime: 'SYS:HH:MM:ss', ignore: 'pid,hostname' },
      },
    }),
  });
}
