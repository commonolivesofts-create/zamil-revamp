// Leave Requests (CI3 /leave-requests): leave records starting in the selected period with approved,
// pending, denied and total counts. Opens (and resets) on the period of the latest processed date.
import { useQuery } from '@tanstack/react-query';
import type { CSSProperties } from 'react';
import {
  LEAVE_REQUESTS_PAGE_SIZE,
  leaveRequestDefaultsSchema,
  leaveRequestPageSchema,
  phpNumberFormat,
  type LeaveRequestPage,
  type LeaveRequestRow,
} from '@attendance/shared';
import { Badge } from '../../components/Badge';
import { ContentSkeleton } from '../../components/Feedback';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { api, errorMessage } from '../../lib/api';
import { display } from '../../lib/format';
import { statusTone } from '../absences/absenceStatus';

type Filters = { fromDate: string; toDate: string };

function Summary({ data }: { data: LeaveRequestPage }) {
  const s = data.summary;
  const tiles: [string, number][] = [
    ['Approved This Period', s.approved],
    ['Pending Manager Review', s.pending],
    ['Denied This Period', s.denied],
    ['Total Requests This Period', s.total],
  ];
  return (
    <section className="zrv-hr-rp-kpis zat-kpis-4" aria-label="Leave summary">
      {tiles.map(([label, value], index) => (
        <div key={label} className="zrv-hr-rp-kpi" style={{ '--i': index } as CSSProperties}>
          <small>{label}</small>
          <b>{phpNumberFormat(value)}</b>
        </div>
      ))}
    </section>
  );
}

function pendingTone(status: string | null) {
  return (status ?? '').trim().toUpperCase() === 'PENDING' ? 'warn' : statusTone(status);
}

export default function LeaveRequestsPage() {
  const defaults = useQuery({
    queryKey: ['leave-request-defaults'],
    queryFn: ({ signal }) =>
      api('/leave-requests/defaults', leaveRequestDefaultsSchema, { signal }),
  });
  if (defaults.isPending) return <ContentSkeleton label="Loading leave requests" />;
  if (defaults.isError)
    return (
      <div className="zrv-admin-state zrv-admin-state--error" role="alert">
        <p>The leave requests could not be loaded. {errorMessage(defaults.error)}</p>
      </div>
    );
  const start: Filters = { fromDate: defaults.data.fromDate, toDate: defaults.data.toDate };

  const config: ReportConfig<Filters, LeaveRequestRow, LeaveRequestPage> = {
    id: 'leave-requests',
    endpoint: '/leave-requests',
    pageSchema: leaveRequestPageSchema,
    pageSize: LEAVE_REQUESTS_PAGE_SIZE,
    exportable: false,
    breadcrumb: ['Attendance', 'Main', 'Leave & Requests'],
    title: 'Leave Requests',
    subtitle:
      'Review employee leave requests, monitor approval status, and track pending, approved, and denied requests for the selected period.',
    headerNote: (data) => `Selected Period: ${data.period.fromLabel} – ${data.period.toLabel}`,
    heading: 'Leave Requests',
    filters: [
      { key: 'fromDate', label: 'From Date', type: 'date' },
      { key: 'toDate', label: 'To Date', type: 'date' },
    ],
    initialFilters: () => ({ ...start }),
    validateFilters: (f) =>
      !f.fromDate || !f.toDate
        ? 'Please select From Date and To Date.'
        : f.fromDate > f.toDate
          ? 'From Date cannot be greater than To Date.'
          : null,
    summary: (data) => <Summary data={data} />,
    columns: [
      { key: 'empName', label: 'Employee', render: (r) => display(r.empName) },
      { key: 'leaveType', label: 'Type', render: (r) => display(r.leaveType) },
      { key: 'from', label: 'From', render: (r) => display(r.leaveStartDate) },
      { key: 'to', label: 'To', render: (r) => display(r.leaveEndDate) },
      { key: 'days', label: 'Days', render: (r) => r.totalDays ?? '0' },
      {
        key: 'status',
        label: 'Status',
        render: (r) => (
          <Badge tone={pendingTone(r.approvalStatus)}>{display(r.approvalStatus)}</Badge>
        ),
      },
    ],
    rowKey: (r, index) => `${r.empName ?? ''}-${r.leaveStartDate ?? ''}-${index}`,
    emptyMessage: 'No leave requests found for the selected dates.',
  };
  return <ReportPage config={config} />;
}
