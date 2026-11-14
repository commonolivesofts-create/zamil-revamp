// npm run db:ping — M8 connectivity check for Oracle ADW (thin mode, shared parent test wallet).
// Prints only the outcome: never the password, never the wallet contents.
import path from 'node:path';
import oracledb from 'oracledb';

const root = path.resolve(import.meta.dirname, '..', '..');
process.loadEnvFile(path.join(root, '.env'));
const env = process.env;
const walletDir = path.resolve(root, env.DB_WALLET_DIR ?? '../secrets/oracle/Wallet_zpadwtest');

try {
  const conn = await oracledb.getConnection({
    user: env.DB_USER,
    password: env.DB_PASSWORD,
    connectString: env.DB_CONNECT_STRING ?? 'zpadwtest_low',
    configDir: walletDir,
    walletLocation: walletDir,
    walletPassword: env.DB_WALLET_PASSWORD || undefined,
  });
  const result = await conn.execute<[string, string, string]>(
    `select sys_context('USERENV','SESSION_USER'), sys_context('USERENV','DB_NAME'), banner_full from v$version where rownum = 1`,
  );
  const [user, db, banner] = result.rows![0]!;
  console.log(`[db:ping] OK — connected as ${user} to ${db}`);
  console.log(`[db:ping] ${String(banner).split('\n')[0]}`);
  // D-43: ExpenseHub shares schema XXZP; its objects all start with EH_ and must not collide.
  const objects = await conn.execute<[number, number]>(
    `select count(*), count(case when object_name like 'EH\\_%' escape '\\' then 1 end) from user_objects`,
  );
  const [total, eh] = objects.rows![0]!;
  console.log(`[db:ping] schema objects: ${total} in total, ${eh} named EH_*`);
  await conn.close();
} catch (err) {
  const e = err as { code?: string; message?: string };
  console.error(`[db:ping] FAILED ${e.code ?? ''} ${String(e.message ?? err).split('\n')[0]}`);
  process.exitCode = 1;
}
