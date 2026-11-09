// Shared sync helpers (INTEGRATION §2.5).
import type { DataLayer } from '../../data/ports';
import { SyncGuardError } from '../types';

/**
 * INTEGRATION §2.5: a full extract returning 0 rows, or fewer than 50 % of the previous count,
 * aborts without changes. "Previous" = rows read by the last successful run, else rows held now.
 */
export function assertNotShrunk(source: string, received: number, previous: number): void {
  if (received === 0) {
    throw new SyncGuardError(`${source} returned 0 rows — aborted without changes.`);
  }
  if (previous > 0 && received < previous * 0.5) {
    throw new SyncGuardError(
      `${source} returned ${received} rows, under 50 % of the previous ${previous} — aborted without changes.`,
    );
  }
}

export async function previousCount(
  data: DataLayer,
  jobName: string,
  current: () => Promise<number>,
): Promise<number> {
  const lastOk = await data.read((r) => r.jobRuns.latestWithStatus(jobName, 'OK'));
  return lastOk?.rowsRead ?? (await current());
}

/** Same business content, ignoring when it was synced. */
export function sameMirrorRow<T extends { syncedAt: string }>(a: T | undefined, b: T): boolean {
  if (!a) return false;
  const { syncedAt: _a, ...left } = a;
  const { syncedAt: _b, ...right } = b;
  return (
    JSON.stringify(left, Object.keys(left).sort()) ===
    JSON.stringify(right, Object.keys(right).sort())
  );
}
