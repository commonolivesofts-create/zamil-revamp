import { loadConfig, loadEnvFile } from './config';
import { createApp } from './app';
import { startJobs } from './jobs';
import { createLogger } from './lib/logger';
import { createServices } from './services';
import { isEmpty, seedDemo, seedMaster } from './seed/seed';
import { bootstrapAdmins, syncEmployees } from './integrations/fusion/sync';

loadEnvFile();
const config = loadConfig();
const log = createLogger(config);
const svc = createServices(config, log);

async function prepare() {
  if (await isEmpty(svc.store)) {
    if (config.data.mode === 'memory' && config.fusion.mode === 'mock') {
      log.info('Empty memory store — loading the demo data set');
      await seedDemo(svc.store, svc.clock());
    } else if (config.data.mode === 'memory') {
      await seedMaster(svc.store, { approveProfiles: true });
      await syncEmployees(svc.ctx(null), svc.employees);
    } else log.warn('ADW schema has no master data yet — run: npm run db:seed');
  }
  await bootstrapAdmins(svc.ctx(null));
}

prepare()
  .catch((err) => log.error({ err }, 'start-up preparation failed (the API still starts)'))
  .finally(() => {
    const app = createApp(svc);
    const server = app.listen(config.api.port, config.api.host, () =>
      log.info(`TrainingHub API on ${config.api.host}:${config.api.port} — data ${config.data.mode}, Fusion ${config.fusion.mode}`),
    );
    const stopJobs = config.jobsEnabled ? startJobs(svc) : () => undefined;
    const shutdown = () => {
      stopJobs();
      server.close(() => void svc.store.close().finally(() => process.exit(0)));
      setTimeout(() => process.exit(0), 5000).unref();
    };
    process.on('SIGINT', shutdown);
    process.on('SIGTERM', shutdown);
  });
