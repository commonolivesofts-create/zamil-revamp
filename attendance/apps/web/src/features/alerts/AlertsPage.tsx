// Alerts & Exceptions (CI3 /alerts-exceptions): summary cards and the exception queue for a date
// range. Opens (and resets) on the 1st of this month to today, as in CI3.
import type { CSSProperties } from 'react';
import {
  ALERT_SEVERITIES,
  ALERT_TYPES,
  ALERTS_PAGE_SIZE,
  alertPageSchema,
  phpNumberFormat,
  toIsoDate,
  type AlertPage,
  type AlertRow,
} from '@attendance/shared';
import { Badge, type Tone } from '../../components/Badge';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { display } from '../../lib/format';

type Filters = { fromDate: string; toDate: string; type: string; severity: string };

const thisMonth = (): Filters => {
  const now = new Date();
  return {
    fromDate: toIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
    toDate: toIsoDate(now),
    type: '',
    severity: '',
  };
};

const SEVERITY_TONE: Record<string, Tone> = { HIGH: 'bad', MEDIUM: 'warn' };

function Summary({ data }: { data: AlertPage }) {
  const s = data.summary;
  const tiles: [string, number, string][] = [
    ['Total Exceptions', s.total, 'All detected issues'],
    ['High Severity', s.high, 'Immediate action required'],
    ['Missing Punch', s.missingPunch, 'Only one punch available'],
    ['Same Punch', s.samePunch, 'In and out times match'],
    ['Missing Shift', s.missingShift, 'Attendance has no shift'],
    ['Missing Occasion', s.missingOccasion, 'No active occasion found'],
    ['Missing Timetable', s.missingTimetable, 'No active assignment'],
  ];
  return (
    <section className="zrv-hr-rp-kpis zat-kpis-7" aria-label="Exception summary">
      {tiles.map(([label, value, note], index) => (
        <div key={label} className="zrv-hr-rp-kpi" style={{ '--i': index } as CSSProperties}>
          <small>{label}</small>
          <b>{phpNumberFormat(value)}</b>
          <span>{note}</span>
        </div>
      ))}
    </section>
  );
}

function Employee({ row }: { row: AlertRow }) {
  return (
    <span className="zat-person">
      <strong>{row.empName ?? 'Employee'}</strong>
      <small>Emp # {row.empNo ?? '-'}</small>
    </span>
  );
}

const config: ReportConfig<Filters, AlertRow, AlertPage> = {
  id: 'alerts',
  endpoint: '/alerts',
  pageSchema: alertPageSchema,
  pageSize: ALERTS_PAGE_SIZE,
  breadcrumb: ['Attendance', 'Reports', 'Alerts & Exceptions'],
  title: 'Alerts & Exceptions',
  subtitle:
    'Review attendance setup and processing problems requiring HR, payroll or attendance-team action.',
  headerNote: (data) => `Generated ${data.generatedAt}`,
  heading: 'Exception Queue',
  filters: [
    { key: 'fromDate', label: 'From Date', type: 'date' },
    { key: 'toDate', label: 'To Date', type: 'date' },
    {
      key: 'type',
      label: 'Exception Type',
      type: 'select',
      placeholder: 'All Types',
      options: ALERT_TYPES,
    },
    {
      key: 'severity',
      label: 'Severity',
      type: 'select',
      placeholder: 'All Severities',
      options: ALERT_SEVERITIES,
    },
  ],
  initialFilters: thisMonth,
  // CI3 kept the filters in the address bar (history.pushState) with these names.
  urlState: { fromDate: 'from_date', toDate: 'to_date', type: 'type', severity: 'severity' },
  summary: (data) => <Summary data={data} />,
  exportWhenEmpty: true,
  columns: [
    { key: 'exception', label: 'Exception', render: (r) => r.exceptionLabel },
    {
      key: 'severity',
      label: 'Severity',
      render: (r) => (
        <Badge tone={SEVERITY_TONE[r.severity.toUpperCase()] ?? 'good'}>{r.severity || '-'}</Badge>
      ),
    },
    { key: 'employee', label: 'Employee', render: (r) => <Employee row={r} /> },
    { key: 'date', label: 'Date', render: (r) => display(r.attDateDisplay) },
    { key: 'details', label: 'Details', render: (r) => display(r.details) },
  ],
  rowClassName: (r) => (r.severity.toUpperCase() === 'HIGH' ? 'zat-row-danger' : undefined),
  rowKey: (r, index) => `${r.exceptionType}-${r.empNo ?? ''}-${r.attDate ?? ''}-${index}`,
  emptyMessage: 'No exceptions found. Change the selected dates or filters.',
};

export default function AlertsPage() {
  return <ReportPage config={config} />;
}
