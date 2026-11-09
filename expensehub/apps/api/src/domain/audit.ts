// Implements: FR-AUD-01 audit selection (OQ-33 proposal: any warning, a missing required receipt,
// total > SAR 3,000, random 10 % — each configurable in EH_AUDIT_RULES; reasons are stored).
// The sample is deterministic (TRD §6): the same report always draws the same number, so a
// resubmission is not re-rolled and tests are stable.
import { createHash } from 'node:crypto';
import { parseSar, type AuditRuleCode, type Halalas } from '@expensehub/shared';

export interface AuditLine {
  receiptRequired: boolean;
  receiptAttached: boolean;
  violations: { ruleCode: string; level: 'WARN' | 'BLOCK' }[];
}

export interface AuditRuleSetting {
  ruleCode: AuditRuleCode;
  paramNumber: number | null;
  active: boolean;
}

/** 0–99 from the report number. */
export function samplePercentile(key: string): number {
  return createHash('sha256').update(key).digest().readUInt32BE(0) % 100;
}

export function selectForAudit(input: {
  lines: readonly AuditLine[];
  totalSar: Halalas;
  sampleKey: string;
  rules: readonly AuditRuleSetting[];
}): AuditRuleCode[] {
  const reasons: AuditRuleCode[] = [];
  for (const rule of input.rules) {
    if (!rule.active) continue;
    let hit = false;
    switch (rule.ruleCode) {
      case 'ANY_WARNING':
        hit = input.lines.some((l) => l.violations.some((v) => v.level === 'WARN'));
        break;
      case 'MISSING_RECEIPT':
        hit = input.lines.some((l) => l.receiptRequired && !l.receiptAttached);
        break;
      case 'TOTAL_GT':
        hit = rule.paramNumber !== null && input.totalSar > parseSar(rule.paramNumber);
        break;
      case 'RANDOM_PCT':
        hit = rule.paramNumber !== null && samplePercentile(input.sampleKey) < rule.paramNumber;
        break;
      case 'DUPLICATE':
        hit = input.lines.some((l) => l.violations.some((v) => v.ruleCode === 'DUPLICATE'));
        break;
    }
    if (hit) reasons.push(rule.ruleCode);
  }
  return reasons;
}
