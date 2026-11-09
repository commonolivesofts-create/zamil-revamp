// npm run db:demo-data            — adds dummy sessions, requests, exams and skill levels using
//                                   the real employees already synced (test only).
// npm run db:demo-data -- --remove — removes everything the command added.
import { addDemoData, hasDemoData, removeDemoData } from '../../seed/demo-real';
import { cliConfig, main } from './cli';
import { createStore } from '../index';

void main(async () => {
  const config = cliConfig();
  if (config.isProduction) throw new Error('Refusing to add demo data in production');
  const store = createStore(config);
  if (process.argv.includes('--remove')) {
    console.log(`✔ Removed demo data: ${(await removeDemoData(store)).join(', ')}`);
  } else if (await hasDemoData(store)) {
    console.log('Demo data is already there. Remove it first with: npm run db:demo-data -- --remove');
  } else {
    for (const line of await addDemoData(store, { bootstrap: config.bootstrapAdmins }))
      console.log(`✔ ${line}`);
    console.log('Restart npm run dev (or wait a minute) to see it.');
  }
  await store.close();
});
