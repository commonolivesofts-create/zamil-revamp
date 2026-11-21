// Shifts (CI3 /shifts): list, filters, CSV, add/edit dialog and delete confirmation.
import { useState } from 'react';
import { Link } from 'react-router';
import {
  mutationResultSchema,
  shiftInputSchema,
  shiftPageSchema,
  STATUSES,
  type ShiftFilters,
  type ShiftRow,
} from '@attendance/shared';
import { ConfirmDialog } from '../../components/form/ConfirmDialog';
import { FormDialog } from '../../components/form/FormDialog';
import type { FormField } from '../../components/form/types';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { RowActions } from '../../components/RowActions';
import { StatusBadge } from '../../components/StatusBadges';
import { api } from '../../lib/api';
import { display, formatDateTime, formatIsoDate } from '../../lib/format';
import { useSave } from '../../lib/useSave';
import { SHIFT_CHOICES_KEY } from './useShiftChoices';

type Filters = Required<{ [K in keyof ShiftFilters]: string | undefined }>;
type Values = {
  shiftName: string;
  status: string;
  startDate: string;
  endDate: string;
  checkIn: string;
  checkOut: string;
  weekdayOvertimeCap: string;
  weekendOvertimeCap: string;
};

const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: value }));

const FIELDS: readonly FormField<Values>[] = [
  {
    name: 'shiftName',
    label: 'Shift Name',
    type: 'text',
    required: true,
    maxLength: 100,
    placeholder: 'Enter shift name',
  },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    required: true,
    options: STATUS_OPTIONS,
    placeholder: 'Select status',
  },
  { name: 'startDate', label: 'Start Date', type: 'date', required: true },
  { name: 'endDate', label: 'End Date', type: 'date', required: true },
  { name: 'checkIn', label: 'Check In', type: 'time', required: true },
  { name: 'checkOut', label: 'Check Out', type: 'time', required: true },
  {
    name: 'weekdayOvertimeCap',
    label: 'Weekday Overtime Cap',
    type: 'text',
    maxLength: 20,
    placeholder: 'Enter weekday overtime cap',
  },
  {
    name: 'weekendOvertimeCap',
    label: 'Weekend Overtime Cap',
    type: 'text',
    maxLength: 20,
    placeholder: 'Enter weekend overtime cap',
  },
];

const EMPTY: Values = {
  shiftName: '',
  status: 'ACTIVE',
  startDate: '',
  endDate: '',
  checkIn: '',
  checkOut: '',
  weekdayOvertimeCap: '',
  weekendOvertimeCap: '',
};

const toValues = (row: ShiftRow): Values => ({
  shiftName: row.shiftName ?? '',
  status: row.status ?? 'ACTIVE',
  startDate: row.startDate ?? '',
  endDate: row.endDate ?? '',
  checkIn: row.checkIn ?? '',
  checkOut: row.checkOut ?? '',
  weekdayOvertimeCap: row.weekdayOvertimeCap ?? '',
  weekendOvertimeCap: row.weekendOvertimeCap ?? '',
});

export default function ShiftsPage() {
  const save = useSave(['shifts', 'shift-weeks', SHIFT_CHOICES_KEY]);
  const [editing, setEditing] = useState<ShiftRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ShiftRow | null>(null);

  const config: ReportConfig<Filters, ShiftRow> = {
    id: 'shifts',
    endpoint: '/shifts',
    pageSchema: shiftPageSchema,
    pageSize: 30,
    breadcrumb: ['Attendance', 'Setup', 'Shifts'],
    title: 'Shift List',
    subtitle: 'Working schedules: validity dates, check-in and check-out times and overtime caps.',
    heading: 'All shift records',
    filters: [
      { key: 'shiftName', label: 'Shift name', type: 'text', placeholder: 'Shift name' },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'endDate', label: 'End date', type: 'date' },
      { key: 'checkIn', label: 'Check in', type: 'time' },
      { key: 'checkOut', label: 'Check out', type: 'time' },
    ],
    initialFilters: () => ({
      shiftName: '',
      status: '',
      startDate: '',
      endDate: '',
      checkIn: '',
      checkOut: '',
    }),
    columns: [
      {
        key: 'shiftName',
        label: 'Shift Name',
        render: (row) => (
          <Link to={`/shift-details/${row.uuid}`} title="Manage shift details">
            {display(row.shiftName)}
          </Link>
        ),
      },
      { key: 'startDate', label: 'Start Date', render: (row) => formatIsoDate(row.startDate) },
      { key: 'endDate', label: 'End Date', render: (row) => formatIsoDate(row.endDate) },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      { key: 'checkIn', label: 'Check In', render: (row) => display(row.checkIn) },
      { key: 'checkOut', label: 'Check Out', render: (row) => display(row.checkOut) },
      {
        key: 'weekdayOvertimeCap',
        label: 'Weekday OT Cap',
        render: (row) => display(row.weekdayOvertimeCap),
      },
      {
        key: 'weekendOvertimeCap',
        label: 'Weekend OT Cap',
        render: (row) => display(row.weekendOvertimeCap),
      },
      { key: 'createdAt', label: 'Created At', render: (row) => formatDateTime(row.createdAt) },
      {
        key: 'actions',
        label: 'Action',
        render: (row: ShiftRow) => (
          <RowActions
            label={`shift ${row.shiftName ?? ''}`}
            onEdit={() => setEditing(row)}
            onDelete={() => setDeleting(row)}
          />
        ),
      },
    ],
    rowKey: (row) => row.uuid,
    emptyMessage: 'No shift data available.',
    headerActions: (
      <button
        type="button"
        className="zrv-ir-btn zrv-ir-btn--primary"
        onClick={() => setEditing('new')}
      >
        <OrvexaIcon name="plus" size={16} />
        Add Shift
      </button>
    ),
  };

  const isNew = editing === 'new';
  return (
    <>
      <ReportPage config={config} />
      {editing && (
        <FormDialog<Values>
          title={isNew ? 'Add Shift' : 'Edit Shift'}
          description="Enter shift details below."
          fields={FIELDS}
          initial={isNew ? EMPTY : toValues(editing)}
          schema={shiftInputSchema}
          submitLabel={isNew ? 'Save Shift' : 'Update Shift'}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await save(() =>
              isNew
                ? api('/shifts', mutationResultSchema, { method: 'POST', body: values })
                : api(`/shifts/${editing.uuid}`, mutationResultSchema, {
                    method: 'PUT',
                    body: values,
                  }),
            );
            setEditing(null);
          }}
        />
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete Shift?"
          description={`Are you sure you want to delete "${deleting.shiftName || 'this shift'}"? Its weekly sub-shift times are deleted too.`}
          confirmLabel="Yes, delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await save(() =>
              api(`/shifts/${deleting.uuid}`, mutationResultSchema, { method: 'DELETE' }),
            );
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
