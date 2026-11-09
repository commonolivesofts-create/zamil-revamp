import { describe, expect, it } from 'vitest';
import { formatDailyAt, formatSchedule, nextDailyRun, nextRun } from './scheduler';

describe('hourly jobs (TRD §7: INT-08/09 hourly 07:00–20:00 Riyadh)', () => {
  const job = { dailyAt: { hour: 7, minute: 0 }, hourly: { fromHour: 7, toHour: 20 } };
  it.each([
    ['2026-10-18T06:10:00Z', '2026-10-18T07:00:00.000Z'], // 09:10 Riyadh → 10:00
    ['2026-10-18T16:59:00Z', '2026-10-18T17:00:00.000Z'], // 19:59 → 20:00
    ['2026-10-18T17:00:00Z', '2026-10-19T04:00:00.000Z'], // 20:00 done → 07:00 next day
    ['2026-10-18T02:00:00Z', '2026-10-18T04:00:00.000Z'], // 05:00 → 07:00
  ])('after %s the next run is %s', (now, next) => {
    expect(nextRun(job, new Date(now)).toISOString()).toBe(next);
  });
  it('describes the schedule', () => {
    expect(formatSchedule(job)).toBe('hourly 07:00–20:00');
    expect(formatSchedule({ dailyAt: { hour: 1, minute: 30 } })).toBe('01:30');
  });
});

describe('nextDailyRun (Asia/Riyadh, UTC+3)', () => {
  it('runs later today when the time has not passed in Riyadh', () => {
    // 21:00 UTC = 00:00 Riyadh → next 01:00 Riyadh = 22:00 UTC same UTC day.
    expect(
      nextDailyRun({ hour: 1, minute: 0 }, new Date('2026-10-18T21:00:00Z')).toISOString(),
    ).toBe('2026-10-18T22:00:00.000Z');
  });

  it('runs tomorrow once the time has passed', () => {
    // 06:00 UTC = 09:00 Riyadh → next 06:00 Riyadh = 03:00 UTC tomorrow.
    expect(
      nextDailyRun({ hour: 6, minute: 0 }, new Date('2026-10-18T06:00:00Z')).toISOString(),
    ).toBe('2026-10-19T03:00:00.000Z');
  });

  it('never returns the current instant', () => {
    const now = new Date('2026-10-18T22:30:00Z'); // exactly 01:30 Riyadh
    expect(nextDailyRun({ hour: 1, minute: 30 }, now).toISOString()).toBe(
      '2026-10-19T22:30:00.000Z',
    );
  });

  it('formats HH:MM', () => {
    expect(formatDailyAt({ hour: 2, minute: 0 })).toBe('02:00');
  });
});
