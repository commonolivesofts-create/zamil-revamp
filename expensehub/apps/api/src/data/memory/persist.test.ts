import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { SYSTEM, expenseType } from '../contract/builders';
import { DataFileError, loadState } from './persist';
import { MemoryDataLayer } from './store';

let dir: string;
let file: string;

beforeEach(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'eh-data-'));
  file = path.join(dir, 'nested', 'dev-data.json');
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

describe('memory store persistence (D-33)', () => {
  it('writes every commit to disk and reloads it after a restart', async () => {
    const first = new MemoryDataLayer({ file });
    await first.withTransaction((r) => r.expenseTypes.insert(expenseType('MEALS'), SYSTEM));
    await first.close();
    expect(existsSync(file)).toBe(true);
    expect(existsSync(`${file}.tmp`)).toBe(false);

    const second = new MemoryDataLayer({ file, initialState: loadState(file) });
    expect((await second.read((r) => r.expenseTypes.getByCode('MEALS')))?.typeId).toBe(1);
    // Identity counters survive too.
    const next = await second.withTransaction((r) =>
      r.expenseTypes.insert(expenseType('HOTEL'), SYSTEM),
    );
    expect(next.typeId).toBe(2);
  });

  it('does not write a failed transaction', async () => {
    const data = new MemoryDataLayer({ file });
    await data.withTransaction((r) => r.expenseTypes.insert(expenseType('MEALS'), SYSTEM));
    const before = readFileSync(file, 'utf8');
    await expect(
      data.withTransaction(async (r) => {
        await r.expenseTypes.insert(expenseType('HOTEL'), SYSTEM);
        throw new Error('rollback');
      }),
    ).rejects.toThrow('rollback');
    expect(readFileSync(file, 'utf8')).toBe(before);
  });

  it('does not commit in memory when the disk write fails', async () => {
    // A non-empty directory where the file should be: the atomic rename cannot replace it.
    const blocked = path.join(dir, 'blocked');
    mkdirSync(path.join(blocked, 'inner'), { recursive: true });
    const data = new MemoryDataLayer({ file: blocked });

    await expect(
      data.withTransaction((r) => r.expenseTypes.insert(expenseType('MEALS'), SYSTEM)),
    ).rejects.toThrow();
    expect(await data.read((r) => r.expenseTypes.list())).toEqual([]);
    expect(existsSync(`${blocked}.tmp`)).toBe(false);
  });

  it('returns undefined when there is no file yet', () => {
    expect(loadState(path.join(dir, 'missing.json'))).toBeUndefined();
  });

  it('explains how to recover from a corrupt or old file', () => {
    const bad = path.join(dir, 'bad.json');
    writeFileSync(bad, '{not json');
    expect(() => loadState(bad)).toThrow(DataFileError);
    writeFileSync(bad, JSON.stringify({ schemaVersion: 0, tables: {} }));
    expect(() => loadState(bad)).toThrow(/data:reset/);
  });
});
