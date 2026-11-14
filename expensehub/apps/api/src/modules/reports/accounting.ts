// Implements: FR-ACC-01 — the journal Fusion is expected to create for a report (D-06: preview
// only, nothing is posted). Accounts come from the per-BU system options (OQ-14 proposal).
import { accountingPreview, formatSar, type AccountingPreviewDto } from '@expensehub/shared';
import type { ReportRow } from '../../data/entities';
import type { Repos } from '../../data/ports';

const OPTION_KEYS = {
  inputVat: 'ACCT_INPUT_VAT',
  employeeLiability: 'ACCT_EMPLOYEE_LIABILITY',
  advanceClearing: 'ACCT_ADVANCE_CLEARING',
  cardPayable: 'ACCT_CARD_PAYABLE',
} as const;

export async function reportAccountingPreview(
  r: Repos,
  report: ReportRow,
): Promise<AccountingPreviewDto> {
  const accounts = Object.fromEntries(
    await Promise.all(
      Object.entries(OPTION_KEYS).map(async ([k, key]) => [
        k,
        (await r.systemOptions.resolve(key, report.businessUnit))?.optionValue ?? `<${key}>`,
      ]),
    ),
  ) as Record<keyof typeof OPTION_KEYS, string>;

  const lines = await r.expenses.listByReport(report.reportId);
  const preview = accountingPreview(
    lines.map((l) => ({
      chargeAccount: l.chargeAccount,
      claimedSar: l.amountSar,
      approvedSar: l.approvedAmountSar,
      vatSar: l.vatSar,
      source: l.source,
    })),
    report.advanceAppliedSar,
    accounts,
  );

  // The natural account (segment 4) names the line, e.g. "Meals & entertainment".
  const nameOf = async (account: string) => {
    const natural = account.split('.')[3];
    return natural
      ? ((await r.coaValues.get({ segment: 'ACCOUNT', value: natural }))?.description ?? null)
      : null;
  };
  return {
    lines: await Promise.all(
      preview.lines.map(async (l) => ({
        side: l.side,
        kind: l.kind,
        account: l.account,
        accountName: await nameOf(l.account),
        amountSar: formatSar(l.amountSar),
      })),
    ),
    totalDr: formatSar(preview.totalDr),
    totalCr: formatSar(preview.totalCr),
    balanced: preview.balanced,
  };
}
