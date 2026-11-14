import { describe, expect, it } from 'vitest';
import {
  convertToSar,
  multiplyHalalas,
  multiplyRate,
  parseDecimal,
  roundDiv,
  vatFromGross,
} from './calc';
import { formatSar, parseSar } from './money';

const h = (s: string) => parseSar(s);

describe('roundDiv (half-up, away from zero)', () => {
  it.each([
    [5n, 2n, 3n],
    [4n, 2n, 2n],
    [7n, 3n, 2n],
    [-5n, 2n, -3n],
    [1n, 3n, 0n],
  ])('%s / %s = %s', (n, d, q) => {
    expect(roundDiv(n, d)).toBe(q);
  });
});

describe('parseDecimal', () => {
  it('scales exactly', () => {
    expect(parseDecimal('3.75', 8)).toBe(375_000_000n);
    expect(parseDecimal('0.04463', 8)).toBe(4_463_000n);
    expect(parseDecimal('3.750000000', 8)).toBe(375_000_000n);
  });
  it('rejects real extra precision', () => {
    expect(() => parseDecimal('1.123', 2)).toThrow(RangeError);
  });
});

describe('FX (FR-CAP-06)', () => {
  it.each([
    ['100.00', '3.75000000', '375.00'],
    ['19.99', '4.06550000', '81.27'], // 81.268... → 81.27
    ['1000.00', '0.04463000', '44.63'],
    ['0.01', '1.02100000', '0.01'],
    ['12.34', '9.94690000', '122.74'], // 122.7447… → 122.74
  ])('%s × %s = SAR %s', (amount, rate, expected) => {
    expect(formatSar(convertToSar(h(amount), rate))).toBe(expected);
  });
});

describe('VAT recoverable (FR-CAP-07, PRD §6)', () => {
  it.each([
    ['115.00', '15.00'],
    ['500.00', '65.22'], // 65.217… → 65.22
    ['180.00', '23.48'], // 23.478… → 23.48
    ['0.01', '0.00'],
    ['1.15', '0.15'],
  ])('VAT in SAR %s = %s at 15 %%', (gross, vat) => {
    expect(formatSar(vatFromGross(h(gross), 15))).toBe(vat);
  });

  it('follows a changed VAT rate', () => {
    expect(formatSar(vatFromGross(h('105.00'), 5))).toBe('5.00');
  });
});

describe('mileage and per diem (FR-CAP-05)', () => {
  it('km × rate per km', () => {
    expect(formatSar(multiplyRate('123.5', '0.7500'))).toBe('92.63'); // 92.625 → 92.63
    expect(formatSar(multiplyRate('100', '0.7500'))).toBe('75.00');
  });
  it('days × daily rate', () => {
    expect(formatSar(multiplyHalalas(4, h('400.00')))).toBe('1600.00');
    expect(formatSar(multiplyHalalas('2.5', h('350.00')))).toBe('875.00');
  });
});
