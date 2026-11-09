// Dev seed (DRD §6, D-35). Loads only through the repository interfaces, so the same code
// seeds the Oracle store in M8. Refuses to run on a store that already has data.
import { parseSar } from '@expensehub/shared';
import { loadMockMasterData } from '../../integrations/fusion/mock/fixtures';
import type { DataLayer, WriteOptions } from '../ports';
import { DEMO_USERS } from './demo-users';
import {
  APPROVAL_RULES,
  AUDIT_RULES,
  EXPENSE_TYPES,
  ROLE_ASSIGNMENTS,
  ROLE_START_DATE,
  SYSTEM_OPTIONS,
} from './setup-data';

const SYSTEM: WriteOptions = { actorId: null };

export interface SeedSummary {
  employees: number;
  users: number;
  expenseTypes: number;
  approvalRules: number;
  quickPays: number;
}

export interface SeedOptions {
  now?: Date;
  /** bcrypt hash of DEV_PASSWORD for all demo users; null = no password (set via reset link). */
  passwordHash?: string | null;
}

export async function seedDatabase(
  data: DataLayer,
  { now = new Date(), passwordHash = null }: SeedOptions = {},
): Promise<SeedSummary> {
  const master = loadMockMasterData(now.toISOString());

  return data.withTransaction(async (r) => {
    if ((await r.employees.count()) > 0) {
      throw new Error('Seed refused: the data store is not empty. Run "npm run data:reset" first.');
    }

    // Fusion mirrors — same fixtures and mappers the sync jobs use.
    for (const row of master.employees) await r.employees.upsert(row);
    for (const row of master.coaValues) await r.coaValues.upsert(row);
    for (const row of master.businessTrips) await r.businessTrips.upsert(row);
    for (const row of master.rates) await r.rates.upsert(row);
    for (const row of master.quickPays) await r.quickPays.upsertByFusionKey(row);

    // Setup.
    for (const row of EXPENSE_TYPES) await r.expenseTypes.insert(row, SYSTEM);
    for (const row of SYSTEM_OPTIONS) await r.systemOptions.insert(row, SYSTEM);
    for (const row of APPROVAL_RULES) await r.approvalRules.insert(row, SYSTEM);
    for (const row of AUDIT_RULES) await r.auditRules.insert(row, SYSTEM);

    const personId = async (personNumber: string) => {
      const employee = await r.employees.getByPersonNumber(personNumber);
      if (!employee) throw new Error(`Seed: no employee ${personNumber} in the HCM fixture`);
      return employee.personId;
    };

    for (const [personNumber, roleCode, businessUnit, backup] of ROLE_ASSIGNMENTS) {
      await r.roleAssignments.insert(
        {
          personId: await personId(personNumber),
          roleCode,
          businessUnit,
          isBackup: backup ? 'Y' : 'N',
          startDate: ROLE_START_DATE,
          endDate: null,
        },
        SYSTEM,
      );
    }

    // Demo users (D-35) share DEV_PASSWORD so password sign-in can be tested too.
    for (const demo of DEMO_USERS) {
      await r.users.insert(
        {
          personId: await personId(demo.personNumber),
          passwordHash,
          failedAttempts: 0,
          lockedUntil: null,
          lastLoginAt: null,
          resetTokenHash: null,
          resetExpiresAt: null,
          active: 'Y',
        },
        SYSTEM,
      );
    }

    // One Quick Pay already invoiced and paid in Fusion (FR-QP-04 edge case).
    const paidQuickPay = await r.quickPays.getByFusionKey(300000040003, 300000041003);
    if (!paidQuickPay) throw new Error('Seed: Quick Pay 300000040003/300000041003 missing');
    const seq = await r.sequences.next(`QP-${paidQuickPay.businessUnit}-2026`);
    await r.quickPayInvoices.insert(
      {
        quickPayId: paidQuickPay.quickPayId,
        status: 'PAID',
        invoiceNumber: `QP-${paidQuickPay.businessUnit}-2026-${String(seq).padStart(6, '0')}`,
        fusionInvoiceId: 300000050001,
        fusionStatus: 'Paid',
        paymentRef: 'PAY-2026-004512',
        paidAt: '2026-09-28T10:00:00.000Z',
        syncError: null,
        excludedReason: null,
        requestedBy: await personId('1007'),
      },
      SYSTEM,
    );
    await r.reportHistory.append({
      entityType: 'QUICK_PAY',
      entityId: paidQuickPay.quickPayId,
      actorId: null,
      action: 'SEEDED',
      fromStatus: null,
      toStatus: 'PAID',
      detail: { amountSar: parseSar('2400.00') },
    });

    return {
      employees: master.employees.length,
      users: DEMO_USERS.length,
      expenseTypes: EXPENSE_TYPES.length,
      approvalRules: APPROVAL_RULES.length,
      quickPays: master.quickPays.length,
    };
  });
}
