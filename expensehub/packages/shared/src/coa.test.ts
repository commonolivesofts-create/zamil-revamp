import { describe, expect, it } from 'vitest';
import { buildChargeAccount, formatAccount, parseAccount } from './coa';

describe('charge account (D-12, FR-CAP-08)', () => {
  it('parses and formats the 6 segments', () => {
    const a = parseAccount('IPP.003.127.55251.000.000000');
    expect(a).toEqual({
      COMPANY: 'IPP',
      LOCATION: '003',
      COST_CENTER: '127',
      ACCOUNT: '55251',
      SEGMENT5: '000',
      SEGMENT6: '000000',
    });
    expect(formatAccount(a!)).toBe('IPP.003.127.55251.000.000000');
  });

  it.each(['IPP.003.127', 'IPP..127.55251.000.000000', ''])('rejects "%s"', (bad) => {
    expect(parseAccount(bad)).toBeNull();
  });

  it('takes company, location and cost centre from HCM and the account from the type (OQ-14)', () => {
    const a = buildChargeAccount({
      defaultAccount: 'IPP.003.127.55251.000.000000',
      naturalAccount: '55210',
    });
    expect(formatAccount(a!)).toBe('IPP.003.127.55210.000.000000');
  });

  it('lets the employee override the cost centre', () => {
    const a = buildChargeAccount({
      defaultAccount: 'FPP.002.140.55251.000.000000',
      naturalAccount: '55220',
      costCenterOverride: '125',
    });
    expect(formatAccount(a!)).toBe('FPP.002.125.55220.000.000000');
  });

  it('cannot build without a default account', () => {
    expect(buildChargeAccount({ defaultAccount: null, naturalAccount: '55210' })).toBeNull();
  });
});
