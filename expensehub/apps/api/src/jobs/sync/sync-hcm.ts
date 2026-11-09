// Implements: INT-01/02/03 (EH_HCM_EMPLOYEES) + INT-07 (EH_AP_EMPLOYEE_PAYEES), TRD §7 sync-hcm.
// Upsert + deactivate: employees missing from the full extract become active='N' (§2.5).
import { riyadhDate } from '../../lib/dates';
import { apPayeeCsv, hcmEmployeeCsv, parseRows } from '../../integrations/fusion/contracts';
import { toEmployees } from '../../integrations/fusion/mappers';
import type { JobDefinition } from '../types';
import { assertNotShrunk, previousCount, sameMirrorRow } from './common';

export const syncHcm: JobDefinition = {
  name: 'sync-hcm',
  interfaces: ['INT-01', 'INT-02', 'INT-03', 'INT-07'],
  dailyAt: { hour: 1, minute: 0 },
  async run({ data, fusion, clock }) {
    const now = clock();
    // 1. Fetch (outside any transaction — each call is logged on its own).
    const employeeRows = await fusion.bip('INT-01', 'EH_HCM_EMPLOYEES', {
      P_AS_OF_DATE: riyadhDate(now),
    });
    const payeeRows = await fusion.bip('INT-07', 'EH_AP_EMPLOYEE_PAYEES');

    // 2. Validate against the contract and guard against a broken extract.
    const employees = toEmployees(
      parseRows(hcmEmployeeCsv, employeeRows, 'EH_HCM_EMPLOYEES'),
      parseRows(apPayeeCsv, payeeRows, 'EH_AP_EMPLOYEE_PAYEES'),
      now.toISOString(),
    );
    assertNotShrunk(
      'EH_HCM_EMPLOYEES',
      employees.length,
      await previousCount(data, 'sync-hcm', () => data.read((r) => r.employees.count())),
    );

    // 3. Apply all-or-nothing.
    return data.withTransaction(async (r) => {
      let changed = 0;
      const seen = new Set<number>();
      for (const row of employees) {
        seen.add(row.personId);
        if (!sameMirrorRow(await r.employees.get(row.personId), row)) changed += 1;
        await r.employees.upsert(row);
      }
      for (const existing of await r.employees.list()) {
        if (!seen.has(existing.personId) && existing.active === 'Y') {
          await r.employees.upsert({ ...existing, active: 'N', syncedAt: now.toISOString() });
          changed += 1;
        }
      }
      return { rowsRead: employees.length, rowsChanged: changed };
    });
  },
};
