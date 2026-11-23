// Late / early / overtime / worked minutes for one employee-day.
// A line-by-line port of CI3 ProcessAttendanceModel::calculate_attendance_metrics and its helpers;
// keep it identical (golden-tested against CI3), only the language differs.

/** Values exactly as CI3 stores them in XX_DIGI_ATT_ATT_SHEET ('' means NULL). */
export interface Metrics {
  TOTAL_MINUTES: string;
  LATE: string;
  EARLY: string;
  OVERTIME: string;
}

const DAY = 1440;

/** PHP empty(): null, '' and '0' are empty. */
export const phpEmpty = (value: string | null | undefined): boolean =>
  value === null || value === undefined || value === '' || value === '0';

/** CI3 normalize_nullable_string: trimmed text, '' becomes null. */
export const nullableText = (value: unknown): string | null => {
  const text = value === null || value === undefined ? '' : String(value).trim();
  return text === '' ? null : text;
};

/**
 * CI3 time_to_minutes. On PHP >= 8.2 DateTime::getLastErrors() returns false after a clean
 * parse, so CI3's format loop never returns and these two patterns decide every value.
 */
export function timeToMinutes(value: string | null): number | null {
  let text = (value ?? '').trim();
  if (text === '') return null;
  text = text.toUpperCase().replace(/\s+/g, ' ').trim();

  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?\s*([AP]M)?$/i.exec(text);
  if (clock) {
    let hours = Number(clock[1]);
    const minutes = Number(clock[2]);
    const seconds = clock[3] ? Number(clock[3]) : 0;
    const meridian = (clock[4] ?? '').toUpperCase();
    if (minutes > 59 || seconds > 59) return null;
    if (meridian) {
      if (hours < 1 || hours > 12) return null;
      if (meridian === 'AM' && hours === 12) hours = 0;
      if (meridian === 'PM' && hours !== 12) hours += 12;
    } else if (hours > 23) {
      return null;
    }
    return hours * 60 + minutes;
  }

  if (/^\d{3,4}$/.test(text)) {
    const padded = text.padStart(4, '0');
    const hours = Number(padded.slice(0, 2));
    const minutes = Number(padded.slice(2, 4));
    if (hours > 23 || minutes > 59) return null;
    return hours * 60 + minutes;
  }
  return null;
}

/** PHP is_numeric() for an already trimmed string. */
const PHP_NUMERIC = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/;

/** CI3 parse_overtime_cap_hours: '2', '1.5' or 'H:MM'; anything else means no cap. */
export function parseOvertimeCapHours(value: string | null): number | null {
  const text = (value ?? '').trim();
  if (text === '') return null;
  if (PHP_NUMERIC.test(text)) {
    const hours = Number(text);
    return hours >= 0 ? hours : null;
  }
  const match = /^(\d{1,2}):(\d{2})$/.exec(text);
  if (match) {
    const minutes = Number(match[2]);
    if (minutes > 59) return null;
    return Number(match[1]) + minutes / 60;
  }
  return null;
}

/** PHP round($value, 2) (half away from zero, on the decimal value). */
const round2 = (value: number): number => {
  const sign = value < 0 ? -1 : 1;
  return (sign * Math.round(Number(`${Math.abs(value)}e2`))) / 100;
};

/** CI3 $formatHours: minutes as hours with up to 2 decimals, capped, trailing zeros removed. */
export function formatHours(minutes: number, maxHours: number | null = null): string {
  let hours = round2(Math.max(0, Math.trunc(minutes)) / 60);
  if (maxHours !== null && hours > maxHours) hours = maxHours;
  const text = round2(hours).toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
  return text === '' ? '0' : text;
}

function resolveTimeRange(start: number, end: number) {
  return { start, end: end < start ? end + DAY : end };
}

function normalizeByShiftWindow(value: number, shiftStart: number | null, shiftEnd: number | null) {
  if (shiftStart === null || shiftEnd === null) return value;
  return shiftEnd <= shiftStart && value <= shiftEnd ? value + DAY : value;
}

/** CI3 $sharedServiceShift: the head-office flexible shift. */
export const SHARED_SERVICE_SHIFTS = [{ id: 75, name: 'H.Office Shift' }] as const;

export function isSharedServiceShift(shiftId: number, shiftName: string | null): boolean {
  const name = (shiftName ?? '').trim().toUpperCase();
  return SHARED_SERVICE_SHIFTS.some(
    (shift) => shift.id === shiftId || shift.name.trim().toUpperCase() === name,
  );
}

const empty = (): Metrics => ({ TOTAL_MINUTES: '', LATE: '', EARLY: '', OVERTIME: '' });

/** Flexible head-office shift: arrive 08:00-09:00, work 9 hours, nothing counts after 18:00. */
function sharedServiceMetrics(
  punchIn: number | null,
  punchOut: number | null,
  checkOut: number | null,
  weekdayCapHours: number | null,
  overtimeAllowed: boolean,
): Metrics {
  const result = empty();
  if (punchIn === null || punchOut === null) return result;

  const arrivalWindowStart = 8 * 60;
  const arrivalWindowEnd = 9 * 60;
  const departureWindowEnd = 18 * 60;
  const requiredWorkMinutes = 9 * 60;

  const work = resolveTimeRange(punchIn, punchOut);
  result.TOTAL_MINUTES = String(Math.max(0, work.end - work.start));

  const effectiveArrival = work.start < arrivalWindowStart ? arrivalWindowStart : work.start;
  const lateMinutes = work.start > arrivalWindowEnd ? work.start - arrivalWindowEnd : 0;
  const effectiveDeparture = Math.min(work.end, departureWindowEnd);
  const earlyCheckLimit = Math.min(effectiveArrival + requiredWorkMinutes, departureWindowEnd);
  const earlyMinutes =
    effectiveDeparture < earlyCheckLimit ? earlyCheckLimit - effectiveDeparture : 0;

  result.LATE = String(Math.max(0, lateMinutes));
  result.EARLY = String(Math.max(0, earlyMinutes));
  if (checkOut !== null) {
    const overtime = effectiveDeparture - checkOut;
    result.OVERTIME =
      overtimeAllowed && overtime > 0 ? formatHours(overtime, weekdayCapHours) : '0';
  } else {
    result.OVERTIME = '0';
  }
  return result;
}

export interface MetricsInput {
  checkIn: string | null;
  grossTime: string | null;
  punchIn: string | null;
  checkOut: string | null;
  punchOut: string | null;
  isWeekend: boolean;
  weekdayOvertimeCap: string | null;
  weekendOvertimeCap: string | null;
  isOccasion: boolean;
  overtimeAllowed: string;
  shiftId: number;
  shiftName: string | null;
}

export function calculateMetrics(input: MetricsInput): Metrics {
  const checkIn = timeToMinutes(input.checkIn);
  const grossTime = timeToMinutes(input.grossTime);
  const punchIn = timeToMinutes(input.punchIn);
  const checkOut = timeToMinutes(input.checkOut);
  const punchOut = timeToMinutes(input.punchOut);

  const weekdayCapHours = parseOvertimeCapHours(input.weekdayOvertimeCap);
  const weekendCapHours = parseOvertimeCapHours(input.weekendOvertimeCap);
  const overtimeAllowed = input.overtimeAllowed.trim().toUpperCase() === 'Y';
  const samePunchValues =
    input.punchIn !== null &&
    input.punchOut !== null &&
    input.punchIn.trim() === input.punchOut.trim();

  const result = empty();

  if (input.isWeekend || input.isOccasion) {
    if (punchIn !== null && punchOut !== null) {
      const work = resolveTimeRange(punchIn, punchOut);
      const worked = Math.max(0, work.end - work.start);
      result.LATE = '0';
      result.EARLY = '0';
      result.OVERTIME = overtimeAllowed ? formatHours(worked, weekendCapHours) : '0';
    }
    return result;
  }

  if (isSharedServiceShift(input.shiftId, input.shiftName)) {
    return sharedServiceMetrics(punchIn, punchOut, checkOut, weekdayCapHours, overtimeAllowed);
  }

  if (punchIn !== null && punchOut !== null) {
    const work = resolveTimeRange(punchIn, punchOut);
    result.TOTAL_MINUTES = String(Math.max(0, work.end - work.start));
  }

  if (checkIn !== null && punchIn !== null) {
    if (samePunchValues) {
      result.LATE = '0';
    } else {
      const normalizedCheckIn = normalizeByShiftWindow(checkIn, checkIn, checkOut);
      const normalizedPunchIn = normalizeByShiftWindow(punchIn, checkIn, checkOut);
      const threshold =
        grossTime !== null
          ? Math.max(normalizedCheckIn, normalizeByShiftWindow(grossTime, checkIn, checkOut))
          : normalizedCheckIn;
      result.LATE = normalizedPunchIn > threshold ? String(normalizedPunchIn - threshold) : '0';
    }
  }

  if (checkOut !== null && punchOut !== null && punchIn !== null) {
    let early: number;
    let overtime: number;
    if (checkIn !== null && checkOut <= checkIn) {
      const scheduledEnd = checkOut + DAY;
      const actualOut = punchOut < checkIn ? punchOut + DAY : punchOut;
      early = scheduledEnd - actualOut;
      overtime = actualOut - scheduledEnd;
    } else {
      early = checkOut - punchOut;
      overtime = punchOut - checkOut;
    }
    result.EARLY = early > 0 ? String(early) : '0';
    result.OVERTIME =
      overtimeAllowed && overtime > 0 ? formatHours(overtime, weekdayCapHours) : '0';
  }

  return result;
}
