import { pino, type Logger } from 'pino';

/** Structured logs; credentials, cookies and tokens are always redacted. */
export function createLogger(level: string, pretty: boolean): Logger {
  return pino({
    level,
    redact: {
      paths: [
        'req.headers.cookie',
        'req.headers.authorization',
        'res.headers["set-cookie"]',
        '*.password',
        '*.token',
      ],
      censor: '[redacted]',
    },
    ...(pretty && {
      transport: { target: 'pino-pretty', options: { colorize: true, ignore: 'pid,hostname' } },
    }),
  });
}

/** A logger that discards everything (tests). */
export const silentLogger = (): Logger => pino({ level: 'silent' });
