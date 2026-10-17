import oracledb from 'oracledb';
import { config } from '../config/index.js';
import { AppError } from '../shared/errors/AppError.js';
import { logger } from '../shared/logger/index.js';
import { validateWallet } from './wallet.js';

/**
 * Named pools on the same ADW database. LOW serves ordinary APIs and all write
 * transactions; HIGH is reserved for approved analytical/reporting queries.
 */
export const POOLS = Object.freeze({ LOW: 'LOW', HIGH: 'HIGH' });

/**
 * Creates one named Thin-mode pool. The alias is resolved through tnsnames.ora
 * immediately; connections are opened in the background, so an unreachable database
 * surfaces on the first acquisition rather than here.
 */
export function createPool(name, db = config.database) {
  const pool = db.pools[name];

  return oracledb.createPool({
    poolAlias: name,
    user: db.user,
    password: db.password,
    connectString: pool.alias,
    configDir: db.walletDir,
    walletLocation: db.walletDir,
    walletPassword: db.walletPassword,
    connectTimeout: db.connectTimeout,
    stmtCacheSize: db.stmtCacheSize,
    enableStatistics: db.enableStatistics,
    poolMin: pool.poolMin,
    poolMax: pool.poolMax,
    poolIncrement: 1,
    queueMax: pool.queueMax,
    queueTimeout: pool.queueTimeout,
  });
}

/** Validates the wallet and creates both pools once for this process. */
export async function initializeDatabase(db = config.database) {
  validateWallet(
    db.walletDir,
    Object.values(db.pools).map((pool) => pool.alias),
    db.walletPassword,
  );

  try {
    for (const name of Object.values(POOLS)) {
      await createPool(name, db);
    }
  } catch (error) {
    await closeDatabase();
    throw error;
  }
}

function findPool(name) {
  try {
    return oracledb.getPool(name);
  } catch {
    return undefined;
  }
}

export async function closeDatabase(drainTimeSeconds = 0) {
  await Promise.all(Object.values(POOLS).map((name) => findPool(name)?.close(drainTimeSeconds)));
}

async function release(connection) {
  try {
    await connection.close();
  } catch (error) {
    logger.error({ err: error }, 'Failed to release Oracle connection');
  }
}

/**
 * Runs `work` with a connection from the named pool and always releases it.
 * Acquisition failures (database unreachable, queue full or timed out) become a 503.
 */
export async function withConnection(poolName, work) {
  const pool = findPool(poolName);
  let connection;

  try {
    if (!pool) throw new Error(`Oracle pool ${poolName} is not initialized`);
    connection = await pool.getConnection();
  } catch (error) {
    throw new AppError(
      503,
      'SERVICE_UNAVAILABLE',
      'The service is temporarily unavailable',
      undefined,
      { cause: error },
    );
  }

  try {
    return await work(connection);
  } finally {
    await release(connection);
  }
}

/**
 * Service-owned transaction: every repository call inside `work` must use the given
 * connection. Commits once on success, rolls back on any failure. The pool is fixed
 * for the whole transaction; writes belong on LOW.
 */
export function withTransaction(poolName, work) {
  return withConnection(poolName, async (connection) => {
    try {
      const result = await work(connection);
      await connection.commit();
      return result;
    } catch (error) {
      try {
        await connection.rollback();
      } catch (rollbackError) {
        logger.error({ err: rollbackError }, 'Oracle rollback failed');
      }
      throw error;
    }
  });
}

/**
 * Bounded, read-only connectivity check for one pool. The deadline covers both
 * acquisition and execution; a connection acquired after the deadline is released.
 */
export async function probePool(poolName, timeoutMs) {
  const pool = findPool(poolName);
  if (!pool) throw new Error(`Oracle pool ${poolName} is not initialized`);

  const startedAt = Date.now();
  const acquisition = pool.getConnection();
  let timer;
  const deadline = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`Timed out acquiring a ${poolName} connection`)),
      timeoutMs,
    );
  });

  let connection;
  try {
    connection = await Promise.race([acquisition, deadline]);
  } catch (error) {
    acquisition.then(release, () => {});
    throw error;
  } finally {
    clearTimeout(timer);
  }

  // callTimeout persists on pooled connections, so it is restored before release.
  const previousCallTimeout = connection.callTimeout;
  try {
    connection.callTimeout = Math.max(1, timeoutMs - (Date.now() - startedAt));
    await connection.execute('SELECT 1 FROM DUAL');
  } finally {
    connection.callTimeout = previousCallTimeout;
    await release(connection);
  }
}

/** Probes both pools in parallel; returns `{ LOW: boolean, HIGH: boolean }`. */
export async function checkDatabaseReadiness(timeoutMs = config.health.readyTimeoutMs) {
  const names = Object.values(POOLS);
  const results = await Promise.all(
    names.map(async (name) => {
      try {
        await probePool(name, timeoutMs);
        return true;
      } catch (error) {
        logger.warn({ err: error, pool: name }, 'Oracle readiness check failed');
        return false;
      }
    }),
  );

  return Object.fromEntries(names.map((name, index) => [name, results[index]]));
}
