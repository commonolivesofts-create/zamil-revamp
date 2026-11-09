// Business dates are Riyadh dates (TRD §4.2), whatever the server's time zone.
const RIYADH_DATE = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Asia/Riyadh',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** "YYYY-MM-DD" in Asia/Riyadh. */
export function riyadhDate(at: Date): string {
  return RIYADH_DATE.format(at);
}

/** "YYYY-MM-DD" ± days (calendar arithmetic, no time zone involved). */
export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/** Riyadh is UTC+3 all year (no daylight saving). */
export const RIYADH_OFFSET_MS = 3 * 60 * 60 * 1000;

export type Clock = () => Date;
export const systemClock: Clock = () => new Date();
