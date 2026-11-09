import { deriveCapabilities, type RoleGrant } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import { employee } from '../data/contract/builders';
import type { AuthContext } from './context';
import { canActOnStep, canViewReceipt, canViewReport, financeBusinessUnits, hasRole } from './rbac';

function auth(personId: number, roles: RoleGrant[] = [], isLineManager = false): AuthContext {
  return {
    userId: personId,
    personId,
    employee: employee(personId),
    roles,
    isLineManager,
    capabilities: deriveCapabilities(roles, isLineManager),
    passwordFingerprint: 'x',
  };
}

const noSteps: [] = [];
const step = (
  assignedTo: number,
  extra: Partial<{ actedBy: number; originalAssignee: number }> = {},
) => ({
  assignedTo,
  actedBy: extra.actedBy ?? null,
  originalAssignee: extra.originalAssignee ?? null,
});

describe('hasRole / financeBusinessUnits', () => {
  const accountant = auth(5, [
    { role: 'ACCOUNTANT', businessUnit: 'IPP', isBackup: false },
    { role: 'ACCOUNTANT', businessUnit: 'APP', isBackup: false },
  ]);

  it('matches a BU grant, and a null grant covers every BU', () => {
    expect(hasRole(accountant, 'ACCOUNTANT', 'IPP')).toBe(true);
    expect(hasRole(accountant, 'ACCOUNTANT', 'FPP')).toBe(false);
    expect(hasRole(accountant, 'ACCOUNTANT')).toBe(true);
    const ap = auth(7, [{ role: 'FINANCE_AP', businessUnit: null, isBackup: false }]);
    expect(hasRole(ap, 'FINANCE_AP', 'FPP')).toBe(true);
    expect(financeBusinessUnits(ap)).toEqual(['IPP', 'FPP', 'APP']);
  });

  it('derives Finance BUs from FINANCE_AP / ACCOUNTANT only', () => {
    expect(financeBusinessUnits(accountant)).toEqual(['IPP', 'APP']);
    expect(
      financeBusinessUnits(auth(9, [{ role: 'SYS_ADMIN', businessUnit: null, isBackup: false }])),
    ).toEqual([]);
  });
});

describe('canViewReport (API §1: Own, step assignee past/current, Fin for the BU)', () => {
  const report = { personId: 11, businessUnit: 'IPP' as const };

  it('allows the claimant', () => {
    expect(canViewReport(auth(11), report, noSteps)).toBe(true);
  });

  it('allows current, past and original step assignees', () => {
    expect(canViewReport(auth(10), report, [step(10)])).toBe(true);
    expect(canViewReport(auth(3), report, [step(4, { actedBy: 3 })])).toBe(true);
    expect(canViewReport(auth(2), report, [step(4, { originalAssignee: 2 })])).toBe(true);
  });

  it('allows Finance only for their BUs', () => {
    const fppAcct = auth(6, [{ role: 'ACCOUNTANT', businessUnit: 'FPP', isBackup: false }]);
    expect(canViewReport(fppAcct, report, noSteps)).toBe(false);
    expect(canViewReport(fppAcct, { ...report, businessUnit: 'FPP' }, noSteps)).toBe(true);
  });

  it('denies everyone else, including admins and other line managers', () => {
    expect(canViewReport(auth(12), report, [step(10)])).toBe(false);
    expect(
      canViewReport(
        auth(9, [{ role: 'SYS_ADMIN', businessUnit: null, isBackup: false }]),
        report,
        noSteps,
      ),
    ).toBe(false);
    expect(canViewReport(auth(13, [], true), report, noSteps)).toBe(false);
  });
});

describe('canActOnStep / canViewReceipt', () => {
  it('lets only the assignee act, and only while PENDING', () => {
    expect(canActOnStep(auth(10), { status: 'PENDING', assignedTo: 10 })).toBe(true);
    expect(canActOnStep(auth(10), { status: 'WAITING', assignedTo: 10 })).toBe(false);
    expect(canActOnStep(auth(3), { status: 'PENDING', assignedTo: 10 })).toBe(false);
  });

  it('shows a receipt to its owner or to someone who may view its report', () => {
    const receipt = { personId: 11 };
    expect(canViewReceipt(auth(11), receipt)).toBe(true);
    expect(canViewReceipt(auth(10), receipt)).toBe(false);
    expect(
      canViewReceipt(auth(10), receipt, { personId: 11, businessUnit: 'IPP' }, [step(10)]),
    ).toBe(true);
  });
});
