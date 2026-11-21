// Contractors (CI3 /contractor): contractor companies in EBS with add / edit / delete and search.
// Needs the Zamil VPN or office network.
import { useState } from 'react';
import {
  CONTRACTOR_STATUSES,
  contractorInputSchema,
  contractorPageSchema,
  mutationResultSchema,
  type ContractorFilters,
  type ContractorRow,
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
import { display, formatIsoDate } from '../../lib/format';
import { useSave } from '../../lib/useSave';
import { CONTRACTOR_KEYS } from './contractorKeys';

type Filters = Required<{ [K in keyof ContractorFilters]: string | undefined }>;
type Values = {
  conNumber: string;
  conName: string;
  status: string;
  rate: string;
  startDate: string;
  endDate: string;
};

const STATUS_OPTIONS = CONTRACTOR_STATUSES.map((value) => ({ value, label: value }));

const FIELDS: FormField<Values>[] = [
  {
    name: 'conNumber',
    label: 'Contractor Number',
    type: 'text',
    required: true,
    maxLength: 50,
    placeholder: 'Enter contractor number',
  },
  {
    name: 'conName',
    label: 'Contractor Name',
    type: 'text',
    required: true,
    maxLength: 200,
    placeholder: 'Enter contractor name',
  },
  {
    name: 'status',
    label: 'Status',
    type: 'select',
    required: true,
    options: STATUS_OPTIONS,
    placeholder: 'Select status',
  },
  {
    name: 'rate',
    label: 'Rate / Hour',
    type: 'number',
    required: true,
    maxLength: 20,
    placeholder: 'Enter rate per hour',
  },
  { name: 'startDate', label: 'Start Date', type: 'date' },
  { name: 'endDate', label: 'End Date', type: 'date' },
];
const EMPTY: Values = {
  conNumber: '',
  conName: '',
  status: '',
  rate: '',
  startDate: '',
  endDate: '',
};
const toValues = (row: ContractorRow): Values => ({
  conNumber: row.conNumber ?? '',
  conName: row.conName ?? '',
  status: row.status ?? '',
  rate: row.rate ?? '',
  startDate: row.startDate ?? '',
  endDate: row.endDate ?? '',
});

export default function ContractorsPage() {
  const save = useSave(CONTRACTOR_KEYS);
  const [editing, setEditing] = useState<ContractorRow | 'new' | null>(null);
  const [deleting, setDeleting] = useState<ContractorRow | null>(null);

  const config: ReportConfig<Filters, ContractorRow> = {
    id: 'contractors',
    endpoint: '/contractors',
    pageSchema: contractorPageSchema,
    pageSize: 30,
    breadcrumb: ['Attendance', 'Contractors', 'Contractors'],
    title: 'Contractors',
    subtitle: 'Contractor companies, their hourly rates and validity dates.',
    heading: 'All contractor records',
    searchPlaceholder: 'Search number, name, status...',
    filters: [
      { key: 'conNumber', label: 'Contractor Number', type: 'text', placeholder: 'Contractor #' },
      { key: 'conName', label: 'Contractor Name', type: 'text', placeholder: 'Contractor Name' },
      {
        key: 'status',
        label: 'Status',
        type: 'select',
        placeholder: 'All Statuses',
        options: STATUS_OPTIONS,
      },
    ],
    initialFilters: () => ({ conNumber: '', conName: '', status: '' }),
    columns: [
      { key: 'conNumber', label: 'Contractor Number', render: (r) => display(r.conNumber) },
      { key: 'conName', label: 'Contractor Name', render: (r) => display(r.conName) },
      { key: 'startDate', label: 'Start Date', render: (r) => formatIsoDate(r.startDate) },
      { key: 'endDate', label: 'End Date', render: (r) => formatIsoDate(r.endDate) },
      { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
      { key: 'rate', label: 'Rate / Hour', render: (r) => display(r.rate) },
      { key: 'created', label: 'Created', render: (r) => display(r.createdDate) },
      {
        key: 'actions',
        label: 'Action',
        render: (r) => (
          <RowActions
            label={`contractor ${r.conName ?? r.conNumber ?? ''}`}
            onEdit={() => setEditing(r)}
            onDelete={() => setDeleting(r)}
          />
        ),
      },
    ],
    rowKey: (r) => String(r.id),
    emptyMessage: 'No contractor data available.',
    filterChips: true,
    headerActions: (
      <button
        type="button"
        className="zrv-ir-btn zrv-ir-btn--primary"
        onClick={() => setEditing('new')}
      >
        <OrvexaIcon name="plus" size={16} />
        Add Contractor
      </button>
    ),
  };

  const isNew = editing === 'new';
  return (
    <>
      <ReportPage config={config} />
      {editing && (
        <FormDialog<Values>
          title={isNew ? 'Add Contractor' : 'Update Contractor'}
          fields={FIELDS}
          initial={isNew ? EMPTY : toValues(editing)}
          schema={contractorInputSchema}
          submitLabel={isNew ? 'Save Contractor' : 'Update Contractor'}
          onClose={() => setEditing(null)}
          onSubmit={async (values) => {
            await save(() =>
              isNew
                ? api('/contractors', mutationResultSchema, { method: 'POST', body: values })
                : api(`/contractors/${editing.id}`, mutationResultSchema, {
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
          title="Delete Contractor?"
          description={`Are you sure you want to delete "${deleting.conName || deleting.conNumber || 'this contractor'}"?`}
          confirmLabel="Yes, delete"
          danger
          onClose={() => setDeleting(null)}
          onConfirm={async () => {
            await save(() =>
              api(`/contractors/${deleting.id}`, mutationResultSchema, { method: 'DELETE' }),
            );
            setDeleting(null);
          }}
        />
      )}
    </>
  );
}
