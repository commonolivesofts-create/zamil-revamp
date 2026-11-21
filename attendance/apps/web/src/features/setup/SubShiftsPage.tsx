// Sub Shifts (CI3 /shift-details): every shift with its Sunday-Saturday times.
// CI3 showed 21 columns (in / out / gross per day); here each day is one cell with the same data.
import { Link } from 'react-router';
import {
  shiftDetailPageSchema,
  STATUSES,
  WEEKDAYS,
  type DayTimes,
  type ShiftDetailFilters,
  type ShiftDetailRow,
} from '@attendance/shared';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { StatusBadge } from '../../components/StatusBadges';
import { display } from '../../lib/format';
import { useCanManage } from './useCanManage';

type Filters = Required<{ [K in keyof ShiftDetailFilters]: string | undefined }>;

function DayCell({ day }: { day: DayTimes }) {
  if (!day.punchIn && !day.punchOut) return <span className="zat-muted">Off</span>;
  return (
    <span className="zat-day-cell">
      <b>
        {display(day.punchIn)}–{display(day.punchOut)}
      </b>
      {day.grossTime && <small>Gross {day.grossTime}</small>}
    </span>
  );
}

export default function SubShiftsPage() {
  const canManage = useCanManage();
  const config: ReportConfig<Filters, ShiftDetailRow> = {
    id: 'shift-weeks',
    endpoint: '/shift-details',
    pageSchema: shiftDetailPageSchema,
    pageSize: 25,
    exportable: false,
    breadcrumb: ['Attendance', 'Setup', 'Sub Shifts'],
    title: 'Sub Shifts',
    subtitle:
      'Weekday punch-in, punch-out and gross (grace) time per shift. A day without times is an off day.',
    heading: 'All shift detail records',
    filters: [
      { key: 'shiftName', label: 'Shift name', type: 'text', placeholder: 'Search by shift name' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        options: STATUSES.map((s) => ({ value: s, label: s })),
      },
    ],
    initialFilters: () => ({ shiftName: '', status: '' }),
    columns: [
      { key: 'shiftName', label: 'Shift Name', render: (row) => display(row.shiftName) },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      ...WEEKDAYS.map((name, index) => ({
        key: name.toLowerCase(),
        label: name,
        render: (row: ShiftDetailRow) => <DayCell day={row.days[index]!} />,
      })),
      {
        key: 'manage',
        label: 'Action',
        render: (row) => (
          <Link className="zrv-ir-btn" to={`/shift-details/${row.uuid}`}>
            <OrvexaIcon name={canManage ? 'pencil' : 'eye'} size={15} />
            {canManage ? 'Manage' : 'View'}
          </Link>
        ),
      },
    ],
    rowKey: (row) => row.uuid,
    searchPlaceholder: 'Search shift name or status',
    emptyMessage: 'No shift detail data available.',
  };
  return <ReportPage config={config} />;
}
