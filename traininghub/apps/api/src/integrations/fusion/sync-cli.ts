// npm run fusion:sync [-- --force] — runs the employee sync once against the configured store.
import { cliConfig, main } from '../../db/scripts/cli';
import { createLogger } from '../../lib/logger';
import { createServices } from '../../services';
import { syncEmployees } from './sync';

void main(async () => {
  const config = cliConfig();
  const svc = createServices(config, createLogger({ ...config, logLevel: 'warn' }));
  console.log(`Syncing employees from ${config.fusion.mode === 'live' ? config.fusion.baseUrl : config.fusion.mode === 'sql' ? 'EMPLOYEE_SQL (ADW)' : 'mock Fusion'} into ${config.data.mode} …`);
  const r = await syncEmployees(svc.ctx(null), svc.employees, { force: process.argv.includes('--force') });
  console.log(`${r.statusCode === 'SUCCESS' ? '✔' : '✖'} ${r.statusCode}: ${r.message}`);
  if (r.statusCode === 'SUCCESS') console.log(`  ${r.inserted} new · ${r.updated} changed · ${r.deactivated} deactivated`);
  await svc.store.close();
  if (r.statusCode !== 'SUCCESS') throw new Error('Sync did not complete');
});
