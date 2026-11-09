// API entry point: load .env → validate config → start Express → shut down cleanly.
import { createApp } from './app';
import { hashPassword } from './auth/password';
import { DEV_PASSWORD } from './data/seed/demo-users';
import { bootstrapLive } from './data/seed/live';
import { ConfigError, loadConfig, loadDotEnv, type AppConfig } from './config';
import { createDataLayer, type DataLayer } from './data';
import { JOBS } from './jobs/registry';
import { Scheduler } from './jobs/scheduler';
import { createLogger } from './lib/logger';
import { buildServices } from './services';
import { APP_VERSION } from './version';

function readConfig(): AppConfig {
  loadDotEnv();
  try {
    return loadConfig();
  } catch (err) {
    if (err instanceof ConfigError) {
      console.error(`[api] ${err.message}\n[api] Fix .env (see .env.example) and restart.`);
      process.exit(1);
    }
    throw err;
  }
}

const config = readConfig();
process.env.TZ = config.tz;
const logger = createLogger(config);

let data: DataLayer;
try {
  data = await createDataLayer(config, logger);
} catch (err) {
  logger.fatal({ err }, err instanceof Error ? err.message : 'Data layer failed to start');
  process.exit(1);
}

const services = buildServices({ config, data, logger });
if (config.fusion.mode === 'live') {
  // D-50: first live start — sync people and accounts from Fusion, create users and admins.
  try {
    await bootstrapLive({
      data,
      jobs: services.jobs,
      logger,
      // Dev convenience: everyone can sign in with DEV_PASSWORD; production uses reset links.
      passwordHash: config.isProduction
        ? null
        : await hashPassword(DEV_PASSWORD, config.auth.bcryptCost),
      adminPersonNumbers: config.fusion.bootstrapAdmins,
    });
  } catch (err) {
    logger.error({ err }, 'live bootstrap failed — check the Fusion connection');
  }
}
const app = createApp({ config, logger, data, services });
// TRD §7: nightly syncs in Asia/Riyadh (JOBS_ENABLED=false turns them off).
const scheduler = config.jobs.enabled
  ? new Scheduler(services.jobs, JOBS, services.clock, logger).start()
  : undefined;
// TRD §7 notification-dispatch, every minute.
const dispatcher = config.jobs.enabled ? services.notifications.start(60_000) : undefined;

const server = app.listen(config.api.port, config.api.host, () => {
  logger.info(
    {
      version: APP_VERSION,
      env: config.env,
      dataMode: config.data.mode,
      fusionMode: config.fusion.mode,
      notify: config.notify.transport,
    },
    `ExpenseHub API listening on ${config.api.host}:${config.api.port}`,
  );
});

server.on('error', (err: NodeJS.ErrnoException) => {
  if (err.code === 'EADDRINUSE') {
    logger.fatal(
      `Port ${config.api.port} is already in use. Stop the other process or change API_PORT.`,
    );
  } else {
    logger.fatal({ err }, 'server error');
  }
  process.exit(1);
});

function shutdown(signal: string) {
  logger.info(`${signal} received, shutting down`);
  scheduler?.stop();
  dispatcher?.stop();
  server.close(() => {
    void Promise.allSettled([services.receipts.close(), data.close()]).finally(() =>
      process.exit(0),
    );
  });
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
