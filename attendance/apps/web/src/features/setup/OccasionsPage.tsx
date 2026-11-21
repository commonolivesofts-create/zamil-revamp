// Occasions (CI3 /occasion): public holidays and occasions, and the shifts they apply to.
import { useState } from 'react';
import {
  mutationResultSchema,
  occasionInputSchema,
  occasionPageSchema,
  type OccasionFilters,
  type OccasionRow,
} from '@attendance/shared';
import { ConfirmDialog } from '../../components/form/ConfirmDialog';
import { FormDialog } from '../../components/form/FormDialog';
import type { FormField } from '../../components/form/types';
import { OrvexaIcon } from '../../components/OrvexaIcon';
import { ReportPage } from '../../components/report/ReportPage';
import type { ReportConfig } from '../../components/report/types';
import { RowActions } from '../../components/RowActions';
import { YesNoBadge } from '../../components/StatusBadges';
import { api } from '../../lib/api';
import { display, formatDateTime, formatIsoDate } from '../../lib/format';
import { useSave } from '../../lib/useSave';
import { useShiftChoices } from './useShiftChoices';

type Filters = Required<{ [K in keyof OccasionFilters]: string | undefined }>;
type Values = {
  occasionName: string;
  fromDate: string;
  toDate: string;
  occasionType: string;
  countAsPresent: string;
  paidHoliday: string;
  isActive: string;
  shiftIds: string[];
  remarks: string;
};

const YES_NO_OPTIONS = [
  { value: 'Y', label: 'Yes' },
  { value: 'N', label: 'No' },
];
const EMPTY: Values = {
  occasionName: '',
  fromDate: '',
  toDate: '',
  occasionType: '',
  countAsPresent: 'Y',
  paidHoliday: 'Y',
  isActive: 'Y',
  shiftIds: [],
  remarks: '',
};

const toValues = (row: OccasionRow): Values => ({
  occasionName: row.occasionName ?? '',
  fromDate: row.fromDate ?? '',
  toDate: row.toDate ?? '',
  occasionType: row.occasionType ?? '',
  countAsPresent: row.countAsPresent,
  paidHoliday: row.paidHoliday,
  isActive: row.isActive,
  shiftIds: row.shiftIds,
  remarks: row.remarks ?? '',
});

export default function OccasionsPage() {
  const shifts = useShiftChoices();
  const save = useSave(['occasions']);
  const [editing, setEditing] = useState<OccasionRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<OccasionRow | null>(null);

  const fields: readonly FormField<Values>[] = [
    {
      name: 'occasionName',
      label: 'Occasion Name',
      type: 'text',
      required: true,
      maxLength: 255,
      wide: true,
      placeholder: 'Enter occasion name',
    },
    { name: 'fromDate', label: 'From Date', type: 'date', required: true },
    { name: 'toDate', label: 'To Date', type: 'date', required: true },
    {
      name: 'occasionType',
      label: 'Occasion Type',
      type: 'text',
      maxLength: 100,
      placeholder: 'Enter occasion type',
    },
    { name: 'isActive', label: 'Is Active', type: 'yesno', required: true },
    { name: 'countAsPresent', label: 'Count As Present', type: 'yesno', required: true },
    { name: 'paidHoliday', label: 'Paid Holiday', type: 'yesno', required: true },
    {
      name: 'shiftIds',
      label: 'Shifts',
      type: 'multiselect',
      wide: true,
      options: (shifts.data ?? []).map((s) => ({ value: String(s.id), label: s.name })),
    },
    {
      name: 'remarks',
      label: 'Remarks',
      type: 'textarea',
      maxLength: 500,
      wide: true,
      placeholder: 'Enter remarks',
    },
  ];

  const config: ReportConfig<Filters, OccasionRow> = {
    id: 'occasions',
    endpoint: '/occasions',
    pageSchema: occasionPageSchema,
    pageSize: 30,
    breadcrumb: ['Attendance', 'Setup', 'Occasion'],
    title: 'Occasion List',
    subtitle: 'Holidays and occasions; attendance processing uses them for the shifts listed.',
    heading: 'All occasion records',
    filters: [
      {
        key: 'occasionName',
        label: 'Occasion name',
        type: 'text',
        placeholder: 'Enter occasion name',
      },
      {
        key: 'occasionType',
        label: 'Occasion type',
        type: 'text',
        placeholder: 'Enter occasion type',
      },
      { key: 'fromDate', label: 'From date', type: 'date' },
      { key: 'toDate', label: 'To date', type: 'date' },
      { key: 'countAsPresent', label: 'Count as present', type: 'select', options: YES_NO_OPTIONS },
      { key: 'paidHoliday', label: 'Paid holiday', type: 'select', options: YES_NO_OPTIONS },
      { key: 'isActive', label: 'Is active', type: 'select', options: YES_NO_OPTIONS },
    ],
    initialFilters: () => ({
      occasionName: '',
      occasionType: '',
      fromDate: '',
      toDate: '',
      countAsPresent: '',
      paidHoliday: '',
      isActive: '',
      shiftId: '',
    }),
    columns: [
      { key: 'occasionName', label: 'Occasion Name', render: (row) => display(row.occasionName) },
      { key: 'fromDate', label: 'From Date', render: (row) => formatIsoDate(row.fromDate) },
      { key: 'toDate', label: 'To Date', render: (row) => formatIsoDate(row.toDate) },
      { key: 'shiftNames', label: 'Shift', render: (row) => display(row.shiftNames) },
      { key: 'occasionType', label: 'Occasion Type', render: (row) => display(row.occasionType) },
      {
        key: 'countAsPresent',
        label: 'Count As Present',
        render: (row) => <YesNoBadge value={row.countAsPresent} />,
      },
      {
        key: 'paidHoliday',
        label: 'Paid Holiday',
        render: (row) => <YesNoBadge value={row.paidHoliday} />,
      },
      { key: 'isActive', label: 'Is Active', render: (row) => <YesNoBadge value={row.isActive} /> },
      { key: 'createdAt', label: 'Created At', render: (row) => formatDateTime(row.createdAt) },
      {
        key: 'actions',
        label: 'Action',
        render: (row: OccasionRow) => (
          <RowActions
            label={`occasion ${row.occasionName ?? ''}`}
            onEdit={() => setEditing(row)}
            onDelete={() => setDeleting(row)}
          />
        ),
      },
    ],
    rowKey: (row) => String(row.occasionId),
    emptyMessage: 'No occasion data available.',
    filterChips: true,
    headerActions: (
      <button
        type="button"
        className="zrv-ir-btn zrv-ir-btn--primary"
        onClick={() => setEditing('new')}
      >
        <OrvexaIcon name="plus" size={16} />
        Add Occasion
      </button>
    ),
  };

  const isNew = editing === 'new';
  return (
    <>
      <ReportPage config={config} />
      {editing && (
        <FormDialog<Values>
          title={isNew ? 'Add Occasion' : 'Edit Occasion'}
          description="Enter occasion details below."
          fields={fields}
          initial={isNew ? EMPTY : toValues(editing)}
          schema={occasionInputSchema}
          submitLabel={isNew ? 'Save Occasion' : 'Update Occasion'}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await save(() =>
              isNew
                ? api('/occasions', mutationResultSchema, { method: 'POST', body: values })
                : api(`/occasions/${editing.occasionId}`, mutationResultSchema, {
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
          title="Delete Occasion?"
          description={`Are you sure you want to delete "${deleting.occasionName || 'this occasion'}"?`}
          confirmLabel="Yes, delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await save(() =>
              api(`/occasions/${deleting.occasionId}`, mutationResultSchema, { method: 'DELETE' }),
            );
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
