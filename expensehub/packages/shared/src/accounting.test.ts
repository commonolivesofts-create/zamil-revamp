import { describe, expect, it } from 'vitest';
import { accountingPreview, effectiveVat } from './accounting';
import { parseSar } from './money';

const sar = parseSar;
const ACCOUNTS = {
  inputVat: 'IPP.001.110.13410.000.000000',
  employeeLiability: 'IPP.001.110.21510.000.000000',
  advanceClearing: 'IPP.001.110.14210.000.000000',
  cardPayable: 'IPP.001.110.21520.000.000000',
};
const MEALS = 'IPP.003.127.55210.000.000000';
const AIR = 'IPP.003.127.55220.000.000000';

describe('effectiveVat (FR-AUD-04)', () => {
  it('keeps VAT when nothing is cut, scales it when reduced, drops it when disallowed', () => {
    expect(effectiveVat(sar('15'), sar('115'), sar('115'))).toBe(sar('15'));
    expect(effectiveVat(sar('15'), sar('57.50'), sar('115'))).toBe(sar('7.50'));
    expect(effectiveVat(sar('15'), sar('100'), sar('115'))).toBe(sar('13.04')); // 13.0434… half-up
    expect(effectiveVat(sar('15'), sar('0'), sar('115'))).toBe(sar('0'));
  });
});

describe('accountingPreview (FR-ACC-01)', () => {
  it('debits expense net of VAT per account and VAT; credits the employee; balances', () => {
    const p = accountingPreview(
      [
        {
          chargeAccount: MEALS,
          claimedSar: sar('115'),
          approvedSar: sar('115'),
          vatSar: sar('15'),
          source: 'CASH',
        },
        {
          chargeAccount: MEALS,
          claimedSar: sar('50'),
          approvedSar: sar('50'),
          vatSar: sar('0'),
          source: 'CASH',
        },
        {
          chargeAccount: AIR,
          claimedSar: sar('1000'),
          approvedSar: sar('800'),
          vatSar: sar('0'),
          source: 'CASH',
        },
      ],
      sar('0'),
      ACCOUNTS,
    );
    expect(p.lines).toEqual([
      { side: 'DR', kind: 'EXPENSE', account: MEALS, amountSar: sar('150') },
      { side: 'DR', kind: 'EXPENSE', account: AIR, amountSar: sar('800') },
      { side: 'DR', kind: 'INPUT_VAT', account: ACCOUNTS.inputVat, amountSar: sar('15') },
      {
        side: 'CR',
        kind: 'EMPLOYEE_LIABILITY',
        account: ACCOUNTS.employeeLiability,
        amountSar: sar('965'),
      },
    ]);
    expect(p).toMatchObject({ totalDr: sar('965'), totalCr: sar('965'), balanced: true });
  });

  it('splits advance netting and card lines (phases 2–3) and stays balanced', () => {
    const p = accountingPreview(
      [
        {
          chargeAccount: MEALS,
          claimedSar: sar('100'),
          approvedSar: sar('100'),
          vatSar: sar('13.04'),
          source: 'CASH',
        },
        {
          chargeAccount: AIR,
          claimedSar: sar('400'),
          approvedSar: sar('400'),
          vatSar: sar('0'),
          source: 'CARD',
        },
      ],
      sar('60'),
      ACCOUNTS,
    );
    expect(p.lines.filter((l) => l.side === 'CR').map((l) => [l.kind, l.amountSar])).toEqual([
      ['EMPLOYEE_LIABILITY', sar('40')],
      ['ADVANCE_CLEARING', sar('60')],
      ['CARD_PAYABLE', sar('400')],
    ]);
    expect(p.balanced).toBe(true);
  });

  it('a fully disallowed report books nothing', () => {
    const p = accountingPreview(
      [
        {
          chargeAccount: MEALS,
          claimedSar: sar('115'),
          approvedSar: sar('0'),
          vatSar: sar('15'),
          source: 'CASH',
        },
      ],
      sar('0'),
      ACCOUNTS,
    );
    expect(p).toEqual({ lines: [], totalDr: 0, totalCr: 0, balanced: true });
  });
});
