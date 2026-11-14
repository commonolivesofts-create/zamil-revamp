import { describe, expect, it } from 'vitest';
import { checkPrerequisites } from './prerequisites';

const ok = {
  active: 'Y' as const,
  supervisorId: 1,
  defaultExpenseAccount: 'IPP.001.110.55251.000.000000',
  payeeOk: 'Y' as const,
};

describe('checkPrerequisites (FR-SET-02)', () => {
  it('passes a fully set-up employee', () => {
    const r = checkPrerequisites(ok, { needsLineManager: true });
    expect(r.ok).toBe(true);
    expect(r.checks.map((c) => c.code)).toEqual([
      'ACTIVE_ASSIGNMENT',
      'LINE_MANAGER',
      'DEFAULT_ACCOUNT',
      'PAYEE',
    ]);
  });

  it('tells the employee who fixes each gap (FR-POL-06)', () => {
    const r = checkPrerequisites(
      { active: 'Y', supervisorId: null, defaultExpenseAccount: null, payeeOk: 'N' },
      { needsLineManager: true },
    );
    expect(r.ok).toBe(false);
    expect(r.checks.filter((c) => !c.ok).map((c) => [c.code, c.contact])).toEqual([
      ['LINE_MANAGER', 'HR'],
      ['DEFAULT_ACCOUNT', 'HR'],
      ['PAYEE', 'FINANCE'],
    ]);
  });

  it('does not need a line manager on the CEO chain (D-37)', () => {
    expect(checkPrerequisites({ ...ok, supervisorId: null }, { needsLineManager: false }).ok).toBe(
      true,
    );
  });
});
