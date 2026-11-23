// Oracle access for both databases: ADW (test ADW, wallet mTLS) and EBS (Phases 7-8).
// node-oracledb thin mode, lazy pools, rows as objects keyed by UPPER-CASE column names.
// Repositories depend on the small `Db` interface so tests can substitute a fake.
import oracledb from 'oracledb';
import type { OraclePoolConfig } from '../config';
import { AppError } from '../lib/errors';

export type PoolName = 'adw' | 'ebs';
/** An OUT bind (e.g. RETURNING id INTO :newId). */
export interface OutBind {
  out: 'number' | 'string';
}
export type BindValue = string | number | null | OutBind;
export type Binds = Record<string, BindValue>;
export type Row = Record<string, unknown>;

export interface ExecuteResult {
  rowsAffected: number;
  outBinds: Record<string, unknown>;
}

/** Statements that run on one connection inside a transaction. */
export interface Tx {
  query<T extends Row = Row>(sql: string, binds?: Binds): Promise<T[]>;
  execute(sql: string, binds?: Binds): Promise<ExecuteResult>;
}

export interface Db {
  query<T extends Row = Row>(pool: PoolName, sql: string, binds?: Binds): Promise<T[]>;
  /** One write, committed on success. */
  execute(pool: PoolName, sql: string, binds?: Binds): Promise<ExecuteResult>;
  /** Several statements committed together; any error rolls everything back. */
  transaction<T>(pool: PoolName, work: (tx: Tx) => Promise<T>): Promise<T>;
  /** null when the pool is not configured (EBS before Phase 7). */
  ping(pool: PoolName): Promise<boolean | null>;
  close(): Promise<void>;
}

export class OracleDb implements Db {
  private readonly pools = new Map<PoolName, Promise<oracledb.Pool>>();
  /** When a pool last proved unreachable (VPN off): fail fast for a while instead of queueing. */
  private readonly downSince = new Map<PoolName, number>();

  constructor(private readonly configs: Record<PoolName, OraclePoolConfig | null>) {}

  private pool(name: PoolName): Promise<oracledb.Pool> {
    const config = this.configs[name];
    if (!config) {
      throw new AppError('UNAVAILABLE', `The ${name.toUpperCase()} database is not configured.`);
    }
    let pool = this.pools.get(name);
    if (!pool) {
      pool = oracledb.createPool({
        user: config.user,
        password: config.password,
        connectString: config.connectString,
        ...(config.walletDir && { configDir: config.walletDir, walletLocation: config.walletDir }),
        ...(config.walletPassword && { walletPassword: config.walletPassword }),
        poolMin: config.poolMin,
        poolMax: config.poolMax,
        poolIncrement: 1,
        stmtCacheSize: 50,
        ...(config.connectTimeout && {
          connectTimeout: config.connectTimeout,
          queueTimeout: (config.connectTimeout + 10) * 1000,
        }),
      });
      // A failed pool creation must not be cached; the next request retries.
      pool.catch(() => this.pools.delete(name));
      this.pools.set(name, pool);
    }
    return pool;
  }

  private async withConnection<T>(pool: PoolName, use: (c: oracledb.Connection) => Promise<T>) {
    const message = this.configs[pool]?.unreachableMessage;
    const since = this.downSince.get(pool);
    if (message && since !== undefined && Date.now() - since < RETRY_AFTER_MS) {
      throw new AppError('UNAVAILABLE', message);
    }
    let connection: oracledb.Connection;
    try {
      connection = await (await this.pool(pool)).getConnection();
      this.downSince.delete(pool);
    } catch (error) {
      if (message && isUnreachable(error)) {
        this.downSince.set(pool, Date.now());
        throw new AppError('UNAVAILABLE', message);
      }
      throw error;
    }
    try {
      return await use(connection);
    } finally {
      await connection.close();
    }
  }

  async query<T extends Row = Row>(pool: PoolName, sql: string, binds: Binds = {}): Promise<T[]> {
    return this.withConnection(pool, (c) => runQuery<T>(c, sql, binds));
  }

  async execute(pool: PoolName, sql: string, binds: Binds = {}): Promise<ExecuteResult> {
    return this.withConnection(pool, (c) => runExecute(c, sql, binds, true));
  }

  async transaction<T>(pool: PoolName, work: (tx: Tx) => Promise<T>): Promise<T> {
    return this.withConnection(pool, async (c) => {
      try {
        const result = await work({
          query: (sql, binds = {}) => runQuery(c, sql, binds),
          execute: (sql, binds = {}) => runExecute(c, sql, binds, false),
        });
        await c.commit();
        return result;
      } catch (error) {
        await c.rollback().catch(() => undefined);
        throw error;
      }
    });
  }

  async ping(pool: PoolName): Promise<boolean | null> {
    if (!this.configs[pool]) return null;
    try {
      await this.query(pool, 'SELECT 1 AS OK FROM DUAL');
      return true;
    } catch {
      return false;
    }
  }

  async close(): Promise<void> {
    const pools = [...this.pools.values()];
    this.pools.clear();
    await Promise.allSettled(pools.map(async (pool) => (await pool).close(5)));
  }
}

/** Network-level failures (host down, VPN off, timeout), as opposed to SQL errors. */
/** How long an unreachable database is reported as down before the next real attempt. */
const RETRY_AFTER_MS = 30_000;

export function isUnreachable(error: unknown): boolean {
  const text = `${(error as { code?: string })?.code ?? ''} ${(error as Error)?.message ?? ''}`;
  return /NJS-040|NJS-50[0-9]|NJS-51[0-9]|ORA-121[0-9]{2}|ORA-125[0-9]{2}|ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENOTFOUND|ENETUNREACH/.test(
    text,
  );
}

function toOracleBinds(binds: Binds): oracledb.BindParameters {
  return Object.fromEntries(
    Object.entries(binds).map(([name, value]) =>
      value !== null && typeof value === 'object'
        ? [
            name,
            {
              dir: oracledb.BIND_OUT,
              type: value.out === 'number' ? oracledb.NUMBER : oracledb.STRING,
              ...(value.out === 'string' && { maxSize: 4000 }),
            },
          ]
        : [name, value],
    ),
  );
}

async function runQuery<T extends Row>(c: oracledb.Connection, sql: string, binds: Binds) {
  const result = await c.execute<T>(sql, toOracleBinds(binds), {
    outFormat: oracledb.OUT_FORMAT_OBJECT,
  });
  return result.rows ?? [];
}

async function runExecute(
  c: oracledb.Connection,
  sql: string,
  binds: Binds,
  autoCommit: boolean,
): Promise<ExecuteResult> {
  const result = await c.execute(sql, toOracleBinds(binds), { autoCommit });
  const outBinds = (result.outBinds ?? {}) as Record<string, unknown>;
  // RETURNING ... INTO yields one-element arrays; unwrap them.
  for (const [key, value] of Object.entries(outBinds)) {
    if (Array.isArray(value)) outBinds[key] = value[0];
  }
  return { rowsAffected: result.rowsAffected ?? 0, outBinds };
}

/** Reads a column as string | null (Oracle returns numbers for NUMBER columns). */
export const str = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

/** Reads a column as number | null. */
export const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

/** CI3 serializeRow "clean": trimmed text, empty -> null. */
export const clean = (value: unknown): string | null => {
  const text = str(value);
  return text === null || text === '' ? null : text.trim();
};
