// Day rules of CI3 process_attendance_range (the DB golden run compares whole sheets with CI3).
import { describe, expect, it } from 'vitest';
import {
  daysBetween,
  processDay,
  shiftForDay,
  type EmployeeData,
  type TimetableShift,
} from './day';

// 2001-01-05 is a Friday, 2001-01-06 a Saturday, 2001-01-07 a Sunday.
const timetable = (patch: Partial<TimetableShift> = {}): TimetableShift => ({
  timetableId: 1,
  startDay: '2001-01-01',
  endDay: null,
  startStamp: '2001-01-01 00:00:00',
  shiftId: 10,
  shiftName: 'Day Shift',
  weekdayOvertimeCap: '2',
  weekendOvertimeCap: '8',
  overtimeAllowed: 'Y',
  excludeTimesheet: 'N',
  ...patch,
});
// Sunday-Thursday 07:00-16:00 (DAY_NO 1-5), Friday and Saturday off (no punches).
const week = [1, 2, 3, 4, 5, 6, 7].map((dayNo) => ({
  shiftId: 10,
  dayNo,
  punchIn: dayNo <= 5 ? '07:00' : null,
  punchOut: dayNo <= 5 ? '16:00' : null,
  grossTime: null,
}));
const data = (patch: Partial<EmployeeData> = {}): EmployeeData => ({
  timetables: [timetable()],
  shiftDays: week,
  cards: [],
  leaves: [],
  occasions: [],
  ...patch,
});

describe('processDay', () => {
  it('present day: late, early, overtime and worked minutes', () => {
    const { row, counters } = processDay(
      '100',
      'Ali',
      '',
      data({ cards: [{ day: '2001-01-07', empName: 'x', punchIn: '07:20', punchOut: '17:30' }] }),
      '2001-01-07',
    );
    expect(row).toMatchObject({
      SHIFT: 'Day Shift',
      CHECK_IN: '07:00',
      CHECK_OUT: '16:00',
      TOTAL_MINUTES: '610',
      LATE: '20',
      EARLY: '0',
      OVERTIME: '1.5',
      ABSENCE: null,
      EMP_NAME: 'Ali',
    });
    expect(counters).toEqual(['presentRows']);
  });

  it('no card on a working day is absence without permission', () => {
    const { row, counters } = processDay('100', 'Ali', '', data(), '2001-01-07');
    expect(row.ABSENCE).toBe('Absence without permission');
    expect(row.TOTAL_MINUTES).toBeNull();
    expect(counters).toEqual(['absenceWithoutPermissionRows']);
  });

  it('two off days make Friday and Saturday the weekend; weekend work is overtime only', () => {
    const friday = processDay('100', 'Ali', '', data(), '2001-01-05');
    expect(friday.row.ABSENCE).toBe('Weekend');
    expect(friday.counters).toEqual(['weeklyHolidayRows']);
    const saturday = processDay(
      '100',
      'Ali',
      '',
      data({ cards: [{ day: '2001-01-06', empName: null, punchIn: '08:00', punchOut: '18:00' }] }),
      '2001-01-06',
    );
    expect(saturday.row).toMatchObject({
      ABSENCE: 'Weekend',
      LATE: '0',
      EARLY: '0',
      OVERTIME: '8',
      TOTAL_MINUTES: null,
    });
    expect(saturday.counters).toEqual(['presentRows']);
  });

  it('one off day of any weekday makes Friday the weekend (CI3 counts, it does not look at which day)', () => {
    // Only Saturday (DAY_NO 7) is off: Friday is still "Weekend", Saturday too (off day of the shift).
    const saturdayOff = week.map((d) =>
      d.dayNo === 7 ? d : { ...d, punchIn: '07:00', punchOut: '16:00' },
    );
    const friday = processDay('100', 'A', '', data({ shiftDays: saturdayOff }), '2001-01-05');
    expect(friday.row.ABSENCE).toBe('Weekend');
    expect(
      processDay('100', 'A', '', data({ shiftDays: saturdayOff }), '2001-01-06').row.ABSENCE,
    ).toBe('Weekend');
    // No off day at all: Friday is a working day.
    const allDays = week.map((d) => ({ ...d, punchIn: '07:00', punchOut: '16:00' }));
    expect(processDay('100', 'A', '', data({ shiftDays: allDays }), '2001-01-05').row.ABSENCE).toBe(
      'Absence without permission',
    );
  });

  it('approved leave wins over occasion and weekend', () => {
    const { row, counters } = processDay(
      '100',
      'A',
      '',
      data({
        leaves: [{ leaveType: 'Annual Leave', startDay: '2001-01-01', endDay: '2001-01-10' }],
        occasions: [
          {
            occasionId: 1,
            occasionName: 'Holiday',
            fromDay: '2001-01-05',
            toDay: '2001-01-05',
            fromStamp: '2001-01-05 00:00:00',
            shiftList: ',10,',
          },
        ],
      }),
      '2001-01-05',
    );
    expect(row.ABSENCE).toBe('Annual Leave');
    expect(counters).toEqual(['leaveRows']);
  });

  it('occasion applies only to its shifts', () => {
    const occasions = [
      {
        occasionId: 1,
        occasionName: 'National Day',
        fromDay: '2001-01-07',
        toDay: '2001-01-08',
        fromStamp: '2001-01-07 00:00:00',
        shiftList: ',9,10,',
      },
    ];
    expect(processDay('100', 'A', '', data({ occasions }), '2001-01-07').row.ABSENCE).toBe(
      'National Day',
    );
    const other = data({ occasions: [{ ...occasions[0]!, shiftList: ',9,' }] });
    expect(processDay('100', 'A', '', other, '2001-01-07').row.ABSENCE).toBe(
      'Absence without permission',
    );
  });

  it('blank punches: present when excluded from timesheet, otherwise absent', () => {
    const blank = { cards: [{ day: '2001-01-07', empName: null, punchIn: null, punchOut: null }] };
    expect(processDay('1', 'A', '', data(blank), '2001-01-07').counters).toEqual([
      'blankPunchRows',
      'absenceWithoutPermissionRows',
    ]);
    const excluded = processDay(
      '1',
      'A',
      '',
      data({ ...blank, timetables: [timetable({ excludeTimesheet: 'Y' })] }),
      '2001-01-07',
    );
    expect(excluded.row.ABSENCE).toBeNull();
    expect(excluded.counters).toEqual(['blankPunchRows', 'presentRows']);
  });

  it('name falls back to the card, then to the employee profile', () => {
    const card = {
      cards: [{ day: '2001-01-07', empName: ' Card Name ', punchIn: '07:00', punchOut: '16:00' }],
    };
    expect(processDay('1', '', 'Profile', data(card), '2001-01-07').row.EMP_NAME).toBe('Card Name');
    expect(processDay('1', '', 'Profile', data(), '2001-01-07').row.EMP_NAME).toBe('Profile');
    expect(processDay('1', '', '', data(), '2001-01-07').row.EMP_NAME).toBeNull();
  });

  it('no timetable: no shift, never weekend', () => {
    const { row } = processDay('1', 'A', '', data({ timetables: [] }), '2001-01-05');
    expect(row).toMatchObject({
      SHIFT: null,
      CHECK_IN: null,
      ABSENCE: 'Absence without permission',
    });
  });
});

describe('shiftForDay', () => {
  it('picks the latest start date, then the highest timetable id, within the dates', () => {
    const d = data({
      timetables: [
        timetable({
          timetableId: 1,
          shiftName: 'Old',
          startDay: '2000-01-01',
          startStamp: '2000-01-01 00:00:00',
        }),
        timetable({
          timetableId: 2,
          shiftName: 'New',
          startDay: '2001-01-06',
          startStamp: '2001-01-06 00:00:00',
        }),
        timetable({
          timetableId: 3,
          shiftName: 'Ended',
          startDay: '2001-01-06',
          startStamp: '2001-01-06 00:00:00',
          endDay: '2001-01-06',
        }),
      ],
    });
    expect(shiftForDay(d, '2001-01-05')?.shiftName).toBe('Old');
    expect(shiftForDay(d, '2001-01-06')?.shiftName).toBe('Ended');
    expect(shiftForDay(d, '2001-01-07')?.shiftName).toBe('New');
  });
});

describe('daysBetween', () => {
  it('lists every calendar day, across month ends', () => {
    expect(daysBetween('2024-02-27', '2024-03-01')).toEqual([
      '2024-02-27',
      '2024-02-28',
      '2024-02-29',
      '2024-03-01',
    ]);
  });
});
