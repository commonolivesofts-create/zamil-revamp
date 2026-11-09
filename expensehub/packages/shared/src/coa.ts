// Implements: D-12 / FR-CAP-08 — the 6-segment charge account
// Company.Location.CostCenter.Account.000.000000, e.g. IPP.003.127.55251.000.000000.
import { COA_SEGMENTS, type CoaSegment } from './reference';

export interface AccountSegments {
  COMPANY: string;
  LOCATION: string;
  COST_CENTER: string;
  ACCOUNT: string;
  SEGMENT5: string;
  SEGMENT6: string;
}

export function parseAccount(combination: string): AccountSegments | null {
  const parts = combination.trim().split('.');
  if (parts.length !== COA_SEGMENTS.length || parts.some((p) => p === '')) return null;
  return Object.fromEntries(
    COA_SEGMENTS.map((s, i) => [s, parts[i]]),
  ) as unknown as AccountSegments;
}

export function formatAccount(segments: AccountSegments): string {
  return COA_SEGMENTS.map((s) => segments[s]).join('.');
}

/** OQ-14 proposal defaults for segments 5 and 6. */
export const DEFAULT_SEGMENT5 = '000';
export const DEFAULT_SEGMENT6 = '000000';

/**
 * OQ-14 proposal: Company, Location and Cost centre come from the employee's default expense
 * account (HCM, INT-03); the expense type supplies the natural account; the employee may
 * override the cost centre on the line (DRD EH_EXPENSES.cost_center).
 */
export function buildChargeAccount(input: {
  defaultAccount: string | null;
  naturalAccount: string;
  costCenterOverride?: string | null;
}): AccountSegments | null {
  const base = input.defaultAccount ? parseAccount(input.defaultAccount) : null;
  if (!base) return null;
  return {
    ...base,
    COST_CENTER: input.costCenterOverride?.trim() || base.COST_CENTER,
    ACCOUNT: input.naturalAccount,
    SEGMENT5: base.SEGMENT5 || DEFAULT_SEGMENT5,
    SEGMENT6: base.SEGMENT6 || DEFAULT_SEGMENT6,
  };
}

export function segmentList(account: AccountSegments): { segment: CoaSegment; value: string }[] {
  return COA_SEGMENTS.map((segment) => ({ segment, value: account[segment] }));
}
