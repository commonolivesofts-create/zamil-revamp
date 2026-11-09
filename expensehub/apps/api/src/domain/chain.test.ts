import { parseSar, type AssignableRole } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import type { ApprovalRuleRow } from '../data/entities';
import { APPROVAL_RULES } from '../data/seed/setup-data';
import { planChain, type ChainInput } from './chain';

// Seeded rules (D-49 + D-37) with ids.
const RULES = APPROVAL_RULES.map(
  (r, i) =>
    ({
      ...r,
      ruleId: i + 1,
      version: 1,
      createdAt: '',
      createdBy: null,
      updatedAt: '',
      updatedBy: null,
    }) as ApprovalRuleRow,
);
const rules = {
  STANDARD: RULES.filter((r) => r.chainCode === 'STANDARD'),
  CEO_CLAIMANT: RULES.filter((r) => r.chainCode === 'CEO_CLAIMANT'),
};

// Demo hierarchy (D-35): 1011 → 1010 (line manager) → 1001 (CEO); 1002 Finance Manager,
// 1005 Accountant (IPP).
const HOLDERS: Partial<Record<AssignableRole, number>> = {
  APPROVER_CEO: 1001,
  APPROVER_FIN_MGR: 1002,
  APPROVER_HR: 1003,
  ACCOUNTANT: 1005,
};

function input(over: Partial<ChainInput> = {}): ChainInput {
  return {
    claimant: { personId: 1011, supervisorId: 1010 },
    supervisorChain: [1010, 1001],
    claimantIsCeo: false,
    totalSar: parseSar('6000'),
    ceoThresholdSar: parseSar('5000'),
    rules,
    roleHolder: (role) => HOLDERS[role] ?? null,
    ...over,
  };
}

const route = (plan: ReturnType<typeof planChain>) =>
  plan.ok
    ? plan.steps.map((s) => `${s.stepName}:${s.status === 'SKIPPED' ? 'skip' : s.assignedTo}`)
    : plan.problem;

describe('approval chain (FR-APR-01, D-49)', () => {
  it('line-manager hierarchy up to the top → Finance Manager → Accountant', () => {
    const plan = planChain(input());
    expect(route(plan)).toEqual([
      'Line Manager:1010',
      'Line Manager · level 2:1001',
      'Finance Manager:1002',
      'Accountant:1005',
    ]);
    expect(plan.ok && plan.steps.map((s) => [s.seq, s.status])).toEqual([
      [1, 'PENDING'],
      [2, 'WAITING'],
      [3, 'WAITING'],
      [4, 'WAITING'],
    ]);
    expect(plan.ok && plan.steps.at(-1)!.isAuditStep).toBe(true);
  });

  it('the amount does not change the chain (no CEO threshold step)', () => {
    expect(route(planChain(input({ totalSar: parseSar('100') })))).toEqual(
      route(planChain(input({ totalSar: parseSar('90000') }))),
    );
  });

  it('the CEO’s own claim: Finance Manager → Accountant at any amount (D-37)', () => {
    const plan = planChain(
      input({
        claimant: { personId: 1001, supervisorId: null },
        supervisorChain: [],
        claimantIsCeo: true,
        totalSar: parseSar('90000'),
      }),
    );
    expect(plan.chain).toBe('CEO_CLAIMANT');
    expect(route(plan)).toEqual(['Finance Manager:1002', 'Accountant:1005']);
  });

  it('a role holder’s own step goes to their HCM supervisor, not the backup (D-34)', () => {
    // The Finance Manager (1002, supervisor 1001) claims.
    const plan = planChain(
      input({ claimant: { personId: 1002, supervisorId: 1001 }, supervisorChain: [1001] }),
    );
    expect(route(plan)).toEqual(['Line Manager:1001', 'Finance Manager:1001', 'Accountant:1005']);
    expect(plan.ok && plan.steps[1]!.note).toBe('SELF_APPROVAL');
  });

  it('the Accountant’s own claim is audited by their supervisor (D-34)', () => {
    const plan = planChain(
      input({ claimant: { personId: 1005, supervisorId: 1002 }, supervisorChain: [1002, 1001] }),
    );
    expect(route(plan)).toContain('Accountant:1002');
  });

  it('refuses without a line manager (FR-APR-08) or a role holder', () => {
    expect(
      route(
        planChain(input({ claimant: { personId: 1016, supervisorId: null }, supervisorChain: [] })),
      ),
    ).toEqual({ code: 'NO_SUPERVISOR' });
    expect(
      route(
        planChain(input({ roleHolder: (r) => (r === 'APPROVER_FIN_MGR' ? null : HOLDERS[r]!) })),
      ),
    ).toEqual({
      code: 'NO_ROLE_HOLDER',
      stepName: 'Finance Manager',
      role: 'APPROVER_FIN_MGR',
    });
  });

  it('still supports a single line-manager step and a "total above" step', () => {
    const custom = {
      ...rules,
      STANDARD: [
        { ...rules.STANDARD[0]!, approverSource: 'SUPERVISOR' as const },
        {
          ...rules.STANDARD[1]!,
          ruleId: 99,
          stepName: 'CEO',
          roleCode: 'APPROVER_CEO' as const,
          conditionType: 'TOTAL_GT' as const,
          conditionAmountSar: parseSar('10000'),
        },
        ...rules.STANDARD.slice(1),
      ],
    };
    expect(route(planChain(input({ rules: custom })))).toEqual([
      'Line Manager:1010',
      'CEO:skip',
      'Finance Manager:1002',
      'Accountant:1005',
    ]);
    expect(route(planChain(input({ rules: custom, totalSar: parseSar('10000.01') })))).toContain(
      'CEO:1001',
    );
  });
});
