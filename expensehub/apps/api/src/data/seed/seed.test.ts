// Seed integrity (BUILD-PLAN M1): the demo data can exercise every rule and role.
import {
  ASSIGNABLE_ROLES,
  BUSINESS_UNITS,
  COA_SEGMENTS,
  type AssignableRole,
} from '@expensehub/shared';
import { beforeAll, describe, expect, it } from 'vitest';
import { MemoryDataLayer } from '../memory/store';
import type { Repos } from '../ports';
import { DEMO_USERS } from './demo-users';
import { seedDatabase } from './index';

let data: MemoryDataLayer;
const read = <T>(fn: (r: Repos) => Promise<T>) => data.read(fn);

beforeAll(async () => {
  data = new MemoryDataLayer();
  await seedDatabase(data, { now: new Date('2026-10-18T06:00:00Z') });
});

describe('dev seed', () => {
  it('creates 16 demo users (D-35), each an active employee', async () => {
    const users = await read((r) => r.users.list());
    expect(users).toHaveLength(16);
    expect(DEMO_USERS).toHaveLength(16);
    for (const u of users) {
      const e = await read((r) => r.employees.get(u.personId));
      expect(e?.active, `user ${u.personId}`).toBe('Y');
    }
  });

  it('only references supervisors that exist', async () => {
    const employees = await read((r) => r.employees.list());
    const ids = new Set(employees.map((e) => e.personId));
    for (const e of employees) {
      if (e.supervisorId !== null) expect(ids.has(e.supervisorId), e.personNumber).toBe(true);
    }
  });

  it('has a primary holder for every chain role in every BU (OQ-02)', async () => {
    const chainRoles = new Set(
      (await read((r) => r.approvalRules.list())).flatMap((rule) =>
        rule.roleCode ? [rule.roleCode] : [],
      ),
    );
    const assignments = await read((r) => r.roleAssignments.list());
    for (const role of chainRoles) {
      for (const bu of BUSINESS_UNITS) {
        const holder = assignments.find(
          (a) =>
            a.roleCode === role &&
            a.isBackup === 'N' &&
            (a.businessUnit === null || a.businessUnit === bu),
        );
        expect(holder, `${role} for ${bu}`).toBeDefined();
      }
    }
  });

  it('gives every assignable role to a demo user (except phase-3 CARD_ADMIN)', async () => {
    const assigned = new Set((await read((r) => r.roleAssignments.list())).map((a) => a.roleCode));
    const expected = ASSIGNABLE_ROLES.filter(
      (role): role is AssignableRole => role !== 'CARD_ADMIN',
    );
    for (const role of expected) expect(assigned.has(role), role).toBe(true);
  });

  it('seeds both approval chains (D-49, D-37)', async () => {
    const standard = await read((r) => r.approvalRules.listActive('STANDARD'));
    expect(standard.map((s) => s.stepName)).toEqual([
      'Line Manager',
      'Finance Manager',
      'Accountant',
    ]);
    expect(standard[0]).toMatchObject({ approverSource: 'SUPERVISOR_HIERARCHY' });
    const ceo = await read((r) => r.approvalRules.listActive('CEO_CLAIMANT'));
    expect(ceo.map((s) => s.stepName)).toEqual(['Finance Manager', 'Accountant']);
    expect(ceo.at(-1)?.isAuditStep).toBe('Y');
  });

  it('builds every default expense account from enabled COA values (FR-POL-05)', async () => {
    const coa = await read((r) => r.coaValues.list());
    const enabled = new Set(
      coa.filter((c) => c.enabled === 'Y').map((c) => `${c.segment}:${c.value}`),
    );
    for (const e of await read((r) => r.employees.list())) {
      if (e.active !== 'Y' || !e.defaultExpenseAccount) continue;
      const parts = e.defaultExpenseAccount.split('.');
      expect(parts, e.personNumber).toHaveLength(6);
      parts.forEach((value, i) =>
        expect(
          enabled.has(`${COA_SEGMENTS[i]}:${value}`),
          `${e.personNumber} ${COA_SEGMENTS[i]}=${value}`,
        ).toBe(true),
      );
      expect(e.businessUnit).toBe(parts[0]); // OQ-14 proposal: Company = BU code
    }
  });

  it('points every expense type and per-BU account option at real accounts', async () => {
    const accounts = new Set(
      (await read((r) => r.coaValues.listBySegment('ACCOUNT'))).map((a) => a.value),
    );
    for (const t of await read((r) => r.expenseTypes.list())) {
      expect(accounts.has(t.naturalAccount), t.typeCode).toBe(true);
      expect(t.isPlaceholder).toBe('Y'); // OQ-32
    }
    for (const bu of BUSINESS_UNITS) {
      const opt = await read((r) => r.systemOptions.resolve('ACCT_EMPLOYEE_LIABILITY', bu));
      expect(opt?.optionValue.startsWith(`${bu}.`)).toBe(true);
    }
  });

  it('contains the edge cases the tests and demos need', async () => {
    const employees = await read((r) => r.employees.list());
    const byNumber = (n: string) => employees.find((e) => e.personNumber === n)!;
    expect(byNumber('1014').payeeOk).toBe('N'); // FR-SET-02
    expect(byNumber('1016').supervisorId).toBeNull(); // FR-APR-08
    expect(byNumber('1017').active).toBe('N');
    expect(byNumber('1001').supervisorId).toBeNull(); // CEO → D-37 chain
    const qp = await read((r) => r.quickPays.getByFusionKey(300000040003, 300000041003));
    expect((await read((r) => r.quickPayInvoices.getByQuickPay(qp!.quickPayId)))?.status).toBe(
      'PAID',
    );
    expect(
      (await read((r) => r.rates.findLatest('EUR', 'Corporate', '2026-10-18')))?.rateDate,
    ).toBe('2026-10-05');
  });

  it('refuses to seed a store that already has data', async () => {
    await expect(seedDatabase(data)).rejects.toThrow(/not empty/);
  });
});
