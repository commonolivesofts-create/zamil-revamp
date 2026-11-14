// Implements: FR-ACC-01 accounting preview (D-06: Fusion creates the accounting; this is only
// what we expect it to book) and FR-AUD-04 VAT on adjusted lines. Exact integer halalas.
import { roundDiv } from './calc';
import { halalas, sumSar, type Halalas } from './money';

/**
 * Recoverable VAT on a line after audit: proportional to the approved share of the claimed
 * amount (FR-AUD-04 keeps the original); a disallowed line recovers nothing.
 */
export function effectiveVat(vat: Halalas, approved: Halalas, claimed: Halalas): Halalas {
  if (approved >= claimed || claimed <= 0) return vat;
  if (approved <= 0) return halalas(0);
  return halalas(Number(roundDiv(BigInt(vat) * BigInt(approved), BigInt(claimed))));
}

export interface JournalSourceLine {
  chargeAccount: string;
  claimedSar: Halalas;
  approvedSar: Halalas;
  vatSar: Halalas;
  source: 'CASH' | 'CARD';
}

export interface JournalAccounts {
  inputVat: string;
  employeeLiability: string;
  advanceClearing: string;
  cardPayable: string;
}

export const JOURNAL_KINDS = [
  'EXPENSE',
  'INPUT_VAT',
  'EMPLOYEE_LIABILITY',
  'ADVANCE_CLEARING',
  'CARD_PAYABLE',
] as const;
export type JournalKind = (typeof JOURNAL_KINDS)[number];

export interface JournalLine {
  side: 'DR' | 'CR';
  kind: JournalKind;
  account: string;
  amountSar: Halalas;
}

export interface JournalPreview {
  lines: JournalLine[];
  totalDr: Halalas;
  totalCr: Halalas;
  balanced: boolean;
}

/**
 * FR-ACC-01: Dr expense (net of VAT) per charge account · Dr input VAT · Cr employee liability
 * (net payable) · Cr advance clearing · Cr card issuer payable. Zero lines are left out.
 */
export function accountingPreview(
  source: readonly JournalSourceLine[],
  advanceAppliedSar: Halalas,
  accounts: JournalAccounts,
): JournalPreview {
  const expense = new Map<string, number>();
  let vat = 0;
  let cash = 0;
  let card = 0;
  for (const line of source) {
    const lineVat = effectiveVat(line.vatSar, line.approvedSar, line.claimedSar);
    vat += lineVat;
    expense.set(
      line.chargeAccount,
      (expense.get(line.chargeAccount) ?? 0) + line.approvedSar - lineVat,
    );
    if (line.source === 'CARD') card += line.approvedSar;
    else cash += line.approvedSar;
  }

  const lines: JournalLine[] = [];
  const add = (side: JournalLine['side'], kind: JournalKind, account: string, amount: number) => {
    if (amount !== 0) lines.push({ side, kind, account, amountSar: halalas(amount) });
  };
  for (const [account, amount] of [...expense].sort(([a], [b]) => a.localeCompare(b))) {
    add('DR', 'EXPENSE', account, amount);
  }
  add('DR', 'INPUT_VAT', accounts.inputVat, vat);
  add('CR', 'EMPLOYEE_LIABILITY', accounts.employeeLiability, cash - advanceAppliedSar);
  add('CR', 'ADVANCE_CLEARING', accounts.advanceClearing, advanceAppliedSar);
  add('CR', 'CARD_PAYABLE', accounts.cardPayable, card);

  const totalDr = sumSar(lines.filter((l) => l.side === 'DR').map((l) => l.amountSar));
  const totalCr = sumSar(lines.filter((l) => l.side === 'CR').map((l) => l.amountSar));
  return { lines, totalDr, totalCr, balanced: totalDr === totalCr };
}
