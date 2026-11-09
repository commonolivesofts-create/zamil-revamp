import { describe, expect, it } from 'vitest';
import {
  REPORT_STATUSES,
  REPORT_TRANSITIONS,
  STATUS_MACHINES,
  canTransition,
  isTerminal,
} from './status';

describe('status machines', () => {
  it('only point at statuses that exist', () => {
    for (const [kind, machine] of Object.entries(STATUS_MACHINES)) {
      const statuses = Object.keys(machine);
      for (const [from, targets] of Object.entries(machine)) {
        for (const to of targets as readonly string[]) {
          expect(statuses, `${kind}: ${from} → ${to}`).toContain(to);
        }
      }
    }
  });

  it('define every report status', () => {
    expect(Object.keys(REPORT_TRANSITIONS).sort()).toEqual([...REPORT_STATUSES].sort());
  });

  it.each([
    ['DRAFT', 'PENDING_APPROVAL'],
    ['PENDING_APPROVAL', 'DRAFT'], // withdraw (FR-REP-05)
    ['PENDING_APPROVAL', 'REJECTED'],
    ['PENDING_AUDIT', 'READY_FOR_PAYMENT'],
    ['READY_FOR_PAYMENT', 'INVOICED'],
    ['READY_FOR_PAYMENT', 'SETTLED'],
    ['INVOICED', 'PAID'],
    ['INVOICED', 'READY_FOR_PAYMENT'], // cancelled in Fusion (OQ-18)
    ['PAID', 'INVOICED'], // payment voided
    ['REJECTED', 'DRAFT'], // correct (FR-REP-04)
  ] as const)('allows report %s → %s', (from, to) => {
    expect(canTransition('REPORT', from, to)).toBe(true);
  });

  it.each([
    ['DRAFT', 'PAID'],
    ['DRAFT', 'READY_FOR_PAYMENT'],
    ['REJECTED', 'PENDING_APPROVAL'], // must go back to DRAFT first
    ['PENDING_AUDIT', 'DRAFT'], // no withdraw once approved
    ['READY_FOR_PAYMENT', 'PAID'], // only Fusion pays, via INVOICED
    ['SETTLED', 'DRAFT'],
  ] as const)('refuses report %s → %s', (from, to) => {
    expect(canTransition('REPORT', from, to)).toBe(false);
  });

  it('treats decided approval steps as final', () => {
    expect(isTerminal('APPROVAL_STEP', 'APPROVED')).toBe(true);
    expect(canTransition('APPROVAL_STEP', 'APPROVED', 'REJECTED')).toBe(false);
    expect(canTransition('APPROVAL_STEP', 'PENDING', 'APPROVED')).toBe(true);
  });

  it('never re-opens an excluded Quick Pay', () => {
    expect(isTerminal('QUICK_PAY_INVOICE', 'EXCLUDED')).toBe(true);
  });
});
