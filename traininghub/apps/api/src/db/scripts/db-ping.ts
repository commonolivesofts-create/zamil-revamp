// npm run db:ping — proves the wallet, credentials and network path to ADW.
import { cliConfig, main, oracleFromEnv } from './cli';

void main(async () => {
  cliConfig();
  const { config, store } = oracleFromEnv();
  const o = config.data.oracle!;
  console.log(`Connecting to ${o.connectString} as ${o.user} (wallet ${o.walletDir}) …`);
  const t0 = Date.now();
  const r = await store.exec<{ DB: string; WHO: string; NOW: string; V: string }>(
    `SELECT SYS_CONTEXT('USERENV','DB_NAME') AS DB, USER AS WHO,
            TO_CHAR(SYSTIMESTAMP,'YYYY-MM-DD HH24:MI:SS TZH:TZM') AS NOW,
            (SELECT version_full FROM product_component_version WHERE ROWNUM = 1) AS V FROM dual`,
  );
  const row = r.rows![0]!;
  const n = await store.exec<{ N: number }>(
    `SELECT COUNT(*) AS N FROM user_tables WHERE table_name LIKE :p ESCAPE '\\'`,
    { p: config.data.prefix.replace('_', '\\_') + '%' },
  );
  console.log(`✔ Connected in ${Date.now() - t0} ms — database ${row.DB}, user ${row.WHO}, Oracle ${row.V}`);
  console.log(`  Server time ${row.NOW}. ${n.rows![0]!.N} ${config.data.prefix}* tables present.`);
  await store.close();
});
