import { describe, expect, it } from 'vitest';
import { parseReceiptText } from './parse-text';

describe('OCR text → proposed fields (FR-CAP-03)', () => {
  it('reads merchant, day-first date, total and VAT', () => {
    const text = `AL BAIK RESTAURANT
Riyadh - King Fahd Road
VAT No: 300055184400003
Date: 12/10/2026 13:25
Broast meal x2 100.00
Subtotal 100.00
VAT 15% 15.00
TOTAL 115.00`;
    expect(parseReceiptText(text)).toEqual({
      merchant: 'AL BAIK RESTAURANT',
      date: '2026-10-12',
      total: '115.00',
      vat: '15.00',
    });
  });

  it('understands ISO dates, thousands separators and "amount due"', () => {
    expect(
      parseReceiptText('Hilton Riyadh\n2026-10-06\nRoom 2 nights\nAmount due 1,250.50'),
    ).toMatchObject({
      merchant: 'Hilton Riyadh',
      date: '2026-10-06',
      total: '1250.50',
      vat: null,
    });
  });

  it('falls back to the largest amount and ignores impossible dates', () => {
    expect(parseReceiptText('Shop\n31/02/2026\n12.00\n48.00')).toMatchObject({
      date: null,
      total: '48.00',
    });
  });

  it('does not mistake words containing "tax" for a tax line', () => {
    expect(parseReceiptText('CAREEM TAXI\nTrip receipt\nTOTAL SAR 48.00').merchant).toBe(
      'CAREEM TAXI',
    );
  });

  it('returns nulls for empty text', () => {
    expect(parseReceiptText('')).toEqual({ merchant: null, date: null, total: null, vat: null });
  });
});
