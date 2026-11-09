import { parseSar } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import {
  buildQuickPayInvoice,
  buildReportInvoice,
  linesTotal,
  mapInvoiceStatus,
  type FusionInvoice,
  type ReportInvoiceLine,
} from './invoices';

const sar = parseSar;
const OPTIONS = {
  businessUnit: 'IPP BU',
  invoiceType: 'Standard',
  invoiceSource: 'EXPENSEHUB',
  paymentMethod: 'EFT',
  payGroup: 'EMPLOYEES',
  paymentTerms: 'Immediate',
  taxClassificationCode: 'VAT 15% STANDARD',
};
const SUPPLIER = { name: 'Ahmed Al-Subaie', number: '1011', site: 'IPP-DMM' };
const line = (over: Partial<ReportInvoiceLine>): ReportInvoiceLine => ({
  expenseDate: '2026-10-12',
  typeName: 'Meals & entertainment',
  merchant: 'Al Baik',
  chargeAccount: 'IPP.003.127.55210.000.000000',
  claimedSar: sar('115'),
  approvedSar: sar('115'),
  vatSar: sar('15'),
  source: 'CASH',
  ...over,
});

describe('INT-08 report invoice payload (INTEGRATION §5.3)', () => {
  it('one net-of-VAT line per approved cash line; invoice number = report number', () => {
    const p = buildReportInvoice({
      reportNumber: 'EH-IPP-2026-000123',
      purpose: 'Client visit Riyadh',
      invoiceDate: '2026-10-20',
      netPayableSar: sar('1115'),
      advanceAppliedSar: sar('0'),
      lines: [
        line({}),
        line({
          typeName: 'Airfare',
          merchant: 'Saudia',
          chargeAccount: 'IPP.003.127.55230.000.000000',
          claimedSar: sar('1200'),
          approvedSar: sar('1000'),
          vatSar: sar('0'),
        }),
        line({ approvedSar: sar('0'), merchant: 'Disallowed' }),
        line({ source: 'CARD', merchant: 'Card line' }),
      ],
      supplier: SUPPLIER,
      options: OPTIONS,
    });
    expect(p).toMatchObject({
      InvoiceNumber: 'EH-IPP-2026-000123',
      InvoiceAmount: 1115,
      InvoiceCurrency: 'SAR',
      SupplierNumber: '1011',
      SupplierSite: 'IPP-DMM',
      BusinessUnit: 'IPP BU',
      Description: 'Expense report EH-IPP-2026-000123 – Client visit Riyadh',
      PaymentMethodCode: 'EFT',
      PayGroup: 'EMPLOYEES', // D-42
      PaymentTerms: 'Immediate',
    });
    expect(p.invoiceDff).toBeUndefined(); // no FUSION_INVOICE_DFF in these options
    const withDff = buildReportInvoice({
      reportNumber: 'EH-IPP-2026-000123',
      purpose: 'x',
      invoiceDate: '2026-10-20',
      netPayableSar: sar('1000'),
      advanceAppliedSar: sar('0'),
      lines: [line({ approvedSar: sar('1000'), claimedSar: sar('1000'), vatSar: sar('0') })],
      supplier: SUPPLIER,
      options: {
        ...OPTIONS,
        invoiceDff: { rirNumber: '{invoiceNumber}', rirDate: '{invoiceDate}' },
      },
    });
    expect(withDff.invoiceDff).toEqual({ rirNumber: 'EH-IPP-2026-000123', rirDate: '2026-10-20' }); // D-57
    expect(p.invoiceLines).toEqual([
      {
        LineNumber: 1,
        LineType: 'Item',
        LineAmount: 100,
        Description: '2026-10-12 Meals & entertainment – Al Baik (VAT recoverable 15.00)',
        DistributionCombination: 'IPP.003.127.55210.000.000000',
        TaxClassificationCode: 'VAT 15% STANDARD',
      },
      {
        LineNumber: 2,
        LineType: 'Item',
        LineAmount: 1000,
        Description: '2026-10-12 Airfare – Saudia',
        DistributionCombination: 'IPP.003.127.55230.000.000000',
      },
    ]);
    // Σ net (1,100) + VAT Fusion adds (15) = InvoiceAmount.
    expect(linesTotal(p)).toBe(sar('1100'));
  });

  it('pro-rates VAT on an audited line and keeps exact cents', () => {
    const p = buildReportInvoice({
      reportNumber: 'EH-IPP-2026-000124',
      purpose: 'Lunch',
      invoiceDate: '2026-10-20',
      netPayableSar: sar('57.50'),
      advanceAppliedSar: sar('0'),
      lines: [line({ approvedSar: sar('57.50') })],
      supplier: SUPPLIER,
      options: OPTIONS,
    });
    expect(p.invoiceLines[0]).toMatchObject({
      LineAmount: 50,
      Description: expect.stringContaining('VAT recoverable 7.50'),
    });
  });

  it('D-41: with no recoverable VAT every line goes gross, with no tax code', () => {
    const p = buildReportInvoice({
      reportNumber: 'EH-IPP-2026-000126',
      purpose: 'Lunch',
      invoiceDate: '2026-10-20',
      netPayableSar: sar('115'),
      advanceAppliedSar: sar('0'),
      lines: [line({ vatSar: sar('0') })],
      supplier: SUPPLIER,
      options: OPTIONS,
    });
    expect(p.invoiceLines).toEqual([
      {
        LineNumber: 1,
        LineType: 'Item',
        LineAmount: 115,
        Description: '2026-10-12 Meals & entertainment – Al Baik',
        DistributionCombination: 'IPP.003.127.55210.000.000000',
      },
    ]);
    expect(linesTotal(p)).toBe(sar('115'));
  });

  it('refuses a payload that does not add up to the net payable', () => {
    expect(() =>
      buildReportInvoice({
        reportNumber: 'EH-IPP-2026-000125',
        purpose: 'x',
        invoiceDate: '2026-10-20',
        netPayableSar: sar('999'),
        advanceAppliedSar: sar('0'),
        lines: [line({})],
        supplier: SUPPLIER,
        options: OPTIONS,
      }),
    ).toThrow(/do not add up/);
  });
});

describe('INT-08 Quick Pay invoice (INTEGRATION §5.4)', () => {
  it('one line for the pay value', () => {
    const p = buildQuickPayInvoice({
      invoiceNumber: 'QP-IPP-2026-000002',
      invoiceDate: '2026-10-20',
      elementName: 'Business Trip Allowance',
      effectiveDate: '2026-10-01',
      amountSar: sar('2400'),
      account: 'IPP.001.110.55290.000.000000',
      supplier: SUPPLIER,
      options: OPTIONS,
    });
    expect(p).toMatchObject({ InvoiceNumber: 'QP-IPP-2026-000002', InvoiceAmount: 2400 });
    expect(p.invoiceLines).toHaveLength(1);
    expect(p.invoiceLines[0]).toMatchObject({
      LineAmount: 2400,
      DistributionCombination: 'IPP.001.110.55290.000.000000',
    });
  });
});

describe('INT-09 status mapping (INTEGRATION §6)', () => {
  const invoice = (over: Partial<FusionInvoice>): FusionInvoice => ({
    InvoiceId: 1,
    InvoiceNumber: 'EH-IPP-2026-000123',
    SupplierNumber: '1011',
    InvoiceAmount: 100,
    ValidationStatus: 'Validated',
    ApprovalStatus: 'Not required',
    PaidStatus: 'Unpaid',
    CanceledFlag: false,
    AmountPaid: 0,
    ...over,
  });
  const payment = {
    invoiceId: 1,
    paymentNumber: 'PAY-2026-000777',
    paymentDate: '2026-10-21',
    status: 'NEGOTIABLE',
  };

  it.each([
    [
      'validated, unpaid → fusion_status only',
      invoice({}),
      [],
      false,
      { action: 'UPDATE', fusionStatus: 'Validated' },
    ],
    [
      'fully paid → PAID with ref and date',
      invoice({ PaidStatus: 'Paid' }),
      [payment],
      false,
      { action: 'PAID', fusionStatus: 'PAID', paymentRef: 'PAY-2026-000777', paidAt: '2026-10-21' },
    ],
    [
      'paid but no payment row yet → wait',
      invoice({ PaidStatus: 'Paid' }),
      [],
      false,
      { action: 'UPDATE', fusionStatus: 'Validated' },
    ],
    [
      'partially paid → Finance flag',
      invoice({ PaidStatus: 'Partially paid' }),
      [payment],
      false,
      { action: 'PARTIALLY_PAID', fusionStatus: 'PARTIALLY_PAID' },
    ],
    [
      'cancelled → back to ready (OQ-18)',
      invoice({ CanceledFlag: true }),
      [],
      false,
      { action: 'CANCELLED', fusionStatus: 'CANCELLED' },
    ],
    [
      'payment voided → back to invoiced',
      invoice({}),
      [{ ...payment, status: 'VOIDED' }],
      true,
      { action: 'VOIDED', fusionStatus: 'Validated' },
    ],
  ] as const)('%s', (_name, inv, payments, paidInEh, expected) => {
    expect(mapInvoiceStatus(inv, payments, paidInEh)).toEqual(expected);
  });
});
