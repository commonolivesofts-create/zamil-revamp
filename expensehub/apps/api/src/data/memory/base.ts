// Generic memory repositories for ExpenseHub-owned (audit columns + version) and mirror tables.
import { AppError } from '../../lib/errors';
import type { AuditCols, MirrorCols } from '../entities';
import type { EntityRepo, MirrorRepo, UpdateOptions, WriteOptions } from '../ports';
import { MemoryTable, type TableDef, type TxContext } from './table';

function withoutUndefined<T extends object>(patch: T): Partial<T> {
  return Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) as Partial<T>;
}

export class MemoryEntityRepo<T extends AuditCols, K, New extends object> implements EntityRepo<
  T,
  K,
  New
> {
  protected readonly table: MemoryTable<T>;

  constructor(
    protected readonly ctx: TxContext,
    def: TableDef<T>,
    protected readonly toKey: (key: K) => string,
    protected readonly label: string,
  ) {
    this.table = new MemoryTable(ctx, def);
  }

  async get(key: K): Promise<T | undefined> {
    return this.table.get(this.toKey(key));
  }

  async getOrThrow(key: K): Promise<T> {
    const row = await this.get(key);
    if (!row) throw new AppError('NOT_FOUND', `${this.label} not found`, { key });
    return row;
  }

  async list(): Promise<T[]> {
    return this.table.all();
  }

  async insert(row: New, { actorId }: WriteOptions): Promise<T> {
    const now = this.ctx.now();
    return this.table.insert({
      ...row,
      createdAt: now,
      createdBy: actorId,
      updatedAt: now,
      updatedBy: actorId,
      version: 1,
    } as unknown as T);
  }

  async update(key: K, patch: Partial<New>, opts: UpdateOptions): Promise<T> {
    const rowKey = this.toKey(key);
    const current = this.table.get(rowKey);
    if (!current) throw new AppError('NOT_FOUND', `${this.label} not found`, { key });
    if (opts.expectedVersion !== undefined && current.version !== opts.expectedVersion) {
      throw new AppError(
        'VERSION_CONFLICT',
        `${this.label} was changed by someone else. Reload and try again.`,
        { expected: opts.expectedVersion, actual: current.version },
      );
    }
    const next = {
      ...current,
      ...withoutUndefined(patch),
      createdAt: current.createdAt,
      createdBy: current.createdBy,
      updatedAt: this.ctx.now(),
      updatedBy: opts.actorId,
      version: current.version + 1,
    } as T;
    return this.table.replace(rowKey, next);
  }
}

export class MemoryMirrorRepo<T extends MirrorCols, K> implements MirrorRepo<T, K> {
  protected readonly table: MemoryTable<T>;

  constructor(
    protected readonly ctx: TxContext,
    protected readonly def: TableDef<T>,
    protected readonly toKey: (key: K) => string,
  ) {
    this.table = new MemoryTable(ctx, def);
  }

  async get(key: K): Promise<T | undefined> {
    return this.table.get(this.toKey(key));
  }

  async list(): Promise<T[]> {
    return this.table.all();
  }

  async count(): Promise<number> {
    return this.table.count();
  }

  async upsert(row: T): Promise<T> {
    const rowKey = this.def.key(row);
    return this.table.has(rowKey) ? this.table.replace(rowKey, row) : this.table.insert(row);
  }
}

export { withoutUndefined };
