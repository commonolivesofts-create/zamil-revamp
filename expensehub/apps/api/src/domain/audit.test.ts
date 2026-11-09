// M6 Done-when: each audit rule has a test that selects a report.
import { parseSar } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import { samplePercentile, selectForAudit, type AuditLine, type AuditRuleSetting } from './audit';

// OQ-33 proposal (seed): DUPLICATE is built but off by default.
const RULES: AuditRuleSetting[] = [
  { ruleCode: 'ANY_WARNING', paramNumber: null, active: true },
  { ruleCode: 'MISSING_RECEIPT', paramNumber: null, active: true },
  { ruleCode: 'TOTAL_GT', paramNumber: 3000, active: true },
  { ruleCode: 'RANDOM_PCT', paramNumber: 10, active: true },
  { ruleCode: 'DUPLICATE', paramNumber: null, active: false },
];
const clean: AuditLine = { receiptRequired: true, receiptAttached: true, violations: [] };

/** A report number the 10 % sample does NOT draw (so other rules are tested alone). */
const notSampled = Array.from(
  { length: 100 },
  (_, i) => `EH-IPP-2026-${String(i).padStart(6, '0')}`,
).find((k) => samplePercentile(k) >= 10)!;
const sampled = Array.from(
  { length: 200 },
  (_, i) => `EH-IPP-2026-${String(i).padStart(6, '0')}`,
).find((k) => samplePercentile(k) < 10)!;

const select = (lines: AuditLine[], total = '500', key = notSampled, rules = RULES) =>
  selectForAudit({ lines, totalSar: parseSar(total), sampleKey: key, rules });

describe('audit selection (FR-AUD-01)', () => {
  it('a clean report under SAR 3,000 that the sample skips goes straight to payment (FR-AUD-02)', () => {
    expect(select([clean])).toEqual([]);
  });

  it('ANY_WARNING: a line with a policy warning', () => {
    expect(select([{ ...clean, violations: [{ ruleCode: 'LIMIT', level: 'WARN' }] }])).toEqual([
      'ANY_WARNING',
    ]);
  });

  it('MISSING_RECEIPT: a required receipt is not attached', () => {
    expect(select([{ ...clean, receiptAttached: false }])).toEqual(['MISSING_RECEIPT']);
  });

  it('TOTAL_GT: above SAR 3,000 (not at it)', () => {
    expect(select([clean], '3000.01')).toEqual(['TOTAL_GT']);
    expect(select([clean], '3000')).toEqual([]);
  });

  it('RANDOM_PCT: about 1 in 10, always the same for the same report', () => {
    expect(select([clean], '500', sampled)).toEqual(['RANDOM_PCT']);
    expect(select([clean], '500', sampled)).toEqual(['RANDOM_PCT']);
    const drawn = Array.from({ length: 2000 }, (_, i) => `EH-FPP-2027-${i}`).filter(
      (k) => samplePercentile(k) < 10,
    );
    expect(drawn.length).toBeGreaterThan(150);
    expect(drawn.length).toBeLessThan(250);
  });

  it('DUPLICATE: selects only when the rule is switched on', () => {
    const dup: AuditLine = { ...clean, violations: [{ ruleCode: 'DUPLICATE', level: 'WARN' }] };
    const on = RULES.map((r) => (r.ruleCode === 'DUPLICATE' ? { ...r, active: true } : r));
    expect(select([dup], '500', notSampled, on)).toEqual(['ANY_WARNING', 'DUPLICATE']);
    expect(select([dup])).toEqual(['ANY_WARNING']);
  });

  it('stores every matching reason and ignores inactive rules', () => {
    const lines = [
      {
        receiptRequired: true,
        receiptAttached: false,
        violations: [{ ruleCode: 'LIMIT', level: 'WARN' as const }],
      },
    ];
    expect(select(lines, '9000')).toEqual(['ANY_WARNING', 'MISSING_RECEIPT', 'TOTAL_GT']);
    expect(
      select(
        lines,
        '9000',
        notSampled,
        RULES.map((r) => ({ ...r, active: false })),
      ),
    ).toEqual([]);
  });
});
