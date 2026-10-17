import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, afterEach, before, beforeEach, describe, it, mock } from 'node:test';
import oracledb from 'oracledb';
import {
  checkDatabaseReadiness,
  closeDatabase,
  initializeDatabase,
  withConnection,
  withTransaction,
} from '../src/database/oracle.js';
import { AppError } from '../src/shared/errors/AppError.js';

// These tests replace the driver with test doubles. They verify pool and transaction
// handling only; they do not prove Oracle connectivity (see `npm run db:status`).

function createFakeConnection() {
  return {
    callTimeout: 0,
    execute: mock.fn(async () => ({ rows: [[1]] })),
    commit: mock.fn(async () => {}),
    rollback: mock.fn(async () => {}),
    close: mock.fn(async () => {}),
  };
}

function createFakePool(connection = createFakeConnection()) {
  return {
    connection,
    getConnection: mock.fn(async () => connection),
    close: mock.fn(async () => {}),
  };
}

let pools;

function registerPool(name, pool = createFakePool()) {
  pools.set(name, pool);
  return pool;
}

beforeEach(() => {
  pools = new Map();
  mock.method(oracledb, 'getPool', (name) => {
    if (!pools.has(name)) throw new Error(`NJS-047: pool alias "${name}" not found`);
    return pools.get(name);
  });
});

afterEach(() => mock.restoreAll());

describe('initializeDatabase', () => {
  let walletDir;
  let db;

  before(() => {
    walletDir = mkdtempSync(join(tmpdir(), 'zr-wallet-'));
    writeFileSync(join(walletDir, 'tnsnames.ora'), 'db_low = (x)\ndb_high = (x)\n');
    writeFileSync(join(walletDir, 'ewallet.pem'), 'synthetic');
    db = {
      user: 'app_user',
      password: 'db-secret',
      walletDir,
      walletPassword: 'wallet-secret',
      connectTimeout: 15,
      stmtCacheSize: 30,
      enableStatistics: true,
      pools: {
        LOW: { alias: 'db_low', poolMin: 1, poolMax: 4, queueMax: 50, queueTimeout: 10000 },
        HIGH: { alias: 'db_high', poolMin: 0, poolMax: 2, queueMax: 10, queueTimeout: 30000 },
      },
    };
  });

  after(() => rmSync(walletDir, { recursive: true, force: true }));

  it('creates one named LOW and one named HIGH pool using wallet mTLS settings', async () => {
    const createPool = mock.method(oracledb, 'createPool', async (options) =>
      registerPool(options.poolAlias),
    );

    await initializeDatabase(db);

    assert.equal(createPool.mock.callCount(), 2);
    const [low, high] = createPool.mock.calls.map((call) => call.arguments[0]);
    assert.deepEqual(
      { alias: low.poolAlias, connectString: low.connectString, max: low.poolMax },
      { alias: 'LOW', connectString: 'db_low', max: 4 },
    );
    assert.deepEqual(
      { alias: high.poolAlias, connectString: high.connectString, max: high.poolMax },
      { alias: 'HIGH', connectString: 'db_high', max: 2 },
    );
    for (const options of [low, high]) {
      assert.equal(options.configDir, walletDir);
      assert.equal(options.walletLocation, walletDir);
      assert.equal(options.walletPassword, 'wallet-secret');
      assert.ok(options.queueMax > 0 && options.queueTimeout > 0, 'queue must be bounded');
    }
  });

  it('closes already-created pools when a later pool fails', async () => {
    mock.method(oracledb, 'createPool', async (options) => {
      if (options.poolAlias === 'HIGH') throw new Error('NJS-516: alias not found');
      return registerPool(options.poolAlias);
    });

    await assert.rejects(initializeDatabase(db), /NJS-516/);
    assert.equal(pools.get('LOW').close.mock.callCount(), 1);
  });

  it('creates no pools when the wallet is invalid', async () => {
    const createPool = mock.method(oracledb, 'createPool', async () => {});

    await assert.rejects(
      initializeDatabase({ ...db, walletDir: join(walletDir, 'absent') }),
      /wallet directory not found/,
    );
    assert.equal(createPool.mock.callCount(), 0);
  });
});

describe('closeDatabase', () => {
  it('closes every initialized pool and tolerates missing ones', async () => {
    const low = registerPool('LOW');

    await closeDatabase();

    assert.equal(low.close.mock.callCount(), 1);
  });
});

describe('withConnection', () => {
  it('returns the result and releases the connection', async () => {
    const pool = registerPool('LOW');

    const result = await withConnection('LOW', async (connection) => {
      const { rows } = await connection.execute('SELECT 1 FROM DUAL');
      return rows[0][0];
    });

    assert.equal(result, 1);
    assert.equal(pool.connection.close.mock.callCount(), 1);
  });

  it('releases the connection when the work fails', async () => {
    const pool = registerPool('LOW');

    await assert.rejects(
      withConnection('LOW', async () => {
        throw new Error('ORA-00942');
      }),
      /ORA-00942/,
    );
    assert.equal(pool.connection.close.mock.callCount(), 1);
  });

  it('turns acquisition failures into a safe 503 that keeps the cause', async () => {
    const pool = registerPool('LOW');
    const cause = new Error('NJS-040: connection request timeout');
    pool.getConnection.mock.mockImplementation(async () => {
      throw cause;
    });

    await assert.rejects(
      withConnection('LOW', async () => {}),
      (error) => {
        assert.ok(error instanceof AppError);
        assert.equal(error.statusCode, 503);
        assert.equal(error.code, 'SERVICE_UNAVAILABLE');
        assert.equal(error.cause, cause);
        return true;
      },
    );
  });

  it('returns 503 when the pool was never initialized', async () => {
    await assert.rejects(
      withConnection('HIGH', async () => {}),
      { statusCode: 503 },
    );
  });
});

describe('withTransaction', () => {
  it('runs all work on one connection, commits once and releases', async () => {
    const pool = registerPool('LOW');
    const seen = new Set();

    await withTransaction('LOW', async (connection) => {
      seen.add(connection);
      await connection.execute('UPDATE a SET x = :x', { x: 1 });
      seen.add(connection);
      await connection.execute('UPDATE b SET y = :y', { y: 2 });
    });

    const { connection } = pool;
    assert.equal(seen.size, 1);
    assert.equal(pool.getConnection.mock.callCount(), 1);
    assert.equal(connection.commit.mock.callCount(), 1);
    assert.equal(connection.rollback.mock.callCount(), 0);
    assert.equal(connection.close.mock.callCount(), 1);
  });

  it('rolls back, does not commit, rethrows and releases on failure', async () => {
    const { connection } = registerPool('LOW');

    await assert.rejects(
      withTransaction('LOW', async (conn) => {
        await conn.execute('UPDATE a SET x = :x', { x: 1 });
        throw new Error('business rule failed');
      }),
      /business rule failed/,
    );

    assert.equal(connection.commit.mock.callCount(), 0);
    assert.equal(connection.rollback.mock.callCount(), 1);
    assert.equal(connection.close.mock.callCount(), 1);
  });

  it('rethrows the original error even if rollback fails', async () => {
    const { connection } = registerPool('LOW');
    connection.rollback.mock.mockImplementation(async () => {
      throw new Error('rollback failed');
    });

    await assert.rejects(
      withTransaction('LOW', async () => {
        throw new Error('original');
      }),
      /original/,
    );
    assert.equal(connection.close.mock.callCount(), 1);
  });
});

describe('checkDatabaseReadiness', () => {
  it('reports both pools up after a read-only probe and restores callTimeout', async () => {
    const low = registerPool('LOW');
    const high = registerPool('HIGH');

    assert.deepEqual(await checkDatabaseReadiness(500), { LOW: true, HIGH: true });
    for (const { connection } of [low, high]) {
      assert.equal(connection.execute.mock.calls[0].arguments[0], 'SELECT 1 FROM DUAL');
      assert.equal(connection.callTimeout, 0);
      assert.equal(connection.close.mock.callCount(), 1);
    }
  });

  it('reports a pool down when its query fails, still releasing the connection', async () => {
    registerPool('LOW');
    const high = registerPool('HIGH');
    high.connection.execute.mock.mockImplementation(async () => {
      throw new Error('ORA-12545');
    });

    assert.deepEqual(await checkDatabaseReadiness(500), { LOW: true, HIGH: false });
    assert.equal(high.connection.close.mock.callCount(), 1);
  });

  it('bounds a stalled acquisition and releases the late connection', async () => {
    registerPool('LOW');
    const high = registerPool('HIGH');
    let deliver;
    high.getConnection.mock.mockImplementation(
      () => new Promise((resolve) => (deliver = () => resolve(high.connection))),
    );

    assert.deepEqual(await checkDatabaseReadiness(50), { LOW: true, HIGH: false });

    deliver();
    await new Promise((resolve) => setImmediate(resolve));
    assert.equal(high.connection.close.mock.callCount(), 1);
    assert.equal(high.connection.execute.mock.callCount(), 0);
  });

  it('reports pools down when they are not initialized', async () => {
    assert.deepEqual(await checkDatabaseReadiness(50), { LOW: false, HIGH: false });
  });
});

describe('probePool deadline', () => {
  it('gives the query only the time left after acquisition', async () => {
    const pool = registerPool('LOW');
    registerPool('HIGH');
    let callTimeoutDuringQuery;
    pool.getConnection.mock.mockImplementation(
      () => new Promise((resolve) => setTimeout(() => resolve(pool.connection), 120)),
    );
    pool.connection.execute.mock.mockImplementation(async () => {
      callTimeoutDuringQuery = pool.connection.callTimeout;
    });

    await checkDatabaseReadiness(300);

    assert.ok(
      callTimeoutDuringQuery > 0 && callTimeoutDuringQuery <= 190,
      `${callTimeoutDuringQuery}`,
    );
  });
});
