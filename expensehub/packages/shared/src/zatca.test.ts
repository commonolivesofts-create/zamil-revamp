import { describe, expect, it } from 'vitest';
import { decodeZatcaQr, encodeZatcaQr, type ZatcaFields } from './zatca';

const NOW = new Date('2026-10-18T12:00:00Z');
const good: ZatcaFields = {
  sellerName: 'مطاعم البيك Al Baik',
  vatNumber: '300055184400003',
  timestamp: '2026-10-12T13:25:00Z',
  total: '115.00',
  vat: '15.00',
};

describe('ZATCA QR (FR-CAP-04, OQ-24)', () => {
  it('round-trips the five phase-1 tags, Arabic included', () => {
    const result = decodeZatcaQr(encodeZatcaQr(good), NOW);
    expect(result).toMatchObject({
      decoded: true,
      valid: true,
      fields: good,
      hasSignature: false,
      errors: [],
    });
  });

  it('decodes a known reference payload', () => {
    // Seller "Bobs Records", VAT 310122393500003, 2022-04-25T15:30:00Z, total 1000.00, VAT 150.00
    const payload =
      'AQxCb2JzIFJlY29yZHMCDzMxMDEyMjM5MzUwMDAwMwMUMjAyMi0wNC0yNVQxNTozMDowMFoEBzEwMDAuMDAFBjE1MC4wMA==';
    const result = decodeZatcaQr(payload, NOW);
    expect(result.fields).toEqual({
      sellerName: 'Bobs Records',
      vatNumber: '310122393500003',
      timestamp: '2022-04-25T15:30:00Z',
      total: '1000.00',
      vat: '150.00',
    });
    expect(result.valid).toBe(false); // 150 is 15 % of 1000, not 15/115 of a VAT-inclusive total
    expect(result.errors).toEqual(['VAT does not match 15% of the invoice total']);
  });

  it.each([
    [{ vatNumber: '300055184400004' }, 'Seller VAT number'],
    [{ vatNumber: '12345' }, 'Seller VAT number'],
    [{ vat: '20.00' }, 'VAT does not match'],
    [{ total: 'abc' }, 'Invoice total'],
    [{ timestamp: '2027-01-01T00:00:00Z' }, 'in the future'],
    [{ timestamp: 'yesterday' }, 'Invoice date'],
  ] as const)('flags %j', (patch, error) => {
    const result = decodeZatcaQr(encodeZatcaQr({ ...good, ...patch }), NOW);
    expect(result.decoded).toBe(true);
    expect(result.valid).toBe(false);
    expect(result.errors.join(' ')).toContain(error);
  });

  it('tolerates ± SAR 0.05 on the VAT', () => {
    expect(decodeZatcaQr(encodeZatcaQr({ ...good, vat: '15.04' }), NOW).valid).toBe(true);
    expect(decodeZatcaQr(encodeZatcaQr({ ...good, vat: '15.06' }), NOW).valid).toBe(false);
  });

  it('is not fooled by other QR codes', () => {
    for (const text of ['https://example.com', 'hello world', '', 'AAAA']) {
      expect(decodeZatcaQr(text, NOW)).toMatchObject({ decoded: false, valid: false });
    }
  });
});
