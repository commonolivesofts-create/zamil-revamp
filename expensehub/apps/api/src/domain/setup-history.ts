// Implements: FR-SET-05 — every setup change is written to EH_SETUP_HISTORY (who, when,
// old → new) in the same transaction as the change. The table is append-only (DB-05).
import type { SetupTable } from '@expensehub/shared';
import type { PersonId } from '../data/entities';
import type { Repos } from '../data/ports';

const AUDIT_KEYS = new Set(['createdAt', 'createdBy', 'updatedAt', 'updatedBy', 'version']);

function businessFields(row: object | null | undefined): Record<string, unknown> | null {
  if (!row) return null;
  return Object.fromEntries(Object.entries(row).filter(([k]) => !AUDIT_KEYS.has(k)));
}

export async function recordSetupChange(
  repos: Repos,
  tableName: SetupTable,
  rowKey: string,
  actorId: PersonId,
  before: object | null | undefined,
  after: object | null | undefined,
): Promise<void> {
  await repos.setupHistory.append({
    tableName,
    rowKey,
    actorId,
    oldJson: businessFields(before),
    newJson: businessFields(after),
  });
}
