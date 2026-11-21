// Daily Attendance (CI3 /daily-attendance): first and last biometric punch per employee per day, live
// from EBS. Opens (and resets) on today. Needs the Zamil VPN or office network.
import type { CSSProperties } from 'react';
import {
  DAILY_ATTENDANCE_PAGE_SIZE,
  dailyAttendancePageSchema,
  phpNumberFormat,
  toIsoDate,
  type DailyAttendancePage,
  type DailyAttendanceRow,
} from '@attendance/shared';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { display } from '../../lib/format';

type Filters = { fromDate: string; toDate: string; search: string };

const today = (): Filters => {
  const day = toIsoDate(new Date());
  return { fromDate: day, toDate: day, search: '' };
};

function Summary({ data }: { data: DailyAttendancePage }) {
  const s = data.summary;
  const n = (v: number) => phpNumberFormat(v);
  const tiles: [string, number, string][] = [
    ['Scheduled Employees', s.scheduledEmployees, 'Employees in the daily timesheet'],
    ['Checked In', s.checkedIn, `${n(s.onTime)} arrived on time`],
    ['Late Arrivals', s.late, `${n(s.totalLateMinutes)} total late minutes`],
    ['Not Checked In', s.notCheckedIn, `${n(s.absent)} marked absent`],
    ['Missing Punch', s.missingPunch, 'Only one punch is available'],
    ['Approved Leave', s.approvedLeave, `${n(s.weekend + s.occasion)} off-day or holiday`],
  ];
  return (
    <section className="zrv-hr-rp-kpis zat-kpis-6" aria-label="Daily attendance summary">
      {tiles.map(([label, value, note], index) => (
        <div key={label} className="zrv-hr-rp-kpi" style={{ '--i': index } as CSSProperties}>
          <small>{label}</small>
          <b>{n(value)}</b>
          <span>{note}</span>
        </div>
      ))}
    </section>
  );
}

const config: ReportConfig<Filters, DailyAttendanceRow, DailyAttendancePage> = {
  id: 'daily-attendance',
  endpoint: '/daily-attendance',
  pageSchema: dailyAttendancePageSchema,
  pageSize: DAILY_ATTENDANCE_PAGE_SIZE,
  breadcrumb: ['Attendance', 'Reports', 'Daily Attendance'],
  title: 'Daily Attendance',
  subtitle:
    'See who is present, late, missing a punch, absent, or on approved leave for the selected day.',
  heading: 'Daily Employee Roster',
  filters: [
    { key: 'fromDate', label: 'From Date', type: 'date' },
    { key: 'toDate', label: 'To Date', type: 'date' },
    {
      key: 'search',
      label: 'Employee Search',
      type: 'text',
      placeholder: 'Number or employee name',
    },
  ],
  initialFilters: today,
  validateFilters: (f) =>
    f.fromDate && f.toDate && f.fromDate > f.toDate
      ? 'From date must be less than or equal to To date.'
      : null,
  summary: (data) => <Summary data={data} />,
  exportWhenEmpty: true,
  columns: [
    { key: 'empNo', label: 'Employee Code', render: (r) => display(r.empNo) },
    { key: 'empName', label: 'Employee Name', render: (r) => display(r.empName) },
    { key: 'date', label: 'Attendance Date', render: (r) => display(r.attDateDisplay) },
    { key: 'punchIn', label: 'Clock In', render: (r) => display(r.punchIn) },
    { key: 'punchOut', label: 'Clock Out', render: (r) => display(r.punchOut) },
    {
      key: 'workTime',
      label: 'Work Hours',
      render: (r) => `${(parseFloat(r.workTime ?? '0') || 0).toFixed(2)} hrs`,
    },
  ],
  rowKey: (r, index) => `${r.empNo ?? ''}-${r.attDateDisplay ?? ''}-${index}`,
  emptyMessage: 'No attendance found for the selected dates.',
};

export default function DailyAttendancePage() {
  return <ReportPage config={config} />;
}
