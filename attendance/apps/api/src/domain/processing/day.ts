// One employee-day: which shift applies, whether it is a weekend, leave or occasion, the ABSENCE
// text and the sheet row. Port of the loop body of CI3 process_attendance_range plus the per-day
// lookups (resolved here from rows loaded once per employee instead of 5 queries per day).
import { calculateMetrics, nullableText, phpEmpty, type Metrics } from './metrics';

/** An active timetable row of the employee joined with its shift (CI3 get_employee_shift_for_date). */
export interface TimetableShift {
  timetableId: number;
  /** TRUNC(START_DATE) / TRUNC(END_DATE) as YYYY-MM-DD, null when open. */
  startDay: string | null;
  endDay: string | null;
  /** START_DATE with time, for CI3's ORDER BY START_DATE DESC NULLS LAST. */
  startStamp: string | null;
  shiftId: number | null;
  shiftName: string | null;
  weekdayOvertimeCap: string | null;
  weekendOvertimeCap: string | null;
  overtimeAllowed: string | null;
  excludeTimesheet: string | null;
}

/** Active weekly detail row of a shift (XX_DIGI_SHIFT_PR_DTL). DAY_NO 1 = Sunday. */
export interface ShiftDay {
  shiftId: number;
  dayNo: number;
  punchIn: string | null;
  punchOut: string | null;
  grossTime: string | null;
}

export interface CardRow {
  day: string;
  empName: string | null;
  punchIn: string | null;
  punchOut: string | null;
}

export interface LeaveRow {
  leaveType: string | null;
  /** Parsed LEAVE_START_DATE / LEAVE_END_DATE (YYYY-MM-DD), null when unparsable. */
  startDay: string | null;
  endDay: string | null;
}

export interface OccasionRow {
  occasionId: number;
  occasionName: string | null;
  fromDay: string;
  toDay: string;
  /** FROM_DATE with time, for ORDER BY FROM_DATE DESC. */
  fromStamp: string;
  /** SHIFT_ID list without spaces, wrapped in commas: ',12,75,'. */
  shiftList: string;
}

/** Everything known about one employee for the whole range. */
export interface EmployeeData {
  timetables: TimetableShift[];
  shiftDays: ShiftDay[];
  cards: CardRow[];
  leaves: LeaveRow[];
  occasions: OccasionRow[];
}

export interface SheetRow {
  EMP_NO: string;
  EMP_NAME: string | null;
  SHIFT: string | null;
  ATT_DATE: string;
  CHECK_IN: string | null;
  PUNCH_IN: string | null;
  CHECK_OUT: string | null;
  PUNCH_OUT: string | null;
  TOTAL_MINUTES: string | null;
  EARLY: string | null;
  LATE: string | null;
  OVERTIME: string | null;
  ABSENCE: string | null;
}

export type Counter =
  | 'presentRows'
  | 'weeklyHolidayRows'
  | 'leaveRows'
  | 'absenceWithoutPermissionRows'
  | 'blankPunchRows';

export const ABSENCE_WITHOUT_PERMISSION = 'Absence without permission';
export const WEEKEND = 'Weekend';

const desc = (a: string | null, b: string | null) => {
  // DESC NULLS LAST
  if (a === b) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return a < b ? 1 : -1;
};

/** Day of week of a YYYY-MM-DD calendar date: 0 = Sunday. */
export const weekday = (day: string) => new Date(`${day}T00:00:00Z`).getUTCDay();

/** Every calendar day from `from` to `to`, inclusive. */
export function daysBetween(from: string, to: string): string[] {
  const days: string[] = [];
  const cursor = new Date(`${from}T00:00:00Z`);
  const end = new Date(`${to}T00:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** The shift that applies on `day` (latest start first, then highest timetable id). */
export function shiftForDay(data: EmployeeData, day: string) {
  const timetable = data.timetables
    .filter(
      (t) => (t.startDay === null || t.startDay <= day) && (t.endDay === null || t.endDay >= day),
    )
    .sort((a, b) => desc(a.startStamp, b.startStamp) || b.timetableId - a.timetableId)[0];
  if (!timetable) return null;
  const dayNo = weekday(day) + 1;
  const detail =
    timetable.shiftId === null
      ? undefined
      : data.shiftDays.find((d) => d.shiftId === timetable.shiftId && d.dayNo === dayNo);
  const checkIn = detail?.punchIn ?? null;
  const checkOut = detail?.punchOut ?? null;
  return {
    ...timetable,
    checkIn,
    checkOut,
    grossTime: detail?.grossTime ?? null,
    // CASE WHEN TRIM(PUNCH_IN) IS NULL AND TRIM(PUNCH_OUT) IS NULL THEN 'Y'
    isOffDay: nullableText(checkIn) === null && nullableText(checkOut) === null,
  };
}

/** CI3 get_weekend_days_for_shift + is_weekend_date: 1 off day = Friday, 2+ = Friday and Saturday. */
export function isWeekendDay(data: EmployeeData, shiftId: number, day: string): boolean {
  if (shiftId <= 0) return false;
  const offDays = data.shiftDays.filter(
    (d) =>
      d.shiftId === shiftId &&
      nullableText(d.punchIn) === null &&
      nullableText(d.punchOut) === null,
  ).length;
  const dow = weekday(day);
  if (offDays === 1) return dow === 5;
  if (offDays >= 2) return dow === 5 || dow === 6;
  return false;
}

function leaveForDay(data: EmployeeData, day: string) {
  return data.leaves
    .filter((l) => l.startDay !== null && l.endDay !== null && l.startDay <= day && day <= l.endDay)
    .sort((a, b) => desc(a.startDay, b.startDay))[0];
}

function occasionForDay(data: EmployeeData, day: string, shiftId: number) {
  if (shiftId <= 0) return undefined;
  return data.occasions
    .filter((o) => o.fromDay <= day && day <= o.toDay && o.shiftList.includes(`,${shiftId},`))
    .sort((a, b) => desc(a.fromStamp, b.fromStamp) || b.occasionId - a.occasionId)[0];
}

export interface DayResult {
  row: SheetRow;
  counters: Counter[];
}

/**
 * CI3 loop body for one date. `employeeName` is the master name (CI3 falls back to the card name,
 * then to the employee profile, which the caller supplies as `profileName`).
 */
export function processDay(
  empNo: string,
  employeeName: string,
  profileName: string,
  data: EmployeeData,
  day: string,
): DayResult {
  const shift = shiftForDay(data, day);
  const shiftId = shift?.shiftId ?? 0;
  const card = data.cards.find((c) => c.day === day);
  const leave = leaveForDay(data, day);
  const occasion = occasionForDay(data, day, shiftId);

  let isWeekend = isWeekendDay(data, shiftId, day);
  if (!isWeekend && shift?.isOffDay) isWeekend = true;
  const isOccasion = !phpEmpty(occasion?.occasionName);

  let name = employeeName;
  if (name === '' && !phpEmpty(card?.empName)) name = (card?.empName ?? '').trim();
  if (name === '') name = profileName;

  const shiftName = shift && !phpEmpty(shift.shiftName) ? (shift.shiftName ?? '').trim() : null;
  const checkIn = nullableText(shift?.checkIn);
  const checkOut = nullableText(shift?.checkOut);
  const grossTime = nullableText(shift?.grossTime);
  const excludeTimesheet = shift ? (shift.excludeTimesheet ?? '').trim().toUpperCase() : 'N';
  const overtimeAllowed = shift ? (shift.overtimeAllowed ?? '').trim().toUpperCase() : 'N';
  const punchIn = nullableText(card?.punchIn);
  const punchOut = nullableText(card?.punchOut);

  const counters: Counter[] = [];
  let absence: string | null = null;
  if (leave && !phpEmpty(leave.leaveType)) {
    absence = (leave.leaveType ?? '').trim();
    counters.push('leaveRows');
  } else if (isOccasion) {
    absence = (occasion?.occasionName ?? '').trim();
    if (punchIn !== null && punchOut !== null) counters.push('presentRows');
  } else if (isWeekend) {
    absence = WEEKEND;
    counters.push(punchIn !== null && punchOut !== null ? 'presentRows' : 'weeklyHolidayRows');
  } else if (!card) {
    absence = ABSENCE_WITHOUT_PERMISSION;
    counters.push('absenceWithoutPermissionRows');
  } else if (punchIn === null && punchOut === null) {
    counters.push('blankPunchRows');
    if (excludeTimesheet === 'Y') {
      counters.push('presentRows');
    } else {
      absence = ABSENCE_WITHOUT_PERMISSION;
      counters.push('absenceWithoutPermissionRows');
    }
  } else {
    counters.push('presentRows');
  }

  const metrics: Metrics = calculateMetrics({
    checkIn,
    grossTime,
    punchIn,
    checkOut,
    punchOut,
    isWeekend,
    weekdayOvertimeCap: nullableText(shift?.weekdayOvertimeCap),
    weekendOvertimeCap: nullableText(shift?.weekendOvertimeCap),
    isOccasion,
    overtimeAllowed,
    shiftId,
    shiftName,
  });
  const orNull = (value: string) => (value === '' ? null : value);

  return {
    row: {
      EMP_NO: empNo,
      EMP_NAME: name !== '' ? name : null,
      SHIFT: shiftName,
      ATT_DATE: day,
      CHECK_IN: checkIn,
      PUNCH_IN: punchIn,
      CHECK_OUT: checkOut,
      PUNCH_OUT: punchOut,
      TOTAL_MINUTES: orNull(metrics.TOTAL_MINUTES),
      EARLY: orNull(metrics.EARLY),
      LATE: orNull(metrics.LATE),
      OVERTIME: orNull(metrics.OVERTIME),
      ABSENCE: absence === '' ? null : absence,
    },
    counters,
  };
}
