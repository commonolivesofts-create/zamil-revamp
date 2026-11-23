// Golden test: outputs recorded from CI3 ProcessAttendanceModel (PHP 8.5) for 6,000 generated
// employee-days, plus its time and overtime-cap parsers. Any difference fails the build.
import { describe, expect, it } from 'vitest';
import fixture from './golden/ci3-metrics.json';
import {
  calculateMetrics,
  formatHours,
  OVERTIME_CAP_GRACE_MINUTES,
  parseOvertimeCapHours,
  timeToMinutes,
  type MetricsInput,
} from './metrics';

type Case = [unknown[], string[]];

/**
 * CI3's output with the one intended difference applied: overtime within
 * OVERTIME_CAP_GRACE_MINUTES of the day's cap becomes the cap (production payroll rule).
 */
function withCapGrace(input: MetricsInput, expected: string[]): string[] {
  const ot = expected[3];
  if (!ot || ot === '0') return expected;
  const offDay = input.isWeekend || input.isOccasion;
  const cap = parseOvertimeCapHours(offDay ? input.weekendOvertimeCap : input.weekdayOvertimeCap);
  if (cap === null || cap <= 0) return expected;
  const capText = formatHours(1_000_000, cap); // the cap as CI3 prints a capped value
  // CI3 rounds minutes to 2-decimal hours; 0.01 h of slack keeps the comparison to whole minutes.
  const withinGrace =
    Number(ot) < cap && Number(ot) * 60 >= cap * 60 - OVERTIME_CAP_GRACE_MINUTES - 0.6;
  return withinGrace ? [...expected.slice(0, 3), capText] : expected;
}

describe('CI3 golden: attendance metrics', () => {
  it('timeToMinutes matches CI3 time_to_minutes', () => {
    for (const [input, expected] of fixture.times as [string, number | null][]) {
      expect([input, timeToMinutes(input)]).toEqual([input, expected]);
    }
  });

  it('parseOvertimeCapHours matches CI3 parse_overtime_cap_hours', () => {
    for (const [input, expected] of fixture.caps as [string, number | null][]) {
      const actual = parseOvertimeCapHours(input);
      if (expected === null) expect([input, actual]).toEqual([input, null]);
      else expect(actual).toBeCloseTo(expected, 10);
    }
  });

  it(`calculateMetrics matches CI3 for all ${fixture.metrics.length} cases`, () => {
    const mismatches: unknown[] = [];
    for (const [values, expected] of fixture.metrics as Case[]) {
      const input = Object.fromEntries(
        fixture.keys.map((key, i) => [key, values[i]]),
      ) as unknown as MetricsInput;
      const m = calculateMetrics(input);
      const actual = [m.TOTAL_MINUTES, m.LATE, m.EARLY, m.OVERTIME];
      const want = withCapGrace(input, expected);
      if (actual.join('|') !== want.join('|')) mismatches.push({ input, expected: want, actual });
    }
    expect(mismatches.slice(0, 5)).toEqual([]);
  });

  it('formats hours like PHP number_format with trailing zeros removed', () => {
    expect(formatHours(90)).toBe('1.5');
    expect(formatHours(60)).toBe('1');
    expect(formatHours(0)).toBe('0');
    expect(formatHours(100)).toBe('1.67');
    expect(formatHours(600, 8)).toBe('8');
    expect(formatHours(600, 1 + 20 / 60)).toBe('1.33');
  });

  it('pays the full cap within 5 minutes of it (production payroll, employee 1148)', () => {
    // Shift 74 Morning 6D: 06:30-15:00, weekday cap 3.5 h (18:30), weekend cap 11.5 h.
    const day = (punchOut: string, isWeekend = false) =>
      calculateMetrics({
        checkIn: '06:30',
        grossTime: null,
        punchIn: '06:22',
        checkOut: '15:00',
        punchOut,
        isWeekend,
        weekdayOvertimeCap: '3.5',
        weekendOvertimeCap: '11.5',
        isOccasion: false,
        overtimeAllowed: 'Y',
        shiftId: 74,
        shiftName: 'Morning 6D',
      }).OVERTIME;
    expect(day('18:26')).toBe('3.5');
    expect(day('18:27')).toBe('3.5');
    expect(day('18:29')).toBe('3.5');
    expect(day('18:24')).toBe('3.4');
    expect(day('17:00')).toBe('2');
    expect(day('19:30')).toBe('3.5');
    expect(day('17:56', true)).toBe('11.5'); // 11 h 34 min worked on the off day
    expect(day('17:45', true)).toBe('11.38'); // 7 minutes short: exact hours
  });

  it('totals 137.00 overtime hours for employee 1148, 2026-10-21..2026-11-20 (production payroll)', () => {
    // Punches from XX_DIGI_ATT_ATT_CARD; CI3's exact-minute rule gave 135.86.
    const days: [string, string, string][] = [
      ['WED', '06:22', '18:28'],
      ['THU', '06:29', '18:27'],
      ['FRI', '06:20', '18:29'],
      ['SAT', '06:21', '18:27'],
      ['SUN', '06:22', '18:29'],
      ['MON', '06:23', '18:27'],
      ['TUE', '06:24', '18:27'],
      ['WED', '06:27', '18:27'],
      ['THU', '06:23', '18:27'],
      ['FRI', '06:18', '18:28'],
      ['SAT', '06:22', '18:29'],
      ['SUN', '06:21', '18:27'],
      ['MON', '06:23', '18:27'],
      ['TUE', '06:23', '18:27'],
      ['WED', '06:27', '18:27'],
      ['THU', '06:24', '18:28'],
      ['SAT', '06:20', '18:27'],
      ['SUN', '06:22', '18:27'],
      ['MON', '06:28', '18:27'],
      ['TUE', '06:22', '18:27'],
      ['WED', '06:20', '18:27'],
      ['THU', '06:19', '18:28'],
      ['FRI', '06:18', '18:27'],
      ['SAT', '06:22', '18:28'],
      ['SUN', '06:22', '18:28'],
      ['MON', '06:25', '18:26'],
      ['TUE', '06:20', '18:28'],
      ['WED', '06:19', '18:27'],
      ['THU', '06:28', '18:27'],
      ['FRI', '06:20', '18:28'],
    ];
    const minutes = days.reduce((sum, [dow, punchIn, punchOut]) => {
      const offDay = dow === 'FRI';
      const { OVERTIME } = calculateMetrics({
        checkIn: offDay ? null : '06:30',
        grossTime: null,
        punchIn,
        checkOut: offDay ? null : '15:00',
        punchOut,
        isWeekend: offDay,
        weekdayOvertimeCap: '3.5',
        weekendOvertimeCap: '11.5',
        isOccasion: false,
        overtimeAllowed: 'Y',
        shiftId: 74,
        shiftName: 'Morning 6D',
      });
      return sum + Math.round(Number(OVERTIME) * 100);
    }, 0);
    expect(days).toHaveLength(30);
    expect(minutes / 100).toBe(137);
  });
});
