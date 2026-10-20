// Shared runtime for interactive Oracle TEST operator tools. Runs the API in this process on an
// ephemeral loopback port from the validated configuration, after proving (read-only) that the
// environment is not production and the connected database is the configured TEST database.
import { createApp } from '../src/app.js';
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, withConnection } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';
import { findDatabaseName } from '../src/modules/notifications/databaseIdentity.repository.js';
import { createClient, createCookieJar } from './mfa-test-flow.js';

/** Problems that forbid any TEST write (empty = safe). */
export function testEnvironmentProblems(appConfig, databaseName) {
  const problems = [];
  if (appConfig.env === 'production') problems.push('NODE_ENV is production');
  const expected = appConfig.smtp?.testDatabaseName;
  if (!expected)
    problems.push('SMTP_TEST_DATABASE_NAME (TEST database identity) is not configured');
  else if (databaseName !== expected)
    problems.push('connected database is not the configured TEST database');
  return problems;
}

/** Independent client pair (`auth` = /api/v1/auth, `api` = /api/v1) with its own cookie jar. */
export const clientFor = (root) => {
  const jar = createCookieJar();
  return { auth: createClient(`${root}/auth`, jar), api: createClient(root, jar) };
};

/**
 * Runs `work({ root, client })` against a local API; `extraProblems(config, dbName)` can add
 * scenario-specific preflight checks. Returns the work's result, or 1 when the preflight fails.
 */
export async function withLocalApi(say, work, extraProblems = () => []) {
  const { database } = config;
  validateWallet(database.walletDir, [database.pools.LOW.alias], database.walletPassword);
  await createPool(POOLS.LOW);
  let server;
  try {
    const databaseName = await withConnection(POOLS.LOW, findDatabaseName);
    const problems = [
      ...testEnvironmentProblems(config, databaseName),
      ...extraProblems(config, databaseName),
    ];
    if (problems.length) {
      for (const problem of problems) say(`FAIL  preflight: ${problem}`);
      say('STOP  safety preflight failed; nothing was changed.');
      return 1;
    }
    say('PASS  preflight: non-production, connected to the configured TEST database');
    server = createApp(config).listen(0, '127.0.0.1');
    await new Promise((resolve, reject) => server.once('listening', resolve).once('error', reject));
    const root = `http://127.0.0.1:${server.address().port}/api/v1`;
    return await work({ root, client: () => clientFor(root), appConfig: config });
  } finally {
    if (server) await new Promise((resolve) => server.close(resolve));
    await closeDatabase().catch(() => {});
  }
}
