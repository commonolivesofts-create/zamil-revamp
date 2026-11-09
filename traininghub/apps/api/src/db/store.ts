import type { R, TableKey } from './tables';

/** Equality filters; an array means IN (...); null means IS NULL. */
export type Where<K extends TableKey> = { [P in keyof R<K>]?: R<K>[P] | R<K>[P][] | null };
export interface FindOptions<K extends TableKey> {
  /** Column names; prefix with '-' for descending. */
  orderBy?: (Extract<keyof R<K>, string> | `-${Extract<keyof R<K>, string>}`)[];
  limit?: number;
}

/**
 * The only way the app touches persistent data. Two implementations: Oracle ADW and an
 * in-memory store (JSON file) for development and tests. Both enforce the same unique keys.
 */
export interface Store {
  readonly kind: 'memory' | 'oracle';
  find<K extends TableKey>(table: K, where?: Where<K>, opts?: FindOptions<K>): Promise<R<K>[]>;
  one<K extends TableKey>(table: K, where: Where<K>): Promise<R<K> | undefined>;
  count<K extends TableKey>(table: K, where?: Where<K>): Promise<number>;
  /** Inserts and returns the stored row (with its generated id). */
  insert<K extends TableKey>(table: K, row: Partial<R<K>>): Promise<R<K>>;
  update<K extends TableKey>(table: K, where: Where<K>, patch: Partial<R<K>>): Promise<number>;
  remove<K extends TableKey>(table: K, where: Where<K>): Promise<number>;
  /** Insert or update the row matched on `keys`. */
  upsert<K extends TableKey>(table: K, keys: (keyof R<K>)[], row: Partial<R<K>>): Promise<void>;
  /** Runs fn atomically: every store call inside commits together or not at all. */
  tx<T>(fn: () => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

export class UniqueViolation extends Error {
  constructor(table: string, cols: readonly string[]) {
    super(`Duplicate value for ${table}(${cols.join(', ')})`);
    this.name = 'UniqueViolation';
  }
}
