import { describe, expect, it } from 'vitest';
import { deriveCapabilities, hasAnyCapability, isApprover } from './access';
import { passwordSchema } from './schemas/auth';

describe('deriveCapabilities', () => {
  it('always includes EMPLOYEE and keeps a stable order', () => {
    expect(deriveCapabilities([], false)).toEqual(['EMPLOYEE']);
    expect(
      deriveCapabilities(
        [{ role: 'SYS_ADMIN' }, { role: 'ACCOUNTANT' }, { role: 'ACCOUNTANT' }],
        true,
      ),
    ).toEqual(['EMPLOYEE', 'LINE_MANAGER', 'ACCOUNTANT', 'SYS_ADMIN']);
  });

  it('treats line managers and approval-step roles as approvers', () => {
    expect(isApprover(['EMPLOYEE'])).toBe(false);
    expect(isApprover(['EMPLOYEE', 'LINE_MANAGER'])).toBe(true);
    expect(isApprover(['EMPLOYEE', 'APPROVER_HR'])).toBe(true);
    expect(isApprover(['EMPLOYEE', 'FINANCE_AP'])).toBe(false);
    expect(hasAnyCapability(['EMPLOYEE', 'FINANCE_AP'], ['FINANCE_AP', 'SYS_ADMIN'])).toBe(true);
  });
});

describe('passwordSchema', () => {
  it.each(['short1', 'onlyletterslong', '1234567890'])('rejects "%s"', (pw) => {
    expect(passwordSchema.safeParse(pw).success).toBe(false);
  });

  it('accepts 10+ characters with a letter and a number', () => {
    expect(passwordSchema.safeParse('ExpenseHub2026').success).toBe(true);
  });
});
