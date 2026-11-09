// Oracle ADW store (node-oracledb thin mode with the ADW wallet). Builds SQL from the table
// definitions: dates travel as 'YYYY-MM-DD', timestamps as UTC ISO strings, flags as 'Y'/'N'.
import { AsyncLocalStorage } from 'node:async_hooks';
import oracledb from 'oracledb';
import type { AppConfig } from '../config';
import { T, toSnake, type Col, type R, type TableKey } from './tables';
import { UniqueViolation, type FindOptions, type Store, type Where } from './store';

type Row = Record<string, unknown>;
type Binds = Record<string, oracledb.BindParameter | string | number | null>;
const TS_FMT = `'YYYY-MM-DD"T"HH24:MI:SS.FF3"Z"'`;

export type OracleSettings = NonNullable<AppConfig['data']['oracle']>;

export function connectAttrs(o: OracleSettings): oracledb.ConnectionAttributes {
  return {
    user: o.user,
    password: o.password,
    connectString: o.connectString,
    configDir: o.walletDir,
    walletLocation: o.walletDir,
    ...(o.walletPassword && { walletPassword: o.walletPassword }),
  };
}

function toDb(spec: Col, v: unknown): string | number | null {
  if (v == null) return null;
  switch (spec.t) {
    case 'flag':
      return v ? 'Y' : 'N';
    case 'ts':
      return new Date(v as string).toISOString();
    case 'date':
      return String(v).slice(0, 10);
    case 'int':
    case 'num':
      return Number(v);
    default:
      return String(v);
  }
}
function fromDb(spec: Col, v: unknown): unknown {
  if (v == null) return null;
  if (spec.t === 'flag') return v === 'Y';
  if (spec.t === 'int' || spec.t === 'num') return Number(v);
  return v;
}
/** SQL expression that turns a bind into the column's type. */
function bindExpr(spec: Col, name: string): string {
  if (spec.t === 'date') return `TO_DATE(:${name}, 'YYYY-MM-DD')`;
  if (spec.t === 'ts') return `TO_TIMESTAMP(:${name}, ${TS_FMT})`;
  return `:${name}`;
}
function selectExpr(col: string, spec: Col): string {
  const c = toSnake(col);
  if (spec.t === 'date') return `TO_CHAR(${c}, 'YYYY-MM-DD') AS ${c}`;
  if (spec.t === 'ts') return `TO_CHAR(${c}, ${TS_FMT}) AS ${c}`;
  return c;
}

export class OracleStore implements Store {
  readonly kind = 'oracle' as const;
  private pool: oracledb.Pool | undefined;
  private readonly als = new AsyncLocalStorage<oracledb.Connection>();

  constructor(
    private readonly settings: OracleSettings,
    private readonly prefix: string,
  ) {}

  private tableName(k: TableKey) {
    return this.prefix + T[k].name;
  }

  async getPool(): Promise<oracledb.Pool> {
    this.pool ??= await oracledb.createPool({
      ...connectAttrs(this.settings),
      poolMin: this.settings.poolMin,
      poolMax: this.settings.poolMax,
      poolIncrement: 1,
    });
    return this.pool;
  }

  /** Runs SQL on the transaction's connection, or on a pooled one with autocommit. */
  async exec<X = Row>(sql: string, binds: Binds = {}): Promise<oracledb.Result<X>> {
    const opts: oracledb.ExecuteOptions = { outFormat: oracledb.OUT_FORMAT_OBJECT };
    const txConn = this.als.getStore();
    try {
      if (txConn) return await txConn.execute<X>(sql, binds, opts);
      const conn = await (await this.getPool()).getConnection();
      try {
        return await conn.execute<X>(sql, binds, { ...opts, autoCommit: true });
      } finally {
        await conn.close();
      }
    } catch (err) {
      const e = err as { errorNum?: number; message?: string };
      if (e.errorNum === 1) throw new UniqueViolation(sql.match(/(?:INTO|UPDATE|MERGE INTO)\s+(\w+)/)?.[1] ?? '?', []);
      throw err;
    }
  }

  private whereSql<K extends TableKey>(table: K, where: Where<K> | undefined, binds: Binds): string {
    const def = T[table];
    const parts: string[] = [];
    let i = 0;
    for (const [col, v] of Object.entries(where ?? {})) {
      if (v === undefined) continue;
      const spec = (def.cols as Record<string, Col>)[col];
      if (!spec) throw new Error(`Unknown column ${def.name}.${col}`);
      const c = toSnake(col);
      if (v === null) parts.push(`${c} IS NULL`);
      else if (Array.isArray(v)) {
        if (!v.length) parts.push('1 = 0');
        else {
          const names = v.map((x) => {
            const n = `w${i++}`;
            binds[n] = toDb(spec, x);
            return bindExpr(spec, n);
          });
          // Oracle allows at most 1000 items per IN list.
          const chunks: string[] = [];
          for (let s = 0; s < names.length; s += 900) chunks.push(`${c} IN (${names.slice(s, s + 900).join(', ')})`);
          parts.push(`(${chunks.join(' OR ')})`);
        }
      } else {
        const n = `w${i++}`;
        binds[n] = toDb(spec, v);
        parts.push(`${c} = ${bindExpr(spec, n)}`);
      }
    }
    return parts.length ? ` WHERE ${parts.join(' AND ')}` : '';
  }

  private mapRow<K extends TableKey>(table: K, r: Row): R<K> {
    const out: Row = {};
    for (const [col, spec] of Object.entries(T[table].cols as Record<string, Col>)) out[col] = fromDb(spec, r[toSnake(col)]);
    return out as R<K>;
  }

  async find<K extends TableKey>(table: K, where?: Where<K>, opts?: FindOptions<K>): Promise<R<K>[]> {
    const def = T[table];
    const binds: Binds = {};
    const cols = Object.entries(def.cols as Record<string, Col>).map(([c, s]) => selectExpr(c, s));
    let sql = `SELECT ${cols.join(', ')} FROM ${this.tableName(table)}${this.whereSql(table, where, binds)}`;
    if (opts?.orderBy?.length) {
      const order = opts.orderBy.map((o) => {
        const desc = o.startsWith('-');
        const c = desc ? o.slice(1) : o;
        if (!(c in def.cols)) throw new Error(`Unknown column ${def.name}.${c}`);
        return `${toSnake(c)} ${desc ? 'DESC NULLS LAST' : 'ASC NULLS FIRST'}`;
      });
      sql += ` ORDER BY ${order.join(', ')}`;
    }
    if (opts?.limit) sql += ` FETCH FIRST ${Math.trunc(opts.limit)} ROWS ONLY`;
    const res = await this.exec<Row>(sql, binds);
    return (res.rows ?? []).map((r) => this.mapRow(table, r));
  }

  async one<K extends TableKey>(table: K, where: Where<K>): Promise<R<K> | undefined> {
    return (await this.find(table, where, { limit: 1 }))[0];
  }

  async count<K extends TableKey>(table: K, where?: Where<K>): Promise<number> {
    const binds: Binds = {};
    const res = await this.exec<{ N: number }>(
      `SELECT COUNT(*) AS N FROM ${this.tableName(table)}${this.whereSql(table, where, binds)}`,
      binds,
    );
    return Number(res.rows?.[0]?.N ?? 0);
  }

  async insert<K extends TableKey>(table: K, row: Partial<R<K>>): Promise<R<K>> {
    const def = T[table];
    const binds: Binds = {};
    const cols: string[] = [];
    const vals: string[] = [];
    for (const [col, spec] of Object.entries(def.cols as Record<string, Col>)) {
      const v = (row as Row)[col];
      if (def.identity && col === def.pk && v == null) continue;
      if (v === undefined) continue; // column default applies
      cols.push(toSnake(col));
      binds[col] = toDb(spec, v);
      vals.push(bindExpr(spec, col));
    }
    let sql = `INSERT INTO ${this.tableName(table)} (${cols.join(', ')}) VALUES (${vals.join(', ')})`;
    if (def.identity) {
      sql += ` RETURNING ${toSnake(def.pk)} INTO :outId`;
      binds.outId = { dir: oracledb.BIND_OUT, type: oracledb.NUMBER };
    }
    const res = await this.exec(sql, binds);
    const pk = def.identity ? (res.outBinds as { outId: number[] }).outId[0] : (row as Row)[def.pk];
    const stored = await this.one(table, { [def.pk]: pk } as Where<K>);
    if (!stored) throw new Error(`Inserted ${def.name} row not found`);
    return stored;
  }

  async update<K extends TableKey>(table: K, where: Where<K>, patch: Partial<R<K>>): Promise<number> {
    const def = T[table];
    const binds: Binds = {};
    const sets: string[] = [];
    for (const [col, v] of Object.entries(patch as Row)) {
      if (v === undefined || col === def.pk) continue;
      const spec = (def.cols as Record<string, Col>)[col];
      if (!spec) throw new Error(`Unknown column ${def.name}.${col}`);
      binds[`s_${col}`] = toDb(spec, v);
      sets.push(`${toSnake(col)} = ${bindExpr(spec, `s_${col}`)}`);
    }
    if (!sets.length) return 0;
    const res = await this.exec(
      `UPDATE ${this.tableName(table)} SET ${sets.join(', ')}${this.whereSql(table, where, binds)}`,
      binds,
    );
    return res.rowsAffected ?? 0;
  }

  async remove<K extends TableKey>(table: K, where: Where<K>): Promise<number> {
    const binds: Binds = {};
    const w = this.whereSql(table, where, binds);
    if (!w) throw new Error('Refusing to delete a whole table');
    const res = await this.exec(`DELETE FROM ${this.tableName(table)}${w}`, binds);
    return res.rowsAffected ?? 0;
  }

  async upsert<K extends TableKey>(table: K, keys: (keyof R<K>)[], row: Partial<R<K>>): Promise<void> {
    const def = T[table];
    const specs = def.cols as Record<string, Col>;
    const binds: Binds = {};
    const keySet = new Set(keys as string[]);
    const present = Object.keys(row).filter((c) => (row as Row)[c] !== undefined && c in specs);
    for (const c of present) binds[c] = toDb(specs[c]!, (row as Row)[c]);
    const on = [...keySet].map((c) => `t.${toSnake(c)} = ${bindExpr(specs[c]!, c)}`).join(' AND ');
    const upd = present.filter((c) => !keySet.has(c) && c !== def.pk);
    const ins = present.filter((c) => !(def.identity && c === def.pk));
    let sql = `MERGE INTO ${this.tableName(table)} t USING dual ON (${on})`;
    if (upd.length) sql += ` WHEN MATCHED THEN UPDATE SET ${upd.map((c) => `t.${toSnake(c)} = ${bindExpr(specs[c]!, c)}`).join(', ')}`;
    sql += ` WHEN NOT MATCHED THEN INSERT (${ins.map(toSnake).join(', ')}) VALUES (${ins.map((c) => bindExpr(specs[c]!, c)).join(', ')})`;
    await this.exec(sql, binds);
  }

  async tx<X>(fn: () => Promise<X>): Promise<X> {
    if (this.als.getStore()) return fn();
    const conn = await (await this.getPool()).getConnection();
    try {
      const out = await this.als.run(conn, fn);
      await conn.commit();
      return out;
    } catch (err) {
      await conn.rollback().catch(() => undefined);
      throw err;
    } finally {
      await conn.close();
    }
  }

  async close() {
    await this.pool?.close(10);
    this.pool = undefined;
  }
}
