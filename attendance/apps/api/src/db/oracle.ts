// Oracle access for both databases: ADW (test ADW, wallet mTLS) and EBS (Phases 7-8).
// node-oracledb thin mode, lazy pools, rows as objects keyed by UPPER-CASE column names.
// Repositories depend on the small `Db` interface so tests can substitute a fake.
import oracledb from 'oracledb';
import type { OraclePoolConfig } from '../config';
import { AppError } from '../lib/errors';

export type PoolName = 'adw' | 'ebs';
export type Binds = Record<string, string | number | null>;
export type Row = Record<string, unknown>;

export interface Db {
  query<T extends Row = Row>(pool: PoolName, sql: string, binds?: Binds): Promise<T[]>;
  /** null when the pool is not configured (EBS before Phase 7). */
  ping(pool: PoolName): Promise<boolean | null>;
  close(): Promise<void>;
}

export class OracleDb implements Db {
  private readonly pools = new Map<PoolName, Promise<oracledb.Pool>>();

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
      });
      // A failed pool creation must not be cached; the next request retries.
      pool.catch(() => this.pools.delete(name));
      this.pools.set(name, pool);
    }
    return pool;
  }

  async query<T extends Row = Row>(pool: PoolName, sql: string, binds: Binds = {}): Promise<T[]> {
    const connection = await (await this.pool(pool)).getConnection();
    try {
      const result = await connection.execute<T>(sql, binds, {
        outFormat: oracledb.OUT_FORMAT_OBJECT,
      });
      return result.rows ?? [];
    } finally {
      await connection.close();
    }
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

/** Reads a column as string | null (Oracle returns numbers for NUMBER columns). */
export const str = (value: unknown): string | null =>
  value === null || value === undefined ? null : String(value);

/** Reads a column as number | null. */
export const num = (value: unknown): number | null => {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};
