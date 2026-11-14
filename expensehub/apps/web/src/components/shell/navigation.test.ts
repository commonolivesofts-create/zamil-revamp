import type { Capability } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import { visibleNav } from './navigation';

const ids = (capabilities: Capability[], dev = false) =>
  visibleNav({ capabilities }, dev).map((i) => i.id);

describe('menu by role (UI-UX §3)', () => {
  it('gives every employee their own claims only', () => {
    expect(ids(['EMPLOYEE'])).toEqual(['home', 'expenses', 'reports', 'status']);
  });

  it('adds the approval inbox for line managers', () => {
    expect(ids(['EMPLOYEE', 'LINE_MANAGER'])).toContain('approvals');
  });

  it('gives the accountant approvals, audit and the Finance admin views', () => {
    expect(ids(['EMPLOYEE', 'ACCOUNTANT'])).toEqual([
      'home',
      'expenses',
      'reports',
      'status',
      'approvals',
      'audit',
      'prerequisites',
      'integrations',
    ]);
  });

  it('gives Finance AP payables and Quick Pays but no approval inbox', () => {
    const menu = ids(['EMPLOYEE', 'FINANCE_AP']);
    expect(menu).toEqual(expect.arrayContaining(['payables', 'quickPays', 'prerequisites']));
    expect(menu).not.toContain('approvals');
    expect(menu).not.toContain('setup');
  });

  it('gives the system admin setup and system status', () => {
    const menu = ids(['EMPLOYEE', 'SYS_ADMIN']);
    expect(menu).toEqual(
      expect.arrayContaining(['setup', 'prerequisites', 'integrations', 'systemStatus']),
    );
    expect(menu).not.toContain('payables');
  });

  it('shows dev mail only when dev tools are on (D-33)', () => {
    expect(ids(['EMPLOYEE'])).not.toContain('mail');
    expect(ids(['EMPLOYEE'], true)).toContain('mail');
  });
});
