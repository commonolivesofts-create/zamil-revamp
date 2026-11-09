// Implements: D-33 DATA_MODE=memory.
// Transactions: serialised by a queue; each works on a copy of the state, which replaces the
// committed state only if the function succeeds AND the file write succeeds (all or nothing).
// A transaction started inside another (same async flow, via AsyncLocalStorage) joins it.
import { AsyncLocalStorage } from 'node:async_hooks';
import type { DataLayer, Repos } from '../ports';
import { saveState } from './persist';
import { createMemoryRepos } from './repos';
import { emptyState, type MemoryState } from './state';
import type { TxContext } from './table';

export interface MemoryDataLayerOptions {
  /** Snapshot file; omit for a purely in-memory store (tests). */
  file?: string;
  initialState?: MemoryState;
  clock?: () => Date;
}

export class MemoryDataLayer implements DataLayer {
  readonly mode = 'memory' as const;
  private state: MemoryState;
  private readonly active = new AsyncLocalStorage<TxContext>();
  private queue: Promise<unknown> = Promise.resolve();

  constructor(private readonly options: MemoryDataLayerOptions = {}) {
    this.state = options.initialState ?? emptyState(this.now());
  }

  private readonly now = (): string => (this.options.clock?.() ?? new Date()).toISOString();

  withTransaction<T>(fn: (repos: Repos) => Promise<T>): Promise<T> {
    const outer = this.active.getStore();
    if (outer?.writable) return fn(createMemoryRepos(outer));

    const run = async (): Promise<T> => {
      const ctx: TxContext = { state: structuredClone(this.state), writable: true, now: this.now };
      const result = await this.active.run(ctx, () => fn(createMemoryRepos(ctx)));
      if (this.options.file) saveState(this.options.file, ctx.state);
      this.state = ctx.state;
      return result;
    };
    const next = this.queue.then(run, run);
    this.queue = next.catch(() => undefined);
    return next;
  }

  read<T>(fn: (repos: Repos) => Promise<T>): Promise<T> {
    // Inside a transaction: read its uncommitted writes. Otherwise: the committed snapshot,
    // which is never mutated in place (commits replace it), so the read is consistent.
    const ctx = this.active.getStore() ?? { state: this.state, writable: false, now: this.now };
    return this.active.run(ctx, () => fn(createMemoryRepos(ctx)));
  }

  async ping(): Promise<boolean> {
    return true;
  }

  async close(): Promise<void> {
    // Wait for queued transactions; every commit is already on disk.
    await this.queue;
  }

  /** Test/diagnostic helper: a deep copy of the committed state. */
  snapshot(): MemoryState {
    return structuredClone(this.state);
  }
}
