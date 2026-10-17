// Oracle connectivity diagnostic (`npm run db:status`). Runs as its own process with its own
// short-lived pools; the statistics it prints never describe a running server's pools.
import oracledb from 'oracledb';
import { config } from '../src/config/index.js';
import { closeDatabase, createPool, POOLS, probePool } from '../src/database/oracle.js';
import { validateWallet } from '../src/database/wallet.js';

const { database } = config;
// Allows for the TLS handshake of the first connection, which pool queues do not bound.
const probeTimeoutMs = (database.connectTimeout + 5) * 1000;

function describeError(error) {
  return [error.code, error.message.split('\n')[0]].filter(Boolean).join(' ');
}

function printPoolStatistics(pool) {
  console.log(
    `  Pool limits:   min ${pool.poolMin}, max ${pool.poolMax}, queueMax ${pool.queueMax}, queueTimeout ${pool.queueTimeout} ms`,
  );
  console.log(`  Connections:   open ${pool.connectionsOpen}, in use ${pool.connectionsInUse}`);

  const stats = pool.getStatistics();
  if (!stats) {
    console.log('  Queue:         statistics disabled (ORACLE_POOL_STATISTICS=false)');
    return;
  }
  console.log(
    `  Queue:         current ${stats.currentQueueLength}, max ${stats.maximumQueueLength}, ` +
      `enqueued ${stats.requestsEnqueued}, rejected ${stats.rejectedRequests}, ` +
      `timeouts ${stats.requestTimeouts}, failed ${stats.failedRequests}`,
  );
}

async function checkPool(name) {
  console.log(`\n[${name}] alias ${database.pools[name].alias}`);
  try {
    await createPool(name);
    const startedAt = performance.now();
    await probePool(name, probeTimeoutMs);
    const elapsedMs = Math.round(performance.now() - startedAt);
    console.log(`  Connectivity:  OK (SELECT 1 FROM DUAL, ${elapsedMs} ms incl. connect)`);
    printPoolStatistics(oracledb.getPool(name));
    return true;
  } catch (error) {
    console.log(`  Connectivity:  FAILED: ${describeError(error)}`);
    return false;
  }
}

console.log('Oracle database diagnostic (standalone process; not live server pool statistics)');
console.log(
  `Driver: node-oracledb ${oracledb.versionString} (${oracledb.thin ? 'Thin' : 'Thick'} mode)`,
);
console.log(`Environment: ${config.env}`);

let passed = false;
try {
  validateWallet(
    database.walletDir,
    Object.values(database.pools).map((pool) => pool.alias),
    database.walletPassword,
  );
  console.log('Wallet: OK (tnsnames.ora, ewallet.pem decrypts, both aliases present)');

  const results = [];
  for (const name of Object.values(POOLS)) {
    results.push(await checkPool(name));
  }
  passed = results.every(Boolean);
} catch (error) {
  console.log(`Wallet: FAILED: ${error.message}`);
} finally {
  await closeDatabase();
}

console.log(`\nResult: ${passed ? 'PASS' : 'FAIL'}`);
process.exitCode = passed ? 0 : 1;
