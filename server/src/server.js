import { createApp } from './app.js';
import { config } from './config/index.js';
import { checkDatabaseReadiness, closeDatabase, initializeDatabase } from './database/oracle.js';
import { logger } from './shared/logger/index.js';
import { shutdownGracefully } from './shutdown.js';

process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ err: reason }, 'Unhandled promise rejection');
  process.exit(1);
});

// Configuration only allows this on a loopback-only development listener (config/index.js).
if (config.auth.adminMfaRequired === false) {
  logger.warn(
    { nodeEnv: config.env, host: config.http.host },
    'WARNING: Administrator MFA requirement is disabled for local development.',
  );
}

// Invalid wallet or pool configuration is fatal. An unreachable database is not:
// the process stays live and /health/ready reports 503 until Oracle becomes available.
try {
  await initializeDatabase();
} catch (error) {
  logger.fatal({ err: error }, 'Oracle database initialization failed');
  process.exit(1);
}

// Listen as soon as the pools exist. The readiness probe below only logs; awaiting it first kept
// the port closed for several seconds after every (watch-mode) start, during which the dev proxy
// answered 502 to session checks and sign-ins.
const server = createApp().listen(config.port, config.http.host, (error) => {
  if (error) {
    logger.fatal({ err: error }, 'HTTP server failed to start');
    process.exit(1);
  }
  logger.info({ host: config.http.host, port: config.port }, 'HTTP server listening');
});

const pools = await checkDatabaseReadiness();
if (Object.values(pools).every(Boolean)) {
  logger.info({ pools }, 'Oracle LOW and HIGH pools ready');
} else {
  logger.error({ pools }, 'Oracle unavailable at startup; readiness will report 503');
}

let shuttingDown = false;

async function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  logger.info({ signal }, 'Graceful shutdown started');

  process.exit(
    await shutdownGracefully({
      server,
      closeResources: closeDatabase,
      timeoutMs: config.shutdownTimeoutMs,
    }),
  );
}

process.once('SIGTERM', () => shutdown('SIGTERM'));
process.once('SIGINT', () => shutdown('SIGINT'));
