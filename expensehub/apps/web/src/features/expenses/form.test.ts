import type { ReceiptUploadResponse } from '@expensehub/shared';
import { describe, expect, it } from 'vitest';
import { emptyForm, prefillFromReceipt, toExpenseInput, trimRate } from './form';

const upload = (over: Partial<ReceiptUploadResponse> = {}): ReceiptUploadResponse => ({
  receiptId: 5,
  originalName: 'albaik.png',
  mime: 'image/png',
  sizeBytes: 1000,
  url: '/api/v1/receipts/5/file',
  qr: {
    found: true,
    valid: true,
    fields: {
      sellerName: 'Al Baik Restaurant',
      vatNumber: '300055184400003',
      timestamp: '2026-10-12T13:25:00Z',
      total: '115.00',
      vat: '15.00',
    },
    errors: [],
  },
  ocr: { engine: 'none', fields: { merchant: null, date: null, total: null, vat: null } },
  duplicate: false,
  ...over,
});

describe('receipt prefill (FR-CAP-03/04)', () => {
  it('fills merchant, Riyadh date and SAR total from a valid ZATCA QR', () => {
    const { values, filled } = prefillFromReceipt(emptyForm('2026-10-18'), upload());
    expect(values).toEqual({
      merchant: 'Al Baik Restaurant',
      expenseDate: '2026-10-12',
      amount: '115.00',
      currency: 'SAR',
      taxInvoice: true,
    });
    expect(filled).toEqual(['merchant', 'expenseDate', 'amount']);
  });

  it('falls back to OCR and never overwrites what the user typed', () => {
    const current = { ...emptyForm('2026-10-18'), amount: '50' };
    const { values, filled } = prefillFromReceipt(
      current,
      upload({
        qr: { found: false, valid: false, fields: null, errors: [] },
        ocr: {
          engine: 'tesseract',
          fields: { merchant: 'CAREEM TAXI', date: '2026-10-14', total: '48.00', vat: null },
        },
      }),
    );
    expect(values).toEqual({ merchant: 'CAREEM TAXI', expenseDate: '2026-10-14' });
    expect(filled).toEqual(['merchant', 'expenseDate']);
  });
});

describe('form → API input', () => {
  const base = { ...emptyForm('2026-10-18'), typeId: 1, merchant: ' Al Baik ', amount: '1,150' };

  it('trims, strips thousands separators and drops fields the category does not use', () => {
    const { input } = toExpenseInput({ ...base, quantity: '12' }, 'STANDARD', 9);
    expect(input).toMatchObject({
      merchant: 'Al Baik',
      amount: '1150',
      quantity: null,
      receiptId: 9,
    });
    const mileage = toExpenseInput({ ...base, quantity: '123.5' }, 'MILEAGE', null).input;
    expect(mileage).toMatchObject({
      merchant: null,
      amount: null,
      quantity: '123.5',
      currency: 'SAR',
      taxInvoice: false,
    });
  });

  it('reports contract errors instead of an input', () => {
    const { input, issues } = toExpenseInput({ ...base, amount: '12.345' }, 'STANDARD', null);
    expect(input).toBeNull();
    expect(issues[0]).toMatchObject({ path: 'amount' });
  });

  it('waits for an expense type', () => {
    expect(toExpenseInput(emptyForm(), undefined, null)).toEqual({ input: null, issues: [] });
  });
});

it.each([
  ['0.7500', '0.75'],
  ['400.00', '400.00'],
  ['0.1250', '0.125'],
])('trimRate(%s) = %s', (rate, shown) => {
  expect(trimRate(rate)).toBe(shown);
});
