// Golden test: outputs recorded from CI3 ProcessAttendanceModel (PHP 8.5) for 6,000 generated
// employee-days, plus its time and overtime-cap parsers. Any difference fails the build.
import { describe, expect, it } from 'vitest';
import fixture from './golden/ci3-metrics.json';
import {
  calculateMetrics,
  formatHours,
  parseOvertimeCapHours,
  timeToMinutes,
  type MetricsInput,
} from './metrics';

type Case = [unknown[], string[]];

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
      if (actual.join('|') !== expected.join('|')) mismatches.push({ input, expected, actual });
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
});
