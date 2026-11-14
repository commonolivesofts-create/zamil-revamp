// One memory table: primary key, identity column, unique keys and CHECK rules emulated the
// way Oracle would enforce them, so the services behave the same on both stores.
import { AppError } from '../../lib/errors';
import type { MemoryState, TableName } from './state';

export interface TxContext {
  state: MemoryState;
  writable: boolean;
  now: () => string;
}

export interface TableDef<T> {
  name: TableName;
  key: (row: T) => string;
  identity?: keyof T & string;
  /** Unique keys; a null key is not enforced (Oracle UK allows many NULLs). */
  unique?: { name: string; key: (row: T) => string | null }[];
  /** CHECK constraints. */
  checks?: { name: string; test: (row: T) => boolean }[];
}

/** Composite key helper: key(a, b) → "a|b". */
export const key = (...parts: unknown[]): string => parts.map((p) => String(p)).join('|');

export function assertWritable(ctx: TxContext, what: string): void {
  if (!ctx.writable) throw new Error(`Write to ${what} outside withTransaction()`);
}

/** Counter stored in the transaction's state, so it rolls back with it. */
export function nextSequence(ctx: TxContext, name: string): number {
  assertWritable(ctx, `sequence ${name}`);
  const next = (ctx.state.sequences[name] ?? 0) + 1;
  ctx.state.sequences[name] = next;
  return next;
}

export class MemoryTable<T extends object> {
  constructor(
    private readonly ctx: TxContext,
    private readonly def: TableDef<T>,
  ) {}

  private get rows(): Record<string, T> {
    return this.ctx.state.tables[this.def.name] as Record<string, T>;
  }

  get(rowKey: string): T | undefined {
    const row = Object.hasOwn(this.rows, rowKey) ? this.rows[rowKey] : undefined;
    return row === undefined ? undefined : structuredClone(row);
  }

  has(rowKey: string): boolean {
    return Object.hasOwn(this.rows, rowKey);
  }

  all(): T[] {
    return Object.values(this.rows).map((row) => structuredClone(row));
  }

  filter(predicate: (row: T) => boolean): T[] {
    return Object.values(this.rows)
      .filter(predicate)
      .map((row) => structuredClone(row));
  }

  find(predicate: (row: T) => boolean): T | undefined {
    const row = Object.values(this.rows).find(predicate);
    return row === undefined ? undefined : structuredClone(row);
  }

  count(): number {
    return Object.keys(this.rows).length;
  }

  insert(input: T): T {
    this.assertWritable();
    const row = structuredClone(input);
    const fields = row as Record<string, unknown>;
    const identity = this.def.identity;
    if (identity && (fields[identity] === undefined || fields[identity] === null)) {
      fields[identity] = nextSequence(this.ctx, `identity:${this.def.name}`);
    }
    const rowKey = this.def.key(row);
    if (this.has(rowKey)) {
      throw this.constraintError(`${this.def.name}_pk`, `Duplicate key ${rowKey}`);
    }
    this.checkConstraints(row, undefined);
    this.rows[rowKey] = row;
    return structuredClone(row);
  }

  replace(rowKey: string, next: T): T {
    this.assertWritable();
    if (!this.has(rowKey)) throw new AppError('NOT_FOUND', `${this.def.name} ${rowKey} not found`);
    if (this.def.key(next) !== rowKey) {
      throw this.constraintError(`${this.def.name}_pk`, 'The primary key cannot change');
    }
    this.checkConstraints(next, rowKey);
    this.rows[rowKey] = structuredClone(next);
    return structuredClone(next);
  }

  remove(rowKey: string): void {
    this.assertWritable();
    if (!this.has(rowKey)) throw new AppError('NOT_FOUND', `${this.def.name} ${rowKey} not found`);
    delete this.rows[rowKey];
  }

  private checkConstraints(row: T, selfKey: string | undefined): void {
    for (const check of this.def.checks ?? []) {
      if (!check.test(row)) throw this.constraintError(check.name, `Check ${check.name} failed`);
    }
    for (const unique of this.def.unique ?? []) {
      const value = unique.key(row);
      if (value === null) continue;
      for (const [otherKey, other] of Object.entries(this.rows)) {
        if (otherKey !== selfKey && unique.key(other) === value) {
          throw this.constraintError(unique.name, `Duplicate value for ${unique.name}`);
        }
      }
    }
  }

  private constraintError(constraint: string, message: string): AppError {
    return new AppError('INVALID_STATE', message, { constraint: constraint.toLowerCase() });
  }

  private assertWritable(): void {
    assertWritable(this.ctx, this.def.name);
  }
}
