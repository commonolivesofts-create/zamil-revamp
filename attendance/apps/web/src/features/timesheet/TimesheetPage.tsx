// Timesheet (CI3 /report/timesheet): the processed daily rows. Opens on the 21st of last month
// to the 20th of this month; Reset clears every filter, as in CI3.
import {
  payrollPeriodEndingThisMonth,
  timesheetPageSchema,
  type TimesheetFilters,
  type TimesheetRow,
} from '@attendance/shared';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { display, formatIsoDate } from '../../lib/format';
import { useShiftChoices } from '../setup/useShiftChoices';

type Filters = Required<{ [K in keyof TimesheetFilters]: string | undefined }>;

const NO_FILTERS: Filters = { empNo: '', empName: '', shift: '', attDateStart: '', attDateEnd: '' };

/** CI3 parseTimeToMinutes: "HH:MM" -> minutes, anything else -> null. */
const minutes = (value: string | null) => {
  const [h, m] = (value ?? '').split(':');
  if (m === undefined) return null;
  const hours = parseInt(h ?? '', 10);
  const mins = parseInt(m, 10);
  return Number.isNaN(hours) || Number.isNaN(mins) ? null : hours * 60 + mins;
};

/** CI3 highlighted a punch-in after check-in and a punch-out before check-out. */
function Punch({ value, late }: { value: string | null; late: boolean }) {
  return <span className={late ? 'zat-text-danger' : undefined}>{display(value)}</span>;
}
const isAfter = (a: string | null, b: string | null) => {
  const x = minutes(a);
  const y = minutes(b);
  return x !== null && y !== null && x > y;
};

/** "Monday" (CI3 Attendance Day, en-US long weekday). */
const weekdayName = (iso: string | null) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso ?? '');
  if (!match) return '—';
  return new Date(Date.UTC(+match[1]!, +match[2]! - 1, +match[3]!)).toLocaleDateString('en-US', {
    weekday: 'long',
    timeZone: 'UTC',
  });
};

export default function TimesheetPage() {
  const shifts = useShiftChoices();
  // CI3: every shift name (Timetable_model::get_shift_options), empty names skipped.
  const shiftOptions = (shifts.data ?? [])
    .filter((s) => s.name !== '')
    .map((s) => ({ value: s.name, label: s.name }));

  const config: ReportConfig<Filters, TimesheetRow> = {
    id: 'timesheet',
    endpoint: '/timesheet',
    pageSchema: timesheetPageSchema,
    pageSize: 50,
    breadcrumb: ['Attendance', 'Reports', 'Timesheet'],
    title: 'Timesheet',
    subtitle:
      'Processed attendance per employee and day: punches, late, early, overtime and absence.',
    heading: 'All timesheet records',
    filters: [
      { key: 'empNo', label: 'Employee Number', type: 'text', placeholder: 'Employee Number' },
      { key: 'empName', label: 'Employee Name', type: 'text', placeholder: 'Employee Name' },
      {
        key: 'shift',
        label: 'Shift',
        type: 'select',
        placeholder: 'All Shifts',
        options: shiftOptions,
      },
      { key: 'attDateStart', label: 'Attendance Date Start', type: 'date' },
      { key: 'attDateEnd', label: 'Attendance Date End', type: 'date' },
    ],
    initialFilters: () => {
      const period = payrollPeriodEndingThisMonth(new Date());
      return { ...NO_FILTERS, attDateStart: period.from, attDateEnd: period.to };
    },
    resetFilters: () => ({ ...NO_FILTERS }),
    columns: [
      { key: 'empNo', label: 'Emp #', render: (r) => display(r.empNo) },
      { key: 'empName', label: 'Employee Name', render: (r) => display(r.empName) },
      { key: 'shift', label: 'Shift', render: (r) => display(r.shift) },
      { key: 'attDate', label: 'Attendance Date', render: (r) => formatIsoDate(r.attDate) },
      { key: 'day', label: 'Attendance Day', render: (r) => weekdayName(r.attDate) },
      { key: 'checkIn', label: 'Check In', render: (r) => display(r.checkIn) },
      {
        key: 'punchIn',
        label: 'Punch In',
        render: (r) => <Punch value={r.punchIn} late={isAfter(r.punchIn, r.checkIn)} />,
      },
      { key: 'checkOut', label: 'Check Out', render: (r) => display(r.checkOut) },
      {
        key: 'punchOut',
        label: 'Punch Out',
        render: (r) => <Punch value={r.punchOut} late={isAfter(r.checkOut, r.punchOut)} />,
      },
      { key: 'totalMinutes', label: 'Total Minutes', render: (r) => display(r.totalMinutes) },
      { key: 'early', label: 'Early', render: (r) => display(r.early) },
      { key: 'late', label: 'Late', render: (r) => display(r.late) },
      { key: 'overtime', label: 'Overtime', render: (r) => display(r.overtime) },
      { key: 'absence', label: 'Absence', render: (r) => display(r.absence) },
      { key: 'totDelay', label: 'Delay', render: (r) => display(r.totDelay) },
      { key: 'overtimeHrs', label: 'Total Overtime', render: (r) => display(r.overtimeHrs) },
    ],
    rowClassName: (r) =>
      (r.absence ?? '').trim().toLowerCase() === 'absence without permission'
        ? 'zat-row-danger'
        : undefined,
    rowKey: (r, index) => `${r.empNo ?? ''}-${r.attDate ?? index}`,
    emptyMessage: 'No timesheet data available.',
    filterChips: true,
  };

  return <ReportPage config={config} />;
}
