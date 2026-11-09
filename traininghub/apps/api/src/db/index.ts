import type { AppConfig } from '../config';
import { MemoryStore } from './memory';
import { OracleStore } from './oracle';
import type { Store } from './store';

export function createStore(config: AppConfig, opts: { memoryFile?: string | null } = {}): Store {
  if (config.data.mode === 'oracle') return new OracleStore(config.data.oracle!, config.data.prefix);
  return new MemoryStore(opts.memoryFile === undefined ? config.data.file : opts.memoryFile);
}
export type { Store } from './store';
