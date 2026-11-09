import { describe, expect, it } from 'vitest';
import {
  formatDate,
  formatDuration,
  formatRelative,
  formatSar,
  formatTime,
  riyadhDate,
} from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0s'],
    [42, '42s'],
    [192, '3m 12s'],
    [7380, '2h 3m'],
    [90000, '1d 1h'],
    [-5, '0s'],
  ])('%i seconds → %s', (input, expected) => {
    expect(formatDuration(input)).toBe(expected);
  });
});

describe('formatTime / formatDate', () => {
  it('shows Riyadh time whatever the machine time zone', () => {
    expect(formatTime(new Date('2026-10-18T09:15:30Z'))).toBe('12:15:30');
  });

  it('shows a business date without shifting it', () => {
    expect(formatDate('2026-10-18')).toBe('18 Oct 2026');
  });

  it('turns an instant into the Riyadh business date', () => {
    expect(riyadhDate('2026-10-12T13:25:00Z')).toBe('2026-10-12');
    expect(riyadhDate('2026-10-12T22:30:00Z')).toBe('2026-10-13'); // 01:30 next day in Riyadh
  });
});

describe('formatSar', () => {
  it.each([
    ['1840.00', 'SAR 1,840.00'],
    ['1234567.5', 'SAR 1,234,567.50'],
    ['0.05', 'SAR 0.05'],
    ['-500.00', '-SAR 500.00'],
    [null, '—'],
  ])('%s → %s', (input, expected) => {
    expect(formatSar(input)).toBe(expected);
  });
});

describe('formatRelative', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  it.each([
    ['2026-10-18T11:59:50Z', 'now'],
    ['2026-10-18T11:55:00Z', '5 minutes ago'],
    ['2026-10-18T15:00:00Z', 'in 3 hours'],
    ['2026-10-17T12:00:00Z', 'yesterday'],
  ])('%s → %s', (iso, expected) => {
    expect(formatRelative(iso, now)).toBe(expected);
  });
});
