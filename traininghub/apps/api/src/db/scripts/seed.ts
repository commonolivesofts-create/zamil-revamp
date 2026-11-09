// npm run db:seed [-- --approve-profiles] [-- --demo]
// Loads master data (skills library, IT positions with profiles, eligibility rules, settings,
// the Direct manager → HR Lead workflow) into an empty TrainingHub schema in ADW.
// --demo also loads demo people/sessions/requests — never use it against a schema that will
// sync real employees from Fusion.
import { isEmpty, seedDemo, seedMaster } from '../../seed/seed';
import { main, oracleFromEnv } from './cli';

void main(async () => {
  const { store } = oracleFromEnv();
  if (!(await isEmpty(store))) {
    console.log('TrainingHub master data is already present — nothing to do.');
    await store.close();
    return;
  }
  if (process.argv.includes('--demo')) {
    await seedDemo(store);
    console.log('✔ Master data and demo data loaded.');
  } else {
    const approve = process.argv.includes('--approve-profiles');
    await seedMaster(store, { approveProfiles: approve });
    console.log(
      `✔ Master data loaded (profiles ${approve ? 'approved as version 1' : 'left as drafts for HR to approve'}).`,
    );
    console.log(
      '  Next: start the app and run Setup → Integration → Sync employees (or npm run fusion:sync).',
    );
  }
  await store.close();
});
