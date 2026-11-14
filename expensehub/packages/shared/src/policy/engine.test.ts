import { describe, expect, it } from 'vitest';
import { formatSar, parseSar } from '../money';
import { evaluatePolicy, type PolicyInput, type PolicyRule } from './engine';

const h = (s: string) => parseSar(s);
const account = [
  { segment: 'COMPANY', value: 'IPP', enabled: true, description: null },
  { segment: 'LOCATION', value: '003', enabled: true, description: null },
  { segment: 'COST_CENTER', value: '127', enabled: true, description: null },
  { segment: 'ACCOUNT', value: '55210', enabled: true, description: null },
  { segment: 'SEGMENT5', value: '000', enabled: true, description: null },
  { segment: 'SEGMENT6', value: '000000', enabled: true, description: null },
] as PolicyInput['account'];

function input(overrides: Partial<PolicyInput> = {}): PolicyInput {
  return {
    today: '2026-10-18',
    expenseDate: '2026-10-12',
    type: {
      name: 'Meals',
      category: 'STANDARD',
      defaultLimitSar: h('150'),
      limitAction: 'WARN',
      receiptOverSar: h('50'),
      justificationReq: false,
      attendeesReq: true,
      vatEligible: true,
      unitRateSar: null,
    },
    currency: 'SAR',
    amount: h('115.00'),
    quantity: null,
    merchant: 'Al Baik',
    description: 'Lunch with client',
    attendees: 'Ahmed, client',
    justification: null,
    taxInvoice: true,
    receipt: { attached: true, qr: { valid: true, total: h('115.00'), vat: h('15.00') } },
    trip: null,
    rate: null,
    account,
    duplicates: { sameDetails: 0, sameReceipt: 0 },
    options: { vatRatePercent: 15, rateStaleDays: 7, tripToleranceDays: 1 },
    ...overrides,
  };
}

const rule = (out: ReturnType<typeof evaluatePolicy>, name: PolicyRule) =>
  out.results.find((r) => r.rule === name);

describe('a clean SAR expense', () => {
  it('passes with VAT taken from the ZATCA QR', () => {
    const out = evaluatePolicy(input());
    expect(out.level).toBe('PASS');
    expect(formatSar(out.amountSar!)).toBe('115.00');
    expect(formatSar(out.vatSar)).toBe('15.00');
    expect(formatSar(out.netSar!)).toBe('100.00');
    expect(out.receiptRequired).toBe(true);
    expect(rule(out, 'VAT')?.message).toBe('Recoverable VAT SAR 15.00 from the ZATCA QR.');
  });
});

describe('limits (FR-POL-01/03; D-45: the expense type limit)', () => {
  it('warns over a WARN limit with the UI-UX wording', () => {
    const out = evaluatePolicy(input({ amount: h('180') }));
    expect(out.level).toBe('WARN');
    expect(rule(out, 'LIMIT')?.message).toBe(
      'Meals limit is SAR 150.00 — you entered SAR 180.00 (warning, report will be audited).',
    );
  });

  it('blocks over a BLOCK limit', () => {
    const out = evaluatePolicy(
      input({ type: { ...input().type, limitAction: 'BLOCK' }, amount: h('151') }),
    );
    expect(rule(out, 'LIMIT')?.level).toBe('BLOCK');
    expect(out.level).toBe('BLOCK');
  });

  it('passes within the limit, and has no limit check when the type has none', () => {
    expect(rule(evaluatePolicy(input({ amount: h('150') })), 'LIMIT')?.message).toBe(
      'Within the meals limit of SAR 150.00.',
    );
    const noLimit = evaluatePolicy(
      input({ amount: h('900'), type: { ...input().type, defaultLimitSar: null } }),
    );
    expect(rule(noLimit, 'LIMIT')).toBeUndefined();
  });
});

describe('receipts and VAT (FR-POL-01, FR-CAP-04/07)', () => {
  it('warns (not blocks) when a required receipt is missing — it sends the report to audit', () => {
    const out = evaluatePolicy(input({ receipt: { attached: false, qr: null } }));
    expect(rule(out, 'RECEIPT')).toMatchObject({ level: 'WARN' });
    expect(rule(out, 'VAT')).toMatchObject({
      level: 'WARN',
      message: expect.stringContaining('No ZATCA QR'),
    });
    expect(out.vatSar).toBe(0);
  });

  it('allows no VAT recovery with an invalid QR (D-22)', () => {
    const out = evaluatePolicy(
      input({ receipt: { attached: true, qr: { valid: false, total: null, vat: null } } }),
    );
    expect(out.vatSar).toBe(0);
    expect(rule(out, 'VAT')?.message).toContain('invalid');
  });

  it('calculates VAT and warns when the amount differs from the QR total', () => {
    const out = evaluatePolicy(input({ amount: h('100.00') }));
    expect(rule(out, 'QR_TOTAL')?.level).toBe('WARN');
    expect(formatSar(out.vatSar)).toBe('13.04');
  });

  it('does not recover VAT without the tax-invoice flag or on a non-eligible type', () => {
    expect(evaluatePolicy(input({ taxInvoice: false })).vatSar).toBe(0);
    expect(evaluatePolicy(input({ type: { ...input().type, vatEligible: false } })).vatSar).toBe(0);
  });

  it('needs no receipt under the threshold', () => {
    const out = evaluatePolicy(
      input({ amount: h('40'), receipt: { attached: false, qr: null }, taxInvoice: false }),
    );
    expect(out.receiptRequired).toBe(false);
    expect(rule(out, 'RECEIPT')).toBeUndefined();
  });
});

describe('foreign currency (FR-CAP-06)', () => {
  it('converts with the latest rate on or before the date', () => {
    const out = evaluatePolicy(
      input({
        currency: 'USD',
        amount: h('30.00'),
        taxInvoice: false,
        rate: { rate: '3.75000000', rateDate: '2026-10-08' },
      }),
    );
    expect(formatSar(out.amountSar!)).toBe('112.50');
    expect(out.fxRate).toBe('3.75000000');
    expect(rule(out, 'FX_RATE')?.level).toBe('PASS');
  });

  it('blocks when Fusion has no rate', () => {
    const out = evaluatePolicy(input({ currency: 'JPY', amount: h('1000'), rate: null }));
    expect(rule(out, 'FX_RATE')?.level).toBe('BLOCK');
    expect(out.amountSar).toBeNull();
  });

  it('warns when the rate is older than RATE_STALE_DAYS', () => {
    const out = evaluatePolicy(
      input({
        currency: 'EUR',
        amount: h('20'),
        taxInvoice: false,
        expenseDate: '2026-10-16',
        rate: { rate: '4.06550000', rateDate: '2026-10-05' },
      }),
    );
    expect(rule(out, 'FX_RATE')).toMatchObject({
      level: 'WARN',
      message: expect.stringContaining('11 days'),
    });
  });
});

describe('mileage (FR-CAP-05)', () => {
  const mileage = {
    ...input().type,
    name: 'Mileage',
    category: 'MILEAGE' as const,
    unitRateSar: '0.7500',
    defaultLimitSar: null,
    receiptOverSar: null,
    attendeesReq: false,
    vatEligible: false,
  };

  it('calculates mileage from km', () => {
    const out = evaluatePolicy(
      input({ type: mileage, amount: null, quantity: '123.5', merchant: null }),
    );
    expect(formatSar(out.amountSar!)).toBe('92.63');
    expect(out).toMatchObject({ quantity: '123.5', unitRateSar: '0.7500', level: 'PASS' });
  });

  it('pays mileage in SAR only', () => {
    expect(
      rule(
        evaluatePolicy(input({ type: mileage, amount: null, quantity: '10', currency: 'USD' })),
        'AMOUNT',
      )?.level,
    ).toBe('BLOCK');
  });
});

describe('required details, account, trip, duplicates', () => {
  it('blocks missing purpose, merchant, attendees and justification', () => {
    const out = evaluatePolicy(
      input({
        description: ' ',
        merchant: null,
        attendees: null,
        type: { ...input().type, justificationReq: true },
      }),
    );
    expect(rule(out, 'DETAILS')?.message).toBe('Enter the business purpose, merchant.');
    expect(rule(out, 'ATTENDEES')?.level).toBe('BLOCK');
    expect(rule(out, 'JUSTIFICATION')?.level).toBe('BLOCK');
  });

  it('blocks a future date', () => {
    expect(rule(evaluatePolicy(input({ expenseDate: '2026-10-19' })), 'DATE')?.level).toBe('BLOCK');
  });

  it('blocks an unknown or disabled segment (FR-POL-05) and a missing default account', () => {
    const bad = account!.map((s) =>
      s.segment === 'COST_CENTER' ? { ...s, value: '199', enabled: false } : s,
    );
    expect(rule(evaluatePolicy(input({ account: bad })), 'ACCOUNT')?.message).toContain(
      'cost center 199 is disabled',
    );
    expect(rule(evaluatePolicy(input({ account: null })), 'ACCOUNT')?.level).toBe('BLOCK');
  });

  it('warns outside the trip dates ± 1 day (FR-TRP-02)', () => {
    const trip = {
      startDate: '2026-10-05',
      endDate: '2026-10-08',
      days: 4,
      destination: null,
    };
    expect(rule(evaluatePolicy(input({ trip, expenseDate: '2026-10-09' })), 'TRIP')?.level).toBe(
      'PASS',
    );
    expect(rule(evaluatePolicy(input({ trip, expenseDate: '2026-10-10' })), 'TRIP')?.level).toBe(
      'WARN',
    );
  });

  it('warns on possible duplicates, never blocks (FR-CAP-10)', () => {
    const out = evaluatePolicy(input({ duplicates: { sameDetails: 1, sameReceipt: 0 } }));
    expect(rule(out, 'DUPLICATE')?.level).toBe('WARN');
    expect(out.level).toBe('WARN');
  });
});
