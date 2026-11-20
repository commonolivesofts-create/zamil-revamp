// The Zamil payroll period runs from the 21st of one month to the 20th of the next.
// CI3 computed it four different ways; this is the single definition for API and web.

export interface Period {
  /** Inclusive start, YYYY-MM-DD. */
  from: string;
  /** Inclusive end, YYYY-MM-DD. */
  to: string;
}

export const PAYROLL_PERIOD_START_DAY = 21;

const pad = (n: number) => String(n).padStart(2, '0');

/** Calendar date (no time zone shift) as YYYY-MM-DD. */
export function isoDate(year: number, monthIndex: number, day: number): string {
  const d = new Date(Date.UTC(year, monthIndex, day));
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

/** Local calendar date of `date` as YYYY-MM-DD. */
export function toIsoDate(date: Date): string {
  return isoDate(date.getFullYear(), date.getMonth(), date.getDate());
}

/**
 * The payroll period that contains `date`: on or before the 20th it is the 21st of the
 * previous month to the 20th of this month; after the 20th it is the 21st of this month to
 * the 20th of the next month.
 */
export function payrollPeriodContaining(date: Date): Period {
  const year = date.getFullYear();
  const month = date.getMonth();
  const startMonth = date.getDate() >= PAYROLL_PERIOD_START_DAY ? month : month - 1;
  return {
    from: isoDate(year, startMonth, PAYROLL_PERIOD_START_DAY),
    to: isoDate(year, startMonth + 1, PAYROLL_PERIOD_START_DAY - 1),
  };
}
