import { describe, expect, it } from 'vitest';
import { formatSar, halalas, parseSar, sumSar } from './money';

describe('parseSar', () => {
  it.each([
    ['1840', 184000],
    ['1840.00', 184000],
    ['1,840.5', 184050],
    ['0.05', 5],
    ['-500.00', -50000],
    ['  12.30 ', 1230],
  ])('%s → %i halalas', (input, expected) => {
    expect(parseSar(input)).toBe(expected);
  });

  it.each(['', 'abc', '1.234', '1.2.3', '--5', '1e3'])('rejects "%s"', (input) => {
    expect(() => parseSar(input)).toThrow(RangeError);
  });

  it('rounds a JS number once at the input edge', () => {
    expect(parseSar(434.78)).toBe(43478);
    expect(parseSar(0.1 + 0.2)).toBe(30);
  });

  it('rejects non-finite numbers', () => {
    expect(() => parseSar(Number.NaN)).toThrow(RangeError);
  });
});

describe('formatSar', () => {
  it.each([
    [184000, '1840.00'],
    [5, '0.05'],
    [-50000, '-500.00'],
    [-5, '-0.05'],
    [0, '0.00'],
  ])('%i → %s', (input, expected) => {
    expect(formatSar(halalas(input))).toBe(expected);
  });

  it('round-trips with parseSar', () => {
    for (const s of ['0.00', '1.01', '99999.99', '-12.50']) expect(formatSar(parseSar(s))).toBe(s);
  });
});

describe('sumSar / halalas', () => {
  it('adds exactly where floats would drift', () => {
    const tenCents = Array.from({ length: 10 }, () => parseSar('0.10'));
    expect(formatSar(sumSar(tenCents))).toBe('1.00');
  });

  it('refuses fractional halalas', () => {
    expect(() => halalas(1.5)).toThrow(RangeError);
  });
});
