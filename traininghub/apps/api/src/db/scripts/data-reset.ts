// npm run data:reset — wipes the local memory store (DATA_MODE=memory only); the next start reseeds.
import { rmSync } from 'node:fs';
import { cliConfig, main } from './cli';

void main(async () => {
  const config = cliConfig();
  if (config.data.mode !== 'memory') throw new Error('data:reset only works with DATA_MODE=memory');
  rmSync(config.data.file, { force: true });
  console.log(`✔ Removed ${config.data.file}. Restart the API to reload the demo data.`);
});
