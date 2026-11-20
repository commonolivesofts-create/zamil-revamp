// npm run db:ping — proves wallet, credentials and network for ADW (and EBS when enabled),
// and that the attendance tables are present. Prints names only, never credentials.
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from '../config';
import { OracleDb } from './oracle';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..');
const envFile = path.join(root, '.env');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const TABLES = [
  'XX_DIGI_EMP_MASTER',
  'XX_DIGI_EMP_ABSENCE_TYPE',
  'XX_DIGI_SHIFT_PR',
  'XX_DIGI_SHIFT_PR_DTL',
  'XX_DIGI_TIMETABLE_PR',
  'XX_DIGI_ATT_OCCASIONS',
  'XX_DIGI_ATT_ATT_CARD',
  'XX_DIGI_ATT_ATT_SHEET',
  'XX_DIGI_ATT_PYRL_FILE_ADJ',
];

const config = loadConfig(process.env, root);
const db = new OracleDb({ adw: config.adw, ebs: config.ebs });
try {
  const [info] = await db.query(
    'adw',
    "SELECT SYS_CONTEXT('USERENV','DB_NAME') AS DB, USER AS U, SYS_CONTEXT('USERENV','SERVICE_NAME') AS SVC FROM DUAL",
  );
  console.log(`ADW: connected to ${info?.DB} as ${info?.U} (${config.adw.connectString})`);
  const binds = Object.fromEntries(TABLES.map((t, i) => [`t${i}`, t]));
  const found = await db.query(
    'adw',
    `SELECT TABLE_NAME FROM USER_TABLES WHERE TABLE_NAME IN (${TABLES.map((_, i) => `:t${i}`).join(',')})`,
    binds,
  );
  const present = new Set(found.map((r) => String(r.TABLE_NAME)));
  for (const table of TABLES)
    console.log(`  ${present.has(table) ? 'ok     ' : 'MISSING'} ${table}`);
  const ebs = await db.ping('ebs');
  console.log(
    `EBS: ${ebs === null ? 'disabled (EBS_ENABLED=false)' : ebs ? 'connected' : 'NOT reachable'}`,
  );
} catch (error) {
  console.error(`ADW: failed — ${(error as Error).message}`);
  process.exitCode = 1;
} finally {
  await db.close();
}
