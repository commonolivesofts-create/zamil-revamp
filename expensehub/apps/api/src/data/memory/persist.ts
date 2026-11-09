// storage/dev-data.json: atomic save (temp file + rename) and validated load.
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { SCHEMA_VERSION, TABLES, type MemoryState, type TableName } from './state';

export class DataFileError extends Error {
  constructor(file: string, reason: string) {
    super(`${reason} (${file}). Run "npm run data:reset" to start again from seed data.`);
    this.name = 'DataFileError';
  }
}

export function loadState(file: string): MemoryState | undefined {
  if (!existsSync(file)) return undefined;
  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    throw new DataFileError(file, 'The dev data file is not valid JSON');
  }
  const state = parsed as Partial<MemoryState>;
  if (state?.schemaVersion !== SCHEMA_VERSION || typeof state.tables !== 'object') {
    throw new DataFileError(file, `The dev data file is not schema version ${SCHEMA_VERSION}`);
  }
  // Tables added since the file was written start empty.
  const tables = { ...state.tables } as Record<TableName, Record<string, unknown>>;
  for (const name of Object.keys(TABLES) as TableName[]) tables[name] ??= {};
  return {
    schemaVersion: SCHEMA_VERSION,
    createdAt: state.createdAt ?? new Date().toISOString(),
    sequences: state.sequences ?? {},
    tables,
  };
}

function sleepSync(ms: number): void {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/** Writes the whole state atomically; a crash never leaves a half-written file. */
export function saveState(file: string, state: MemoryState): void {
  mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state), 'utf8');
  // Windows: antivirus or an open editor can briefly lock the target; retry a few times.
  for (let attempt = 1; ; attempt += 1) {
    try {
      renameSync(tmp, file);
      return;
    } catch (err) {
      if (attempt >= 5) {
        rmSync(tmp, { force: true });
        throw err;
      }
      sleepSync(20 * attempt);
    }
  }
}
