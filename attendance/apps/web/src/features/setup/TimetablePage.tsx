// Timetable (CI3 /timetable): employee-to-shift assignments. Editing keeps history: the edited
// row becomes INACTIVE and a new row is saved.
import { useState } from 'react';
import {
  employeeLookupSchema,
  mutationResultSchema,
  STATUSES,
  timetableInputSchema,
  timetablePageSchema,
  type TimetableFilters,
  type TimetableRow,
} from '@attendance/shared';
import { ConfirmDialog } from '../../components/form/ConfirmDialog';
import { FormDialog } from '../../components/form/FormDialog';
import type { FormField } from '../../components/form/types';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { RowActions } from '../../components/RowActions';
import { StatusBadge, YesNoBadge } from '../../components/StatusBadges';
import { api, errorMessage } from '../../lib/api';
import { display, formatDateTime, formatIsoDate } from '../../lib/format';
import { useSave } from '../../lib/useSave';
import { useCanManage } from './useCanManage';
import { useShiftChoices } from './useShiftChoices';

type Filters = Required<{ [K in keyof TimetableFilters]: string | undefined }>;
type Values = {
  empNo: string;
  empName: string;
  shiftId: string;
  status: string;
  startDate: string;
  endDate: string;
  overtimeAllowed: string;
  excludeTimesheet: string;
};

const STATUS_OPTIONS = STATUSES.map((value) => ({ value, label: value }));
const EMPTY: Values = {
  empNo: '',
  empName: '',
  shiftId: '',
  status: 'ACTIVE',
  startDate: '',
  endDate: '',
  overtimeAllowed: 'N',
  excludeTimesheet: 'N',
};

const toValues = (row: TimetableRow): Values => ({
  empNo: row.empNo ?? '',
  empName: row.empName ?? '',
  shiftId: row.shiftId ? String(row.shiftId) : '',
  status: row.status ?? 'ACTIVE',
  startDate: row.startDate ?? '',
  endDate: row.endDate ?? '',
  overtimeAllowed: row.overtimeAllowed === 'Y' ? 'Y' : 'N',
  excludeTimesheet: row.excludeTimesheet === 'Y' ? 'Y' : 'N',
});

export default function TimetablePage() {
  const canManage = useCanManage();
  const shifts = useShiftChoices();
  const save = useSave(['timetables']);
  const [editing, setEditing] = useState<TimetableRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<TimetableRow | null>(null);
  const [lookup, setLookup] = useState<string | null>(null);

  const shiftOptions = (shifts.data ?? []).map((s) => ({ value: String(s.id), label: s.name }));
  const fields: readonly FormField<Values>[] = [
    {
      name: 'empNo',
      label: 'Employee Number',
      type: 'number',
      required: true,
      maxLength: 15,
      hint: 'The name is filled in from the employee master.',
    },
    { name: 'empName', label: 'Employee Name', type: 'text', required: true, maxLength: 150 },
    {
      name: 'shiftId',
      label: 'Shift',
      type: 'select',
      required: true,
      placeholder: 'Select shift',
      options: shiftOptions.map((o) => ({ ...o, label: `${o.label} (#${o.value})` })),
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
    { name: 'endDate', label: 'End Date', type: 'date' },
    { name: 'overtimeAllowed', label: 'Overtime Allowed', type: 'yesno', required: true },
    { name: 'excludeTimesheet', label: 'Exclude Timesheet', type: 'yesno', required: true },
  ];

  const config: ReportConfig<Filters, TimetableRow> = {
    id: 'timetables',
    endpoint: '/timetables',
    pageSchema: timetablePageSchema,
    pageSize: 30,
    breadcrumb: ['Attendance', 'Setup', 'TimeTable'],
    title: 'Timetable List',
    subtitle: 'Which shift each employee works, from when, and whether overtime is allowed.',
    heading: 'All timetable records',
    filters: [
      { key: 'empNo', label: 'Emp No', type: 'text', placeholder: 'Emp No' },
      { key: 'empName', label: 'Employee', type: 'text', placeholder: 'Employee name' },
      { key: 'shiftId', label: 'Shift', type: 'select', options: shiftOptions },
      { key: 'status', label: 'Status', type: 'select', options: STATUS_OPTIONS },
      { key: 'startDate', label: 'Start date', type: 'date' },
      { key: 'endDate', label: 'End date', type: 'date' },
    ],
    initialFilters: () => ({
      empNo: '',
      empName: '',
      shiftId: '',
      status: '',
      startDate: '',
      endDate: '',
    }),
    columns: [
      { key: 'empNo', label: 'Emp No', render: (row) => display(row.empNo) },
      { key: 'empName', label: 'Emp Name', render: (row) => display(row.empName) },
      { key: 'shiftName', label: 'Shift', render: (row) => display(row.shiftName) },
      { key: 'startDate', label: 'Start Date', render: (row) => formatIsoDate(row.startDate) },
      { key: 'endDate', label: 'End Date', render: (row) => formatIsoDate(row.endDate) },
      {
        key: 'overtimeAllowed',
        label: 'Overtime Allowed',
        render: (row) => <YesNoBadge value={row.overtimeAllowed} />,
      },
      {
        key: 'excludeTimesheet',
        label: 'Exclude Timesheet',
        render: (row) => <YesNoBadge value={row.excludeTimesheet} />,
      },
      { key: 'status', label: 'Status', render: (row) => <StatusBadge status={row.status} /> },
      { key: 'createdAt', label: 'Created At', render: (row) => formatDateTime(row.createdAt) },
      ...(canManage
        ? [
            {
              key: 'actions',
              label: 'Action',
              render: (row: TimetableRow) => (
                <RowActions
                  label={`timetable of ${row.empName ?? row.empNo ?? ''}`}
                  onEdit={() => setEditing(row)}
                  onDelete={() => setDeleting(row)}
                />
              ),
            },
          ]
        : []),
    ],
    rowKey: (row) => row.uuid,
    searchPlaceholder: 'Search employee, number, shift or status',
    emptyMessage: 'No timetable data available.',
    headerActions: canManage && (
      <button
        type="button"
        className="zrv-ir-btn zrv-ir-btn--primary"
        onClick={() => {
          setLookup(null);
          setEditing('new');
        }}
      >
        <OrvexaIcon name="plus" size={16} />
        Add Timetable
      </button>
    ),
  };

  const isNew = editing === 'new';
  return (
    <>
      <ReportPage config={config} />
      {editing && (
        <FormDialog<Values>
          title={isNew ? 'Add Timetable' : 'Edit Timetable'}
          description={
            isNew
              ? undefined
              : 'Saving keeps the current row as history (INACTIVE) and stores a new row.'
          }
          fields={fields}
          initial={isNew ? EMPTY : toValues(editing)}
          schema={timetableInputSchema}
          submitLabel={isNew ? 'Save Timetable' : 'Update Timetable'}
          onClose={() => setEditing(null)}
          onFieldBlur={(name, values, set) => {
            if (name !== 'empNo') return;
            const empNo = values.empNo.trim();
            if (!/^\d{3,}$/.test(empNo)) return;
            setLookup('Looking up employee...');
            api(`/timetables/employee/${empNo}`, employeeLookupSchema)
              .then((employee) => {
                set({ empName: employee.fullName ?? '' });
                setLookup('Employee found.');
              })
              .catch((error: unknown) => setLookup(errorMessage(error)));
          }}
          onSubmit={async (values) => {
            await save(() =>
              isNew
                ? api('/timetables', mutationResultSchema, { method: 'POST', body: values })
                : api(`/timetables/${editing.uuid}`, mutationResultSchema, {
                    method: 'PUT',
                    body: values,
                  }),
            );
            setEditing(null);
          }}
        >
          {lookup && (
            <p className="zat-muted" role="status">
              {lookup}
            </p>
          )}
        </FormDialog>
      )}
      {deleting && (
        <ConfirmDialog
          title="Delete Timetable?"
          description={`Are you sure you want to delete "${deleting.empName || 'this timetable'}"? Only this version row is removed.`}
          confirmLabel="Yes, delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await save(() =>
              api(`/timetables/${deleting.uuid}`, mutationResultSchema, { method: 'DELETE' }),
            );
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
