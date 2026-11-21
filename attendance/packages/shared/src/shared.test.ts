import { describe, expect, it } from 'vitest';
import {
  absenceListQuerySchema,
  employeeListQuerySchema,
  pageMeta,
  payrollPeriodContaining,
  payrollPeriodEndingThisMonth,
} from './index';

describe('payrollPeriodContaining', () => {
  it('uses the previous 21st up to the 20th on or before the 20th', () => {
    expect(payrollPeriodContaining(new Date(2026, 10, 20))).toEqual({
      from: '2026-10-21',
      to: '2026-11-20',
    });
    expect(payrollPeriodContaining(new Date(2026, 10, 1))).toEqual({
      from: '2026-10-21',
      to: '2026-11-20',
    });
  });

  it('starts a new period on the 21st', () => {
    expect(payrollPeriodContaining(new Date(2026, 10, 21))).toEqual({
      from: '2026-11-21',
      to: '2026-12-20',
    });
  });

  it('crosses year boundaries', () => {
    expect(payrollPeriodContaining(new Date(2026, 0, 5))).toEqual({
      from: '2025-12-21',
      to: '2026-01-20',
    });
    expect(payrollPeriodContaining(new Date(2026, 11, 25))).toEqual({
      from: '2026-12-21',
      to: '2027-01-20',
    });
  });
});

describe('payrollPeriodEndingThisMonth', () => {
  it('always runs from the previous 21st to the 20th of this month (CI3 pre-filled dates)', () => {
    expect(payrollPeriodEndingThisMonth(new Date(2026, 10, 25))).toEqual({
      from: '2026-10-21',
      to: '2026-11-20',
    });
    expect(payrollPeriodEndingThisMonth(new Date(2026, 0, 3))).toEqual({
      from: '2025-12-21',
      to: '2026-01-20',
    });
  });
});

describe('list query schemas', () => {
  it('applies defaults and drops empty filters', () => {
    const q = employeeListQuerySchema.parse({ filters: { fullName: '  ', department: ' IT ' } });
    expect(q).toEqual({ page: 1, limit: 10, search: '', filters: { department: 'IT' } });
  });

  it('accepts a missing filters object', () => {
    expect(absenceListQuerySchema.parse({}).filters).toEqual({});
  });

  it('rejects invalid dates and oversized pages', () => {
    expect(() =>
      employeeListQuerySchema.parse({ filters: { joiningDate: '20-01-2026' } }),
    ).toThrow();
    expect(() => employeeListQuerySchema.parse({ limit: 1000 })).toThrow();
  });

  it('computes page metadata', () => {
    expect(pageMeta(2, 10, 21)).toEqual({ page: 2, limit: 10, total: 21, totalPages: 3 });
    expect(pageMeta(1, 10, 0).totalPages).toBe(1);
  });
});
