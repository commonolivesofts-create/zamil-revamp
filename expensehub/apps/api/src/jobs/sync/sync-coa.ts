// Implements: INT-04 (EH_GL_SEGMENT_VALUES), TRD §7 sync-coa.
// Values missing from the full extract are disabled, never deleted (expense lines reference them).
import { glSegmentValueCsv, parseRows } from '../../integrations/fusion/contracts';
import { toCoaValues } from '../../integrations/fusion/mappers';
import type { JobDefinition } from '../types';
import { assertNotShrunk, previousCount, sameMirrorRow } from './common';

export const syncCoa: JobDefinition = {
  name: 'sync-coa',
  interfaces: ['INT-04'],
  dailyAt: { hour: 1, minute: 30 },
  async run({ data, fusion, clock }) {
    const now = clock().toISOString();
    const rows = await fusion.bip('INT-04', 'EH_GL_SEGMENT_VALUES');
    const values = toCoaValues(parseRows(glSegmentValueCsv, rows, 'EH_GL_SEGMENT_VALUES'), now);
    assertNotShrunk(
      'EH_GL_SEGMENT_VALUES',
      values.length,
      await previousCount(data, 'sync-coa', () => data.read((r) => r.coaValues.count())),
    );

    return data.withTransaction(async (r) => {
      let changed = 0;
      const seen = new Set<string>();
      for (const row of values) {
        seen.add(`${row.segment}|${row.value}`);
        if (!sameMirrorRow(await r.coaValues.get(row), row)) changed += 1;
        await r.coaValues.upsert(row);
      }
      for (const existing of await r.coaValues.list()) {
        if (!seen.has(`${existing.segment}|${existing.value}`) && existing.enabled === 'Y') {
          await r.coaValues.upsert({ ...existing, enabled: 'N', syncedAt: now });
          changed += 1;
        }
      }
      return { rowsRead: values.length, rowsChanged: changed };
    });
  },
};
