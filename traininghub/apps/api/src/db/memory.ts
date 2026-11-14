// In-memory store for development and tests. Persists to a JSON file when one is given.
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { T, type R, type TableDef, type TableKey } from './tables';
import { UniqueViolation, type FindOptions, type Store, type Where } from './store';

type Row = Record<string, unknown>;
interface Snapshot {
  rows: Record<string, Row[]>;
  seq: Record<string, number>;
}

function matches(row: Row, where: Row | undefined): boolean {
  if (!where) return true;
  for (const [k, v] of Object.entries(where)) {
    if (v === undefined) continue;
    const actual = row[k] ?? null;
    if (Array.isArray(v)) {
      if (!v.includes(actual)) return false;
    } else if (actual !== v) return false;
  }
  return true;
}

function normalise(table: TableKey, row: Row): Row {
  const def = T[table];
  const out: Row = {};
  for (const [col, spec] of Object.entries(def.cols)) {
    let v = row[col];
    if (v === undefined) {
      // Mirror the Oracle column default.
      if (spec.def === undefined) v = null;
      else if (spec.t === 'flag') v = spec.def === "'Y'";
      else if (spec.t === 'int' || spec.t === 'num') v = Number(spec.def);
      else v = spec.def.replace(/^'|'$/g, '');
    }
    if (v != null && spec.t === 'ts') v = new Date(v as string).toISOString();
    if (v != null && spec.t === 'date') v = String(v).slice(0, 10);
    out[col] = v;
  }
  return out;
}

export class MemoryStore implements Store {
  readonly kind = 'memory' as const;
  private db: Snapshot;
  private lock: Promise<unknown> = Promise.resolve();
  private inTx = false;
  private readonly als = new AsyncLocalStorage<true>();
  private saveTimer: NodeJS.Timeout | undefined;

  constructor(private readonly file: string | null) {
    this.db = { rows: {}, seq: {} };
    if (file && existsSync(file)) this.db = JSON.parse(readFileSync(file, 'utf8')) as Snapshot;
    for (const k of Object.keys(T)) this.db.rows[k] ??= [];
  }

  private rows(table: TableKey): Row[] {
    return (this.db.rows[table] ??= []);
  }

  private checkUnique(table: TableKey, row: Row, self?: Row) {
    const def: TableDef = T[table];
    const sets: readonly (readonly string[])[] = [[def.pk], ...(def.unique ?? [])];
    for (const cols of sets) {
      if (cols.some((c) => row[c] == null)) continue;
      const dup = this.rows(table).find((r) => r !== self && cols.every((c) => r[c] === row[c]));
      if (dup) throw new UniqueViolation(def.name, cols);
    }
  }

  private persist() {
    if (!this.file || this.inTx) return;
    clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => this.flush(), 150);
  }

  flush() {
    if (!this.file) return;
    mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    writeFileSync(tmp, JSON.stringify(this.db));
    renameSync(tmp, this.file);
  }

  async find<K extends TableKey>(table: K, where?: Where<K>, opts?: FindOptions<K>): Promise<R<K>[]> {
    let list = this.rows(table).filter((r) => matches(r, where as Row));
    if (opts?.orderBy?.length) {
      const keys = opts.orderBy.map((o) => (o.startsWith('-') ? { k: o.slice(1), d: -1 } : { k: o, d: 1 }));
      list = [...list].sort((a, b) => {
        for (const { k, d } of keys) {
          const x = a[k] as string | number | null;
          const y = b[k] as string | number | null;
          if (x === y) continue;
          if (x == null) return d;
          if (y == null) return -d;
          return (x < y ? -1 : 1) * d;
        }
        return 0;
      });
    }
    if (opts?.limit) list = list.slice(0, opts.limit);
    return structuredClone(list) as R<K>[];
  }

  async one<K extends TableKey>(table: K, where: Where<K>): Promise<R<K> | undefined> {
    return (await this.find(table, where, { limit: 1 }))[0];
  }

  async count<K extends TableKey>(table: K, where?: Where<K>): Promise<number> {
    return this.rows(table).filter((r) => matches(r, where as Row)).length;
  }

  async insert<K extends TableKey>(table: K, row: Partial<R<K>>): Promise<R<K>> {
    const def = T[table];
    const full = normalise(table, row as Row);
    if (def.identity && full[def.pk] == null) {
      const next = Math.max(this.db.seq[table] ?? 0, ...this.rows(table).map((r) => Number(r[def.pk]))) + 1;
      this.db.seq[table] = next;
      full[def.pk] = next;
    }
    for (const [c, spec] of Object.entries(def.cols))
      if (spec.req && full[c] == null) throw new Error(`${def.name}.${c} cannot be null`);
    this.checkUnique(table, full);
    this.rows(table).push(full);
    this.persist();
    return structuredClone(full) as R<K>;
  }

  async update<K extends TableKey>(table: K, where: Where<K>, patch: Partial<R<K>>): Promise<number> {
    const hits = this.rows(table).filter((r) => matches(r, where as Row));
    for (const r of hits) {
      const next = { ...r, ...normalise(table, { ...r, ...(patch as Row) }) };
      this.checkUnique(table, next, r);
      Object.assign(r, next);
    }
    if (hits.length) this.persist();
    return hits.length;
  }

  async remove<K extends TableKey>(table: K, where: Where<K>): Promise<number> {
    const before = this.rows(table).length;
    this.db.rows[table] = this.rows(table).filter((r) => !matches(r, where as Row));
    const n = before - this.rows(table).length;
    if (n) this.persist();
    return n;
  }

  async upsert<K extends TableKey>(table: K, keys: (keyof R<K>)[], row: Partial<R<K>>): Promise<void> {
    const where = Object.fromEntries(keys.map((k) => [k, (row as Row)[k as string]])) as Where<K>;
    if (await this.count(table, where)) await this.update(table, where, row);
    else await this.insert(table, row);
  }

  async tx<X>(fn: () => Promise<X>): Promise<X> {
    if (this.als.getStore()) return fn();
    const run = async () => {
      const snapshot = structuredClone(this.db);
      this.inTx = true;
      try {
        const out = await this.als.run(true, fn);
        this.inTx = false;
        this.persist();
        return out;
      } catch (err) {
        this.db = snapshot;
        this.inTx = false;
        throw err;
      }
    };
    const p = this.lock.then(run, run);
    this.lock = p.catch(() => undefined);
    return p;
  }

  /** Replaces all data (tests, data:reset). */
  reset(rows: Record<string, Row[]> = {}) {
    this.db = { rows: {}, seq: {} };
    for (const k of Object.keys(T)) this.db.rows[k] = (rows[k] ?? []).map((r) => normalise(k as TableKey, r));
    this.persist();
  }

  async close() {
    clearTimeout(this.saveTimer);
    if (this.file) this.flush();
  }
}
